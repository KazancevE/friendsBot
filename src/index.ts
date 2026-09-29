import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createSalonMaxBot } from "./channels/max-salon.ts";
import { createSalonTelegramBot } from "./channels/telegram-salon.ts";
import { prisma } from "./db.ts";
import { setAppTimezone } from "./domain/week.ts";
import { createHttpApp } from "./http/app.ts";
import { createSalonRoutes } from "./http/salon.ts";
import { deriveWebhookSecret } from "./http/webhook-secret.ts";
import { startScheduler } from "./jobs/scheduler.ts";
import { SalonFlow } from "./salon/flow.ts";
import { startSalonJobs } from "./salon/jobs.ts";
import { createNotifier } from "./salon/outbound.ts";
import { SalonService } from "./salon/service.ts";
import { PrismaStore } from "./store/prisma-store.ts";
import { miniAppUrl } from "./web-app-url.ts";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

const publicUrl = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 3000);
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
const maxToken = process.env.MAX_BOT_TOKEN || "";
const adminTelegramId = process.env.TELEGRAM_ADMIN_ID || "";
const sessionSecret =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "daddyson-demo-session";
const webhookSecret =
  process.env.WEBHOOK_SECRET && process.env.WEBHOOK_SECRET.length > 0
    ? process.env.WEBHOOK_SECRET
    : deriveWebhookSecret(telegramToken || sessionSecret);

const store = new PrismaStore(prisma);
const salon = new SalonService(prisma, store, {
  publicUrl,
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || null,
  maxBotUrl: process.env.MAX_BOT_URL || null,
});
const flow = new SalonFlow(salon);
const notifier = createNotifier();

const notifyAdmins = async (text: string) => {
  if (adminTelegramId && telegramToken) {
    await notifier.send("telegram", adminTelegramId, { text });
  }
  const maxAdmin = process.env.MAX_ADMIN_USER_ID;
  if (maxAdmin && maxToken) {
    await notifier.send("max", maxAdmin, { text });
  }
};

const telegramBot = telegramToken
  ? createSalonTelegramBot(telegramToken, flow, notifier, { onNotice: notifyAdmins })
  : undefined;
const maxBot = maxToken ? createSalonMaxBot(maxToken, flow, notifier, { onNotice: notifyAdmins }) : undefined;

const salonHttp = createSalonRoutes({
  salon,
  store,
  notifier,
  adminLogin: process.env.ADMIN_LOGIN || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "daddyson-demo",
  sessionSecret,
  allowDemoGuest: process.env.ALLOW_DEMO_GUEST !== "false",
  links: {
    telegram: process.env.TELEGRAM_BOT_USERNAME ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}` : null,
    max: process.env.MAX_BOT_URL || null,
    app: "/app/?demo=1",
  },
  onNotice: notifyAdmins,
});

const app = createHttpApp({
  bot: telegramBot,
  store,
  botToken: telegramToken || "demo",
  webhookSecret,
  salon: salonHttp,
  checkReady: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

const boot = async () => {
  const settings = await store.getSettings();
  setAppTimezone(process.env.VENUE_TIMEZONE?.trim() || settings.venueTimezone);
  startSalonJobs(salon, notifier);
  if (telegramBot && adminTelegramId) {
    startScheduler(store, telegramBot.api, { adminTelegramId: BigInt(adminTelegramId) });
  }
  serve({ fetch: app.fetch, port }, async () => {
    const https = publicUrl.startsWith("https://");
    const poll = process.env.TELEGRAM_TRANSPORT === "polling";
    if (telegramBot && https) {
      void telegramBot.api
        .setChatMenuButton({
          menu_button: {
            type: "web_app",
            text: "Карта",
            web_app: { url: miniAppUrl(publicUrl) },
          },
        })
        .catch((error: unknown) => {
          console.error("telegram menu button", error);
        });
    }
    if (telegramBot && https && !poll) {
      await telegramBot.api.setWebhook(`${publicUrl}/tg/webhook`, { secret_token: webhookSecret });
    } else if (telegramBot) {
      console.log(poll ? "telegram polling: TELEGRAM_TRANSPORT=polling" : "telegram polling: PUBLIC_URL не https, webhook не ставится");
      void telegramBot.start();
    } else {
      console.log("TELEGRAM_BOT_TOKEN пуст — бот Telegram не запущен, сайт работает");
    }
    if (maxBot) {
      console.log("MAX: long polling через @maxhub/max-bot-api, host platform-api2.max.ru");
      void maxBot.start();
    } else {
      console.log("MAX_BOT_TOKEN пуст — бот MAX не запущен");
    }
    console.log("listening", port);
  });
};

boot().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
