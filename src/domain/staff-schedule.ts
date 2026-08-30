import { DateTime } from "luxon";
import { DomainError } from "./errors.ts";
import type { StaffWeeklyScheduleRecord } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export const isScheduleSlotActive = (slot: StaffWeeklyScheduleRecord, at: Date) => {
  const local = DateTime.fromJSDate(at, { zone: MOSCOW });
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

export async function listOnDutyStaffTelegramIds(store: Store, now: Date): Promise<bigint[]> {
  const schedules = await store.listAllStaffWeeklySchedules();
  if (schedules.length === 0) {
    return store.listStaffTelegramIds();
  }

  const activeUserIds = new Set<string>();
  for (const slot of schedules) {
    if (isScheduleSlotActive(slot, now)) {
      activeUserIds.add(slot.userId);
    }
  }

  if (activeUserIds.size === 0) {
    return store.listStaffTelegramIds();
  }

  const staff = await store.listStaffMembers();
  return staff
    .filter((member) => activeUserIds.has(member.id))
    .map((member) => member.telegramId);
}

export async function replaceStaffWeeklySchedule(
  store: Store,
  input: {
    actorId: string;
    userId: string;
    slots: ReadonlyArray<{ weekday: number; startHour: number; endHour: number }>;
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

  for (const slot of input.slots) {
    if (slot.weekday < 1 || slot.weekday > 7) {
      throw new DomainError("bad_request", "День недели от 1 до 7");
    }
    if (slot.startHour < 0 || slot.startHour > 47 || slot.endHour < 1 || slot.endHour > 48) {
      throw new DomainError("bad_request", "Некорректные часы смены");
    }
    if (slot.endHour <= slot.startHour) {
      throw new DomainError("bad_request", "Конец смены должен быть позже начала");
    }
  }

  return store.replaceStaffWeeklySchedule(input.userId, input.slots);
}
