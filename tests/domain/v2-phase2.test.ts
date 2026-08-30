import { describe, expect, test } from "vitest";
import { recipientsForSegment } from "../../src/domain/broadcast.ts";
import {
  daysUntilBirthday,
  grantDueBirthdays,
  isBirthdayToday,
} from "../../src/domain/birthday.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { pickPromoAdjustment } from "../../src/domain/promo-rules.ts";
import {
  ensureReferralCode,
  parseReferralStartPayload,
} from "../../src/domain/referral.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import type { PromoRuleRecord } from "../../src/domain/types.ts";

const seedGuest = async (
  store: MemoryStore,
  input: { telegramId: bigint; firstName: string; lastName: string; phone: string; referredByUserId?: string },
) => {
  const user = await store.createUser({
    telegramId: input.telegramId,
    role: "guest",
    firstName: input.firstName,
    lastName: input.lastName,
    birthday: new Date("1995-06-15"),
    phone: input.phone,
    qrToken: crypto.randomUUID(),
  });
  if (input.referredByUserId !== undefined) {
    return store.updateUser(user.id, { referredByUserId: input.referredByUserId });
  }
  return user;
};

const seedMaster = async (store: MemoryStore) => {
  return store.createUser({
    telegramId: BigInt(Math.floor(Math.random() * 1_000_000)),
    role: "master",
    firstName: "Master",
    lastName: null,
    birthday: null,
    phone: null,
    qrToken: crypto.randomUUID(),
  });
};

describe("v2 phase 2", () => {
  test("parseReferralStartPayload extracts code", () => {
    expect(parseReferralStartPayload("ref_ABCD1234")).toBe("ABCD1234");
    expect(parseReferralStartPayload("hello")).toBeNull();
  });

  test("referral activates on first check within window", async () => {
    const store = new MemoryStore();
    const referrer = await seedGuest(store, {
      telegramId: 101n,
      firstName: "Ref",
      lastName: "Errer",
      phone: "79991110001",
    });
    await store.updateUser(referrer.id, { referralCode: "TESTCODE" });
    const referee = await seedGuest(store, {
      telegramId: 102n,
      firstName: "New",
      lastName: "Guest",
      phone: "79991110002",
      referredByUserId: referrer.id,
    });
    const master = await seedMaster(store);
    const now = new Date("2026-08-30T18:00:00+03:00");
    await applyCheck(store, {
      guestId: referee.id,
      actorId: master.id,
      checkRubles: 1000,
      now,
    });
    const stats = await store.getReferralStats(referrer.id);
    expect(stats.activated).toBe(1);
    expect(stats.bonusesEarned).toBe(300);
    const updatedReferee = await store.findUserById(referee.id);
    expect(updatedReferee?.balance).toBeGreaterThanOrEqual(300);
  });

  test("double_check_bonus promo rule doubles check bonus", async () => {
    const store = new MemoryStore();
    const guest = await seedGuest(store, {
      telegramId: 201n,
      firstName: "Promo",
      lastName: "Guest",
      phone: "79992220001",
    });
    const master = await seedMaster(store);
    await store.createPromoRule({
      promoId: null,
      kind: "double_check_bonus",
      params: {},
      priority: 10,
    });
    const now = new Date("2026-08-30T18:00:00+03:00");
    const applied = await applyCheck(store, {
      guestId: guest.id,
      actorId: master.id,
      checkRubles: 1000,
      now,
    });
    expect(applied.bonus).toBe(200);
  });

  test("pickPromoAdjustment applies highest priority rule only", () => {
    const rules: PromoRuleRecord[] = [
      {
        id: "low",
        promoId: null,
        kind: "min_check_bonus",
        params: { minRubles: 500, bonus: 50 },
        active: true,
        validFrom: null,
        validUntil: null,
        priority: 1,
      },
      {
        id: "high",
        promoId: null,
        kind: "double_check_bonus",
        params: {},
        active: true,
        validFrom: null,
        validUntil: null,
        priority: 5,
      },
    ];
    const adjustment = pickPromoAdjustment(
      rules,
      { checkRubles: 1000, now: new Date("2026-08-30T18:00:00+03:00") },
      100,
    );
    expect(adjustment.checkBonusMultiplier).toBe(2);
    expect(adjustment.extraBonus).toBe(0);
  });

  test("broadcast segment inactive_30d excludes recent visitors", async () => {
    const store = new MemoryStore();
    const active = await seedGuest(store, {
      telegramId: 301n,
      firstName: "Active",
      lastName: "One",
      phone: "79993330001",
    });
    const inactive = await seedGuest(store, {
      telegramId: 302n,
      firstName: "Inactive",
      lastName: "Two",
      phone: "79993330002",
    });
    const master = await seedMaster(store);
    const now = new Date("2026-08-30T18:00:00+03:00");
    await applyCheck(store, {
      guestId: active.id,
      actorId: master.id,
      checkRubles: 500,
      now,
    });
    const ids = await recipientsForSegment(store, {
      segment: "inactive_30d",
      now,
    });
    expect(ids).toEqual([inactive.telegramId]);
  });

  test("grantDueBirthdays creates coupon when configured", async () => {
    const store = new MemoryStore();
    await store.updateSettings({
      birthdayCouponTitle: "ДР-коктейль",
      birthdayCouponClaimDays: 14,
    });
    const guest = await registerGuest(store, {
      telegramId: 401n,
      firstName: "Birth",
      lastName: "Day",
      birthday: new Date("1990-08-30"),
      phone: "79994440001",
    });
    const now = new Date("2026-08-30T12:00:00+03:00");
    const granted = await grantDueBirthdays(store, now);
    expect(granted).toBe(1);
    const coupons = await store.listActiveCoupons(guest.id);
    expect(coupons.some((coupon) => coupon.title === "ДР-коктейль")).toBe(true);
  });

  test("daysUntilBirthday and isBirthdayToday work in Moscow", () => {
    const birthday = new Date("1990-08-30");
    const onDay = new Date("2026-08-30T12:00:00+03:00");
    expect(isBirthdayToday(birthday, onDay)).toBe(true);
    expect(daysUntilBirthday(birthday, new Date("2026-08-23T12:00:00+03:00"))).toBe(7);
  });

  test("ensureReferralCode creates stable code", async () => {
    const store = new MemoryStore();
    const guest = await seedGuest(store, {
      telegramId: 501n,
      firstName: "Code",
      lastName: "Guest",
      phone: "79995550001",
    });
    const code = await ensureReferralCode(store, guest.id);
    expect(code.length).toBe(8);
    const again = await ensureReferralCode(store, guest.id);
    expect(again).toBe(code);
  });
});
