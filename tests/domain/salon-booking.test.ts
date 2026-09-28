import { expect, test } from "vitest";
import { DateTime } from "luxon";
import { canonicalService, parseDurationMinutes, parsePriceCsv, parsePriceLevel } from "../../src/salon/catalog.ts";
import { decidePhoneLink, channelIdsToMove } from "../../src/salon/identity.ts";
import { SALON_DEFAULT_CASHBACK_PERCENT, cashbackForCheck } from "../../src/salon/money.ts";
import { isHaircutNudgeDue } from "../../src/salon/nudge.ts";
import { dueReminders } from "../../src/salon/reminders.ts";
import { issueGuestToken, readGuestToken } from "../../src/salon/session.ts";
import { freeSlotStarts, intervalsOverlap, slotsForAnyBarber } from "../../src/salon/slots.ts";
import { appTimezone, DEFAULT_VENUE_TIMEZONE } from "../../src/domain/week.ts";

test("free slots respect duration, step and existing bookings", () => {
  const slots = freeSlotStarts({
    openMin: 10 * 60,
    closeMin: 13 * 60,
    durationMin: 40,
    stepMin: 30,
    busy: [{ startMin: 10 * 60, endMin: 10 * 60 + 40 }],
  });
  expect(slots).toEqual([11 * 60, 11 * 60 + 30, 12 * 60]);
  expect(intervalsOverlap({ startMin: 600, endMin: 640 }, { startMin: 630, endMin: 700 })).toBe(true);
  expect(freeSlotStarts({
    openMin: 10 * 60,
    closeMin: 11 * 60,
    durationMin: 90,
    stepMin: 30,
    busy: [],
  })).toEqual([]);
});

test("any-barber picks the first free master and hides past starts", () => {
  const slots = slotsForAnyBarber(
    [
      { id: "a", openMin: 600, closeMin: 720, busy: [{ startMin: 600, endMin: 660 }] },
      { id: "b", openMin: 600, closeMin: 720, busy: [] },
    ],
    30,
    30,
  );
  expect(slots[0]).toEqual({ startMin: 600, barberId: "b" });
  expect(slots.find((slot) => slot.startMin === 660)?.barberId).toBe("a");
  const later = freeSlotStarts({
    openMin: 600,
    closeMin: 720,
    durationMin: 30,
    stepMin: 30,
    busy: [],
    earliestStartMin: 630,
  });
  expect(later[0]).toBe(630);
});

test("reminders fire at 24h and 2h and skip the long one inside the short window", () => {
  const startsAt = new Date("2026-10-02T12:00:00+07:00");
  expect(
    dueReminders({
      startsAt,
      now: new Date("2026-10-01T12:00:00+07:00"),
      status: "confirmed",
      sent24: false,
      sent2: false,
    }),
  ).toEqual(["h24"]);
  expect(
    dueReminders({
      startsAt,
      now: new Date("2026-10-02T10:30:00+07:00"),
      status: "confirmed",
      sent24: false,
      sent2: false,
    }),
  ).toEqual(["h2"]);
  expect(
    dueReminders({
      startsAt,
      now: new Date("2026-10-02T10:30:00+07:00"),
      status: "cancelled",
      sent24: false,
      sent2: false,
    }),
  ).toEqual([]);
  expect(
    dueReminders({
      startsAt,
      now: new Date("2026-10-01T12:00:00+07:00"),
      status: "confirmed",
      sent24: true,
      sent2: false,
    }),
  ).toEqual([]);
});

test("haircut nudge is due N weeks after the visit and only once", () => {
  const lastVisitAt = new Date("2026-09-01T12:00:00+07:00");
  const now = new Date("2026-09-29T12:00:00+07:00");
  expect(isHaircutNudgeDue({ lastVisitAt, lastNudgeAt: null, now, weeks: 4 })).toBe(true);
  expect(isHaircutNudgeDue({ lastVisitAt, lastNudgeAt: null, now, weeks: 5 })).toBe(false);
  expect(
    isHaircutNudgeDue({
      lastVisitAt,
      lastNudgeAt: new Date("2026-09-29T09:00:00+07:00"),
      now,
      weeks: 4,
    }),
  ).toBe(false);
  expect(isHaircutNudgeDue({ lastVisitAt: null, lastNudgeAt: null, now, weeks: 4 })).toBe(false);
});

