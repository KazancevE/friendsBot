import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { redeemCoupon } from "../domain/coupons.ts";
import { DomainError } from "../domain/errors.ts";
import { buildStaffGuestCard, formatStaffGuestCard, type StaffGuestCard } from "../domain/guest-card.ts";
import { guestSearchButtonLabel, searchGuests } from "../domain/guest-search.ts";
import { applyCheck, manualAdjust, redeemBonuses } from "../domain/ledger.ts";
import { normalizePhone } from "../domain/phone.ts";
import type { Role } from "../domain/types.ts";
import { closeActiveVisit, extendActiveVisit, staffOpenVisit } from "../domain/visits.ts";
import { MOSCOW } from "../domain/week.ts";
import type { BotContext } from "./context.ts";
import { enterConversation } from "./enter-conversation.ts";

type BotConversation = Conversation<BotContext, BotContext>;

const STAFF_CONVERSATIONS = {
  check: "staffCheck",
  redeem: "staffRedeem",
  manual: "staffManual",
  visit: "staffVisit",
  note: "staffNote",
} as const;

type StaffAction = keyof typeof STAFF_CONVERSATIONS;

const isStaffRole = (role: Role | undefined): boolean => {
  return role === "master" || role === "admin";
};

const isStaffAction = (value: string): value is StaffAction => {
  return value in STAFF_CONVERSATIONS;
};

const guestCardKeyboard = (card: StaffGuestCard): InlineKeyboard => {
  const keyboard = new InlineKeyboard()
    .text("Чек", "staff:check")
    .text("Списать", "staff:redeem")
    .row()
    .text("Ручное", "staff:manual")
    .text("Визит", "staff:visit")
    .row()
    .text("Заметка", "staff:note");
  if (card.visitActive) {
    keyboard.text("Продлить визит", "staff:extend").text("Закончить визит", "staff:close");
  }
  for (const coupon of card.coupons) {
    keyboard.row().text(`Погасить: ${coupon.title}`, `staff:coupon:${coupon.id}`);
  }
  return keyboard;
};

const showGuestCard = async (ctx: BotContext, guestId: string) => {
  const guest = await ctx.store.findUserById(guestId);
  if (guest === null) {
    await ctx.reply("Гость не найден");
    return;
  }
  ctx.session.staffGuestId = guest.id;
  const card = await buildStaffGuestCard(ctx.store, guest, new Date());
  await ctx.reply(formatStaffGuestCard(card), { reply_markup: guestCardKeyboard(card) });
};

const askInt = async (
  conversation: BotConversation,
  ctx: BotContext,
  prompt: string,
): Promise<number> => {
  await ctx.reply(prompt);
  return conversation.form.int({
    otherwise: (c) => c.reply("Введите целое число"),
  });
};

