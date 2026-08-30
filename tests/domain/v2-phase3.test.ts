import { describe, expect, test } from "vitest";
import { evaluateGameSession } from "../../src/domain/game-anticheat.ts";
import { listGames, submitScoreOrPractice } from "../../src/domain/games.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { getLiveQuiz, startQuizSession, submitQuizAnswer } from "../../src/domain/quiz.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import type { QuizQuestionRecord, QuizRecord } from "../../src/domain/types.ts";

const now = new Date("2026-08-30T18:00:00+03:00");

const sessionTiming = (at: Date, durationSeconds: number) => ({
  startedAt: new Date(at.getTime() - durationSeconds * 1000),
  endedAt: at,
});

const seedGuestWithVisit = async (store: MemoryStore) => {
  const guest = await registerGuest(store, {
    telegramId: 701n,
    firstName: "Game",
    lastName: "Guest",
    birthday: new Date("1990-01-01"),
    phone: "79997770001",
  });
  const master = await store.createUser({
    telegramId: 702n,
    role: "master",
    firstName: "M",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: "master702",
  });
  await applyCheck(store, {
    guestId: guest.id,
    actorId: master.id,
    checkRubles: 500,
    now,
  });
  return guest;
};

const seedQuiz = (store: MemoryStore) => {
  const quiz: QuizRecord = {
    id: crypto.randomUUID(),
    title: "Тест",
    active: true,
    showInHub: false,
  };
  store.quizzes.set(quiz.id, quiz);
  const q1: QuizQuestionRecord = {
    id: crypto.randomUUID(),
    quizId: quiz.id,
    sort: 1,
    text: "2+2?",
    options: ["3", "4", "5", "6"],
    correctIndex: 1,
  };
  store.quizQuestions.set(q1.id, q1);
  return { quiz, q1 };
};

describe("v2 phase 3", () => {
  test("rejects score without session timing", async () => {
    const store = new MemoryStore();
    const guest = await seedGuestWithVisit(store);
    await expect(
      submitScoreOrPractice(store, { userId: guest.id, slug: "match3", points: 100, now }),
    ).rejects.toMatchObject({ code: "bad_session" });
  });

  test("rejects impossibly fast flappy score", async () => {
    const store = new MemoryStore();
    const guest = await seedGuestWithVisit(store);
    const game = await store.findGameBySlug("flappy");
    expect(game).not.toBeNull();
    const verdict = await evaluateGameSession(store, {
      userId: guest.id,
      gameId: game!.id,
      slug: "flappy",
      points: 100,
      maxScorePerSession: 500,
      timing: sessionTiming(now, 5),
      now,
    });
    expect(verdict.accepted).toBe(false);
  });

  test("accepts valid match3 session", async () => {
    const store = new MemoryStore();
    const guest = await seedGuestWithVisit(store);
    const timing = sessionTiming(now, 15);
    const result = await submitScoreOrPractice(store, {
      userId: guest.id,
      slug: "match3",
      points: 120,
      now,
      sessionStartedAt: timing.startedAt,
      sessionEndedAt: timing.endedAt,
    });
    expect(result.counted).toBe(true);
  });

  test("quiz hidden until live session", async () => {
    const store = new MemoryStore();
    const before = await listGames(store, now);
    expect(before.some((game) => game.slug === "quiz")).toBe(false);
    const { quiz } = seedQuiz(store);
    await startQuizSession(store, { quizId: quiz.id, durationMinutes: 10, now });
    const after = await listGames(store, now);
    expect(after.some((game) => game.slug === "quiz")).toBe(true);
  });

  test("submitQuizAnswer scores on server", async () => {
    const store = new MemoryStore();
    const guest = await seedGuestWithVisit(store);
    const { quiz, q1 } = seedQuiz(store);
    const session = await startQuizSession(store, { quizId: quiz.id, durationMinutes: 10, now });
    const live = await getLiveQuiz(store, now);
    expect(live?.session.id).toBe(session.id);
    const result = await submitQuizAnswer(store, {
      userId: guest.id,
      sessionId: session.id,
      questionId: q1.id,
      optionIndex: 1,
      elapsedMs: 3000,
      now,
    });
    expect(result.correct).toBe(true);
    expect(result.points).toBeGreaterThan(0);
  });
});
