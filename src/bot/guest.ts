import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard, InputFile } from "grammy";
import type { Bot } from "grammy";
import { listActiveMenu } from "../domain/content.ts";
import { DomainError } from "../domain/errors.ts";
import { newQrToken } from "../domain/qr-token.ts";
import type { MenuItemRecord, PromoRecord } from "../domain/types.ts";
import { updateGuestProfile } from "../domain/users.ts";
import type { BotContext } from "./context.ts";
import {
  askCancellableBirthday,
  askCancellableText,
  replyMainMenu,
  runCancellable,
  waitCancellableContactOrSkip,
} from "./conversation-cancel.ts";
import { enterConversation } from "./enter-conversation.ts";
import { mainKeyboard } from "./keyboards.ts";
import { qrPngBuffer } from "./qr.ts";

const formatMenu = (items: MenuItemRecord[]): string => {
  if (items.length === 0) {
    return "Меню пока пусто";
  }
  return items
    .map((item) => {
      const lines = [item.title, item.description];
      if (item.priceRubles !== null) {
        lines.push(`${item.priceRubles} ₽`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
};

const adminMenuKeyboard = (): InlineKeyboard => {
  return new InlineKeyboard().text("Добавить позицию", "admin:addMenuItem");
};

const adminContactsKeyboard = (): InlineKeyboard => {
  return new InlineKeyboard().text("Редактировать", "admin:editContacts");
};

const adminDirectionsKeyboard = (): InlineKeyboard => {
  return new InlineKeyboard().text("Редактировать", "admin:editDirections");
};

const broadcastOptKeyboard = (optOut: boolean): InlineKeyboard => {
  if (optOut) {
    return new InlineKeyboard().text("Включить рассылку", "guest:broadcastOn");
  }
  return new InlineKeyboard().text("Отключить рассылку", "guest:broadcastOff");
};

const sendPromoMessage = async (ctx: BotContext, promo: PromoRecord) => {
  const photo = promo.photos[0];
  if (photo !== undefined) {
    await ctx.replyWithPhoto(photo, { caption: promo.body });
    for (const extra of promo.photos.slice(1)) {
      await ctx.replyWithPhoto(extra);
    }
    return;
  }
  await ctx.reply(promo.body);
};

const setBroadcastOptOut = async (ctx: BotContext, optOut: boolean) => {
  if (!ctx.dbUser) {
    await enterConversation(ctx, "registerGuest");
    return;
  }
  ctx.dbUser = await ctx.store.updateUser(ctx.dbUser.id, { broadcastOptOut: optOut });
  if (optOut) {
    await ctx.reply("Рассылка отключена. Напишите «Включить рассылку», чтобы получать акции снова.");
    return;
  }
  await ctx.reply("Рассылка включена");
};

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
        await enterConversation(ctx, "registerGuest");
        return;
      }
    }

    await ctx.reply("Добро пожаловать в Друзья", {
      reply_markup: mainKeyboard({ role: ctx.dbUser.role, publicUrl: ctx.config.publicUrl }),
    });
  });

  bot.hears("Баланс и QR", async (ctx) => {
    if (!ctx.dbUser) {
      await enterConversation(ctx, "registerGuest");
      return;
    }
    const buf = await qrPngBuffer(ctx.dbUser.qrToken);
    const coupons = await ctx.store.listActiveCoupons(ctx.dbUser.id);
    const couponLine =
      coupons.length > 0 ? coupons.map((coupon) => coupon.title).join(", ") : "нет";
    await ctx.replyWithPhoto(new InputFile(buf), {
      caption: `Баланс: ${ctx.dbUser.balance}\nКод: ${ctx.dbUser.qrToken}\nКупоны: ${couponLine}`,
    });
  });

  bot.hears("История", async (ctx) => {
    if (!ctx.dbUser) {
      await enterConversation(ctx, "registerGuest");
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
      await enterConversation(ctx, "registerGuest");
      return;
    }
    const coupons = await ctx.store.listActiveCoupons(ctx.dbUser.id);
    const couponLine =
      coupons.length > 0 ? coupons.map((coupon) => coupon.title).join(", ") : "нет";
    await ctx.reply(`Купоны: ${couponLine}`);
    await enterConversation(ctx, "editGuestProfile");
  });

  bot.hears("Меню", async (ctx) => {
    const menu = await listActiveMenu(ctx.store);
    const text = formatMenu(menu);
    if (ctx.dbUser?.role === "admin") {
      await ctx.reply(text, { reply_markup: adminMenuKeyboard() });
      return;
    }
    await ctx.reply(text);
  });

  bot.hears("Контакты", async (ctx) => {
    const page = await ctx.store.getPage("contacts");
    const text = page?.body?.trim() || "Контакты пока не добавлены";
    if (ctx.dbUser?.role === "admin") {
      await ctx.reply(text, { reply_markup: adminContactsKeyboard() });
      return;
    }
    await ctx.reply(text);
  });

  bot.hears("Как доехать", async (ctx) => {
    const page = await ctx.store.getPage("directions");
    const body = page?.body?.trim() || "Маршрут пока не добавлен";
    const text = page?.mapUrl ? `${body}\n\nКарта: ${page.mapUrl}` : body;
    if (ctx.dbUser?.role === "admin") {
      await ctx.reply(text, { reply_markup: adminDirectionsKeyboard() });
      return;
    }
    await ctx.reply(text);
  });

  bot.hears("Игры", async (ctx) => {
    const origin = ctx.config.publicUrl.replace(/\/$/, "");
    await ctx.reply("Игры в Mini App", {
      reply_markup: new InlineKeyboard().webApp("Открыть", `${origin}/app/`),
    });
  });

  bot.hears("Акции", async (ctx) => {
    if (!ctx.dbUser) {
      await enterConversation(ctx, "registerGuest");
      return;
    }
    const promos = (await ctx.store.listFeedPromos()).slice().sort((a, b) => {
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    if (promos.length === 0) {
      await ctx.reply("Акций пока нет", {
        reply_markup: broadcastOptKeyboard(ctx.dbUser.broadcastOptOut),
      });
      return;
    }
    for (const promo of promos) {
      await sendPromoMessage(ctx, promo);
    }
    await ctx.reply("Управление рассылкой", {
      reply_markup: broadcastOptKeyboard(ctx.dbUser.broadcastOptOut),
    });
  });

  bot.hears("Отключить рассылку", async (ctx) => {
    await setBroadcastOptOut(ctx, true);
  });

  bot.hears("Включить рассылку", async (ctx) => {
    await setBroadcastOptOut(ctx, false);
  });

  bot.command("broadcast_opt_out", async (ctx) => {
    await setBroadcastOptOut(ctx, true);
  });

  bot.command("broadcast_opt_in", async (ctx) => {
    await setBroadcastOptOut(ctx, false);
  });

  bot.callbackQuery("guest:broadcastOff", async (ctx) => {
    await ctx.answerCallbackQuery();
    await setBroadcastOptOut(ctx, true);
  });

  bot.callbackQuery("guest:broadcastOn", async (ctx) => {
    await ctx.answerCallbackQuery();
    await setBroadcastOptOut(ctx, false);
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

  await runCancellable({
    ctx,
    body: async () => {
      const firstName = (
        await askCancellableText({
          conversation,
          ctx,
          prompt: "Как вас зовут? (имя)",
          otherwise: "Отправьте имя текстом",
        })
      ).trim();
      const lastName = (
        await askCancellableText({
          conversation,
          ctx,
          prompt: "Фамилия?",
          otherwise: "Отправьте фамилию текстом",
        })
      ).trim();
      const birthday = await askCancellableBirthday({ conversation, ctx });
      const phone = await waitCancellableContactOrSkip({
        conversation,
        ctx,
        prompt: "Новый телефон: нажмите «Поделиться контактом» или напишите «пропустить»",
      });

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
        await replyMainMenu({ ctx, text: result.message });
        return;
      }

      await replyMainMenu({ ctx, text: "Профиль обновлён" });
    },
  });
}
