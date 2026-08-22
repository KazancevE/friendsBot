import { DateTime } from "luxon";
import type { Store } from "../store/types.ts";
import { DomainError } from "./errors.ts";
import type { GameScoreRecord } from "./types.ts";
import { weekStartMoscow } from "./week.ts";

const LEADERBOARD_TOP = 10;

type SubmitScoreParameters = {
  readonly userId: string;
  readonly slug: string;
  readonly points: number;
  readonly now: Date;
};

export const submitScore = async (store: Store, input: SubmitScoreParameters) => {
  const user = await store.findUserById(input.userId);
  if (user === null) {
    throw new DomainError("not_found", "Гость не найден");
  }
  if (user.role !== "guest") {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  const visit = await store.getActiveVisit(user.id, input.now);
  if (visit === null) {
    throw new DomainError("no_visit", "Игры доступны во время визита в «Друзьях»");
  }
  const game = await store.findGameBySlug(input.slug);
  if (game === null || !game.active) {
    throw new DomainError("not_found", "Игра не найдена");
  }
  if (
    !Number.isInteger(input.points) ||
    input.points < 1 ||
    input.points > game.maxScorePerSession
  ) {
    throw new DomainError("score_cap", "Слишком много очков за партию");
  }
  const weekStart = weekStartMoscow(DateTime.fromJSDate(input.now)).toJSDate();
  return store.withTransaction(async (tx) => {
    const week = await tx.getOrCreateOpenWeek(game.id, weekStart);
    return tx.addScore(week.id, user.id, input.points, input.now);
  });
};

const rankScores = (scores: ReadonlyArray<GameScoreRecord>) => {
  return [...scores].sort((left, right) => {
    if (right.points !== left.points) {
      return right.points - left.points;
    }
    return left.updatedAt.getTime() - right.updatedAt.getTime();
  });
};

type GetLeaderboardParameters = {
  readonly userId: string;
  readonly slug: string;
  readonly now: Date;
};

export const getLeaderboard = async (store: Store, input: GetLeaderboardParameters) => {
  const game = await store.findGameBySlug(input.slug);
  if (game === null) {
    throw new DomainError("not_found", "Игра не найдена");
  }
  const weekStart = weekStartMoscow(DateTime.fromJSDate(input.now)).toJSDate();
  const week = await store.getOrCreateOpenWeek(game.id, weekStart);
  const ranked = rankScores(await store.listWeekScores(week.id));
  const top = ranked.slice(0, LEADERBOARD_TOP).map((score, index) => {
    return {
      place: index + 1,
      userId: score.userId,
      points: score.points,
    };
  });
  const meIndex = ranked.findIndex((score) => score.userId === input.userId);
  const meScore = meIndex === -1 ? undefined : ranked[meIndex];
  const me =
    meScore === undefined
      ? { place: null, points: 0 }
      : { place: meIndex + 1, points: meScore.points };
  return { me, top };
};
