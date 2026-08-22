import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createBot } from "./bot/create-bot.ts";
import { loadConfig } from "./config.ts";
import { prisma } from "./db.ts";
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

await bot.start();
