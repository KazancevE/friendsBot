import type { Conversation } from "@grammyjs/conversations";
import { DomainError } from "../domain/errors.ts";
import { registerGuest } from "../domain/users.ts";
import type { BotContext } from "./context.ts";
import { contactKeyboard, mainKeyboard } from "./keyboards.ts";

const BIRTHDAY_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

export async function registerGuestConversation(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const fromId = ctx.from?.id;
  if (fromId === undefined) {
    await ctx.reply("Не удалось определить пользователя");
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

  await ctx.reply("Поделитесь контактом", { reply_markup: contactKeyboard() });
  const contact = await conversation.form.contact({
    otherwise: (c) => c.reply("Нажмите кнопку «Поделиться контактом»"),
  });

  const result = await conversation.external(async (outer) => {
    try {
      const user = await registerGuest(outer.store, {
        telegramId: BigInt(fromId),
        firstName,
        lastName,
        birthday,
        phone: contact.phone_number,
      });
      return { ok: true as const, balance: user.balance, role: user.role };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message, { reply_markup: { remove_keyboard: true } });
    return;
  }

  await ctx.reply(`Добро пожаловать в Друзья\nБаланс: ${result.balance}`, {
    reply_markup: mainKeyboard(result.role),
  });
}

async function askBirthday(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
): Promise<Date> {
  await ctx.reply("Дата рождения, ДД.ММ.ГГГГ");
  for (;;) {
    const text = (await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Введите дату в формате ДД.ММ.ГГГГ"),
    })).msg.text.trim();
    const parsed = parseBirthday(text);
    if (parsed) {
      return parsed;
    }
    await ctx.reply("Введите дату в формате ДД.ММ.ГГГГ");
  }
}

function parseBirthday(text: string): Date | null {
  const match = BIRTHDAY_RE.exec(text);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
