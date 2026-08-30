import { runBirthdayNotifications } from "../domain/birthday.ts";
import type { Store } from "../store/types.ts";
import type { Api } from "grammy";

export async function runBirthdayJob(store: Store, api: Api) {
  return runBirthdayNotifications(store, api, new Date());
}
