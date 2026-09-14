import { expect, test } from "vitest";
import { WEEKLY_POINTS_CAP, toWeeklyPoints } from "../../src/domain/weekly-points.ts";

test("zero raw score yields zero weekly points", () => {
  expect(toWeeklyPoints({ slug: "match3", rawScore: 0 })).toBe(0);
});

test("applies a per-game coefficient and rounds", () => {
  expect(toWeeklyPoints({ slug: "flappy", rawScore: 20 })).toBe(1000);
  expect(toWeeklyPoints({ slug: "match3", rawScore: 4000 })).toBe(1000);
  expect(toWeeklyPoints({ slug: "blockblast", rawScore: 2000 })).toBe(1000);
  expect(toWeeklyPoints({ slug: "game2048", rawScore: 1000 })).toBe(1000);
  expect(toWeeklyPoints({ slug: "quiz", rawScore: 1500 })).toBe(1500);
});

test("unknown games keep raw score", () => {
  expect(toWeeklyPoints({ slug: "unknown", rawScore: 180 })).toBe(180);
});

test("weekly points scale linearly until the session cap", () => {
  expect(toWeeklyPoints({ slug: "match3", rawScore: 8000 })).toBe(2000);
  expect(toWeeklyPoints({ slug: "match3", rawScore: 50_000 })).toBe(WEEKLY_POINTS_CAP);
  expect(toWeeklyPoints({ slug: "flappy", rawScore: 500 })).toBe(WEEKLY_POINTS_CAP);
});
