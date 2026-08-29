import { DateTime } from "luxon";
import type { Api } from "grammy";
import { createLotForCredit } from "./bonus-lots.ts";
import { expiresAfterDays } from "./settings.ts";
import type { Store } from "../store/types.ts";
import type { UserRecord } from "./types.ts";
import { MOSCOW, moscowCalendarYear } from "./week.ts";

const anniversaryInYear = (birthday: Date, year: number): DateTime => {
  const month = birthday.getUTCMonth() + 1;
  const day = birthday.getUTCDate();
  const direct = DateTime.fromObject({ year, month, day }, { zone: MOSCOW });
  if (direct.isValid) {
    return direct.startOf("day");
  }
  return DateTime.fromObject({ year, month: 2, day: 28 }, { zone: MOSCOW }).startOf("day");
};

export function isBirthdayWeek(birthday: Date, now: Date): boolean {
  const nowMsk = DateTime.fromJSDate(now, { zone: MOSCOW }).startOf("day");
  const years = [nowMsk.year - 1, nowMsk.year, nowMsk.year + 1];
  return years.some((year) => {
    const anniversary = anniversaryInYear(birthday, year);
    const start = anniversary.minus({ days: 3 });
    const end = anniversary.plus({ days: 3 });
    return nowMsk >= start && nowMsk <= end;
  });
}

export function isBirthdayToday(birthday: Date, now: Date): boolean {
  const nowMsk = DateTime.fromJSDate(now, { zone: MOSCOW }).startOf("day");
  const anniversary = anniversaryInYear(birthday, nowMsk.year);
  return nowMsk.hasSame(anniversary, "day");
}

export function daysUntilBirthday(birthday: Date, now: Date): number | null {
  const nowMsk = DateTime.fromJSDate(now, { zone: MOSCOW }).startOf("day");
  const years = [nowMsk.year, nowMsk.year + 1];
  let best: number | null = null;
  for (const year of years) {
    const anniversary = anniversaryInYear(birthday, year);
    const diff = Math.round(anniversary.diff(nowMsk, "days").days);
    if (diff < 0) {
      continue;
    }
    if (best === null || diff < best) {
      best = diff;
    }
  }
  return best;
}

export async function grantDueBirthdays(store: Store, now: Date) {
  const settings = await store.getSettings();
  const users = await store.listUsersWithBirthday();
  const year = moscowCalendarYear(now);
  let granted = 0;
  for (const user of users) {
    if (user.birthday === null) {
      continue;
    }
    if (!isBirthdayWeek(user.birthday, now)) {
      continue;
    }
    if (await store.hasBirthdayLedgerInYear(user.id, year)) {
      continue;
    }
    await store.withTransaction(async (tx) => {
      const current = await tx.findUserById(user.id);
      if (current === null) {
        return;
      }
      await tx.updateUser(current.id, { balance: current.balance + settings.birthdayBonus });
      const ledger = await tx.addLedger({
        userId: current.id,
        type: "birthday",
        amount: settings.birthdayBonus,
        actorId: null,
        comment: "День рождения",
        checkAmount: null,
      });
      await createLotForCredit(tx, {
        userId: current.id,
        ledgerId: ledger.id,
        type: "birthday",
        amount: settings.birthdayBonus,
        createdAt: ledger.createdAt,
        settings,
      });
      if (settings.birthdayCouponTitle !== null && settings.birthdayCouponTitle.length > 0) {
        await tx.createCoupon({
          userId: current.id,
          title: settings.birthdayCouponTitle,
          weekId: null,
          expiresAt: expiresAfterDays(now, settings.birthdayCouponClaimDays),
        });
      }
    });
    granted += 1;
  }
  return granted;
}

const notifyGuest = async (api: Api, user: UserRecord, text: string) => {
  if (user.broadcastOptOut) {
    return false;
  }
  try {
    await api.sendMessage(user.telegramId.toString(), text);
    return true;
  } catch {
    return false;
  }
};

export async function sendBirthdayWarnings(store: Store, api: Api, now: Date) {
  const settings = await store.getSettings();
  const users = await store.listUsersWithBirthday();
  const year = moscowCalendarYear(now);
  let sent = 0;
  for (const user of users) {
    if (user.birthday === null || user.birthdayWarnedYear === year) {
      continue;
    }
    const days = daysUntilBirthday(user.birthday, now);
    if (days !== settings.birthdayNotifyDaysBefore) {
      continue;
    }
    const ok = await notifyGuest(
      api,
      user,
      "Скоро ваш день рождения — загляните в «Друзья» 🎂",
    );
    if (ok) {
      await store.updateUser(user.id, { birthdayWarnedYear: year });
      sent += 1;
    }
  }
  return sent;
}

export async function sendBirthdayGreetings(store: Store, api: Api, now: Date) {
  const users = await store.listUsersWithBirthday();
  const year = moscowCalendarYear(now);
  let sent = 0;
  for (const user of users) {
    if (user.birthday === null || user.birthdayGreetedYear === year) {
      continue;
    }
    if (!isBirthdayToday(user.birthday, now)) {
      continue;
    }
    const ok = await notifyGuest(api, user, "С днём рождения! Ждём вас в «Друзья» 🎉");
    if (ok) {
      await store.updateUser(user.id, { birthdayGreetedYear: year });
      sent += 1;
    }
  }
  return sent;
}

export async function runBirthdayNotifications(store: Store, api: Api, now: Date) {
  const granted = await grantDueBirthdays(store, now);
  const warnings = await sendBirthdayWarnings(store, api, now);
  const greetings = await sendBirthdayGreetings(store, api, now);
  return { granted, warnings, greetings };
}
