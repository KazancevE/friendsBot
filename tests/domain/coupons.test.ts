import { expect, test } from "vitest";
import { redeemCoupon } from "../../src/domain/coupons.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("redeem once", async () => {
  const store = new MemoryStore();
  const staff = await store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "staff-coupon-token",
  });
  const guest = await registerGuest(store, {
    telegramId: 14n,
    firstName: "Гость",
    lastName: "Купон",
    birthday: new Date("1990-05-12"),
    phone: "79001400014",
  });
  const coupon = await store.createCoupon({
    userId: guest.id,
    title: "Кальян в подарок",
    weekId: null,
  });
  const first = await redeemCoupon(store, { couponId: coupon.id, actorId: staff.id, now: new Date() });
  expect(first.status).toBe("redeemed");
  await expect(
    redeemCoupon(store, { couponId: coupon.id, actorId: staff.id, now: new Date() }),
  ).rejects.toMatchObject({ code: "coupon_used" });
});
