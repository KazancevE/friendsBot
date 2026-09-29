export type ReminderKind = "h24" | "h2";

export type AppointmentReminderInput = {
  startsAt: Date;
  now: Date;
  status: "confirmed" | "cancelled" | "completed";
  sent24: boolean;
  sent2: boolean;
  lead24Hours?: number;
  lead2Hours?: number;
};

/**
 * 24 ч — пока до визита больше, чем окно второго напоминания.
 * 2 ч — в последнем окне. Если запись создали уже внутри 2 часов, уходит только короткое.
 */
export const dueReminders = (input: AppointmentReminderInput): ReminderKind[] => {
  if (input.status !== "confirmed") {
    return [];
  }
  const start = input.startsAt.getTime();
  const now = input.now.getTime();
  if (now >= start) {
    return [];
  }
  const lead24 = (input.lead24Hours ?? 24) * 60 * 60 * 1000;
  const lead2 = (input.lead2Hours ?? 2) * 60 * 60 * 1000;
  const due: ReminderKind[] = [];
  if (!input.sent24 && now >= start - lead24 && now < start - lead2) {
    due.push("h24");
  }
  if (!input.sent2 && now >= start - lead2) {
    due.push("h2");
  }
  return due;
};
