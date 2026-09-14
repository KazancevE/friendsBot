import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { closeActiveVisit, staffOpenVisit } from "../../src/domain/visits.ts";

test("second check extends visit to now + visitHours", async () => {
  const store = new MemoryStore();
  const g = await registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79991111111",
  });
  const s = await store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
  const first = new Date("2026-08-22T12:00:00+03:00");
  await applyCheck(store, { guestId: g.id, actorId: s.id, checkRubles: 1000, now: first });
  const later = new Date("2026-08-22T13:00:00+03:00");
  await applyCheck(store, { guestId: g.id, actorId: s.id, checkRubles: 1000, now: later });
  const visit = await store.getActiveVisit(g.id, later);
  expect(visit).not.toBeNull();
  expect(visit!.endsAt.getTime()).toBe(later.getTime() + 4 * 3600 * 1000);
});

test("closeActiveVisit ends the current visit", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 2n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79991111112",
  });
  const staff = await store.createUser({
    telegramId: 98n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken2",
  });
  const now = new Date("2026-08-22T12:00:00+03:00");
  await staffOpenVisit(store, { guestId: guest.id, actorId: staff.id, now });
  expect(await store.getActiveVisit(guest.id, now)).not.toBeNull();
  await closeActiveVisit(store, { guestId: guest.id, actorId: staff.id, now });
  expect(await store.getActiveVisit(guest.id, now)).toBeNull();
});
