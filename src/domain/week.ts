import { DateTime } from "luxon";

export const MOSCOW = "Europe/Moscow";

export const moscowCalendarYear = (at: Date) => {
  return DateTime.fromJSDate(at).setZone(MOSCOW).year;
};

export const moscowYearStart = (year: number) => {
  return DateTime.fromObject({ year, month: 1, day: 1 }, { zone: MOSCOW }).toJSDate();
};

export function weekStartMoscow(at: DateTime): DateTime {
  const local = at.setZone(MOSCOW);
  const weekday = local.weekday; // 1 = Monday
  return local.startOf("day").minus({ days: weekday - 1 });
}
