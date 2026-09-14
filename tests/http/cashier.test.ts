import { expect, test } from "vitest";
import { registerGuest } from "../../src/domain/users.ts";
import { createHttpApp } from "../../src/http/app.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import { buildInitData } from "./auth.test.ts";

const BOT_TOKEN = "test-token";

const seedCashier = async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79991111111",
  });
  const master = await store.createUser({
    telegramId: 99n,
    role: "master",
    firstName: "Мастер",
    lastName: "Зала",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
  const app = createHttpApp({ store, botToken: BOT_TOKEN });
  return { store, guest, master, app };
};

test("master can apply check via api with phone or qrToken", async () => {
  const { store, guest, master, app } = await seedCashier();
  const initData = buildInitData({ id: Number(master.telegramId) }, BOT_TOKEN);

  const byPhone = await app.request("/api/cashier/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({ phone: guest.phone, checkRubles: 2000 }),
  });
  expect(byPhone.status).toBe(200);
  const phoneBody = (await byPhone.json()) as { balance: number };
  expect(phoneBody.balance).toBe(700);
  expect((await store.findUserById(guest.id))?.balance).toBe(700);

  const byQr = await app.request("/api/cashier/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({ qrToken: guest.qrToken, checkRubles: 2000 }),
  });
  expect(byQr.status).toBe(200);
  const qrBody = (await byQr.json()) as { balance: number };
  expect(qrBody.balance).toBe(900);
});

test("lookup returns coupons as id and title", async () => {
  const { store, guest, master, app } = await seedCashier();
  const coupon = await store.createCoupon({
    userId: guest.id,
    title: "Кальян в подарок",
    weekId: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  });
  const initData = buildInitData({ id: Number(master.telegramId) }, BOT_TOKEN);
  const res = await app.request("/api/cashier/lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({ phone: guest.phone }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { coupons: ReadonlyArray<{ id: string; title: string }> };
  expect(body.coupons).toEqual([{ id: coupon.id, title: "Кальян в подарок" }]);
});

test("guest cannot apply check", async () => {
  const { store, guest, app } = await seedCashier();
  const initData = buildInitData({ id: Number(guest.telegramId) }, BOT_TOKEN);
  const res = await app.request("/api/cashier/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({ phone: guest.phone, checkRubles: 2000 }),
  });
  expect(res.status).toBe(403);
  expect((await store.findUserById(guest.id))?.balance).toBe(500);
});

const staffHeaders = (telegramId: bigint) => {
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": buildInitData({ id: Number(telegramId) }, BOT_TOKEN),
  };
};

test("master can redeem, adjust, open, extend, and close visit via api", async () => {
  const { store, guest, master, app } = await seedCashier();
  const headers = staffHeaders(master.telegramId);

  const redeem = await app.request("/api/cashier/redeem", {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: guest.phone, amount: 50 }),
  });
  expect(redeem.status).toBe(200);
  const redeemBody = (await redeem.json()) as { balance: number };
  expect(redeemBody.balance).toBe(450);

  const manual = await app.request("/api/cashier/manual", {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: guest.phone, delta: 20, comment: "тест" }),
  });
  expect(manual.status).toBe(200);
  expect(((await manual.json()) as { balance: number }).balance).toBe(470);

  const visit = await app.request("/api/cashier/visit", {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: guest.phone }),
  });
  expect(visit.status).toBe(200);
  expect(((await visit.json()) as { visitActive: boolean }).visitActive).toBe(true);

  const extend = await app.request("/api/cashier/extend-visit", {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: guest.phone }),
  });
  expect(extend.status).toBe(200);

  const close = await app.request("/api/cashier/close-visit", {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: guest.phone }),
  });
  expect(close.status).toBe(200);
  const closeBody = (await close.json()) as { visitActive: boolean };
  expect(closeBody.visitActive).toBe(false);
  expect(await store.getActiveVisit(guest.id, new Date())).toBeNull();
});

test("master can redeem a coupon via api", async () => {
  const { store, guest, master, app } = await seedCashier();
  const coupon = await store.createCoupon({
    userId: guest.id,
    title: "Чай",
    weekId: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  });
  const res = await app.request("/api/cashier/coupon/redeem", {
    method: "POST",
    headers: staffHeaders(master.telegramId),
    body: JSON.stringify({ couponId: coupon.id }),
  });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { status: string }).status).toBe("redeemed");
});
