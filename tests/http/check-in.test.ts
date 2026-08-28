import { expect, test } from "vitest";
import { registerGuest } from "../../src/domain/users.ts";
import { ensureActiveVenueCode, venueQrPayload } from "../../src/domain/venue-code.ts";
import { createHttpApp } from "../../src/http/app.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import { buildInitData } from "./auth.test.ts";

const BOT_TOKEN = "test-token";

const seed = async () => {
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
    firstName: "М",
    lastName: "С",
    birthday: null,
    phone: null,
    qrToken: "stafftoken1",
  });
  const now = new Date();
  const code = await ensureActiveVenueCode(store, now);
  const app = createHttpApp({ store, botToken: BOT_TOKEN });
  return { store, guest, master, app, code, now };
};

test("guest can check in with pin via api", async () => {
  const { guest, app, code } = await seed();
  const initData = buildInitData({ id: Number(guest.telegramId) }, BOT_TOKEN);
  const res = await app.request("/api/check-in", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({ method: "pin", pin: code.pin }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { visitActive: boolean; message: string };
  expect(body.visitActive).toBe(true);
  expect(body.message).toContain("Визит открыт");
});

test("staff can fetch venue code and active visits", async () => {
  const { guest, master, app, code } = await seed();
  const guestInit = buildInitData({ id: Number(guest.telegramId) }, BOT_TOKEN);
  await app.request("/api/check-in", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": guestInit,
    },
    body: JSON.stringify({ method: "qr", token: venueQrPayload(code.token) }),
  });

  const initData = buildInitData({ id: Number(master.telegramId) }, BOT_TOKEN);
  const codeRes = await app.request("/api/staff/venue-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({}),
  });
  expect(codeRes.status).toBe(200);
  const codeBody = (await codeRes.json()) as { pin: string; qrPayload: string };
  expect(codeBody.pin).toBe(code.pin);
  expect(codeBody.qrPayload).toContain(code.token);

  const activeRes = await app.request("/api/staff/active-visits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({}),
  });
  expect(activeRes.status).toBe(200);
  const activeBody = (await activeRes.json()) as { count: number };
  expect(activeBody.count).toBe(1);
});

test("guest cannot fetch venue code", async () => {
  const { guest, app } = await seed();
  const initData = buildInitData({ id: Number(guest.telegramId) }, BOT_TOKEN);
  const res = await app.request("/api/staff/venue-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(403);
});
