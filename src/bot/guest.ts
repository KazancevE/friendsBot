import type { Conversation } from "@grammyjs/conversations";
import type { Bot } from "grammy";
import { DomainError } from "../domain/errors.ts";
import { newQrToken } from "../domain/qr-token.ts";
import { updateGuestProfile } from "../domain/users.ts";
import type { BotContext } from "./context.ts";
import { contactKeyboard, mainKeyboard } from "./keyboards.ts";
import { askBirthday } from "./register.ts";

export function wireGuestHandlers(bot: Bot<BotContext>) {
  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) {
      await ctx.reply("Не удалось определить пользователя");
      return;
    }

    const isEnvAdmin = BigInt(from.id) === ctx.config.adminTelegramId;

    if (!ctx.dbUser) {
      if (isEnvAdmin) {
        ctx.dbUser = await ctx.store.createUser({
          telegramId: BigInt(from.id),
          role: "admin",
          firstName: from.first_name ?? "Админ",
          lastName: null,
          birthday: null,
          phone: null,
          qrToken: newQrToken(),
        });
      } else {
        await ctx.conversation.enter("registerGuest");
        return;
      }
    }

    await ctx.reply("Добро пожаловать в Друзья", {
      reply_markup: mainKeyboard(ctx.dbUser.role),
    });
  });

  bot.hears("Баланс и QR", async (ctx) => {
    if (!ctx.dbUser) {
      await ctx.conversation.enter("registerGuest");
      return;
    }
    await ctx.reply(`Баланс: ${ctx.dbUser.balance}\nКод: ${ctx.dbUser.qrToken}`);
  });

  bot.hears("История", async (ctx) => {
    if (!ctx.dbUser) {
      await ctx.conversation.enter("registerGuest");
      return;
    }
    const rows = await ctx.store.listLedger(ctx.dbUser.id);
    if (rows.length === 0) {
      await ctx.reply("История пуста");
      return;
    }
    const text = rows
      .map((row) => {
        const sign = row.amount > 0 ? "+" : "";
        const label = row.comment ?? row.type;
        return `${row.createdAt.toISOString().slice(0, 10)} ${label}: ${sign}${row.amount}`;
      })
      .join("\n");
    await ctx.reply(text);
  });

  bot.hears("Профиль", async (ctx) => {
    if (!ctx.dbUser) {
      await ctx.conversation.enter("registerGuest");
      return;
    }
    await ctx.conversation.enter("editGuestProfile");
  });
}

export async function editGuestProfileConversation(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const userId = ctx.dbUser?.id;
  const role = ctx.dbUser?.role;
  if (userId === undefined || role === undefined) {
    await ctx.reply("Сначала зарегистрируйтесь");
    return;
  }

  await ctx.reply("Как вас зовут? (имя)");
  const firstName = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте имя текстом"),
    })
  ).msg.text.trim();

  await ctx.reply("Фамилия?");
  const lastName = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте фамилию текстом"),
    })
  ).msg.text.trim();

  const birthday = await askBirthday(conversation, ctx);

  await ctx.reply("Новый телефон: нажмите «Поделиться контактом» или напишите «пропустить»", {
    reply_markup: contactKeyboard(),
  });

  let phone: string | undefined;
  for (;;) {
    const next = await conversation.wait();
    const contact = next.message?.contact;
    if (contact) {
      phone = contact.phone_number;
      break;
    }
    const text = next.message?.text?.trim().toLowerCase();
    if (text === "пропустить" || text === "-" || text === "нет") {
      break;
    }
    await ctx.reply("Нажмите «Поделиться контактом» или напишите «пропустить»");
  }

  const result = await conversation.external(async (outer) => {
    try {
      await updateGuestProfile(outer.store, userId, {
        firstName,
        lastName,
        birthday,
        ...(phone !== undefined ? { phone } : {}),
      });
      return { ok: true as const };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message, { reply_markup: mainKeyboard(role) });
    return;
  }

  await ctx.reply("Профиль обновлён", { reply_markup: mainKeyboard(role) });
}