export async function staffFindConversation(conversation: BotConversation, ctx: BotContext) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  await ctx.reply("Телефон, QR-код или имя гостя");
  const raw = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте текстом"),
    })
  ).msg.text.trim();

  const found = await conversation.external(async (outer) => {
    const now = new Date();
    try {
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 10) {
        const phone = normalizePhone(raw);
        const guest = await outer.store.findUserByPhone(phone);
        if (!guest) {
          return { ok: false as const, message: "проверьте номер" };
        }
        return { ok: true as const, kind: "single" as const, guestId: guest.id };
      }
      if (raw.length >= 8 && !raw.includes(" ")) {
        const guest = await outer.store.findUserByQrToken(raw);
        if (!guest) {
          return { ok: false as const, message: "Гость не найден" };
        }
        return { ok: true as const, kind: "single" as const, guestId: guest.id };
      }
      const hits = await searchGuests(outer.store, { query: raw, now });
      if (hits.length === 0) {
        return { ok: false as const, message: "Гость не найден. Попробуйте телефон или QR" };
      }
      if (hits.length === 1) {
        return { ok: true as const, kind: "single" as const, guestId: hits[0]!.id };
      }
      return { ok: true as const, kind: "list" as const, hits };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!found.ok) {
    await ctx.reply(found.message);
    return;
  }

  if (found.kind === "single") {
    await conversation.external(async (outer) => {
      await showGuestCard({ ...ctx, store: outer.store }, found.guestId);
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const hit of found.hits) {
    keyboard.text(guestSearchButtonLabel(hit), `staff:pick:${hit.id}`).row();
  }
  await ctx.reply("Выберите гостя", { reply_markup: keyboard });
}

export async function staffCheckConversation(conversation: BotConversation, ctx: BotContext) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  const checkRubles = await askInt(conversation, ctx, "Сумма чека в рублях");
  await ctx.reply("Промокод? (отправьте «пропустить», если нет)");
  const promoRaw = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте промокод или «пропустить»"),
    })
  ).msg.text.trim();
  const promoCode =
    promoRaw.toLowerCase() === "пропустить" || promoRaw === "-" ? null : promoRaw;
  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    const guestId = outer.session.staffGuestId;
    if (!actor || !isStaffRole(actor.role)) {
      return { ok: false as const, message: "Недостаточно прав" };
    }
    if (guestId === undefined) {
      return { ok: false as const, message: "Сначала найдите гостя" };
    }
    try {
      const applied = await applyCheck(outer.store, {
        guestId,
        actorId: actor.id,
        checkRubles,
        now: new Date(),
        promoCode,
      });
      return { ok: true as const, bonus: applied.bonus, balance: applied.user.balance };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  await ctx.reply(`Начислено ${result.bonus} бонусов. Баланс: ${result.balance}`);
}

export async function staffRedeemConversation(conversation: BotConversation, ctx: BotContext) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  const amount = await askInt(conversation, ctx, "Сколько бонусов списать?");
  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    const guestId = outer.session.staffGuestId;
    if (!actor || !isStaffRole(actor.role)) {
      return { ok: false as const, message: "Недостаточно прав" };
    }
    if (guestId === undefined) {
      return { ok: false as const, message: "Сначала найдите гостя" };
    }
    try {
      const user = await redeemBonuses(outer.store, {
        guestId,
        actorId: actor.id,
        amount,
      });
      return { ok: true as const, balance: user.balance };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  await ctx.reply(`Списано. Баланс: ${result.balance}`);
}

export async function staffManualConversation(conversation: BotConversation, ctx: BotContext) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  const delta = await askInt(conversation, ctx, "На сколько изменить баланс? (например 100 или -50)");
  await ctx.reply("Комментарий (обязательно)");
  const comment = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте комментарий текстом"),
    })
  ).msg.text.trim();

  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    const guestId = outer.session.staffGuestId;
    if (!actor || !isStaffRole(actor.role)) {
      return { ok: false as const, message: "Недостаточно прав" };
    }
    if (guestId === undefined) {
      return { ok: false as const, message: "Сначала найдите гостя" };
    }
    try {
      const user = await manualAdjust(outer.store, {
        guestId,
        actorId: actor.id,
        delta,
        comment,
      });
      return { ok: true as const, balance: user.balance };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  await ctx.reply(`Баланс: ${result.balance}`);
}

export async function staffVisitConversation(conversation: BotConversation, ctx: BotContext) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    const guestId = outer.session.staffGuestId;
    if (!actor || !isStaffRole(actor.role)) {
      return { ok: false as const, message: "Недостаточно прав" };
    }
    if (guestId === undefined) {
      return { ok: false as const, message: "Сначала найдите гостя" };
    }
    try {
      const visit = await staffOpenVisit(outer.store, {
        guestId,
        actorId: actor.id,
        now: new Date(),
      });
      return {
        ok: true as const,
        endsAt: visit.endsAt.toLocaleString("ru-RU", { timeZone: MOSCOW }),
      };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  await ctx.reply(`Визит открыт до ${result.endsAt}`);
}

