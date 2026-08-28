import type { Api } from "grammy";
import { CronJob } from "cron";
import type { Store } from "../store/types.ts";
import { MOSCOW } from "../domain/week.ts";
import { runBirthdayJob } from "./birthday-job.ts";
import { runExpiryJob } from "./expiry-job.ts";
import { runVenueCodeJob } from "./venue-code-job.ts";
import { runWeeklyJob } from "./weekly-job.ts";

const BIRTHDAY_CRON = "0 2 * * *";
const EXPIRY_CRON = "0 2 * * *";
const WEEKLY_CRON = "0 0 * * 1";
const VENUE_CODE_CRON = "0 */2 * * *";

export const startScheduler = (store: Store, api: Api) => {
  CronJob.from({
    cronTime: BIRTHDAY_CRON,
    onTick: () => {
      void runBirthdayJob(store);
    },
    start: true,
    timeZone: MOSCOW,
  });
  CronJob.from({
    cronTime: EXPIRY_CRON,
    onTick: () => {
      void runExpiryJob(store, api);
    },
    start: true,
    timeZone: MOSCOW,
  });
  CronJob.from({
    cronTime: WEEKLY_CRON,
    onTick: () => {
      void runWeeklyJob(store);
    },
    start: true,
    timeZone: MOSCOW,
  });
  CronJob.from({
    cronTime: VENUE_CODE_CRON,
    onTick: () => {
      void runVenueCodeJob(store);
    },
    start: true,
    timeZone: MOSCOW,
  });
  void runVenueCodeJob(store);
};
