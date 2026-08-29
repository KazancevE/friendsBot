import { DomainError } from "./errors.ts";
import { submitScoreOrPractice } from "./games.ts";
import type { QuizQuestionRecord, QuizSessionRecord } from "./types.ts";
import type { Store } from "../store/types.ts";

const QUIZ_SLUG = "quiz";
const QUESTION_TIME_MS = 15_000;
const MAX_QUESTIONS = 10;

export type QuizQuestionPublic = {
  id: string;
  sort: number;
  text: string;
  options: string[];
};

export type LiveQuizState = {
  session: QuizSessionRecord;
  questions: QuizQuestionPublic[];
};

const toPublicQuestion = (question: QuizQuestionRecord): QuizQuestionPublic => ({
  id: question.id,
  sort: question.sort,
  text: question.text,
  options: question.options,
});

export async function getLiveQuiz(store: Store, now: Date): Promise<LiveQuizState | null> {
  const session = await store.getLiveQuizSession(now);
  if (session === null) {
    return null;
  }
  const questions = (await store.listQuizQuestions(session.quizId))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, MAX_QUESTIONS);
  return {
    session,
    questions: questions.map(toPublicQuestion),
  };
}

const scoreForAnswer = (correct: boolean, elapsedMs: number) => {
  if (!correct) {
    return 0;
  }
  const remaining = Math.max(0, QUESTION_TIME_MS - elapsedMs);
  return 100 + Math.floor(remaining / 150);
};

export async function submitQuizAnswer(
  store: Store,
  input: {
    userId: string;
    sessionId: string;
    questionId: string;
    optionIndex: number;
    elapsedMs: number;
    now: Date;
  },
) {
  const user = await store.findUserById(input.userId);
  if (user === null || user.role !== "guest") {
    throw new DomainError("forbidden", "Викторина доступна гостям");
  }
  const visit = await store.getActiveVisit(user.id, input.now);
  if (visit === null) {
    throw new DomainError("no_visit", "Викторина доступна во время визита");
  }
  const session = await store.findQuizSessionById(input.sessionId);
  if (session === null || session.status !== "live") {
    throw new DomainError("not_found", "Сессия викторины недоступна");
  }
  if (input.now < session.startedAt || input.now > session.endsAt) {
    throw new DomainError("forbidden", "Сессия викторины завершена");
  }
  if (await store.hasQuizAnswer(session.id, input.questionId, user.id)) {
    throw new DomainError("already_answered", "Ответ уже отправлен");
  }
  const questions = await store.listQuizQuestions(session.quizId);
  const question = questions.find((row) => row.id === input.questionId);
  if (question === undefined) {
    throw new DomainError("not_found", "Вопрос не найден");
  }
  if (input.optionIndex < 0 || input.optionIndex >= question.options.length) {
    throw new DomainError("bad_request", "Некорректный вариант");
  }
  const elapsedMs = Math.min(Math.max(0, input.elapsedMs), QUESTION_TIME_MS);
  const correct = input.optionIndex === question.correctIndex;
  const points = scoreForAnswer(correct, elapsedMs);

  await store.createQuizAnswer({
    sessionId: session.id,
    questionId: question.id,
    userId: user.id,
    optionIndex: input.optionIndex,
    elapsedMs,
    points,
  });

  const sessionTotal = await store.sumQuizSessionPoints(session.id, user.id);

  if (points > 0) {
    const answerStartedAt = new Date(input.now.getTime() - elapsedMs);
    await submitScoreOrPractice(store, {
      userId: user.id,
      slug: QUIZ_SLUG,
      points,
      now: input.now,
      sessionStartedAt: answerStartedAt,
      sessionEndedAt: input.now,
    });
  }

  return {
    correct,
    points,
    sessionTotal,
  };
}

export async function startQuizSession(
  store: Store,
  input: { quizId: string; durationMinutes: number; now: Date },
) {
  const quiz = await store.findActiveQuiz();
  if (quiz === null || quiz.id !== input.quizId) {
    throw new DomainError("not_found", "Викторина не найдена");
  }
  const existing = await store.getLiveQuizSession(input.now);
  if (existing !== null) {
    throw new DomainError("conflict", "Викторина уже запущена");
  }
  const endsAt = new Date(input.now.getTime() + input.durationMinutes * 60_000);
  return store.createQuizSession({
    quizId: quiz.id,
    startedAt: input.now,
    endsAt,
    status: "live",
  });
}

export async function closeExpiredQuizSessions(store: Store, now: Date) {
  const live = await store.getLiveQuizSession(now);
  if (live === null || live.endsAt > now) {
    return 0;
  }
  await store.updateQuizSession(live.id, { status: "closed" });
  return 1;
}
