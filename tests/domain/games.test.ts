import { DateTime } from "luxon";
import { expect, test } from "vitest";
import { getGameRules, getLeaderboard, getOverallLeaderboard, submitScore, submitScoreOrPractice } from "../../src/domain/games.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { openOrExtendVisit } from "../../src/domain/visits.ts";
import { weekStartMoscow } from "../../src/domain/week.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const now = new Date("2026-08-22T12:00:00+03:00");

const sessionTiming = (at: Date, durationSeconds: number) => ({
  sessionStartedAt: new Date(at.getTime() - durationSeconds * 1000),
  sessionEndedAt: at,
});

async function seed() {
  const store = new MemoryStore();
  const user = await registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79991111111",
  });
  const staff = await store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
  return { store, user, staff };
}

test("rejects score without visit", async () => {
  const { store, user } = await seed();
  await expect(
    submitScoreOrPractice(store, { userId: user.id, slug: "match3", points: 100, now, ...sessionTiming(now, 15) }),
  ).rejects.toMatchObject({ code: "no_visit" });
});

test("master practice score succeeds without persisting", async () => {
  const { store, staff } = await seed();
  await openOrExtendVisit(store, {
    userId: staff.id,
    openedBy: staff.id,
    hours: 4,
    now,
  });
  const result = await submitScoreOrPractice(store, {
    userId: staff.id,
    slug: "match3",
    points: 100,
    now,
    ...sessionTiming(now, 15),
  });
  expect(result).toEqual({ points: 100, counted: false });
  const game = await store.findGameBySlug("match3");
  const week = await store.getOrCreateOpenWeek(
    game!.id,
    weekStartMoscow(DateTime.fromJSDate(now)).toJSDate(),
  );
  expect(await store.listWeekScores(week.id)).toEqual([]);
});

test("rejects score above cap after visit opened", async () => {
  const { store, user, staff } = await seed();
  await applyCheck(store, {
    guestId: user.id,
    actorId: staff.id,
    checkRubles: 100,
    now,
  });
  await expect(
    submitScoreOrPractice(store, { userId: user.id, slug: "match3", points: 50001, now, ...sessionTiming(now, 15) }),
  ).rejects.toMatchObject({ code: "score_cap" });
});

test("adds 120 points and does not change balance", async () => {
  const { store, user, staff } = await seed();
  await applyCheck(store, {
    guestId: user.id,
    actorId: staff.id,
    checkRubles: 100,
    now,
  });
  const before = (await store.findUserById(user.id))!.balance;
  await submitScore(store, { userId: user.id, slug: "match3", points: 120, now, ...sessionTiming(now, 15) });
  expect((await store.findUserById(user.id))!.balance).toBe(before);
  const game = await store.findGameBySlug("match3");
  const week = await store.getOrCreateOpenWeek(
    game!.id,
    weekStartMoscow(DateTime.fromJSDate(now)).toJSDate(),
  );
  const scores = await store.listWeekScores(week.id);
  expect(scores).toEqual([
    expect.objectContaining({ userId: user.id, points: 120 }),
  ]);
});

test("staff getLeaderboard includes displayName for top entries", async () => {
  const { store, user, staff } = await seed();
  await applyCheck(store, {
    guestId: user.id,
    actorId: staff.id,
    checkRubles: 100,
    now,
  });
  await submitScore(store, { userId: user.id, slug: "match3", points: 120, now, ...sessionTiming(now, 15) });
  const board = await getLeaderboard(store, {
    userId: staff.id,
    slug: "match3",
    now,
    viewerRole: "master",
  });
  expect(board.top).toEqual([
    expect.objectContaining({ place: 1, points: 120, displayName: "Г О" }),
  ]);
});

test("getOverallLeaderboard sums points across games", async () => {
  const { store, user, staff } = await seed();
  await applyCheck(store, {
    guestId: user.id,
    actorId: staff.id,
    checkRubles: 100,
    now,
  });
  await submitScore(store, { userId: user.id, slug: "match3", points: 120, now, ...sessionTiming(now, 15) });
  await submitScore(store, { userId: user.id, slug: "blockblast", points: 80, now, ...sessionTiming(now, 15) });
  const board = await getOverallLeaderboard(store, {
    userId: user.id,
    now,
    viewerRole: "guest",
  });
  expect(board.me).toEqual({ place: 1, points: 200, playedToday: false });
});

test("getLeaderboard marks playedToday after accepted session", async () => {
  const { store, user, staff } = await seed();
  await applyCheck(store, {
    guestId: user.id,
    actorId: staff.id,
    checkRubles: 100,
    now,
  });
  await submitScore(store, { userId: user.id, slug: "match3", points: 120, now, ...sessionTiming(now, 15) });
  const board = await getLeaderboard(store, {
    userId: user.id,
    slug: "match3",
    now,
    viewerRole: "guest",
  });
  expect(board.me.playedToday).toBe(true);
});

test("getGameRules returns settings and body", async () => {
  const store = new MemoryStore();
  await store.updateSettings({
    winnersCount: 2,
    prizeTable: [{ place: 1, bonuses: 1000, couponTitle: "Кальян" }],
  });
  await store.upsertPage({
    slug: "game_rules",
    body: "Правила недельного рейтинга",
    mapUrl: null,
  });
  const rules = await getGameRules(store);
  expect(rules).toEqual({
    winnersCount: 2,
    prizeTable: [{ place: 1, bonuses: 1000, couponTitle: "Кальян" }],
    body: "Правила недельного рейтинга",
  });
});
