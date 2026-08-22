import type { PrizePlace, Settings } from "./types.ts";

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
};

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
