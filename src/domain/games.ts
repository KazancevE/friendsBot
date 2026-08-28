import { DateTime } from "luxon";
import type { Store } from "../store/types.ts";
import { DomainError } from "./errors.ts";
import type { Role } from "./types.ts";
import { rankScores } from "./score-ranking.ts";
import { weekStartMoscow } from "./week.ts";

const LEADERBOARD_TOP = 10;

const DEFAULT_GAME_RULES_BODY =
  "Каждую неделю мы подводим итоги игр в «Друзьях». Очки из всех игр складываются в общий зачёт — призы получают лучшие по сумме. В каждой игре есть отдельный рейтинг, чтобы видеть свои успехи. Очки начисляются только во время визита. В конце недели лучшие гости получают бонусы и купоны по таблице призов. Играйте честно и возвращайтесь снова!";

type SubmitScoreParameters = {
  readonly userId: string;
  readonly slug: string;
  readonly points: number;
  readonly now: Date;
};

const validateGameAndPoints = async (
  store: Store,
  slug: string,
  points: number,
) => {
  const game = await store.findGameBySlug(slug);
  if (game === null || !game.active) {
    throw new DomainError("not_found", "Игра не найдена");
  }
  if (!Number.isInteger(points) || points < 1 || points > game.maxScorePerSession) {
    throw new DomainError("score_cap", "Слишком много очков за партию");
  }
  return game;
};

export const submitScoreOrPractice = async (store: Store, input: SubmitScoreParameters) => {
  const user = await store.findUserById(input.userId);
  if (user === null) {
    throw new DomainError("not_found", "Гость не найден");
  }
  if (user.role === "guest") {
    const visit = await store.getActiveVisit(user.id, input.now);
    if (visit === null) {
      throw new DomainError("no_visit", "Игры доступны во время визита в «Друзьях»");
    }
    await validateGameAndPoints(store, input.slug, input.points);
    const game = await store.findGameBySlug(input.slug);
    const weekStart = weekStartMoscow(DateTime.fromJSDate(input.now)).toJSDate();
    const score = await store.withTransaction(async (tx) => {
      const week = await tx.getOrCreateOpenWeek(game!.id, weekStart);
      return tx.addScore(week.id, user.id, input.points, input.now);
    });
    return { points: score.points, counted: true as const };
  }
  if (user.role === "master" || user.role === "admin") {
    await validateGameAndPoints(store, input.slug, input.points);
    return { points: input.points, counted: false as const };
  }
  throw new DomainError("forbidden", "Недостаточно прав");
};

export const submitScore = async (store: Store, input: SubmitScoreParameters) => {
  const result = await submitScoreOrPractice(store, input);
  if (!result.counted) {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  const game = await store.findGameBySlug(input.slug);
  const weekStart = weekStartMoscow(DateTime.fromJSDate(input.now)).toJSDate();
  const week = await store.getOrCreateOpenWeek(game!.id, weekStart);
  const scores = await store.listWeekScores(week.id);
  const score = scores.find((row) => row.userId === input.userId);
  if (score === undefined) {
    throw new DomainError("internal", "Очки не сохранены");
  }
  return score;
};

const rankScoresForLeaderboard = rankScores;

const formatDisplayName = (firstName: string | null, lastName: string | null) => {
  if (firstName === null || firstName.length === 0) {
    return "—";
  }
  if (lastName !== null && lastName.length > 0) {
    return `${firstName} ${lastName[0]}`;
  }
  return firstName;
};

type GetLeaderboardParameters = {
  readonly userId: string;
  readonly slug: string;
  readonly now: Date;
  readonly viewerRole: Role;
};

type LeaderboardParameters = {
  readonly userId: string;
  readonly now: Date;
  readonly viewerRole: Role;
};

const buildLeaderboard = async (
  store: Store,
  scores: ReadonlyArray<{ userId: string; points: number; updatedAt: Date }>,
  input: LeaderboardParameters,
) => {
  const ranked = rankScoresForLeaderboard(scores);
  const showNames = input.viewerRole === "master" || input.viewerRole === "admin";
  const top = await Promise.all(
    ranked.slice(0, LEADERBOARD_TOP).map(async (score, index) => {
      const entry = {
        place: index + 1,
        userId: score.userId,
        points: score.points,
      };
      if (!showNames) {
        return entry;
      }
      const user = await store.findUserById(score.userId);
      return {
        ...entry,
        displayName: formatDisplayName(user?.firstName ?? null, user?.lastName ?? null),
      };
    }),
  );
  const meIndex = ranked.findIndex((score) => score.userId === input.userId);
  const meScore = meIndex === -1 ? undefined : ranked[meIndex];
  const me =
    meScore === undefined
      ? { place: null, points: 0 }
      : { place: meIndex + 1, points: meScore.points };
  return { me, top };
};

export const getOverallLeaderboard = async (store: Store, input: LeaderboardParameters) => {
  const weekStart = weekStartMoscow(DateTime.fromJSDate(input.now)).toJSDate();
  const scores = await store.listAggregatedWeekScores(weekStart);
  return buildLeaderboard(store, scores, input);
};

export const getLeaderboard = async (store: Store, input: GetLeaderboardParameters) => {
  const game = await store.findGameBySlug(input.slug);
  if (game === null) {
    throw new DomainError("not_found", "Игра не найдена");
  }
  const weekStart = weekStartMoscow(DateTime.fromJSDate(input.now)).toJSDate();
  const week = await store.getOrCreateOpenWeek(game.id, weekStart);
  return buildLeaderboard(store, await store.listWeekScores(week.id), input);
};

export const listGames = async (store: Store) => {
  const games = await store.listActiveGames();
  return games.map((game) => ({
    slug: game.slug,
    title: game.title,
  }));
};

export const getGameRules = async (store: Store) => {
  const settings = await store.getSettings();
  const page = await store.getPage("game_rules");
  return {
    winnersCount: settings.winnersCount,
    prizeTable: settings.prizeTable,
    body: page?.body ?? DEFAULT_GAME_RULES_BODY,
  };
};
