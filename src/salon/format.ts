import { DateTime } from "luxon";
import { appTimezone } from "../domain/week.ts";

const WEEKDAYS = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export const formatPrice = (rubles: number, from: boolean) => {
  const value = rubles.toLocaleString("ru-RU");
  return from ? `от ${value} ₽` : `${value} ₽`;
};

export const formatMinutes = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const formatDayLabel = (isoDate: string, zone = appTimezone()) => {
  const day = DateTime.fromISO(isoDate, { zone });
  if (!day.isValid) {
    return isoDate;
  }
  return `${day.toFormat("dd.MM")} ${WEEKDAYS[day.weekday] ?? ""}`.trim();
};

export const formatAppointmentWhen = (startsAt: Date, zone = appTimezone()) => {
  const local = DateTime.fromJSDate(startsAt, { zone });
  return `${local.toFormat("dd.MM")} ${WEEKDAYS[local.weekday] ?? ""} ${local.toFormat("HH:mm")}`.replace(/\s+/g, " ").trim();
};
