import { CronJob } from "cron";
import type { Store } from "../store/types.ts";
import { MOSCOW } from "../domain/week.ts";
import { runBirthdayJob } from "./birthday-job.ts";
import { runWeeklyJob } from "./weekly-job.ts";

const BIRTHDAY_CRON = "0 2 * * *";
const WEEKLY_CRON = "0 0 * * 1";

export const startScheduler = (store: Store) => {
  CronJob.from({
    cronTime: BIRTHDAY_CRON,
    onTick: () => {
      void runBirthdayJob(store);
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
};
