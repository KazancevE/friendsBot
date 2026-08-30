import { DateTime } from "luxon";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

const WEEKDAY_LABELS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export type GuestVisitPattern = {
  totalVisits: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  byWeekday: Array<{ weekday: number; label: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  topWeekdays: string[];
  topHours: string[];
  visitsPerMonth: number | null;
};

const topLabels = <T extends { count: number }>(
  rows: T[],
  label: (row: T) => string,
  limit = 2,
): string[] => {
  return [...rows]
    .sort((left, right) => right.count - left.count)
    .filter((row) => row.count > 0)
    .slice(0, limit)
    .map(label);
};

export async function getGuestVisitPattern(
  store: Store,
  userId: string,
  now: Date,
): Promise<GuestVisitPattern> {
  const guest = await store.findUserById(userId);
  const visits = await store.listVisitStartsForUser(userId);
  const totalVisits = visits.length;
  const lastVisitAt =
    totalVisits === 0
      ? null
      : visits.reduce((latest, visit) => (visit.startedAt > latest ? visit.startedAt : latest), visits[0]!.startedAt);
  const daysSinceLastVisit =
    lastVisitAt === null
      ? null
      : Math.floor(
          DateTime.fromJSDate(now, { zone: MOSCOW }).diff(
            DateTime.fromJSDate(lastVisitAt, { zone: MOSCOW }),
            "days",
          ).days,
        );

  const weekdayCounts = new Map<number, number>();
  const hourCounts = new Map<number, number>();
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    weekdayCounts.set(weekday, 0);
  }
  for (let hour = 0; hour < 24; hour += 1) {
    hourCounts.set(hour, 0);
  }
  for (const visit of visits) {
    const moscow = DateTime.fromJSDate(visit.startedAt, { zone: MOSCOW });
    const weekday = moscow.weekday;
    const hour = moscow.hour;
    weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  const byWeekday = [...weekdayCounts.entries()].map(([weekday, count]) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday] ?? String(weekday),
    count,
  }));
  const byHour = [...hourCounts.entries()].map(([hour, count]) => ({ hour, count }));

  const monthsSinceCreated =
    guest === null
      ? null
      : Math.max(
          1,
          DateTime.fromJSDate(now, { zone: MOSCOW }).diff(
            DateTime.fromJSDate(guest.createdAt, { zone: MOSCOW }),
            "months",
          ).months,
        );

  return {
    totalVisits,
    lastVisitAt: lastVisitAt?.toISOString() ?? null,
    daysSinceLastVisit,
    byWeekday,
    byHour,
    topWeekdays: topLabels(byWeekday, (row) => row.label),
    topHours: topLabels(byHour, (row) => `${String(row.hour).padStart(2, "0")}:00`),
    visitsPerMonth: monthsSinceCreated === null ? null : Math.round((totalVisits / monthsSinceCreated) * 10) / 10,
  };
}
