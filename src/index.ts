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
import { createAdminDirectory, ensureOwnerAccount } from "./prod/admin-directory.ts";
import { assertProductionConfig } from "./prod/config.ts";
import { log } from "./prod/log.ts";
import { hashPassword } from "./prod/passwords.ts";
import { telegramAdminIdsFromEnv } from "./prod/telegram-admins.ts";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

try {
  assertProductionConfig();
} catch (error) {
  log("error", error instanceof Error ? error.message : "Продакшен не запущен");
  process.exit(1);
}

const publicUrl = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 3000);
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
const maxToken = process.env.MAX_BOT_TOKEN || "";
const adminTelegramIds = telegramAdminIdsFromEnv(process.env.TELEGRAM_ADMIN_ID);
const sessionSecret =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "bro-demo-session";
const webhookSecret =
  process.env.WEBHOOK_SECRET && process.env.WEBHOOK_SECRET.length > 0
    ? process.env.WEBHOOK_SECRET
    : deriveWebhookSecret(telegramToken || sessionSecret);
const telegramPolling = process.env.TELEGRAM_TRANSPORT === "polling";

const store = new PrismaStore(prisma);
const salon = new SalonService(prisma, store, {
  publicUrl,
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || null,
  maxBotUrl: process.env.MAX_BOT_URL || null,
});
const flow = new SalonFlow(salon);
const notifier = createNotifier();

const notifyAdmins = async (text: string) => {
  if (telegramToken) {
    for (const adminTelegramId of adminTelegramIds) {
      await notifier.send("telegram", adminTelegramId.toString(), { text });
    }
  }
  const maxAdmin = process.env.MAX_ADMIN_USER_ID;
  if (maxAdmin && maxToken) {
    await notifier.send("max", maxAdmin, { text });
  }
};

const telegramBot = telegramToken
  ? createSalonTelegramBot(telegramToken, flow, notifier, {
      onNotice: notifyAdmins,
      adminIds: adminTelegramIds,
      publicUrl,
    })
  : undefined;
const maxBot = maxToken ? createSalonMaxBot(maxToken, flow, notifier, { onNotice: notifyAdmins }) : undefined;

const salonHttp = createSalonRoutes({
  salon,
  store,
  notifier,
  adminLogin: process.env.ADMIN_LOGIN || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "bro-demo",
  sessionSecret,
  allowDemoGuest: process.env.ALLOW_DEMO_GUEST !== "false",
  flow,
  telegramBotToken: telegramToken,
  maxBotToken: maxToken,
  admins: createAdminDirectory(prisma),
  links: {
    telegram: process.env.TELEGRAM_BOT_USERNAME ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}` : null,
    max: process.env.MAX_BOT_URL || null,
    app: "/app/?demo=1",
  },
  onNotice: notifyAdmins,
});

const app = createHttpApp({
  bot: telegramPolling ? undefined : telegramBot,
  store,
  botToken: telegramToken || "demo",
  webhookSecret,
  salon: salonHttp,
  checkReady: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

const boot = async () => {
  if (process.env.APP_ENV === "production") {
    const created = await ensureOwnerAccount(prisma, process.env.ADMIN_LOGIN ?? "admin", hashPassword(process.env.ADMIN_PASSWORD ?? ""));
    log("info", created ? "создана учётка владельца" : "учётка владельца уже есть");
  }
  const settings = await store.getSettings();
  setAppTimezone(process.env.VENUE_TIMEZONE?.trim() || settings.venueTimezone);
  startSalonJobs(salon, notifier);
  if (telegramBot && adminTelegramIds.length > 0) {
    startScheduler(store, telegramBot.api, {
      adminTelegramId: adminTelegramIds[0]!,
      adminTelegramIds,
    });
  }
  serve({ fetch: app.fetch, port }, async () => {
    const https = publicUrl.startsWith("https://");
    const poll = telegramPolling;
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
      log("info", poll ? "telegram polling" : "telegram polling, PUBLIC_URL не https");
      void telegramBot.start();
    } else {
      log("info", "TELEGRAM_BOT_TOKEN пуст, бот не запущен");
    }
    if (maxBot) {
      log("info", "MAX long polling");
      void maxBot.start();
    } else {
      log("info", "MAX_BOT_TOKEN пуст, бот MAX не запущен");
    }
    log("info", "listening", { port });
  });
};

boot().catch((error: unknown) => {
  log("error", error instanceof Error ? error.message : "boot failed");
  process.exit(1);
});
