import { DateTime } from "luxon";
import { expect, test } from "vitest";
import { submitScore } from "../../src/domain/games.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { openOrExtendVisit } from "../../src/domain/visits.ts";
import { weekStartMoscow } from "../../src/domain/week.ts";
import { closeOpenWeeks } from "../../src/domain/weekly.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const duringWeek = new Date("2026-08-22T12:00:00+03:00");
const mondayAfter = new Date("2026-08-24T00:00:00+03:00");

const seedGuest = async (store: MemoryStore, telegramId: bigint, phone: string) => {
  return registerGuest(store, {
    telegramId,
    firstName: "Г",
    lastName: String(telegramId),
    birthday: new Date("1990-01-01"),
    phone,
  });
};

const openVisit = async (store: MemoryStore, userId: string, openedBy: string, now: Date) => {
  await openOrExtendVisit(store, { userId, openedBy, hours: 4, now });
};

test("awards top N prizes, coupon, and is idempotent", async () => {
  const store = new MemoryStore();
  await store.updateSettings({
    winnersCount: 2,
    prizeTable: [
      { place: 1, bonuses: 1000, couponTitle: "Кальян" },
      { place: 2, bonuses: 500, couponTitle: null },
    ],
  });
  const first = await seedGuest(store, 1n, "79990000001");
  const second = await seedGuest(store, 2n, "79990000002");
  const third = await seedGuest(store, 3n, "79990000003");
  const staff = await store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
  await openVisit(store, first.id, staff.id, duringWeek);
  await openVisit(store, second.id, staff.id, duringWeek);
  await openVisit(store, third.id, staff.id, duringWeek);
  await submitScore(store, { userId: first.id, slug: "match3", points: 300, now: duringWeek });
  await submitScore(store, { userId: second.id, slug: "match3", points: 200, now: duringWeek });
  await submitScore(store, { userId: third.id, slug: "match3", points: 50, now: duringWeek });

  const weekStart = weekStartMoscow(DateTime.fromJSDate(duringWeek)).toJSDate();

  await closeOpenWeeks(store, mondayAfter);

  expect((await store.findUserById(first.id))?.balance).toBe(1500);
  expect((await store.findUserById(second.id))?.balance).toBe(1000);
  expect((await store.findUserById(third.id))?.balance).toBe(500);
  const coupons = await store.listActiveCoupons(first.id);
  expect(coupons.map((coupon) => coupon.title)).toEqual(["Кальян"]);
  expect(await store.listActiveCoupons(second.id)).toEqual([]);
  expect(await store.hasWeeklyAward(weekStart, first.id)).toBe(true);
  expect(await store.hasWeeklyAward(weekStart, second.id)).toBe(true);

  await closeOpenWeeks(store, mondayAfter);
  expect((await store.findUserById(first.id))?.balance).toBe(1500);
  expect((await store.findUserById(second.id))?.balance).toBe(1000);
});

test("tie ranks earlier updatedAt higher", async () => {
  const store = new MemoryStore();
  await store.updateSettings({
    winnersCount: 1,
    prizeTable: [{ place: 1, bonuses: 1000, couponTitle: null }],
  });
  const earlier = await seedGuest(store, 11n, "79990000011");
  const later = await seedGuest(store, 12n, "79990000012");
  const staff = await store.createUser({
    telegramId: 98n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken2",
  });
  const t1 = new Date("2026-08-22T12:00:00+03:00");
  const t2 = new Date("2026-08-22T12:01:00+03:00");
  await openVisit(store, earlier.id, staff.id, t1);
  await openVisit(store, later.id, staff.id, t1);
  await submitScore(store, { userId: earlier.id, slug: "match3", points: 100, now: t1 });
  await submitScore(store, { userId: later.id, slug: "match3", points: 100, now: t2 });

  await closeOpenWeeks(store, mondayAfter);

  expect((await store.findUserById(earlier.id))?.balance).toBe(1500);
  expect((await store.findUserById(later.id))?.balance).toBe(500);
});

test("skips staff in week rankings when awarding prizes", async () => {
  const store = new MemoryStore();
  await store.updateSettings({
    winnersCount: 2,
    prizeTable: [
      { place: 1, bonuses: 1000, couponTitle: null },
      { place: 2, bonuses: 500, couponTitle: null },
    ],
  });
  const first = await seedGuest(store, 21n, "79990000021");
  const second = await seedGuest(store, 22n, "79990000022");
  const staff = await store.createUser({
    telegramId: 97n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken3",
  });
  const game = await store.findGameBySlug("match3");
  if (game === null) {
    throw new Error("match3 missing");
  }
  const weekStart = weekStartMoscow(DateTime.fromJSDate(duringWeek)).toJSDate();
  const week = await store.getOrCreateOpenWeek(game.id, weekStart);
  await store.addScore(week.id, staff.id, 999, duringWeek);
  await openVisit(store, first.id, staff.id, duringWeek);
  await openVisit(store, second.id, staff.id, duringWeek);
  await submitScore(store, { userId: first.id, slug: "match3", points: 300, now: duringWeek });
  await submitScore(store, { userId: second.id, slug: "match3", points: 200, now: duringWeek });

  await closeOpenWeeks(store, mondayAfter);

  expect((await store.findUserById(first.id))?.balance).toBe(1500);
  expect((await store.findUserById(second.id))?.balance).toBe(1000);
  expect(await store.hasWeeklyAward(weekStart, staff.id)).toBe(false);
  expect(await store.hasWeeklyAward(weekStart, first.id)).toBe(true);
  expect(await store.hasWeeklyAward(weekStart, second.id)).toBe(true);
});

test("awards overall ranking across multiple games once per week", async () => {
  const store = new MemoryStore();
  await store.updateSettings({
    winnersCount: 1,
    prizeTable: [{ place: 1, bonuses: 1000, couponTitle: null }],
  });
  const leader = await seedGuest(store, 31n, "79990000031");
  const specialist = await seedGuest(store, 32n, "79990000032");
  const staff = await store.createUser({
    telegramId: 96n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken4",
  });
  await openVisit(store, leader.id, staff.id, duringWeek);
  await openVisit(store, specialist.id, staff.id, duringWeek);
  await submitScore(store, { userId: leader.id, slug: "match3", points: 200, now: duringWeek });
  await submitScore(store, { userId: leader.id, slug: "blockblast", points: 150, now: duringWeek });
  await submitScore(store, { userId: specialist.id, slug: "match3", points: 300, now: duringWeek });

  await closeOpenWeeks(store, mondayAfter);

  expect((await store.findUserById(leader.id))?.balance).toBe(1500);
  expect((await store.findUserById(specialist.id))?.balance).toBe(500);
});
