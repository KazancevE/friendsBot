import type { Api } from "grammy";
import { CronJob } from "cron";
import type { Store } from "../store/types.ts";
import { MOSCOW } from "../domain/week.ts";
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
};

const alertAdmin = (api: Api, adminTelegramId: bigint) => {
  return async (error: Error) => {
    await api.sendMessage(
      adminTelegramId.toString(),
      `⚠️ Джоб упал: ${error.message.slice(0, 200)}`,
    );
  };
};

export const startScheduler = (store: Store, api: Api, { adminTelegramId }: StartSchedulerParameters) => {
  const onError = alertAdmin(api, adminTelegramId);
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
    timeZone: MOSCOW,
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
    timeZone: MOSCOW,
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
    timeZone: MOSCOW,
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
    timeZone: MOSCOW,
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
    timeZone: MOSCOW,
  });
  void runLoggedJob({
    name: "venue-code-startup",
    work: () => runVenueCodeJob(store),
    onError,
  });
};
