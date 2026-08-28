import { DateTime } from "luxon";
import { expect, test } from "vitest";
import { guestCheckIn } from "../../src/domain/check-in.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { ensureActiveVenueCode, venueQrPayload } from "../../src/domain/venue-code.ts";
import { MOSCOW } from "../../src/domain/week.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("guest check-in with pin opens visit and logs", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 1n,
    firstName: "G",
    lastName: "U",
    birthday: new Date("1990-01-01"),
    phone: "79991111111",
  });
  const now = DateTime.fromObject(
    { year: 2026, month: 8, day: 28, hour: 12, minute: 0 },
    { zone: MOSCOW },
  ).toJSDate();
  const code = await ensureActiveVenueCode(store, now);
  const result = await guestCheckIn(store, {
    userId: guest.id,
    method: "pin",
    pin: code.pin,
    now,
  });
  expect(result.visit.userId).toBe(guest.id);
  const active = await store.getActiveVisit(guest.id, now);
  expect(active).not.toBeNull();
  const visits = await store.listActiveVisits(now);
  expect(visits).toHaveLength(1);
  expect(visits[0]?.checkInMethod).toBe("pin");
});

test("guest check-in with qr token works", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 2n,
    firstName: "A",
    lastName: "B",
    birthday: new Date("1991-02-02"),
    phone: "79992222222",
  });
  const now = DateTime.fromObject(
    { year: 2026, month: 8, day: 28, hour: 12, minute: 0 },
    { zone: MOSCOW },
  ).toJSDate();
  const code = await ensureActiveVenueCode(store, now);
  await guestCheckIn(store, {
    userId: guest.id,
    method: "qr",
    token: venueQrPayload(code.token),
    now,
  });
  const visits = await store.listActiveVisits(now);
  expect(visits[0]?.checkInMethod).toBe("qr");
});

test("wrong pin is rejected", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 3n,
    firstName: "X",
    lastName: "Y",
    birthday: new Date("1992-03-03"),
    phone: "79993333333",
  });
  const now = new Date();
  await ensureActiveVenueCode(store, now);
  await expect(
    guestCheckIn(store, { userId: guest.id, method: "pin", pin: "0000", now }),
  ).rejects.toMatchObject({ code: "bad_code" });
});
