import { DateTime } from "luxon";
import type { Api } from "grammy";
import { DomainError } from "./errors.ts";
import { isBirthdayWeek } from "./birthday.ts";
import type { BroadcastSegmentId } from "./types.ts";
import { MOSCOW, weekStartMoscow } from "./week.ts";
import type { Store } from "../store/types.ts";

export type BroadcastSegmentParams = {
  balanceMin?: number;
  weeklyTopPlace?: number;
};

const BROADCAST_BATCH_SIZE = 25;

export async function recipientsForBroadcast(store: Store): Promise<bigint[]> {
  return recipientsForSegment(store, { segment: "all", now: new Date() });
}

export async function previewSegmentCount(
  store: Store,
  input: { segment: BroadcastSegmentId; params?: BroadcastSegmentParams; now: Date },
): Promise<number> {
  const ids = await recipientsForSegment(store, input);
  return ids.length;
}

export async function recipientsForSegment(
  store: Store,
  input: {
    segment: BroadcastSegmentId;
    params?: BroadcastSegmentParams;
    now: Date;
  },
): Promise<bigint[]> {
  const guests = await store.listBroadcastGuestCandidates();
  const filtered = guests.filter((guest) => !guest.broadcastOptOut);

  switch (input.segment) {
    case "all":
      return filtered.map((guest) => guest.telegramId);
    case "inactive_30d": {
      const since = DateTime.fromJSDate(input.now, { zone: MOSCOW }).minus({ days: 30 }).toJSDate();
      const activeIds = new Set(await store.listGuestIdsActiveSince(since));
      return filtered.filter((guest) => !activeIds.has(guest.id)).map((guest) => guest.telegramId);
    }
    case "active_7d": {
      const since = DateTime.fromJSDate(input.now, { zone: MOSCOW }).minus({ days: 7 }).toJSDate();
      const activeIds = new Set(await store.listGuestIdsActiveSince(since));
      return filtered.filter((guest) => activeIds.has(guest.id)).map((guest) => guest.telegramId);
    }
    case "balance_gt": {
      const min = input.params?.balanceMin ?? 0;
      return filtered.filter((guest) => guest.balance >= min).map((guest) => guest.telegramId);
    }
    case "has_coupon": {
      const withCoupons = new Set(await store.listGuestIdsWithActiveCoupons(input.now));
      return filtered.filter((guest) => withCoupons.has(guest.id)).map((guest) => guest.telegramId);
    }
    case "birthday_week":
      return filtered
        .filter((guest) => guest.birthday !== null && isBirthdayWeek(guest.birthday, input.now))
        .map((guest) => guest.telegramId);
    case "referrers": {
      const referrerIds = new Set(await store.listReferrerGuestIds());
      return filtered.filter((guest) => referrerIds.has(guest.id)).map((guest) => guest.telegramId);
    }
    case "weekly_top": {
      const place = input.params?.weeklyTopPlace ?? 3;
      const previousWeekStart = weekStartMoscow(
        DateTime.fromJSDate(input.now, { zone: MOSCOW }),
      ).minus({ weeks: 1 });
      const winnerIds = new Set(
        await store.listWeeklyAwardUserIds(previousWeekStart.toJSDate(), place),
      );
      return filtered.filter((guest) => winnerIds.has(guest.id)).map((guest) => guest.telegramId);
    }
    default: {
      const _exhaustive: never = input.segment;
      return _exhaustive;
    }
  }
}

export const broadcastSegmentLabel = (segment: BroadcastSegmentId): string => {
  switch (segment) {
    case "all":
      return "всем гостям";
    case "inactive_30d":
      return "не были 30+ дней";
    case "active_7d":
      return "были за 7 дней";
    case "balance_gt":
      return "баланс выше порога";
    case "has_coupon":
      return "с активным купоном";
    case "birthday_week":
      return "неделя ДР";
    case "referrers":
      return "пригласившие друзей";
    case "weekly_top":
      return "победители прошлой недели";
    default: {
      const _exhaustive: never = segment;
      return _exhaustive;
    }
  }
};

export async function sendBroadcastMessages(input: {
  api: Api;
  telegramIds: readonly bigint[];
  body: string;
  photoId?: string;
}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < input.telegramIds.length; index += BROADCAST_BATCH_SIZE) {
    const batch = input.telegramIds.slice(index, index + BROADCAST_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (telegramId) => {
        try {
          if (input.photoId !== undefined) {
            await input.api.sendPhoto(telegramId.toString(), input.photoId, { caption: input.body });
          } else {
            await input.api.sendMessage(telegramId.toString(), input.body);
          }
          return true;
        } catch {
          return false;
        }
      }),
    );
    sent += results.filter(Boolean).length;
    failed += results.filter((ok) => !ok).length;
  }
  return { sent, failed };
}

export async function runBroadcast(
  store: Store,
  input: {
    api: Api;
    segment: BroadcastSegmentId;
    params?: BroadcastSegmentParams;
    body: string;
    showInFeed: boolean;
    photoId?: string;
    sendNow?: boolean;
    now: Date;
  },
) {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new DomainError("bad_request", "Текст рассылки не должен быть пустым");
  }
  const sendNow = input.sendNow ?? true;
  const telegramIds = sendNow
    ? await recipientsForSegment(store, {
        segment: input.segment,
        params: input.params,
        now: input.now,
      })
    : [];
  const delivery =
    sendNow && telegramIds.length > 0
      ? await sendBroadcastMessages({
          api: input.api,
          telegramIds,
          body,
          photoId: input.photoId,
        })
      : { sent: 0, failed: 0 };
  const promo = await store.createPromo({
    body,
    photos: input.photoId === undefined ? [] : [input.photoId],
    showInFeed: input.showInFeed,
    broadcastSegment: input.segment,
    broadcastRecipients: sendNow ? telegramIds.length : null,
    broadcastSent: sendNow ? delivery.sent : null,
    broadcastFailed: sendNow ? delivery.failed : null,
  });
  return {
    promoId: promo.id,
    recipients: telegramIds.length,
    ...delivery,
    skippedSend: !sendNow,
  };
};
