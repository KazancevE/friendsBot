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
