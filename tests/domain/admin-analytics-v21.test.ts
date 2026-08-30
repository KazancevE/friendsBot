import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { listGuestsPage } from "../../src/domain/guest-list.ts";
import { getGuestVisitPattern } from "../../src/domain/visit-pattern.ts";
import { getStatsHeatmap, getStatsTimeseries } from "../../src/domain/stats.ts";
import { periodLastDays } from "../../src/domain/stats.ts";

test("listGuestsPage returns paginated guest directory", async () => {
  const store = new MemoryStore();
  const guest = await store.createUser({
    telegramId: 100n,
    role: "guest",
    firstName: "Анна",
    lastName: "Иванова",
    birthday: null,
    phone: "79991112233",
    qrToken: "qr-anna",
  });
  await store.createVisit({
    userId: guest.id,
    openedBy: guest.id,
    startedAt: new Date("2026-08-01T18:00:00Z"),
    endsAt: new Date("2026-08-02T18:00:00Z"),
  });
  const page = await listGuestsPage(store, {
    limit: 10,
    offset: 0,
    sort: "lastVisitAt",
    order: "desc",
    now: new Date("2026-08-30T12:00:00Z"),
  });
  expect(page.total).toBeGreaterThanOrEqual(1);
  expect(page.guests.some((row) => row.id === guest.id)).toBe(true);
});

test("getGuestVisitPattern aggregates weekday and hour", async () => {
  const store = new MemoryStore();
  const guest = await store.createUser({
    telegramId: 101n,
    role: "guest",
    firstName: "Пётр",
    lastName: null,
    birthday: null,
    phone: "79992223344",
    qrToken: "qr-petr",
  });
  await store.createVisit({
    userId: guest.id,
    openedBy: guest.id,
    startedAt: new Date("2026-08-08T18:00:00+03:00"),
    endsAt: new Date("2026-08-09T18:00:00+03:00"),
  });
  const pattern = await getGuestVisitPattern(store, guest.id, new Date("2026-08-30T12:00:00Z"));
  expect(pattern.totalVisits).toBe(1);
  expect(pattern.byWeekday.length).toBe(7);
  expect(pattern.byHour.length).toBe(24);
});

test("getStatsHeatmap buckets visits by weekday and hour", async () => {
  const store = new MemoryStore();
  const guest = await store.createUser({
    telegramId: 102n,
    role: "guest",
    firstName: "Оля",
    lastName: null,
    birthday: null,
    phone: "79993334455",
    qrToken: "qr-olya",
  });
  const now = new Date("2026-08-30T12:00:00Z");
  await store.createVisit({
    userId: guest.id,
    openedBy: guest.id,
    startedAt: new Date("2026-08-20T18:00:00+03:00"),
    endsAt: new Date("2026-08-21T18:00:00+03:00"),
  });
  const period = periodLastDays(now, 30);
  const heatmap = await getStatsHeatmap(store, { period, source: "visits" });
  expect(heatmap.total).toBeGreaterThanOrEqual(1);
  expect(heatmap.cells.length).toBe(7 * 24);
});

test("getStatsTimeseries supports week granularity", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-08-30T12:00:00Z");
  const period = periodLastDays(now, 30);
  const series = await getStatsTimeseries(store, { period, metric: "visits", granularity: "week" });
  expect(series.points.length).toBeGreaterThan(0);
});
