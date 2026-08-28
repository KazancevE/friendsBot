import type { Store } from "../store/types.ts";
import { rotateScheduledVenueCode } from "../domain/venue-code.ts";

export const runVenueCodeJob = async (store: Store, now = new Date()) => {
  await rotateScheduledVenueCode(store, now);
};
