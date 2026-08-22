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
