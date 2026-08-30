import { DateTime } from "luxon";
import { DomainError } from "./errors.ts";
import type { GameSessionLogRecord } from "./types.ts";
import { weekStartMoscow } from "./week.ts";
import type { Store } from "../store/types.ts";

type GameAnticheatProfile = {
  minSessionSeconds: number;
  maxPointsPerSecond: number;
};

const GAME_ANTICHEAT: Record<string, GameAnticheatProfile> = {
  match3: { minSessionSeconds: 10, maxPointsPerSecond: 500 },
  blockblast: { minSessionSeconds: 10, maxPointsPerSecond: 500 },
  game2048: { minSessionSeconds: 15, maxPointsPerSecond: 200 },
  flappy: { minSessionSeconds: 5, maxPointsPerSecond: 3 },
  quiz: { minSessionSeconds: 0, maxPointsPerSecond: 100 },
};

const defaultProfile = (): GameAnticheatProfile => ({
  minSessionSeconds: 10,
  maxPointsPerSecond: 500,
});

export type SessionTiming = {
  startedAt: Date;
  endedAt: Date;
};

export type AnticheatInput = {
  userId: string;
  gameId: string;
  slug: string;
  points: number;
  maxScorePerSession: number;
  timing: SessionTiming | null;
  now: Date;
};

export type AnticheatVerdict =
  | { accepted: true }
  | { accepted: false; reason: string; code: string };

const durationSeconds = (timing: SessionTiming) => {
  return Math.max(0, (timing.endedAt.getTime() - timing.startedAt.getTime()) / 1000);
};

const maxObstaclesForFlappy = (durationSec: number) => {
  return Math.floor(durationSec * 3);
};

export async function evaluateGameSession(
  store: Store,
  input: AnticheatInput,
): Promise<AnticheatVerdict> {
  const settings = await store.getSettings();
  const profile = GAME_ANTICHEAT[input.slug] ?? defaultProfile();

  if (input.points < 1 || input.points > input.maxScorePerSession) {
    return { accepted: false, reason: "score_cap", code: "score_cap" };
  }

  if (input.timing === null) {
    return { accepted: false, reason: "missing_session_timing", code: "bad_session" };
  }

  const duration = durationSeconds(input.timing);
  if (duration < profile.minSessionSeconds) {
    return { accepted: false, reason: "session_too_short", code: "bad_session" };
  }

  if (duration > 0 && input.points / duration > profile.maxPointsPerSecond) {
    return { accepted: false, reason: "points_per_second", code: "bad_session" };
  }

  if (input.slug === "flappy" && input.points > maxObstaclesForFlappy(duration)) {
    return { accepted: false, reason: "flappy_impossible_score", code: "bad_session" };
  }

  const hourAgo = DateTime.fromJSDate(input.now).minus({ hours: 1 }).toJSDate();
  const sessionsLastHour = await store.countGameSessionsSince(input.userId, hourAgo);
  if (sessionsLastHour >= settings.maxSessionsPerHour) {
    return { accepted: false, reason: "sessions_per_hour", code: "rate_limit" };
  }

  const recent = await store.listRecentGameSessionLogs(input.userId, input.gameId, 2);
  if (
    recent.length >= 2 &&
    recent[0]!.accepted &&
    recent[1]!.accepted &&
    recent[0]!.points === input.points &&
    recent[1]!.points === input.points
  ) {
    return { accepted: false, reason: "duplicate_score_streak", code: "bad_session" };
  }

  const weekStart = weekStartMoscow(DateTime.fromJSDate(input.now)).toJSDate();
  const weeklyBest = await store.getWeeklyGameScore(input.userId, input.gameId, weekStart);
  if (weeklyBest !== null && weeklyBest > 0 && input.points > weeklyBest * 2) {
    return { accepted: false, reason: "weekly_spike", code: "bad_session" };
  }

  return { accepted: true };
}

export async function logGameSession(
  store: Store,
  input: AnticheatInput & { verdict: AnticheatVerdict },
): Promise<GameSessionLogRecord> {
  const timing = input.timing ?? { startedAt: input.now, endedAt: input.now };
  return store.createGameSessionLog({
    userId: input.userId,
    gameId: input.gameId,
    slug: input.slug,
    points: input.points,
    startedAt: timing.startedAt,
    endedAt: timing.endedAt,
    accepted: input.verdict.accepted,
    rejectReason: input.verdict.accepted ? null : input.verdict.reason,
  });
}

export const anticheatErrorMessage = (code: string): string => {
  switch (code) {
    case "score_cap":
      return "Слишком много очков за партию";
    case "bad_session":
      return "Партия не прошла проверку";
    case "rate_limit":
      return "Слишком много партий за час";
    default:
      return "Партия отклонена";
  }
};

export const anticheatErrorFromVerdict = (verdict: Extract<AnticheatVerdict, { accepted: false }>) => {
  return new DomainError(verdict.code, anticheatErrorMessage(verdict.code));
};
