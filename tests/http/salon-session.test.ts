import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { createSalonRoutes } from "../../src/http/salon.ts";
import type { SalonService } from "../../src/salon/service.ts";
import { readGuestToken } from "../../src/salon/session.ts";
import type { Store } from "../../src/store/types.ts";
import { miniAppGateMessage } from "../../src/salon/miniapp-session.ts";

const TOKEN = "test-bot-token";
const SECRET = "test-secret-test-secret-test";

const buildInitData = (userId: number, botToken: string, authDate = Math.floor(Date.now() / 1000)) => {
  const params: Record<string, string> = {
    auth_date: String(authDate),
    user: JSON.stringify({ id: userId, first_name: "Иван" }),
  };
  const dataCheckString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...params, hash }).toString();
};

const appFor = (user: { id: string; firstName: string | null; phone: string | null } | null, consent = true) =>
  createSalonRoutes({
    salon: {
      findChannelUser: async () => user,
      hasConsent: async () => consent,
      profileReady: (row: { firstName: string | null; phone: string | null }) => Boolean(row.firstName && row.phone),
    } as unknown as SalonService,
    store: {} as Store,
    notifier: { send: async () => undefined },
    adminLogin: "admin",
    adminPassword: "daddyson-demo",
    admins: {
      list: async () => [],
      create: async () => {
        throw new Error("нет");
      },
      setPassword: async () => undefined,
      remove: async () => undefined,
    },
    sessionSecret: SECRET,
    allowDemoGuest: false,
    telegramBotToken: TOKEN,
    maxBotToken: "max-token",
    links: { telegram: null, max: null, app: "/app" },
  });

const post = (app: ReturnType<typeof createSalonRoutes>, body: unknown) =>
  app.request("/api/salon/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("a signed Telegram launch of a ready client returns a guest token", async () => {
  const response = await post(appFor({ id: "user-1", firstName: "Иван", phone: "+79990000000" }), {
    channel: "telegram",
    initData: buildInitData(42, TOKEN),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { status: string; token: string };
  expect(body.status).toBe("ok");
  expect(readGuestToken(SECRET, body.token)).toBe("user-1");
});

test("a foreign bot signature explains the token mismatch", async () => {
  const response = await post(appFor({ id: "user-1", firstName: "Иван", phone: "+79990000000" }), {
    channel: "telegram",
    initData: buildInitData(42, "other-bot"),
  });
  expect(response.status).toBe(401);
  const body = (await response.json()) as { status: string; message: string };
  expect(body.status).toBe("bad_signature");
  expect(body.message).toContain("TELEGRAM_BOT_TOKEN");
});

test("a known client without consent or a phone is told what to do in the chat", async () => {
  const unregistered = await post(appFor(null), { channel: "telegram", initData: buildInitData(7, TOKEN) });
  expect(((await unregistered.json()) as { message: string }).message).toBe(miniAppGateMessage("unregistered", "telegram"));

  const consent = await post(appFor({ id: "user-1", firstName: "Иван", phone: "+79990000000" }, false), {
    channel: "telegram",
    initData: buildInitData(7, TOKEN),
  });
  expect(((await consent.json()) as { status: string }).status).toBe("needs_consent");

  const profile = await post(appFor({ id: "user-1", firstName: null, phone: null }), {
    channel: "max",
    initData: buildInitData(7, "max-token"),
  });
  const profileBody = (await profile.json()) as { status: string; message: string };
  expect(profileBody.status).toBe("needs_profile");
  expect(profileBody.message).toContain("MAX");
});
