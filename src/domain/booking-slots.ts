import { DateTime } from "luxon";
import type { Settings } from "./types.ts";
import { MOSCOW } from "./week.ts";

export const bookingSlotStarts = (settings: Settings) => {
  const slots: Array<{ hour: number; minute: number }> = [];
  const startMinutes = settings.bookingHoursStart * 60;
  const endMinutes = settings.bookingHoursEnd * 60;
  const step = settings.bookingSlotMinutes;

  for (let minute = startMinutes; minute < endMinutes; minute += step) {
    slots.push({ hour: Math.floor(minute / 60), minute: minute % 60 });
  }

  return slots;
};

export const isBookingDayClosed = (date: DateTime, settings: Settings) => {
  return settings.bookingClosedWeekdays.includes(date.weekday);
};

export const moscowDayRange = (at: Date) => {
  const local = DateTime.fromJSDate(at, { zone: MOSCOW });
  return {
    from: local.startOf("day").toJSDate(),
    to: local.endOf("day").toJSDate(),
  };
};
