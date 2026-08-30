import { DomainError } from "./errors.ts";
import { tryActivateReferral } from "./referral.ts";
import type { CheckInMethod } from "./types.ts";
import { openOrExtendVisit } from "./visits.ts";
import { resolveVenueCodeForCheckIn } from "./venue-code.ts";
import type { Store } from "../store/types.ts";

export async function guestCheckIn(
  store: Store,
  input: {
    userId: string;
    method: CheckInMethod;
    token?: string;
    pin?: string;
    now: Date;
  },
) {
  const result = await store.withTransaction(async (tx) => {
    const guest = await tx.findUserById(input.userId);
    if (guest === null) {
      throw new DomainError("not_found", "Пользователь не найден");
    }
    if (guest.role !== "guest") {
      throw new DomainError("forbidden", "Отметка доступна только гостям");
    }
    const venueCode = await resolveVenueCodeForCheckIn(tx, {
      method: input.method,
      token: input.token,
      pin: input.pin,
      now: input.now,
    });
    const settings = await tx.getSettings();
    const visit = await openOrExtendVisit(tx, {
      userId: guest.id,
      openedBy: guest.id,
      hours: settings.visitHours,
      now: input.now,
    });
    await tx.createCheckInLog({
      userId: guest.id,
      venueCodeId: venueCode.id,
      visitId: visit.id,
      method: input.method,
      createdAt: input.now,
    });
    return { visit, venueCode, visitId: visit.id };
  });
  await tryActivateReferral(store, {
    guestId: input.userId,
    now: input.now,
    visitId: result.visitId,
  });
  return { visit: result.visit, venueCode: result.venueCode };
}
