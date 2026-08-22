import type { Store } from "../store/types.ts";

export async function recipientsForBroadcast(store: Store): Promise<bigint[]> {
  return store.listGuestTelegramIdsForBroadcast();
}
