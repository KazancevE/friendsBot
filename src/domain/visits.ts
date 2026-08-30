import { DomainError } from "./errors.ts";
import { logStaffAction } from "./staff-log.ts";
import type { Store } from "../store/types.ts";

export function visitActive(endsAt: Date, now: Date): boolean {
  return now < endsAt;
}

export async function openOrExtendVisit(
  store: Store,
  input: { userId: string; openedBy: string; hours: number; now: Date },
) {
  const endsAt = new Date(input.now.getTime() + input.hours * 3600 * 1000);
  const current = await store.getActiveVisit(input.userId, input.now);
  if (current) return store.updateVisitEndsAt(current.id, endsAt);
  return store.createVisit({
    userId: input.userId,
    openedBy: input.openedBy,
    startedAt: input.now,
    endsAt,
  });
}

async function requireStaff(store: Store, actorId: string) {
  const actor = await store.findUserById(actorId);
  if (!actor || (actor.role !== "master" && actor.role !== "admin")) {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  return actor;
}

export async function staffOpenVisit(
  store: Store,
  input: { guestId: string; actorId: string; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const current = await tx.getActiveVisit(input.guestId, input.now);
    const settings = await tx.getSettings();
    const visit = await openOrExtendVisit(tx, {
      userId: input.guestId,
      openedBy: input.actorId,
      hours: settings.visitHours,
      now: input.now,
    });
    await logStaffAction(tx, {
      actorId: input.actorId,
      guestId: input.guestId,
      action: current === null ? "visit_open" : "visit_extend",
      payload: { endsAt: visit.endsAt.toISOString() },
    });
    return visit;
  });
}

export async function extendActiveVisit(
  store: Store,
  input: { guestId: string; actorId: string; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const current = await tx.getActiveVisit(input.guestId, input.now);
    if (current === null) {
      throw new DomainError("no_visit", "Нет активного визита");
    }
    const settings = await tx.getSettings();
    const visit = await openOrExtendVisit(tx, {
      userId: input.guestId,
      openedBy: input.actorId,
      hours: settings.visitHours,
      now: input.now,
    });
    await logStaffAction(tx, {
      actorId: input.actorId,
      guestId: input.guestId,
      action: "visit_extend",
      payload: { endsAt: visit.endsAt.toISOString() },
    });
    return visit;
  });
}

export async function closeActiveVisit(
  store: Store,
  input: { guestId: string; actorId: string; now: Date },
) {
  return store.withTransaction(async (tx) => {
    await requireStaff(tx, input.actorId);
    const current = await tx.getActiveVisit(input.guestId, input.now);
    if (current === null) {
      throw new DomainError("no_visit", "Нет активного визита");
    }
    const visit = await tx.updateVisitEndsAt(current.id, input.now);
    await logStaffAction(tx, {
      actorId: input.actorId,
      guestId: input.guestId,
      action: "visit_close",
      payload: { endedAt: input.now.toISOString() },
    });
    return visit;
  });
}
