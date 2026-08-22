import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { applyCheck, redeemBonuses, manualAdjust } from "../../src/domain/ledger.ts";
import { DomainError } from "../../src/domain/errors.ts";

async function guest(store: MemoryStore) {
  return registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79991111111",
  });
}

async function staff(store: MemoryStore) {
  return store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
}

test("2000 rub check at 10% adds 200 and opens visit", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  const result = await applyCheck(store, {
    guestId: g.id,
    actorId: s.id,
    checkRubles: 2000,
    now,
  });
  expect(result.user.balance).toBe(700);
  expect(result.bonus).toBe(200);
  const visit = await store.getActiveVisit(g.id, now);
  expect(visit).not.toBeNull();
  const hours = (visit!.endsAt.getTime() - now.getTime()) / 3600000;
  expect(hours).toBe(4);
});

test("redeem cannot exceed balance", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  await expect(
    redeemBonuses(store, { guestId: g.id, actorId: s.id, amount: 501 }),
  ).rejects.toMatchObject({ code: "insufficient" });
});

test("manual negative is clamped by balance", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  await expect(
    manualAdjust(store, { guestId: g.id, actorId: s.id, delta: -501, comment: "ошибка" }),
  ).rejects.toBeInstanceOf(DomainError);
  const ok = await manualAdjust(store, {
    guestId: g.id,
    actorId: s.id,
    delta: -100,
    comment: "коррекция",
  });
  expect(ok.balance).toBe(400);
});

test("guest cannot apply check", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  await expect(
    applyCheck(store, {
      guestId: g.id,
      actorId: g.id,
      checkRubles: 100,
      now: new Date(),
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
});
