import { DateTime } from "luxon";
import type { Store } from "../store/types.ts";
import type { GameScoreRecord, PrizePlace } from "./types.ts";
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
      const winnerCount = Math.min(settings.winnersCount, ranked.length);
      for (let index = 0; index < winnerCount; index += 1) {
        const score = ranked[index];
        if (score === undefined) {
          continue;
        }
        const place = index + 1;
        if (await tx.hasWeeklyAward(week.id, score.userId)) {
          continue;
        }
        await tx.addWeeklyAward(week.id, score.userId, place);
        const prize = prizeForPlace(settings.prizeTable, place);
        if (prize === undefined) {
          continue;
        }
        if (prize.bonuses > 0) {
          const user = await tx.findUserById(score.userId);
          if (user !== null) {
            await tx.updateUser(user.id, { balance: user.balance + prize.bonuses });
            await tx.addLedger({
              userId: user.id,
              type: "weekly_prize",
              amount: prize.bonuses,
              actorId: null,
              comment: `Приз за ${place} место`,
              checkAmount: null,
            });
          }
        }
        if (prize.couponTitle !== null && prize.couponTitle.length > 0) {
          await tx.createCoupon({
            userId: score.userId,
            title: prize.couponTitle,
            weekId: week.id,
          });
        }
      }
      await tx.closeWeek(week.id, now);
    });
  }
};
