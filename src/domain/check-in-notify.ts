import { listOnDutyStaffTelegramIds } from "../domain/staff-schedule.ts";
import { DateTime } from "luxon";
import type { Api } from "grammy";
import type { UserRecord, VisitRecord } from "./types.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

const lastNotifyAt = new Map<string, number>();
const DEBOUNCE_MS = 5 * 60 * 1000;

const formatMoscowTime = (at: Date) => {
  return DateTime.fromJSDate(at, { zone: MOSCOW }).toFormat("HH:mm");
};

const guestDisplayName = (guest: UserRecord) => {
  return `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() || "Гость";
};

export async function notifyStaffOfCheckIn(
  store: Store,
  api: Api,
  input: { guest: UserRecord; visit: VisitRecord; now: Date },
) {
  const settings = await store.getSettings();
  if (!settings.checkInNotifyEnabled) {
    return;
  }

  const last = lastNotifyAt.get(input.guest.id) ?? 0;
  if (input.now.getTime() - last < DEBOUNCE_MS) {
    return;
  }
  lastNotifyAt.set(input.guest.id, input.now.getTime());

  const recipients =
    settings.checkInNotifyTelegramIds.length > 0
      ? settings.checkInNotifyTelegramIds
      : await listOnDutyStaffTelegramIds(store, input.now);

  const text = [
    `🟢 Отметился в зале: ${guestDisplayName(input.guest)}`,
    `Баланс: ${input.guest.balance} · Визит до ${formatMoscowTime(input.visit.endsAt)}`,
  ].join("\n");

  await Promise.all(
    recipients.map(async (telegramId) => {
      try {
        await api.sendMessage(telegramId.toString(), text);
      } catch {
        // ignore per-recipient failures
      }
    }),
  );
}
