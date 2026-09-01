import { expect, test } from "vitest";
import { bookingSlotStarts, isBookingDayClosed } from "../../src/domain/booking-slots.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { isScheduleSlotActive } from "../../src/domain/staff-schedule-weekly.ts";
import { listOnDutyStaffTelegramIds } from "../../src/domain/staff-schedule.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import { DateTime } from "luxon";
import { MOSCOW } from "../../src/domain/week.ts";

test("booking slots follow settings", () => {
  const slots = bookingSlotStarts({
    ...DEFAULT_SETTINGS,
    bookingHoursStart: 19,
    bookingHoursEnd: 21,
    bookingSlotMinutes: 30,
  });
  expect(slots).toEqual([
    { hour: 19, minute: 0 },
    { hour: 19, minute: 30 },
    { hour: 20, minute: 0 },
    { hour: 20, minute: 30 },
  ]);
});

test("isBookingDayClosed respects weekday list", () => {
  const monday = DateTime.fromObject({ year: 2026, month: 9, day: 7 }, { zone: MOSCOW });
  expect(isBookingDayClosed(monday, { ...DEFAULT_SETTINGS, bookingClosedWeekdays: [1] })).toBe(true);
  expect(isBookingDayClosed(monday, DEFAULT_SETTINGS)).toBe(false);
});

test("on-duty staff falls back to all staff without schedules", async () => {
  const store = new MemoryStore();
  await store.createUser({
    telegramId: 10n,
    role: "master",
    firstName: "A",
    lastName: "B",
    birthday: null,
    phone: null,
    qrToken: "token10",
  });
  const ids = await listOnDutyStaffTelegramIds(store, new Date());
  expect(ids).toEqual([10n]);
});

test("overnight schedule matches early morning", async () => {
  const store = new MemoryStore();
  const master = await store.createUser({
    telegramId: 11n,
    role: "master",
    firstName: "M",
    lastName: "S",
    birthday: null,
    phone: null,
    qrToken: "token11",
  });
  await store.replaceStaffWeeklySchedule(master.id, [{ weekday: 1, startHour: 18, endHour: 26 }]);
  const schedules = await store.listStaffWeeklySchedule(master.id);
  const tuesdayEarly = DateTime.fromObject(
    { year: 2026, month: 9, day: 8, hour: 1, minute: 0 },
    { zone: MOSCOW },
  ).toJSDate();
  expect(isScheduleSlotActive(schedules[0]!, tuesdayEarly)).toBe(true);
});
