import { allocateBonusSpend, createLotForCredit } from "./bonus-lots.ts";
import { DomainError } from "./errors.ts";
import { calculateCheckBonus } from "./settings.ts";
import { logStaffAction } from "./staff-log.ts";
import { openOrExtendVisit } from "./visits.ts";
import type { Store } from "../store/types.ts";

async function requireStaff(store: Store, actorId: string) {
  const actor = await store.findUserById(actorId);
  if (!actor || (actor.role !== "master" && actor.role !== "admin")) {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  return actor;
}

export async function applyCheck(
  store: Store,
  input: { guestId: string; actorId: string; checkRubles: number; now: Date },
) {
  if (input.checkRubles <= 0) throw new DomainError("bad_amount", "Сумма чека должна быть > 0");
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const settings = await tx.getSettings();
    const bonus = calculateCheckBonus(input.checkRubles, settings.percent);
    const guest = await tx.findUserById(input.guestId);
    if (!guest) throw new DomainError("not_found", "Гость не найден");
    const user = await tx.updateUser(guest.id, { balance: guest.balance + bonus });
    const ledger = await tx.addLedger({
      userId: guest.id,
      type: "check",
      amount: bonus,
      actorId: input.actorId,
      comment: `Чек ${input.checkRubles} ₽`,
      checkAmount: input.checkRubles,
    });
    await createLotForCredit(tx, {
      userId: guest.id,
      ledgerId: ledger.id,
      type: "check",
      amount: bonus,
      createdAt: ledger.createdAt,
      settings,
    });
    const visit = await openOrExtendVisit(tx, {
      userId: guest.id,
      openedBy: input.actorId,
      hours: settings.visitHours,
      now: input.now,
    });
    await logStaffAction(tx, {
      actorId: input.actorId,
      guestId: guest.id,
      action: "check",
      payload: { checkRubles: input.checkRubles, bonus },
    });
    return { user, bonus, visit };
  });
}

export async function redeemBonuses(
  store: Store,
  input: { guestId: string; actorId: string; amount: number; now?: Date },
) {
  const now = input.now ?? new Date();
  if (input.amount <= 0) throw new DomainError("bad_amount", "Сумма должна быть > 0");
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const guest = await tx.findUserById(input.guestId);
    if (!guest) throw new DomainError("not_found", "Гость не найден");
    await allocateBonusSpend(tx, { userId: guest.id, amount: input.amount, now });
    const user = await tx.updateUser(guest.id, { balance: guest.balance - input.amount });
    await tx.addLedger({
      userId: guest.id,
      type: "redeem",
      amount: -input.amount,
      actorId: input.actorId,
      comment: "Списание на кассе",
      checkAmount: null,
    });
    await logStaffAction(tx, {
      actorId: input.actorId,
      guestId: guest.id,
      action: "redeem",
      payload: { amount: input.amount },
    });
    return user;
  });
}

export async function manualAdjust(
  store: Store,
  input: { guestId: string; actorId: string; delta: number; comment: string; now?: Date },
) {
  const now = input.now ?? new Date();
  if (!input.comment.trim()) throw new DomainError("bad_comment", "Нужен комментарий");
  if (input.delta === 0) throw new DomainError("bad_amount", "Дельта не ноль");
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const guest = await tx.findUserById(input.guestId);
    if (!guest) throw new DomainError("not_found", "Гость не найден");
    const settings = await tx.getSettings();
    if (input.delta < 0) {
      await allocateBonusSpend(tx, { userId: guest.id, amount: -input.delta, now });
    }
    const next = guest.balance + input.delta;
    if (next < 0) throw new DomainError("insufficient", "Баланс уйдёт в минус");
    const user = await tx.updateUser(guest.id, { balance: next });
    const ledger = await tx.addLedger({
      userId: guest.id,
      type: "manual",
      amount: input.delta,
      actorId: input.actorId,
      comment: input.comment.trim(),
      checkAmount: null,
    });
    if (input.delta > 0) {
      await createLotForCredit(tx, {
        userId: guest.id,
        ledgerId: ledger.id,
        type: "manual",
        amount: input.delta,
        createdAt: ledger.createdAt,
        settings,
      });
    }
    await logStaffAction(tx, {
      actorId: input.actorId,
      guestId: guest.id,
      action: "manual_adjust",
      payload: { delta: input.delta, comment: input.comment.trim() },
    });
    return user;
  });
}
