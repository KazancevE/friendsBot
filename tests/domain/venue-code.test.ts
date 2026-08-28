import { DateTime } from "luxon";
import { expect, test } from "vitest";
import { registerGuest } from "../../src/domain/users.ts";
import {
  ensureActiveVenueCode,
  parseVenueToken,
  regenerateVenueCode,
  scheduledSlotStart,
  slotEndFromStart,
  venueQrPayload,
} from "../../src/domain/venue-code.ts";
import { MOSCOW } from "../../src/domain/week.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("scheduled slot aligns to even hours in Moscow", () => {
  const at = DateTime.fromObject(
    { year: 2026, month: 8, day: 28, hour: 15, minute: 30 },
    { zone: MOSCOW },
  ).toJSDate();
  const start = scheduledSlotStart(at);
  const local = DateTime.fromJSDate(start).setZone(MOSCOW);
  expect(local.hour).toBe(14);
  expect(local.minute).toBe(0);
  const end = slotEndFromStart(start);
  expect(DateTime.fromJSDate(end).setZone(MOSCOW).hour).toBe(16);
});

test("parseVenueToken reads qr payload", () => {
  expect(parseVenueToken("friends://checkin?t=abc123")).toBe("abc123");
  expect(parseVenueToken("abc123")).toBe("abc123");
});

test("ensureActiveVenueCode creates active code", async () => {
  const store = new MemoryStore();
  const now = DateTime.fromObject(
    { year: 2026, month: 8, day: 28, hour: 10, minute: 5 },
    { zone: MOSCOW },
  ).toJSDate();
  const code = await ensureActiveVenueCode(store, now);
  expect(code.pin).toMatch(/^\d{4}$/);
  expect(code.token.length).toBeGreaterThan(10);
  expect(venueQrPayload(code.token)).toContain(code.token);
});

test("regenerateVenueCode replaces active code", async () => {
  const store = new MemoryStore();
  const staff = await store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "M",
    lastName: "S",
    birthday: null,
    phone: null,
    qrToken: "staff1",
  });
  const now = DateTime.fromObject(
    { year: 2026, month: 8, day: 28, hour: 10, minute: 5 },
    { zone: MOSCOW },
  ).toJSDate();
  const first = await ensureActiveVenueCode(store, now);
  const second = await regenerateVenueCode(store, staff.id, now);
  expect(second.pin).not.toBe(first.pin);
  expect(second.token).not.toBe(first.token);
  const active = await store.findActiveVenueCode(now);
  expect(active?.id).toBe(second.id);
});
