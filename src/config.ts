import { deriveWebhookSecret } from "./http/webhook-secret.ts";
import { parseTelegramAdminIds } from "./prod/telegram-admins.ts";

export type AppConfig = {
  botToken: string;
  adminTelegramId: bigint;
  adminTelegramIds: bigint[];
  databaseUrl: string;
  publicUrl: string;
  port: number;
  webhookSecret: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const botToken = env.BOT_TOKEN;
  const adminTelegramIds = parseTelegramAdminIds(env.TELEGRAM_ADMIN_ID);
  const databaseUrl = env.DATABASE_URL;
  const publicUrl = env.PUBLIC_URL;
  if (!botToken || adminTelegramIds.length === 0 || !databaseUrl || !publicUrl) {
    throw new Error("Missing BOT_TOKEN, TELEGRAM_ADMIN_ID, DATABASE_URL, or PUBLIC_URL");
  }
  const webhookSecret =
    env.WEBHOOK_SECRET !== undefined && env.WEBHOOK_SECRET.length > 0
      ? env.WEBHOOK_SECRET
      : deriveWebhookSecret(botToken);
  return {
    botToken,
    adminTelegramId: adminTelegramIds[0]!,
    adminTelegramIds,
    databaseUrl,
    publicUrl,
    port: Number(env.PORT ?? 3000),
    webhookSecret,
  };
}
