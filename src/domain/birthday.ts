import { DateTime } from "luxon";
import type { Store } from "../store/types.ts";
import { MOSCOW } from "./week.ts";

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

export async function grantDueBirthdays(store: Store, now: Date) {
  const settings = await store.getSettings();
  const users = await store.listUsersWithBirthday();
  const year = DateTime.fromJSDate(now, { zone: MOSCOW }).year;
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
      await tx.addLedger({
        userId: current.id,
        type: "birthday",
        amount: settings.birthdayBonus,
        actorId: null,
        comment: "День рождения",
        checkAmount: null,
      });
    });
    granted += 1;
  }
  return granted;
}
