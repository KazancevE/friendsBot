import { DateTime } from "luxon";
import { expect, test } from "vitest";
import { submitScore } from "../../src/domain/games.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { openOrExtendVisit } from "../../src/domain/visits.ts";
import { weekStartMoscow } from "../../src/domain/week.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const now = new Date("2026-08-22T12:00:00+03:00");

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
    submitScore(store, { userId: user.id, slug: "match3", points: 100, now }),
  ).rejects.toMatchObject({ code: "no_visit" });
});

test("master with an open visit cannot submitScore", async () => {
  const { store, staff } = await seed();
  await openOrExtendVisit(store, {
    userId: staff.id,
    openedBy: staff.id,
    hours: 4,
    now,
  });
  await expect(
    submitScore(store, { userId: staff.id, slug: "match3", points: 100, now }),
  ).rejects.toMatchObject({ code: "forbidden" });
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
    submitScore(store, { userId: user.id, slug: "match3", points: 50001, now }),
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
  await submitScore(store, { userId: user.id, slug: "match3", points: 120, now });
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
