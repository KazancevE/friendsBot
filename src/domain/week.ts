import { DateTime } from "luxon";

export const MOSCOW = "Europe/Moscow";

export function weekStartMoscow(at: DateTime): DateTime {
  const local = at.setZone(MOSCOW);
  const weekday = local.weekday; // 1 = Monday
  return local.startOf("day").minus({ days: weekday - 1 });
}