export async function staffNoteConversation(conversation: BotConversation, ctx: BotContext) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  await ctx.reply("Заметка о госте (до 500 символов, «-» чтобы очистить)");
  const note = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте текст"),
    })
  ).msg.text.trim();

  const result = await conversation.external(async (outer) => {
    const guestId = outer.session.staffGuestId;
    if (guestId === undefined) {
      return { ok: false as const, message: "Сначала найдите гостя" };
    }
    const value = note === "-" ? null : note;
    if (value !== null && value.length > 500) {
      return { ok: false as const, message: "Заметка не длиннее 500 символов" };
    }
    await outer.store.updateUser(guestId, { staffNote: value });
    return { ok: true as const, guestId };
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  await conversation.external(async (outer) => {
    await showGuestCard({ ...ctx, store: outer.store }, result.guestId);
  });
}

export async function staffCouponRedeemConversation(conversation: BotConversation, ctx: BotContext) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  const result = await conversation.external(async (outer) => {
    const actor = outer.dbUser;
    const couponId = outer.session.staffCouponId;
    if (!actor || !isStaffRole(actor.role)) {
      return { ok: false as const, message: "Недостаточно прав" };
    }
    if (couponId === undefined) {
      return { ok: false as const, message: "Купон не выбран" };
    }
    try {
      await redeemCoupon(outer.store, { couponId, actorId: actor.id, now: new Date() });
      return { ok: true as const };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: err.message };
      }
      throw err;
    }
  });

  if (!result.ok) {
    await ctx.reply(result.message);
    return;
  }

  await ctx.reply("Купон погашен");
}

export function wireStaffHandlers(bot: Bot<BotContext>) {
  bot.hears("Найти гостя", async (ctx) => {
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    await enterConversation(ctx, "staffFind");
  });

  bot.callbackQuery(/^staff:pick:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const guestId = Array.isArray(ctx.match) ? ctx.match[1] : undefined;
    if (guestId === undefined) {
      return;
    }
    await showGuestCard(ctx, guestId);
  });

  bot.callbackQuery("staff:close", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role) || !ctx.dbUser) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const guestId = ctx.session.staffGuestId;
    if (guestId === undefined) {
      await ctx.reply("Сначала найдите гостя");
      return;
    }
    try {
      await closeActiveVisit(ctx.store, {
        guestId,
        actorId: ctx.dbUser.id,
        now: new Date(),
      });
      await showGuestCard(ctx, guestId);
      await ctx.reply("Визит завершён");
    } catch (err) {
      const message = err instanceof DomainError ? err.message : "Ошибка";
      await ctx.reply(message);
    }
  });

  bot.callbackQuery("staff:extend", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role) || !ctx.dbUser) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const guestId = ctx.session.staffGuestId;
    if (guestId === undefined) {
      await ctx.reply("Сначала найдите гостя");
      return;
    }
    try {
      const visit = await extendActiveVisit(ctx.store, {
        guestId,
        actorId: ctx.dbUser.id,
        now: new Date(),
      });
      await showGuestCard(ctx, guestId);
      await ctx.reply(`Визит продлён до ${visit.endsAt.toLocaleString("ru-RU", { timeZone: MOSCOW })}`);
    } catch (err) {
      const message = err instanceof DomainError ? err.message : "Ошибка";
      await ctx.reply(message);
    }
  });

  bot.callbackQuery(/^staff:(check|redeem|manual|visit|note)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const matched = ctx.match;
    const action = Array.isArray(matched) ? matched[1] : undefined;
    if (action === undefined || !isStaffAction(action)) {
      return;
    }
    await enterConversation(ctx, STAFF_CONVERSATIONS[action]);
  });

  bot.callbackQuery(/^staff:coupon:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    const matched = ctx.match;
    const couponId = Array.isArray(matched) ? matched[1] : undefined;
    if (couponId === undefined) {
      return;
    }
    ctx.session.staffCouponId = couponId;
    await enterConversation(ctx, "staffCouponRedeem");
  });
}
