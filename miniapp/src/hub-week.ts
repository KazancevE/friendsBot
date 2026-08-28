import { DateTime } from "luxon";
import { MOSCOW, weekStartMoscow } from "../../src/domain/week.ts";

export const formatWeekCountdown = (now: Date): string => {
  const at = DateTime.fromJSDate(now).setZone(MOSCOW);
  const nextWeekStart = weekStartMoscow(at).plus({ weeks: 1 });
  const remainingMs = nextWeekStart.toMillis() - at.toMillis();
  if (remainingMs <= 0) {
    return "скоро";
  }
  const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) {
    return `${days} д ${hours} ч`;
  }
  if (hours > 0) {
    return `${hours} ч`;
  }
  const minutes = Math.floor(remainingMs / (60 * 1000));
  return `${minutes} мин`;
};
