import { DateTime } from "luxon";
import { DomainError } from "./errors.ts";
import type { Settings, StaffShiftRecord, StaffWeeklyScheduleRecord } from "./types.ts";
import type { Store } from "../store/types.ts";
import { venueDateTime, toStoreCalendarDate } from "./venue-time.ts";

const dayEndMinutes = 24 * 60;

export const isStaffShiftActive = (shift: StaffShiftRecord, at: Date, settings: Settings) => {
  const local = venueDateTime(at, settings);
  const shiftDay = venueDateTime(shift.date, settings).startOf("day");
  const minutes = local.hour * 60 + local.minute;
  const start = shift.startHour * 60;
  const end = shift.endHour * 60;

  if (local.startOf("day").toMillis() === shiftDay.toMillis()) {
    if (end <= dayEndMinutes) {
      return minutes >= start && minutes < end;
    }
    return minutes >= start;
  }

  const nextDay = shiftDay.plus({ days: 1 });
  if (local.startOf("day").toMillis() === nextDay.toMillis() && end > dayEndMinutes) {
    return minutes < end - dayEndMinutes;
  }

  return false;
};

export const isWeeklySlotActive = (slot: StaffWeeklyScheduleRecord, at: Date, settings: Settings) => {
  const local = venueDateTime(at, settings);
  const weekday = local.weekday;
  const minutes = local.hour * 60 + local.minute;
  const start = slot.startHour * 60;
  const end = slot.endHour * 60;

  if (end <= dayEndMinutes) {
    return slot.weekday === weekday && minutes >= start && minutes < end;
  }

  if (slot.weekday === weekday && minutes >= start) {
    return true;
  }

  const nextWeekday = slot.weekday === 7 ? 1 : slot.weekday + 1;
  if (nextWeekday === weekday && minutes < end - dayEndMinutes) {
    return true;
  }

  return false;
};

export const formatVenueCalendarDate = (date: Date, settings: Settings) => {
  return venueDateTime(date, settings).toFormat("yyyy-MM-dd");
};

export async function listStaffShiftsView(
  store: Store,
  input: { from: Date; to: Date; settings: Settings },
) {
  const shifts = await store.listStaffShiftsBetween(input.from, input.to);
  const members = await store.listStaffMembers();
  const memberById = new Map(members.map((member) => [member.id, member]));
  return shifts.map((shift) => {
    const member = memberById.get(shift.userId);
    return {
      id: shift.id,
      userId: shift.userId,
      date: formatVenueCalendarDate(shift.date, input.settings),
      startHour: shift.startHour,
      endHour: shift.endHour,
      firstName: member?.firstName ?? null,
      lastName: member?.lastName ?? null,
    };
  });
}

export async function listGuestStaffSchedule(
  store: Store,
  input: { now: Date; days: number },
) {
  const settings = await store.getSettings();
  const start = venueDateTime(input.now, settings).startOf("day");
  const end = start.plus({ days: input.days - 1 }).endOf("day");
  const shifts = await listStaffShiftsView(store, {
    from: toStoreCalendarDate(start.toJSDate(), settings),
    to: toStoreCalendarDate(end.toJSDate(), settings),
    settings,
  });

  const byDate = new Map<string, Array<(typeof shifts)[number]>>();
  for (const shift of shifts) {
    const bucket = byDate.get(shift.date) ?? [];
    bucket.push(shift);
    byDate.set(shift.date, bucket);
  }

  const days: Array<{
    date: string;
    label: string;
    staff: Array<{ name: string; hours: string }>;
  }> = [];

  for (let offset = 0; offset < input.days; offset += 1) {
    const day = start.plus({ days: offset });
    const dateKey = day.toFormat("yyyy-MM-dd");
    let dayShifts = byDate.get(dateKey) ?? [];

    if (dayShifts.length === 0) {
      const templates = await store.listAllStaffWeeklySchedules();
      const weekday = day.weekday;
      const members = await store.listStaffMembers();
      const memberById = new Map(members.map((member) => [member.id, member]));
      dayShifts = templates
        .filter((slot) => slot.weekday === weekday)
        .map((slot) => {
          const member = memberById.get(slot.userId);
          return {
            id: `template-${slot.userId}-${dateKey}`,
            userId: slot.userId,
            date: dateKey,
            startHour: slot.startHour,
            endHour: slot.endHour,
            firstName: member?.firstName ?? null,
            lastName: member?.lastName ?? null,
          };
        });
    }

    const staff = dayShifts.map((shift) => {
      const name = `${shift.firstName ?? ""} ${shift.lastName ?? ""}`.trim() || "Мастер";
      const startLabel = formatShiftHour(shift.startHour);
      const endLabel = formatShiftHour(shift.endHour);
      return { name, hours: `${startLabel}–${endLabel}` };
    });

    days.push({
      date: dateKey,
      label: day.toFormat("ccc d LLL", { locale: "ru" }),
      staff,
    });
  }

  const onDutyNow = await listOnDutyStaffNames(store, input.now, settings);

  return { timezone: settings.venueTimezone, onDutyNow, days };
}

