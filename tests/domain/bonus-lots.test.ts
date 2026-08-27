import { expect, test } from "vitest";
import { DateTime } from "luxon";
import { availableBalance, expiresOnMoscowDay } from "../../src/domain/bonus-lots.ts";
import { applyCheck, manualAdjust, redeemBonuses } from "../../src/domain/ledger.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { expiresAfterDays } from "../../src/domain/settings.ts";
import { MOSCOW } from "../../src/domain/week.ts";
import { runExpiryJob } from "../../src/jobs/expiry-job.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import type { Api } from "grammy";

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

test("redeem spends gift lots before check lots", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  await applyCheck(store, {
    guestId: g.id,
    actorId: s.id,
    checkRubles: 1000,
    now,
  });
  const lotsBefore = await store.listBonusLots(g.id);
  const giftLot = lotsBefore.find((lot) => lot.category === "gift");
  const checkLot = lotsBefore.find((lot) => lot.category === "check");
  expect(giftLot?.remaining).toBe(500);
  expect(checkLot?.remaining).toBe(100);

  await redeemBonuses(store, { guestId: g.id, actorId: s.id, amount: 550, now });
  const lotsAfter = await store.listBonusLots(g.id);
  expect(lotsAfter.find((lot) => lot.id === giftLot!.id)?.remaining).toBe(0);
  expect(lotsAfter.find((lot) => lot.id === checkLot!.id)?.remaining).toBe(50);
});

test("redeem cannot exceed available non-expired balance", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  const lot = (await store.listBonusLots(g.id))[0]!;
  await store.updateBonusLot(lot.id, {
    expiresAt: new Date(now.getTime() - 1000),
  });
  await expect(
    redeemBonuses(store, { guestId: g.id, actorId: s.id, amount: 1, now }),
  ).rejects.toMatchObject({ code: "insufficient" });
});

test("expiresOnMoscowDay matches calendar dates", () => {
  const now = DateTime.fromObject({ year: 2026, month: 8, day: 22 }, { zone: MOSCOW }).toJSDate();
  const expiresAt = DateTime.fromObject({ year: 2026, month: 8, day: 29 }, { zone: MOSCOW }).toJSDate();
  expect(expiresOnMoscowDay(expiresAt, 7, now)).toBe(true);
  expect(expiresOnMoscowDay(expiresAt, 6, now)).toBe(false);
});

test("expiry job sends warning when above threshold", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const now = DateTime.fromObject({ year: 2026, month: 8, day: 22 }, { zone: MOSCOW }).toJSDate();
  const lot = (await store.listBonusLots(g.id))[0]!;
  await store.updateBonusLot(lot.id, {
    expiresAt: expiresAfterDays(now, 7),
  });
  const messages: string[] = [];
  const api = {
    sendMessage: async (_chatId: string, text: string) => {
      messages.push(text);
    },
  } as unknown as Api;

  await runExpiryJob(store, api, now);
  expect(messages.some((text) => text.includes("7 дней"))).toBe(true);
});

test("expiry job burns expired lots and notifies", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  const lot = (await store.listBonusLots(g.id))[0]!;
  await store.updateBonusLot(lot.id, {
    expiresAt: new Date(now.getTime() - 1000),
  });
  const messages: string[] = [];
  const api = {
    sendMessage: async (_chatId: string, text: string) => {
      messages.push(text);
    },
  } as unknown as Api;

  await runExpiryJob(store, api, now);
  expect((await store.findUserById(g.id))?.balance).toBe(0);
  expect(messages.some((text) => text.includes("Сгорело 500"))).toBe(true);
});

test("expiry job skips notification below threshold", async () => {
  const store = new MemoryStore();
  await store.updateSettings({ expireNotifyMinBonuses: 600 });
  const g = await guest(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  const lot = (await store.listBonusLots(g.id))[0]!;
  await store.updateBonusLot(lot.id, {
    expiresAt: new Date(now.getTime() - 1000),
  });
  const messages: string[] = [];
  const api = {
    sendMessage: async (_chatId: string, text: string) => {
      messages.push(text);
    },
  } as unknown as Api;

  await runExpiryJob(store, api, now);
  expect(messages).toHaveLength(0);
});

test("manual negative uses lot allocation order", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const s = await staff(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  await applyCheck(store, {
    guestId: g.id,
    actorId: s.id,
    checkRubles: 500,
    now,
  });
  const giftLot = (await store.listBonusLots(g.id)).find((lot) => lot.category === "gift")!;
  await manualAdjust(store, {
    guestId: g.id,
    actorId: s.id,
    delta: -450,
    comment: "коррекция",
    now,
  });
  const updatedGift = (await store.listBonusLots(g.id)).find((lot) => lot.id === giftLot.id);
  expect(updatedGift?.remaining).toBe(50);
});

test("availableBalance ignores expired lots", async () => {
  const store = new MemoryStore();
  const g = await guest(store);
  const now = new Date("2026-08-22T12:00:00+03:00");
  const lots = await store.listBonusLots(g.id);
  await store.updateBonusLot(lots[0]!.id, {
    expiresAt: new Date(now.getTime() - 1000),
  });
  const refreshed = await store.listBonusLots(g.id);
  expect(availableBalance(refreshed, now)).toBe(0);
});
