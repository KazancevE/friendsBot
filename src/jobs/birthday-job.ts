import { grantDueBirthdays } from "../domain/birthday.ts";
import type { Store } from "../store/types.ts";

export async function runBirthdayJob(store: Store) {
  return grantDueBirthdays(store, new Date());
}
