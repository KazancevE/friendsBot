import { DateTime } from "luxon";
import type { Settings } from "./types.ts";
import type { StaffWeeklyScheduleRecord } from "./types.ts";
import { venueDateTime } from "./venue-time.ts";

/** @deprecated Use isWeeklySlotActive from staff-shifts.ts */
export const isScheduleSlotActive = (slot: StaffWeeklyScheduleRecord, at: Date, settings?: Settings) => {
  const local = settings
    ? venueDateTime(at, settings)
    : DateTime.fromJSDate(at, { zone: "Europe/Moscow" });
  const weekday = local.weekday;
  const minutes = local.hour * 60 + local.minute;
  const start = slot.startHour * 60;
  const end = slot.endHour * 60;
  const dayEnd = 24 * 60;

  if (end <= dayEnd) {
    return slot.weekday === weekday && minutes >= start && minutes < end;
  }

  if (slot.weekday === weekday && minutes >= start) {
    return true;
  }

  const nextWeekday = slot.weekday === 7 ? 1 : slot.weekday + 1;
  if (nextWeekday === weekday && minutes < end - dayEnd) {
    return true;
  }

  return false;
};
