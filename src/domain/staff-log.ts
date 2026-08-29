import type { StaffActionKind, StaffActionLogRecord } from "./types.ts";
import type { Store } from "../store/types.ts";

export async function logStaffAction(
  store: Store,
  input: {
    actorId: string;
    guestId: string | null;
    action: StaffActionKind;
    payload?: Record<string, unknown>;
  },
): Promise<StaffActionLogRecord> {
  return store.createStaffActionLog({
    actorId: input.actorId,
    guestId: input.guestId,
    action: input.action,
    payload: input.payload ?? {},
  });
}
