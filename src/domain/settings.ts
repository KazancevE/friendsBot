import { DomainError } from "./errors.ts";
import type { PrizePlace, Settings } from "./types.ts";
import type { Store } from "../store/types.ts";

export const DEFAULT_SETTINGS: Settings = {
  percent: 10,
  registrationBonus: 500,
  birthdayBonus: 500,
  visitHours: 4,
  winnersCount: 3,
  prizeTable: [
    { place: 1, bonuses: 1000, couponTitle: null },
    { place: 2, bonuses: 500, couponTitle: null },
    { place: 3, bonuses: 300, couponTitle: null },
  ],
  checkBonusTtlDays: 30,
  giftBonusTtlDays: 15,
  couponClaimDaysDefault: 10,
  couponClaimDays: 10,
  expireNotifyMinBonuses: 300,
  checkInNotifyEnabled: true,
  checkInNotifyTelegramIds: [],
  referralBonusReferrer: 300,
  referralBonusReferee: 300,
  referralActivationDays: 30,
  referralEnabled: true,
  birthdayNotifyDaysBefore: 7,
  birthdayCouponTitle: null,
  birthdayCouponClaimDays: 14,
  maxSessionsPerHour: 30,
};

export function expiresAfterDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function parsePrizeTable(json: string): PrizePlace[] {
  const raw = JSON.parse(json) as PrizePlace[];
  return raw.map((row) => ({
    place: Number(row.place),
    bonuses: Number(row.bonuses),
    couponTitle: row.couponTitle ?? null,
  }));
}

export function calculateCheckBonus(checkRubles: number, percent: number): number {
  return Math.floor((checkRubles * percent) / 100);
}

const assertNonNegativeInt = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError("bad_request", `${label} должно быть целым ≥ 0`);
  }
};

export async function patchAdminSettings(store: Store, patch: Partial<Settings>): Promise<Settings> {
  if (patch.percent !== undefined) {
    assertNonNegativeInt(patch.percent, "Процент");
    if (patch.percent > 100) {
      throw new DomainError("bad_request", "Процент не больше 100");
    }
  }
  if (patch.registrationBonus !== undefined) {
    assertNonNegativeInt(patch.registrationBonus, "Бонус регистрации");
  }
  if (patch.birthdayBonus !== undefined) {
    assertNonNegativeInt(patch.birthdayBonus, "Бонус ДР");
  }
  if (patch.visitHours !== undefined) {
    assertNonNegativeInt(patch.visitHours, "Длительность визита");
    if (patch.visitHours < 1 || patch.visitHours > 24) {
      throw new DomainError("bad_request", "Визит от 1 до 24 часов");
    }
  }
  if (patch.referralBonusReferrer !== undefined) {
    assertNonNegativeInt(patch.referralBonusReferrer, "Реф. бонус пригласившему");
  }
  if (patch.referralBonusReferee !== undefined) {
    assertNonNegativeInt(patch.referralBonusReferee, "Реф. бонус другу");
  }
  if (patch.maxSessionsPerHour !== undefined) {
    assertNonNegativeInt(patch.maxSessionsPerHour, "Лимит сессий");
  }
  if (Object.keys(patch).length === 0) {
    throw new DomainError("bad_request", "Нет полей для обновления");
  }
  return store.updateSettings(patch);
}
