import { DomainError } from "./errors.ts";
import type { Store } from "../store/types.ts";
import { listOnDutyStaffUserIds } from "./staff-shifts.ts";

export async function listOnDutyStaffTelegramIds(store: Store, now: Date): Promise<bigint[]> {
  const settings = await store.getSettings();
  const activeUserIds = await listOnDutyStaffUserIds(store, now, settings);
  if (activeUserIds.length === 0) {
    return [];
  }

  const staff = await store.listStaffMembers();
  const idSet = new Set(activeUserIds);
  return staff.filter((member) => idSet.has(member.id)).map((member) => member.telegramId);
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