const formatShiftHour = (hour: number) => {
  const h = hour % 24;
  return `${String(h).padStart(2, "0")}:00`;
};

export async function listOnDutyStaffNames(store: Store, now: Date, settings?: Settings) {
  const resolved = settings ?? (await store.getSettings());
  const ids = await listOnDutyStaffUserIds(store, now, resolved);
  const members = await store.listStaffMembers();
  return members
    .filter((member) => ids.includes(member.id))
    .map((member) => `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || "Мастер");
}

export async function listOnDutyStaffUserIds(store: Store, now: Date, settings: Settings) {
  const local = venueDateTime(now, settings);
  const today = toStoreCalendarDate(local.toJSDate(), settings);
  const yesterday = toStoreCalendarDate(local.minus({ days: 1 }).toJSDate(), settings);

  const [todayShifts, yesterdayShifts] = await Promise.all([
    store.listStaffShiftsForDate(today),
    store.listStaffShiftsForDate(yesterday),
  ]);

  const datedCandidates = [...todayShifts, ...yesterdayShifts.filter((shift) => shift.endHour > 24)];
  const activeFromDated = datedCandidates.filter((shift) => isStaffShiftActive(shift, now, settings));

  if (todayShifts.length > 0) {
    const activeUserIds = new Set(activeFromDated.map((shift) => shift.userId));
    return [...activeUserIds];
  }

  const schedules = await store.listAllStaffWeeklySchedules();
  if (schedules.length === 0) {
    const staff = await store.listStaffMembers();
    return staff.map((member) => member.id);
  }

  const activeUserIds = new Set<string>();
  for (const slot of schedules) {
    if (isWeeklySlotActive(slot, now, settings)) {
      activeUserIds.add(slot.userId);
    }
  }

  return [...activeUserIds];
}

export async function upsertStaffShift(
  store: Store,
  input: {
    actorId: string;
    userId: string;
    date: Date;
    startHour: number;
    endHour: number;
  },
) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }

  const member = await store.findUserById(input.userId);
  if (member === null || (member.role !== "master" && member.role !== "admin")) {
    throw new DomainError("not_found", "Сотрудник не найден");
  }

  validateShiftHours(input.startHour, input.endHour);

  const settings = await store.getSettings();
  const date = toStoreCalendarDate(input.date, settings);

  return store.upsertStaffShift({
    userId: input.userId,
    date,
    startHour: input.startHour,
    endHour: input.endHour,
  });
}

export async function removeStaffShift(store: Store, input: { actorId: string; shiftId: string }) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }
  await store.deleteStaffShift(input.shiftId);
}

export async function replaceStaffShiftsForDay(
  store: Store,
  input: {
    actorId: string;
    date: Date;
    shifts: ReadonlyArray<{ userId: string; startHour: number; endHour: number }>;
  },
) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }

  const settings = await store.getSettings();
  const date = toStoreCalendarDate(input.date, settings);
  for (const shift of input.shifts) {
    validateShiftHours(shift.startHour, shift.endHour);
  }

  return store.replaceStaffShiftsForDate(date, input.shifts);
}

export async function fillStaffShiftsFromTemplate(
  store: Store,
  input: { actorId: string; weekStart: Date; settings: Settings },
) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }

  const start = venueDateTime(input.weekStart, input.settings).startOf("week");
  const templates = await store.listAllStaffWeeklySchedules();
  const members = new Set((await store.listStaffMembers()).map((member) => member.id));

  for (let offset = 0; offset < 7; offset += 1) {
    const day = start.plus({ days: offset });
    const date = toStoreCalendarDate(day.toJSDate(), input.settings);
    const weekday = day.weekday;
    const dayTemplates = templates.filter(
      (slot) => slot.weekday === weekday && members.has(slot.userId),
    );
    await store.replaceStaffShiftsForDate(
      date,
      dayTemplates.map((slot) => ({
        userId: slot.userId,
        startHour: slot.startHour,
        endHour: slot.endHour,
      })),
    );
  }
}

const validateShiftHours = (startHour: number, endHour: number) => {
  if (startHour < 0 || startHour > 47 || endHour < 1 || endHour > 48 || endHour <= startHour) {
    throw new DomainError("bad_request", "Некорректные часы смены");
  }
};
