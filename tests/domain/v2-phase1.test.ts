import { describe, expect, test } from "vitest";
import { createBookingRequest, handleBookingRequest } from "../../src/domain/booking.ts";
import { buildStaffGuestCard, formatStaffGuestCard } from "../../src/domain/guest-card.ts";
import { searchGuestsByName } from "../../src/domain/guest-search.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { getStatsSummary } from "../../src/domain/stats.ts";
import { extendActiveVisit, staffOpenVisit } from "../../src/domain/visits.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const seedGuest = async (store: MemoryStore, input: { firstName: string; lastName: string; phone: string }) => {
  return store.createUser({
    telegramId: BigInt(Math.floor(Math.random() * 1_000_000)),
    role: "guest",
    firstName: input.firstName,
    lastName: input.lastName,
    birthday: null,
    phone: input.phone,
    qrToken: crypto.randomUUID(),
  });
};

const seedMaster = async (store: MemoryStore) => {
  return store.createUser({
    telegramId: BigInt(Math.floor(Math.random() * 1_000_000)),
    role: "master",
    firstName: "Master",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: crypto.randomUUID(),
  });
};

describe("v2 phase 1", () => {
  test("searchGuestsByName finds guest by first name", async () => {
    const store = new MemoryStore();
    await seedGuest(store, { firstName: "Иван", lastName: "Петров", phone: "79991112233" });
    const hits = await searchGuestsByName(store, { query: "иван", now: new Date() });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.firstName).toBe("Иван");
  });

  test("extendActiveVisit requires active visit", async () => {
    const store = new MemoryStore();
    const guest = await seedGuest(store, { firstName: "A", lastName: "B", phone: "79990001122" });
    const master = await seedMaster(store);
    await expect(
      extendActiveVisit(store, { guestId: guest.id, actorId: master.id, now: new Date() }),
    ).rejects.toThrow("Нет активного визита");
  });

  test("staffOpenVisit logs visit and extendActiveVisit extends it", async () => {
    const store = new MemoryStore();
    const guest = await seedGuest(store, { firstName: "A", lastName: "B", phone: "79990001123" });
    const master = await seedMaster(store);
    const now = new Date("2026-08-30T18:00:00+03:00");
    const opened = await staffOpenVisit(store, { guestId: guest.id, actorId: master.id, now });
    expect(opened.endsAt.getTime()).toBeGreaterThan(now.getTime());
    const logs = await store.listStaffActionLog({
      from: new Date(0),
      to: new Date("2099-01-01"),
      limit: 10,
      offset: 0,
    });
    expect(logs.some((row) => row.action === "visit_open")).toBe(true);
    const extended = await extendActiveVisit(store, {
      guestId: guest.id,
      actorId: master.id,
      now: new Date(now.getTime() + 60_000),
    });
    expect(extended.endsAt.getTime()).toBeGreaterThan(opened.endsAt.getTime());
  });

  test("buildStaffGuestCard includes visit stats and staff note", async () => {
    const store = new MemoryStore();
    const guest = await seedGuest(store, { firstName: "Ann", lastName: "Kay", phone: "79990001124" });
    const master = await seedMaster(store);
    const now = new Date("2026-08-30T18:00:00+03:00");
    await staffOpenVisit(store, { guestId: guest.id, actorId: master.id, now });
    await store.updateUser(guest.id, { staffNote: "любит мяту" });
    const card = await buildStaffGuestCard(store, await store.findUserById(guest.id)!, now);
    expect(card.totalVisits).toBe(1);
    expect(card.staffNote).toBe("любит мяту");
    expect(formatStaffGuestCard(card)).toContain("любит мяту");
  });

  test("applyCheck creates staff action log", async () => {
    const store = new MemoryStore();
    const guest = await seedGuest(store, { firstName: "X", lastName: "Y", phone: "79990001125" });
    const master = await seedMaster(store);
    await applyCheck(store, {
      guestId: guest.id,
      actorId: master.id,
      checkRubles: 2000,
      now: new Date(),
    });
    const logs = await store.listStaffActionLog({
      from: new Date(0),
      to: new Date("2099-01-01"),
      limit: 10,
      offset: 0,
    });
    expect(logs.some((row) => row.action === "check")).toBe(true);
  });

  test("stats summary counts registration and staff actions", async () => {
    const store = new MemoryStore();
    const now = new Date("2026-08-30T20:00:00+03:00");
    const guest = await seedGuest(store, { firstName: "S", lastName: "T", phone: "79990001126" });
    await store.updateUser(guest.id, { createdAt: new Date("2026-08-30T10:00:00+03:00") });
    const master = await seedMaster(store);
    await applyCheck(store, { guestId: guest.id, actorId: master.id, checkRubles: 1000, now });
    const summary = await getStatsSummary(
      store,
      { from: new Date(0), to: new Date("2099-01-01T00:00:00Z") },
      now,
    );
    expect(summary.registrations).toBeGreaterThanOrEqual(1);
    expect(summary.staffActions).toBeGreaterThanOrEqual(1);
    expect(summary.averageCheckRubles).toBe(1000);
  });

  test("booking pending limit and staff handle", async () => {
    const store = new MemoryStore();
    const guest = await seedGuest(store, { firstName: "B", lastName: "K", phone: "79990001127" });
    const master = await seedMaster(store);
    const requestedFor = new Date("2026-08-31T20:00:00+03:00");
    const booking = await createBookingRequest(store, {
      userId: guest.id,
      requestedFor,
      partySize: 3,
      comment: "у окна",
      now: new Date("2026-08-30T12:00:00+03:00"),
    });
    expect(booking.status).toBe("pending");
    await expect(
      createBookingRequest(store, {
        userId: guest.id,
        requestedFor,
        partySize: 2,
        comment: null,
        now: new Date("2026-08-30T12:00:00+03:00"),
      }),
    ).rejects.toThrow("У вас уже есть заявка");
    const confirmed = await handleBookingRequest(store, {
      bookingId: booking.id,
      actorId: master.id,
      status: "confirmed",
      now: new Date(),
    });
    expect(confirmed.status).toBe("confirmed");
  });
});
