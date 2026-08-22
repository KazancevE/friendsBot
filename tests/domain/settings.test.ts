import { expect, test } from "vitest";
import { DEFAULT_SETTINGS, parsePrizeTable } from "../../src/domain/settings.ts";

test("defaults match spec", () => {
  expect(DEFAULT_SETTINGS.percent).toBe(10);
  expect(DEFAULT_SETTINGS.registrationBonus).toBe(500);
  expect(DEFAULT_SETTINGS.birthdayBonus).toBe(500);
  expect(DEFAULT_SETTINGS.visitHours).toBe(4);
  expect(DEFAULT_SETTINGS.winnersCount).toBe(3);
});

test("prize table place 1 can mix bonuses and coupon", () => {
  const table = parsePrizeTable(
    JSON.stringify([{ place: 1, bonuses: 1000, couponTitle: "Кальян" }]),
  );
  expect(table[0]).toEqual({ place: 1, bonuses: 1000, couponTitle: "Кальян" });
});
