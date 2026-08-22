import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createBot } from "./bot/create-bot.ts";
import { loadConfig } from "./config.ts";
import { prisma } from "./db.ts";
import { createHttpApp } from "./http/app.ts";
import { startScheduler } from "./jobs/scheduler.ts";
import { PrismaStore } from "./store/prisma-store.ts";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

const config = loadConfig();
const store = new PrismaStore(prisma);
const bot = createBot(config.botToken, store, {
  adminTelegramId: config.adminTelegramId,
  publicUrl: config.publicUrl,
});
const app = createHttpApp({
  bot,
  store,
  botToken: config.botToken,
});
startScheduler(store);

const publicUrl = config.publicUrl.replace(/\/$/, "");

serve({ fetch: app.fetch, port: config.port }, async () => {
  await bot.api.setWebhook(`${publicUrl}/tg/${config.botToken}`);
  console.log("listening", config.port);
});
