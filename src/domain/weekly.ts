import { DateTime } from "luxon";
import type { Store } from "../store/types.ts";
import type { GameScoreRecord, PrizePlace } from "./types.ts";
import { createLotForCredit } from "./bonus-lots.ts";
import { expiresAfterDays } from "./settings.ts";
import { weekStartMoscow } from "./week.ts";

const rankScores = (scores: ReadonlyArray<GameScoreRecord>) => {
  return [...scores].sort((left, right) => {
    if (right.points !== left.points) {
      return right.points - left.points;
    }
    return left.updatedAt.getTime() - right.updatedAt.getTime();
  });
};

const prizeForPlace = (table: ReadonlyArray<PrizePlace>, place: number) => {
  return table.find((row) => row.place === place);
};

export const closeOpenWeeks = async (store: Store, now: Date) => {
  const settings = await store.getSettings();
  const currentWeekStart = weekStartMoscow(DateTime.fromJSDate(now)).toJSDate();
  const due = (await store.listOpenWeeks()).filter((week) => {
    return week.weekStart.getTime() < currentWeekStart.getTime();
  });
  for (const week of due) {
    await store.withTransaction(async (tx) => {
      const ranked = rankScores(await tx.listWeekScores(week.id));
      let awarded = 0;
      for (const score of ranked) {
        if (awarded >= settings.winnersCount) {
          break;
        }
        const user = await tx.findUserById(score.userId);
        if (user === null || user.role !== "guest") {
          continue;
        }
        if (await tx.hasWeeklyAward(week.id, score.userId)) {
          continue;
        }
        awarded += 1;
        const place = awarded;
        await tx.addWeeklyAward(week.id, score.userId, place);
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
            weekId: week.id,
            expiresAt: expiresAfterDays(now, settings.couponClaimDays),
          });
        }
      }
      await tx.closeWeek(week.id, now);
    });
  }
};
