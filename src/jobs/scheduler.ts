import type { Api } from "grammy";
import { CronJob } from "cron";
import type { Store } from "../store/types.ts";
import { appTimezone } from "../domain/week.ts";
import { runBirthdayJob } from "./birthday-job.ts";
import { runBookingReminders } from "../domain/booking.ts";
import { closeExpiredQuizSessions } from "../domain/quiz.ts";
import { runExpiryJob } from "./expiry-job.ts";
import { runVenueCodeJob } from "./venue-code-job.ts";
import { runWeeklyJob } from "./weekly-job.ts";
import { runLoggedJob } from "./run-logged-job.ts";

const BIRTHDAY_CRON = "0 2 * * *";
const EXPIRY_CRON = "0 2 * * *";
const WEEKLY_CRON = "0 0 * * 1";
const VENUE_CODE_CRON = "0 */2 * * *";
const BOOKING_REMINDER_CRON = "*/5 * * * *";

type StartSchedulerParameters = {
  readonly adminTelegramId: bigint;
  readonly adminTelegramIds?: readonly bigint[];
};

const alertAdmin = (api: Api, adminTelegramIds: readonly bigint[]) => {
  return async (error: Error) => {
    const text = `⚠️ Джоб упал: ${error.message.slice(0, 200)}`;
    for (const adminTelegramId of adminTelegramIds) {
      await api.sendMessage(adminTelegramId.toString(), text);
    }
  };
};

export const startScheduler = (store: Store, api: Api, parameters: StartSchedulerParameters) => {
  const ids = parameters.adminTelegramIds?.length ? parameters.adminTelegramIds : [parameters.adminTelegramId];
  const onError = alertAdmin(api, ids);
  CronJob.from({
    cronTime: BIRTHDAY_CRON,
    onTick: () => {
      void runLoggedJob({
        name: "birthday",
        work: () => runBirthdayJob(store, api),
        onError,
      });
    },
    start: true,
    timeZone: appTimezone(),
  });
  CronJob.from({
    cronTime: EXPIRY_CRON,
    onTick: () => {
      void runLoggedJob({
        name: "expiry",
        work: () => runExpiryJob(store, api),
        onError,
      });
    },
    start: true,
    timeZone: appTimezone(),
  });
  CronJob.from({
    cronTime: WEEKLY_CRON,
    onTick: () => {
      void runLoggedJob({
        name: "weekly",
        work: () => runWeeklyJob(store),
        onError,
      });
    },
    start: true,
    timeZone: appTimezone(),
  });
  CronJob.from({
    cronTime: VENUE_CODE_CRON,
    onTick: () => {
      void runLoggedJob({
        name: "venue-code",
        work: () => runVenueCodeJob(store),
        onError,
      });
    },
    start: true,
    timeZone: appTimezone(),
  });
  CronJob.from({
    cronTime: BOOKING_REMINDER_CRON,
    onTick: () => {
      void runLoggedJob({
        name: "booking-reminder",
        work: async () => {
          await runBookingReminders(store, api, new Date());
          await closeExpiredQuizSessions(store, new Date());
        },
        onError,
      });
    },
    start: true,
    timeZone: appTimezone(),
  });
  void runLoggedJob({
    name: "venue-code-startup",
    work: () => runVenueCodeJob(store),
    onError,
  });
};
