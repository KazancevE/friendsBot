import { expect, test } from "vitest";
import { applyCheck } from "../../src/domain/ledger.ts";
import { ensureReferralCode, referralLink } from "../../src/domain/referral.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("referral pays both clients when the friend pays the first check", async () => {
  const store = new MemoryStore();
  const referrer = await registerGuest(store, {
    telegramId: 501n,
    firstName: "Иван",
    lastName: "Петров",
    birthday: new Date("1990-05-01"),
    phone: "79001110001",
  });
  const code = await ensureReferralCode(store, referrer.id);
  expect(referralLink("daddyson_bot", code)).toBe(`https://t.me/daddyson_bot?start=ref_${code}`);
  const referee = await registerGuest(store, {
    telegramId: 502n,
    firstName: "Пётр",
    lastName: "Сидоров",
    birthday: new Date("1995-06-02"),
    phone: "79001110002",
    referredByUserId: referrer.id,
  });
  const master = await store.createUser({
    telegramId: 599n,
    role: "master",
    firstName: "Касса",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: "cashier-token",
  });
  const before = (await store.findUserById(referrer.id))!.balance;
  await applyCheck(store, {
    guestId: referee.id,
    actorId: master.id,
    checkRubles: 1900,
    now: new Date("2026-09-28T12:00:00+07:00"),
  });
  const afterReferrer = await store.findUserById(referrer.id);
  const afterReferee = await store.findUserById(referee.id);
  const stats = await store.getReferralStats(referrer.id);
  expect(stats.activated).toBe(1);
  expect(stats.bonusesEarned).toBe(300);
  expect(afterReferrer!.balance - before).toBe(300);
  expect(afterReferee!.balance).toBeGreaterThanOrEqual(300);
});
