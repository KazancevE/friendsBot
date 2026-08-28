import type { Api } from "grammy";
import {
  WARNING_SCHEDULE,
  availableBalance,
  expiredMessage,
  expiresOnMoscowDay,
  warningMessage,
  type WarningKind,
} from "../domain/bonus-lots.ts";
import type { BonusLotRecord, UserRecord } from "../domain/types.ts";
import type { Store } from "../store/types.ts";

const shouldNotify = (amount: number, minBonuses: number): boolean => {
  return amount >= minBonuses;
};

const lotsForWarning = (
  lots: ReadonlyArray<BonusLotRecord>,
  flag: WarningKind,
  days: number,
  now: Date,
): BonusLotRecord[] => {
  return lots.filter(
    (lot) =>
      lot.remaining > 0 &&
      !lot[flag] &&
      expiresOnMoscowDay(lot.expiresAt, days, now),
  );
};

export async function runExpiryJob(store: Store, api: Api, now = new Date()) {
  const settings = await store.getSettings();
  const lots = await store.listBonusLotsWithRemaining();
  const byUser = new Map<string, BonusLotRecord[]>();
  for (const lot of lots) {
    const bucket = byUser.get(lot.userId) ?? [];
    bucket.push(lot);
    byUser.set(lot.userId, bucket);
  }

  let warningsSent = 0;
  let expiredBonuses = 0;
  let couponsExpired = 0;

  for (const [userId, userLots] of byUser) {
    const user = await store.findUserById(userId);
    if (user === null) {
      continue;
    }

    for (const schedule of WARNING_SCHEDULE) {
      const matching = lotsForWarning(userLots, schedule.flag, schedule.days, now);
      if (matching.length === 0) {
        continue;
      }
      const amount = matching.reduce((sum, lot) => sum + lot.remaining, 0);
      if (!shouldNotify(amount, settings.expireNotifyMinBonuses)) {
        continue;
      }
      await notifyGuest(api, user, warningMessage({
        textDays: schedule.textDays,
        amount,
        balance: availableBalance(userLots, now),
      }));
      for (const lot of matching) {
        await store.updateBonusLot(lot.id, { [schedule.flag]: true });
      }
      warningsSent += 1;
    }

    const expiredLots = userLots.filter(
      (lot) => lot.remaining > 0 && lot.expiresAt.getTime() <= now.getTime(),
    );
    if (expiredLots.length === 0) {
      continue;
    }

    const burnAmount = expiredLots.reduce((sum, lot) => sum + lot.remaining, 0);
    await store.withTransaction(async (tx) => {
      const guest = await tx.findUserById(userId);
      if (guest === null) {
        return;
      }
      for (const lot of expiredLots) {
        await tx.updateBonusLot(lot.id, { remaining: 0 });
      }
      const balance = guest.balance - burnAmount;
      await tx.updateUser(guest.id, { balance });
      await tx.addLedger({
        userId: guest.id,
        type: "expire",
        amount: -burnAmount,
        actorId: null,
        comment: "Сгорание просроченных бонусов",
        checkAmount: null,
      });
    });

    expiredBonuses += burnAmount;
    const refreshed = await store.findUserById(userId);
    if (
      refreshed !== null &&
      shouldNotify(burnAmount, settings.expireNotifyMinBonuses)
    ) {
      await notifyGuest(api, user, expiredMessage(burnAmount, refreshed.balance));
    }
  }

  couponsExpired = await store.expireCoupons(now);
  return { warningsSent, expiredBonuses, couponsExpired };
}

async function notifyGuest(api: Api, user: UserRecord, text: string) {
  if (user.broadcastOptOut) {
    return;
  }
  try {
    await api.sendMessage(user.telegramId.toString(), text);
  } catch {
    // blocked bot — skip
  }
}
