import { DateTime } from "luxon";
import type { Store } from "../store/types.ts";
import type { AggregatedScoreRecord, PrizePlace } from "./types.ts";
import { createLotForCredit } from "./bonus-lots.ts";
import { rankScores } from "./score-ranking.ts";
import { expiresAfterDays } from "./settings.ts";
import { weekStartMoscow } from "./week.ts";

const prizeForPlace = (table: ReadonlyArray<PrizePlace>, place: number) => {
  return table.find((row) => row.place === place);
};

const groupDueWeekStarts = (openWeeks: ReadonlyArray<{ weekStart: Date }>, currentWeekStart: Date) => {
  const due = new Map<number, Date>();
  for (const week of openWeeks) {
    if (week.weekStart.getTime() >= currentWeekStart.getTime()) {
      continue;
    }
    due.set(week.weekStart.getTime(), week.weekStart);
  }
  return [...due.values()];
};

const awardTournamentWeek = async (
  tx: Store,
  weekStart: Date,
  ranked: ReadonlyArray<AggregatedScoreRecord>,
  settings: Awaited<ReturnType<Store["getSettings"]>>,
  now: Date,
) => {
  let awarded = 0;
  for (const score of ranked) {
    if (awarded >= settings.winnersCount) {
      break;
    }
    const user = await tx.findUserById(score.userId);
    if (user === null || user.role !== "guest") {
      continue;
    }
    if (await tx.hasWeeklyAward(weekStart, score.userId)) {
      continue;
    }
    awarded += 1;
    const place = awarded;
    await tx.addWeeklyAward(weekStart, score.userId, place);
    const prize = prizeForPlace(settings.prizeTable, place);
    if (prize === undefined) {
      continue;
    }
    if (prize.bonuses > 0) {
      await tx.updateUser(user.id, { balance: user.balance + prize.bonuses });
      const ledger = await tx.addLedger({
        userId: user.id,
        type: "weekly_prize",
        amount: prize.bonuses,
        actorId: null,
        comment: `Приз за ${place} место`,
        checkAmount: null,
      });
      await createLotForCredit(tx, {
        userId: user.id,
        ledgerId: ledger.id,
        type: "weekly_prize",
        amount: prize.bonuses,
        createdAt: ledger.createdAt,
        settings,
      });
    }
    if (prize.couponTitle !== null && prize.couponTitle.length > 0) {
      await tx.createCoupon({
        userId: score.userId,
        title: prize.couponTitle,
        weekId: null,
        expiresAt: expiresAfterDays(now, settings.couponClaimDays),
      });
    }
  }
};

export const closeOpenWeeks = async (store: Store, now: Date) => {
  const settings = await store.getSettings();
  const currentWeekStart = weekStartMoscow(DateTime.fromJSDate(now)).toJSDate();
  const openWeeks = await store.listOpenWeeks();
  const dueWeekStarts = groupDueWeekStarts(openWeeks, currentWeekStart);

  for (const weekStart of dueWeekStarts) {
    const weeksToClose = openWeeks.filter((week) => week.weekStart.getTime() === weekStart.getTime());
    await store.withTransaction(async (tx) => {
      const ranked = rankScores(await tx.listAggregatedWeekScores(weekStart));
      await awardTournamentWeek(tx, weekStart, ranked, settings, now);
      for (const week of weeksToClose) {
        await tx.closeWeek(week.id, now);
      }
    });
  }
};
