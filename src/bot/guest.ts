import { DateTime } from "luxon";
import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard, InputFile } from "grammy";
import type { Bot } from "grammy";
import { listActiveMenu } from "../domain/content.ts";
import { formatContactEntriesText, parseContactEntries } from "../domain/contacts.ts";
import { DomainError } from "../domain/errors.ts";
import {
  ensureReferralCode,
  getReferralStats,
  parseReferralStartPayload,
  referralLink,
} from "../domain/referral.ts";
import { newQrToken } from "../domain/qr-token.ts";
import type { MenuItemRecord, PromoRecord } from "../domain/types.ts";
import { formatDisplayPhone } from "../domain/phone.ts";
import { updateGuestProfile } from "../domain/users.ts";
import { MOSCOW } from "../domain/week.ts";
import type { BotContext } from "./context.ts";
import { formatBirthday } from "./register.ts";
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

const formatMoscowDate = (value: Date): string => {
  return DateTime.fromJSDate(value, { zone: MOSCOW }).toFormat("dd.MM.yyyy");
};

const formatMenu = (items: MenuItemRecord[]): string => {
  const textItems = items.filter((item) => item.title.trim().length > 0);
  if (textItems.length === 0) {
    return "";
  }
  return textItems
    .map((item) => {
      const lines = [item.title, item.description];
      if (item.priceRubles !== null) {
        lines.push(`${item.priceRubles} ₽`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
};

const menuImageCaption = (item: MenuItemRecord): string | undefined => {
  if (item.title.trim().length > 0) {
    return undefined;
  }
  if (item.priceRubles === null) {
    return undefined;
  }
  return `${item.priceRubles} ₽`;
};

const sendMenuPhotos = async (ctx: BotContext, items: MenuItemRecord[]) => {
  for (const item of items) {
    const caption = menuImageCaption(item);
    const captionOptions = caption === undefined ? {} : { caption };
    if (item.imageFileId !== null) {
      await ctx.replyWithPhoto(item.imageFileId, captionOptions);
      continue;
    }
    if (item.imageUrl !== null) {
      const photoUrl = item.imageUrl.startsWith("http")
        ? item.imageUrl
        : `${ctx.config.publicUrl}${item.imageUrl}`;
      await ctx.replyWithPhoto(photoUrl, captionOptions);
    }
  }
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

type FormatGuestProfileParameters = {
  firstName: string | null;
  lastName: string | null;
  birthday: Date | null;
  phone: string | null;
};

const formatGuestProfile = ({
  firstName,
  lastName,
  birthday,
  phone,
}: FormatGuestProfileParameters): string => {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim() || "—";
  return [
    "👤 Ваш профиль",
    `ФИО: ${name}`,
    `Дата рождения: ${birthday === null ? "—" : formatBirthday(birthday)}`,
    `Телефон: ${formatDisplayPhone(phone)}`,
  ].join("\n");
};

const guestProfileKeyboard = (): InlineKeyboard => {
  return new InlineKeyboard().text("Редактировать", "guest:editProfile");
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
    const startPayload = typeof ctx.match === "string" ? ctx.match : "";
    const referralCode = parseReferralStartPayload(startPayload);
    if (referralCode !== null) {
      ctx.session.pendingReferralCode = referralCode;
    }

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
      coupons.length > 0
        ? coupons.map((coupon) => `${coupon.title} (до ${formatMoscowDate(coupon.expiresAt)})`).join(", ")
        : "нет";
    const lots = await ctx.store.listBonusLots(ctx.dbUser.id);
    const now = new Date();
    const activeLots = lots.filter((lot) => lot.remaining > 0 && lot.expiresAt > now);
    const lotLines =
      activeLots.length === 0
        ? []
        : activeLots.map(
            (lot) =>
              `· ${lot.remaining} ${lot.category === "gift" ? "подарочных" : "чековых"} (до ${formatMoscowDate(lot.expiresAt)})`,
          );
    const lines = [
      `Баланс: ${ctx.dbUser.balance}`,
      ...lotLines,
      `Код: ${ctx.dbUser.qrToken}`,
      `Купоны: ${couponLine}`,
    ];
    await ctx.replyWithPhoto(new InputFile(buf), {
      caption: lines.join("\n"),
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
    const text = (
      await Promise.all(
        rows.map(async (row) => {
          const sign = row.amount > 0 ? "+" : "";
          const label = row.comment ?? row.type;
          let line = `${formatMoscowDate(row.createdAt)} ${label}: ${sign}${row.amount}`;
          if (row.amount > 0) {
            const lot = await ctx.store.findBonusLotByLedgerId(row.id);
            if (lot !== null) {
              line += ` (до ${formatMoscowDate(lot.expiresAt)})`;
            }
          }
          return line;
        }),
      )
    ).join("\n");
    await ctx.reply(text);
  });

  bot.hears("Профиль", async (ctx) => {
    if (!ctx.dbUser) {
      await enterConversation(ctx, "registerGuest");
      return;
    }
    await ctx.reply(formatGuestProfile(ctx.dbUser), {
      reply_markup: guestProfileKeyboard(),
    });
  });

  bot.hears("Меню", async (ctx) => {
    const menu = await listActiveMenu(ctx.store);
    const text = formatMenu(menu);
    const isAdmin = ctx.dbUser?.role === "admin";
    const keyboard = isAdmin ? adminMenuKeyboard() : undefined;

    if (menu.length === 0) {
      await ctx.reply("Меню пока пусто", keyboard === undefined ? {} : { reply_markup: keyboard });
      return;
    }

    if (text.length > 0) {
      await ctx.reply(text, keyboard === undefined ? {} : { reply_markup: keyboard });
    } else if (isAdmin) {
      await ctx.reply("Меню", { reply_markup: keyboard });
    }

    await sendMenuPhotos(ctx, menu);
  });

  bot.hears("Контакты", async (ctx) => {
    const page = await ctx.store.getPage("contacts");
    const text = formatContactEntriesText(parseContactEntries(page?.body ?? ""));
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

  bot.hears("Пригласить друга", async (ctx) => {
    if (!ctx.dbUser) {
      await enterConversation(ctx, "registerGuest");
      return;
    }
    const settings = await ctx.store.getSettings();
    if (!settings.referralEnabled) {
      await ctx.reply("Реферальная программа временно недоступна");
      return;
    }
    const code = await ensureReferralCode(ctx.store, ctx.dbUser.id);
    const stats = await getReferralStats(ctx.store, ctx.dbUser.id);
    const username = ctx.me?.username;
    const link =
      username !== undefined ? referralLink(username, code) : `https://t.me/?start=ref_${code}`;
    await ctx.reply(
      [
        "Пригласите друга в «Друзья»:",
        link,
        "",
        `Вы пригласили: ${stats.invited}`,
        `Активировано: ${stats.activated}`,
        `Получено: ${stats.bonusesEarned} бонусов`,
      ].join("\n"),
    );
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

  bot.callbackQuery("guest:editProfile", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.dbUser) {
      await ctx.reply("Сначала зарегистрируйтесь");
      return;
    }
    await enterConversation(ctx, "editGuestProfile");
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
