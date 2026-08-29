import { expect, test } from "vitest";
import { applyCheck } from "../../src/domain/ledger.ts";
import { getStatsStaff, getStatsTimeseries, getStatsSummary, periodLastDays } from "../../src/domain/stats.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const seedGuest = async (store: MemoryStore, phone: string) => {
  return registerGuest(store, {
    telegramId: BigInt(phone.slice(-9)),
    firstName: "G",
    lastName: phone,
    birthday: new Date("1990-01-01"),
    phone,
  });
};

const seedMaster = async (store: MemoryStore) => {
  return store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
};

test("timeseries counts visits per moscow day", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-08-30T20:00:00+03:00");
  const guest = await seedGuest(store, "79990001130");
  const master = await seedMaster(store);
  await store.createVisit({
    userId: guest.id,
    openedBy: master.id,
    startedAt: new Date("2026-08-29T18:00:00+03:00"),
    endsAt: new Date("2026-08-29T22:00:00+03:00"),
  });
  await store.createVisit({
    userId: guest.id,
    openedBy: master.id,
    startedAt: new Date("2026-08-30T12:00:00+03:00"),
    endsAt: new Date("2026-08-30T16:00:00+03:00"),
  });
  const period = periodLastDays(now, 7);
  const series = await getStatsTimeseries(store, { period, metric: "visits" });
  const byDate = new Map(series.points.map((point) => [point.date, point.value]));
  expect(byDate.get("2026-08-29")).toBe(1);
  expect(byDate.get("2026-08-30")).toBe(1);
});

test("timeseries sums credited bonuses per day", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-08-30T20:00:00+03:00");
  const guest = await seedGuest(store, "79990001131");
  const master = await seedMaster(store);
  await applyCheck(store, { guestId: guest.id, actorId: master.id, checkRubles: 1000, now });
  const period = periodLastDays(now, 7);
  const series = await getStatsTimeseries(store, { period, metric: "bonuses" });
  const today = series.points.find((point) => point.date === "2026-08-30");
  expect(today?.value).toBeGreaterThanOrEqual(100);
});

test("staff stats ranks actors by action count", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-08-30T20:00:00+03:00");
  const guest = await seedGuest(store, "79990001132");
  const master = await seedMaster(store);
  await applyCheck(store, { guestId: guest.id, actorId: master.id, checkRubles: 500, now });
  await applyCheck(store, { guestId: guest.id, actorId: master.id, checkRubles: 700, now });
  const period = periodLastDays(now, 7);
  const staff = await getStatsStaff(store, period);
  expect(staff.rows[0]?.actorId).toBe(master.id);
  expect(staff.rows[0]?.actions).toBeGreaterThanOrEqual(2);
  const summary = await getStatsSummary(store, period, now);
  expect(summary.staffActions).toBeGreaterThanOrEqual(2);
});
