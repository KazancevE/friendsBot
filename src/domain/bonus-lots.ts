import { DateTime } from "luxon";
import { DomainError } from "./errors.ts";
import { expiresAfterDays } from "./settings.ts";
import type { BonusLotCategory, BonusLotRecord, LedgerType, Settings } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export type CreditLedgerType =
  | "check"
  | "registration"
  | "birthday"
  | "manual"
  | "weekly_prize"
  | "referral"
  | "promo_bonus";

export function lotCategoryForLedger(type: LedgerType, amount: number): BonusLotCategory | null {
  if (type === "check") {
    return "check";
  }
  if (
    type === "registration" ||
    type === "birthday" ||
    type === "weekly_prize" ||
    type === "referral" ||
    type === "promo_bonus"
  ) {
    return "gift";
  }
  if (type === "manual" && amount > 0) {
    return "gift";
  }
  return null;
}

export function ttlDaysForCategory(category: BonusLotCategory, settings: Settings): number {
  return category === "check" ? settings.checkBonusTtlDays : settings.giftBonusTtlDays;
}

export function expiresAtForCredit(
  category: BonusLotCategory,
  createdAt: Date,
  settings: Settings,
): Date {
  return expiresAfterDays(createdAt, ttlDaysForCategory(category, settings));
}

export async function createLotForCredit(
  tx: Store,
  input: {
    userId: string;
    ledgerId: string;
    type: CreditLedgerType;
    amount: number;
    createdAt: Date;
    settings: Settings;
  },
): Promise<BonusLotRecord | null> {
  const category = lotCategoryForLedger(input.type, input.amount);
  if (category === null || input.amount <= 0) {
    return null;
  }
  return tx.createBonusLot({
    userId: input.userId,
    ledgerId: input.ledgerId,
    category,
    initial: input.amount,
    remaining: input.amount,
    expiresAt: expiresAtForCredit(category, input.createdAt, input.settings),
    createdAt: input.createdAt,
  });
}

const spendOrder = (lots: ReadonlyArray<BonusLotRecord>, now: Date): BonusLotRecord[] => {
  const active = lots.filter((lot) => lot.remaining > 0 && lot.expiresAt.getTime() > now.getTime());
  const gift = active.filter((lot) => lot.category === "gift").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const check = active.filter((lot) => lot.category === "check").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return [...gift, ...check];
};

export async function allocateBonusSpend(
  tx: Store,
  input: { userId: string; amount: number; now: Date },
): Promise<void> {
  if (input.amount <= 0) {
    throw new DomainError("bad_amount", "Сумма должна быть > 0");
  }
  const lots = await tx.listBonusLots(input.userId);
  const ordered = spendOrder(lots, input.now);
  const available = ordered.reduce((sum, lot) => sum + lot.remaining, 0);
  if (available < input.amount) {
    throw new DomainError("insufficient", "Недостаточно бонусов");
  }
  let left = input.amount;
  for (const lot of ordered) {
    if (left <= 0) {
      break;
    }
    const take = Math.min(lot.remaining, left);
    if (take <= 0) {
      continue;
    }
    await tx.updateBonusLot(lot.id, { remaining: lot.remaining - take });
    left -= take;
  }
}

export function availableBalance(lots: ReadonlyArray<BonusLotRecord>, now: Date): number {
  return lots
    .filter((lot) => lot.remaining > 0 && lot.expiresAt.getTime() > now.getTime())
    .reduce((sum, lot) => sum + lot.remaining, 0);
}

export function expiresOnMoscowDay(expiresAt: Date, daysFromToday: number, now: Date): boolean {
  const today = DateTime.fromJSDate(now, { zone: MOSCOW }).startOf("day");
  const target = today.plus({ days: daysFromToday });
  const expDay = DateTime.fromJSDate(expiresAt, { zone: MOSCOW }).startOf("day");
  return expDay.equals(target);
}

export type WarningKind = "warned7d" | "warned3d" | "warned1d";

export const WARNING_SCHEDULE: ReadonlyArray<{ days: number; flag: WarningKind; textDays: string }> = [
  { days: 7, flag: "warned7d", textDays: "7 дней" },
  { days: 3, flag: "warned3d", textDays: "3 дня" },
  { days: 1, flag: "warned1d", textDays: "1 день" },
];

export function warningMessage(input: { textDays: string; amount: number; balance: number }): string {
  if (input.textDays === "1 день") {
    return `Завтра сгорят ${input.amount} бонусов. Актуальный баланс: ${input.balance}.`;
  }
  return `Через ${input.textDays} сгорят ${input.amount} бонусов. Актуальный баланс: ${input.balance}.`;
}

export function expiredMessage(amount: number, balance: number): string {
  return `Сгорело ${amount} бонусов. Актуальный баланс: ${balance}.`;
}
