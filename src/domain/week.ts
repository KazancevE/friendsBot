import { DateTime } from "luxon";

/** Часовой пояс заведения, если VENUE_TIMEZONE не задан и настройки ещё не загружены. */
export const DEFAULT_VENUE_TIMEZONE = "Asia/Barnaul";

let runtimeZone: string | null = null;

export const setAppTimezone = (zone: string) => {
  const trimmed = zone.trim();
  if (DateTime.now().setZone(trimmed).isValid) {
    runtimeZone = trimmed;
  }
};

/** Активный часовой пояс: настройка заведения, затем VENUE_TIMEZONE, затем Asia/Barnaul. */
export const appTimezone = (): string => {
  if (runtimeZone !== null) {
    return runtimeZone;
  }
  const raw = process.env.VENUE_TIMEZONE?.trim();
  if (raw && DateTime.now().setZone(raw).isValid) {
    return raw;
  }
  return DEFAULT_VENUE_TIMEZONE;
};

export const weekStartInZone = (at: DateTime, zone: string): DateTime => {
  const local = at.setZone(zone);
  const weekday = local.weekday; // 1 = Monday
  return local.startOf("day").minus({ days: weekday - 1 });
};

export const moscowCalendarYear = (at: Date) => {
  return DateTime.fromJSDate(at).setZone(appTimezone()).year;
};

export const moscowYearStart = (year: number) => {
  return DateTime.fromObject({ year, month: 1, day: 1 }, { zone: appTimezone() }).toJSDate();
};

export function weekStartMoscow(at: DateTime): DateTime {
  return weekStartInZone(at, appTimezone());
}

/** Фиксированная метка Europe/Moscow для расчётов, которым нужна именно она. Приложение её не подставляет. */
export const MOSCOW = "Europe/Moscow";
