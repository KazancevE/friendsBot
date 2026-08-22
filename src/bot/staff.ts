import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { DomainError } from "../domain/errors.ts";
import { applyCheck, manualAdjust, redeemBonuses } from "../domain/ledger.ts";
import { normalizePhone } from "../domain/phone.ts";
import type { Role } from "../domain/types.ts";
import { openOrExtendVisit } from "../domain/visits.ts";
import { MOSCOW } from "../domain/week.ts";
import type { BotContext } from "./context.ts";

type BotConversation = Conversation<BotContext, BotContext>;

const STAFF_CONVERSATIONS = {
  check: "staffCheck",
  redeem: "staffRedeem",
  manual: "staffManual",
  visit: "staffVisit",
} as const;

type StaffAction = keyof typeof STAFF_CONVERSATIONS;

const isStaffRole = (role: Role | undefined): boolean => {
  return role === "master" || role === "admin";
};

const isStaffAction = (value: string): value is StaffAction => {
  return (
    value === "check" || value === "redeem" || value === "manual" || value === "visit"
  );
};

const guestCardKeyboard = (): InlineKeyboard => {
  return new InlineKeyboard()
    .text("Чек", "staff:check")
    .text("Списать", "staff:redeem")
    .row()
    .text("Ручное", "staff:manual")
    .text("Визит", "staff:visit");
};

type GuestCard = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  balance: number;
  visitActive: boolean;
  coupons: string[];
};

const formatGuestCard = (card: GuestCard): string => {
  const name = `${card.firstName ?? ""} ${card.lastName ?? ""}`.trim() || "—";
  const coupons = card.coupons.length > 0 ? card.coupons.join(", ") : "нет";
  return [
    `ФИО: ${name}`,
    `Телефон: ${card.phone ?? "—"}`,
    `Баланс: ${card.balance}`,
    `Визит: ${card.visitActive ? "да" : "нет"}`,
    `Купоны: ${coupons}`,
  ].join("\n");
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

export async function staffFindConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  await ctx.reply("Номер телефона гостя");
  const raw = (
    await conversation.waitFor(":text", {
      otherwise: (c) => c.reply("Отправьте номер текстом"),
    })
  ).msg.text.trim();

  const found = await conversation.external(async (outer) => {
    try {
      const phone = normalizePhone(raw);
      const guest = await outer.store.findUserByPhone(phone);
      if (!guest) {
        return { ok: false as const, message: "проверьте номер" };
      }
      const now = new Date();
      const visit = await outer.store.getActiveVisit(guest.id, now);
      const coupons = await outer.store.listActiveCoupons(guest.id);
      outer.session.staffGuestId = guest.id;
      return {
        ok: true as const,
        card: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          phone: guest.phone,
          balance: guest.balance,
          visitActive: visit !== null,
          coupons: coupons.map((coupon) => coupon.title),
        } satisfies GuestCard,
      };
    } catch (err) {
      if (err instanceof DomainError) {
        return { ok: false as const, message: "проверьте номер" };
      }
      throw err;
    }
  });

  if (!found.ok) {
    await ctx.reply(found.message);
    return;
  }

  await ctx.reply(formatGuestCard(found.card), {
    reply_markup: guestCardKeyboard(),
  });
}

export async function staffCheckConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  const checkRubles = await askInt(conversation, ctx, "Сумма чека в рублях");
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

export async function staffRedeemConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
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

export async function staffManualConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  if (!isStaffRole(ctx.dbUser?.role)) {
    await ctx.reply("Недостаточно прав");
    return;
  }

  const delta = await askInt(
    conversation,
    ctx,
    "На сколько изменить баланс? (например 100 или -50)",
  );
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

export async function staffVisitConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
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
      const settings = await outer.store.getSettings();
      const visit = await openOrExtendVisit(outer.store, {
        userId: guestId,
        openedBy: actor.id,
        hours: settings.visitHours,
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

export function wireStaffHandlers(bot: Bot<BotContext>) {
  bot.hears("Найти гостя", async (ctx) => {
    if (!isStaffRole(ctx.dbUser?.role)) {
      await ctx.reply("Недостаточно прав");
      return;
    }
    await ctx.conversation.enter("staffFind");
  });

  bot.callbackQuery(/^staff:(check|redeem|manual|visit)$/, async (ctx) => {
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
    await ctx.conversation.enter(STAFF_CONVERSATIONS[action]);
  });
}
