import { expect, test } from "vitest";
import { clearExportTokensForTests, consumeExportToken, createExportToken } from "../../src/domain/export-token.ts";
import { exportRowCount, EXPORT_ROW_LIMIT } from "../../src/domain/export.ts";
import { addQuizQuestion } from "../../src/domain/quiz.ts";
import { getStatsSummary, periodLastDays } from "../../src/domain/stats.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("export token is one-time and expires", () => {
  clearExportTokensForTests();
  const now = new Date("2026-08-30T12:00:00Z");
  const token = createExportToken({
    type: "ledger",
    from: new Date("2026-08-01T00:00:00Z"),
    to: now,
    now,
  });
  const payload = consumeExportToken(token, now);
  expect(payload?.type).toBe("ledger");
  expect(consumeExportToken(token, now)).toBeNull();
});

test("stats summary includes game session metrics", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 55n,
    firstName: "G",
    lastName: "M",
    birthday: new Date("1990-01-01"),
    phone: "79990001155",
  });
  const game = await store.findGameBySlug("match3");
  if (game === null) {
    throw new Error("no game");
  }
  await store.createGameSessionLog({
    userId: guest.id,
    gameId: game.id,
    slug: game.slug,
    points: 100,
    startedAt: new Date("2026-08-30T10:00:00+03:00"),
    endedAt: new Date("2026-08-30T10:05:00+03:00"),
    accepted: true,
    rejectReason: null,
  });
  const now = new Date("2026-08-30T20:00:00+03:00");
  const summary = await getStatsSummary(store, periodLastDays(now, 7), now);
  expect(summary.gameSessions).toBe(1);
  expect(summary.uniqueGamePlayers).toBe(1);
});

test("addQuizQuestion validates four options", async () => {
  const store = new MemoryStore();
  const quiz = await store.findActiveQuiz();
  if (quiz === null) {
    throw new Error("quiz missing");
  }
  await expect(
    addQuizQuestion(store, { quizId: quiz.id, text: "Q?", options: ["a"], correctIndex: 0 }),
  ).rejects.toThrow("4");
  const question = await addQuizQuestion(store, {
    quizId: quiz.id,
    text: "Столица?",
    options: ["Москва", "Казань", "СПб", "Сочи"],
    correctIndex: 0,
  });
  expect(question.sort).toBeGreaterThanOrEqual(1);
});

test("export row limit constant matches spec", () => {
  expect(EXPORT_ROW_LIMIT).toBe(10_000);
});
