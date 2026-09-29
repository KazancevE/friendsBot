import { CronJob } from "cron";
import { appTimezone } from "../domain/week.ts";
import type { Notifier, OutMessage } from "./outbound.ts";
import type { SalonService } from "./service.ts";

const deliver = async (
  notifier: Notifier,
  rows: Array<{ channel: "telegram" | "max"; externalId: string }>,
  message: OutMessage,
) => {
  for (const row of rows) {
    try {
      await notifier.send(row.channel, row.externalId, message);
    } catch (error) {
      console.error("delivery", row.channel, error);
    }
  }
};

export const runSalonMaintenance = async (salon: SalonService, notifier: Notifier, now = new Date()) => {
  const reminders = await salon.reminderBatch(now);
  for (const reminder of reminders) {
    await deliver(notifier, reminder.deliveries, {
      text: reminder.text,
      buttons: [
        [
          { text: "Буду", callback: `rm:${reminder.appointmentId}` },
          { text: "Отменить", callback: `cx:${reminder.appointmentId}` },
        ],
      ],
    });
    await salon.markReminder(reminder.appointmentId, reminder.kind, now);
  }
  const nudges = await salon.nudgeBatch(now);
  for (const nudge of nudges) {
    await deliver(notifier, nudge.deliveries, {
      text: nudge.text,
      buttons: [[{ text: "Записаться", callback: "nav:book" }]],
    });
    await salon.markNudge(nudge.userId, now);
  }
  return { reminders: reminders.length, nudges: nudges.length };
};

export const startSalonJobs = (salon: SalonService, notifier: Notifier) => {
  const zone = appTimezone();
  CronJob.from({
    cronTime: "*/5 * * * *",
    onTick: () => {
      void runSalonMaintenance(salon, notifier).catch((error: unknown) => {
        console.error("salon jobs", error);
      });
    },
    start: true,
    timeZone: zone,
  });
  void runSalonMaintenance(salon, notifier).catch((error: unknown) => {
    console.error("salon jobs", error);
  });
};
