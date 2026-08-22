import { closeOpenWeeks } from "../domain/weekly.ts";
import type { Store } from "../store/types.ts";

export const runWeeklyJob = async (store: Store) => {
  return closeOpenWeeks(store, new Date());
};
