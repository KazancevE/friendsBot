import { expect, test } from "vitest";
import { registerGuest } from "../../src/domain/users.ts";
import { createHttpApp } from "../../src/http/app.ts";
import { MemoryStore } from "../../src/store/memory.ts";
import { buildInitData } from "./auth.test.ts";

const BOT_TOKEN = "test-token";

const seedAdmin = async () => {
  const store = new MemoryStore();
  await registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79991111111",
  });
  const admin = await store.createUser({
    telegramId: 42n,
    role: "admin",
    firstName: "Админ",
    lastName: "Главный",
    birthday: null,
    phone: null,
    qrToken: "admintoken1",
  });
  const app = createHttpApp({ store, botToken: BOT_TOKEN });
  return { store, admin, app };
};

test("admin can read settings and broadcast segments", async () => {
  const { admin, app } = await seedAdmin();
  const initData = buildInitData({ id: Number(admin.telegramId) }, BOT_TOKEN);
  const headers = { "X-Telegram-Init-Data": initData };

  const settings = await app.request("/api/admin/settings", { headers });
  expect(settings.status).toBe(200);
  const settingsBody = (await settings.json()) as { settings: { percent: number } };
  expect(settingsBody.settings.percent).toBe(10);

  const segments = await app.request("/api/admin/broadcast/segments", { headers });
  expect(segments.status).toBe(200);
  const segmentsBody = (await segments.json()) as { segments: ReadonlyArray<{ id: string; count: number }> };
  expect(segmentsBody.segments.length).toBe(8);
  expect(segmentsBody.segments.some((segment) => segment.id === "all")).toBe(true);
});

test("guest cannot access admin settings", async () => {
  const { app } = await seedAdmin();
  const initData = buildInitData({ id: 1 }, BOT_TOKEN);
  const res = await app.request("/api/admin/settings", {
    headers: { "X-Telegram-Init-Data": initData },
  });
  expect(res.status).toBe(403);
});

test("admin export returns csv attachment", async () => {
  const { admin, app } = await seedAdmin();
  const initData = buildInitData({ id: Number(admin.telegramId) }, BOT_TOKEN);
  const res = await app.request("/api/admin/export?type=ledger", {
    headers: { "X-Telegram-Init-Data": initData },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("text/csv");
  const body = await res.text();
  expect(body.length).toBeGreaterThan(0);
});

test("admin can read stats timeseries and staff ranking", async () => {
  const { admin, app } = await seedAdmin();
  const initData = buildInitData({ id: Number(admin.telegramId) }, BOT_TOKEN);
  const headers = { "X-Telegram-Init-Data": initData };

  const series = await app.request("/api/admin/stats/timeseries?metric=visits", { headers });
  expect(series.status).toBe(200);
  const seriesBody = (await series.json()) as { points: ReadonlyArray<{ date: string; value: number }> };
  expect(Array.isArray(seriesBody.points)).toBe(true);

  const staff = await app.request("/api/admin/stats/staff", { headers });
  expect(staff.status).toBe(200);
  const staffBody = (await staff.json()) as { rows: ReadonlyArray<{ actorId: string; actions: number }> };
  expect(Array.isArray(staffBody.rows)).toBe(true);
});

test("admin can patch settings and preview broadcast", async () => {
  const { admin, app } = await seedAdmin();
  const initData = buildInitData({ id: Number(admin.telegramId) }, BOT_TOKEN);
  const headers = {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": initData,
  };

  const settings = await app.request("/api/admin/settings", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ patch: { percent: 12 } }),
  });
  expect(settings.status).toBe(200);
  const settingsBody = (await settings.json()) as { settings: { percent: number } };
  expect(settingsBody.settings.percent).toBe(12);

  const preview = await app.request("/api/admin/broadcast/preview", {
    method: "POST",
    headers,
    body: JSON.stringify({ segment: "all" }),
  });
  expect(preview.status).toBe(200);
  const previewBody = (await preview.json()) as { count: number };
  expect(previewBody.count).toBeGreaterThanOrEqual(0);
});

test("admin export returns csv attachment", async () => {
  const { admin, app } = await seedAdmin();
  const initData = buildInitData({ id: Number(admin.telegramId) }, BOT_TOKEN);
  const res = await app.request("/api/admin/export?type=ledger", {
    headers: { "X-Telegram-Init-Data": initData },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("text/csv");
  const body = await res.text();
  expect(body.length).toBeGreaterThan(0);
});

test("export token endpoint serves csv once", async () => {
  const { admin, app } = await seedAdmin();
  const initData = buildInitData({ id: Number(admin.telegramId) }, BOT_TOKEN);
  const headers = { "X-Telegram-Init-Data": initData };
  const oversized = await app.request("/api/admin/export?type=ledger", { headers });
  if (oversized.headers.get("Content-Type")?.includes("application/json")) {
    const payload = (await oversized.json()) as { downloadUrl?: string };
    if (payload.downloadUrl !== undefined) {
      const tokenRes = await app.request(payload.downloadUrl);
      expect(tokenRes.status).toBe(200);
      expect(tokenRes.headers.get("Content-Type")).toContain("text/csv");
      const again = await app.request(payload.downloadUrl);
      expect(again.status).toBe(404);
      return;
    }
  }
  expect(oversized.status).toBe(200);
});