test("cashback default is 5 percent of the check", () => {
  expect(SALON_DEFAULT_CASHBACK_PERCENT).toBe(5);
  expect(cashbackForCheck(1900)).toBe(95);
  expect(cashbackForCheck(1400, 5)).toBe(70);
  expect(cashbackForCheck(1000, 0)).toBe(0);
});

test("phone links two channels onto one client", () => {
  expect(decidePhoneLink("current", null)).toEqual({ action: "set_phone" });
  expect(decidePhoneLink("current", "current")).toEqual({ action: "set_phone" });
  expect(decidePhoneLink("max-user", "tg-user")).toEqual({
    action: "merge_into",
    canonicalUserId: "tg-user",
  });
  expect(
    channelIdsToMove({
      channel: "max",
      currentTelegramId: -15n,
      currentMaxUserId: 15n,
      canonicalMaxUserId: null,
      canonicalTelegramId: 100n,
    }),
  ).toEqual({ maxUserId: 15n, telegramId: null });
  expect(
    channelIdsToMove({
      channel: "telegram",
      currentTelegramId: 100n,
      currentMaxUserId: null,
      canonicalMaxUserId: 15n,
      canonicalTelegramId: -15n,
    }),
  ).toEqual({ maxUserId: null, telegramId: 100n });
});

test("price csv keeps duration, level and branch", () => {
  expect(parseDurationMinutes("1 ч 10 м")).toBe(70);
  expect(parseDurationMinutes("40 м")).toBe(40);
  expect(parsePriceLevel("Шеф - барбер")).toBe("chef");
  expect(parsePriceLevel("Новый барбер")).toBe("junior");
  expect(parsePriceLevel("Дополнительные услуги")).toBe("any");
  expect(canonicalService("Стрижка детская(до 12 лет)").name).toBe("Детская стрижка");
  const rows = parsePriceCsv(
    [
      "филиал,категория/уровень,услуга,цена_руб,цена_от,длительность,источник",
      "Васильева 55,Барбер,Стрижка,1400,да,40 м,https://dikidi.net/example",
      "Училищный 7,Шеф - барбер,Стрижка,1900,нет,40 м,https://dikidi.net/example",
      "Училищный 7,Новый барбер,Стрижка машинкой Фэйд,800,да,40 м,https://dikidi.net/example",
    ].join("\n"),
  );
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({
    branchSlug: "vasilyeva",
    level: "barber",
    serviceName: "Стрижка",
    priceRub: 1400,
    priceFrom: true,
    durationMinutes: 40,
  });
  expect(rows[2]?.serviceName).toBe("Стрижка машинкой (фейд)");
});

test("guest token roundtrip and default timezone", () => {
  const token = issueGuestToken("secret", "user-1", 60, 1_000);
  expect(readGuestToken("secret", token, 1_000)).toBe("user-1");
  expect(readGuestToken("secret", token, 1_000 + 61_000)).toBeNull();
  expect(readGuestToken("other", token, 1_000)).toBeNull();
  const previous = process.env.VENUE_TIMEZONE;
  delete process.env.VENUE_TIMEZONE;
  expect(appTimezone()).toBe(DEFAULT_VENUE_TIMEZONE);
  expect(DEFAULT_VENUE_TIMEZONE).toBe("Asia/Barnaul");
  expect(DateTime.now().setZone(DEFAULT_VENUE_TIMEZONE).isValid).toBe(true);
  if (previous === undefined) {
    delete process.env.VENUE_TIMEZONE;
  } else {
    process.env.VENUE_TIMEZONE = previous;
  }
});
