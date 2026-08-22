export type AppConfig = {
  botToken: string;
  adminTelegramId: bigint;
  databaseUrl: string;
  publicUrl: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const botToken = env.BOT_TOKEN;
  const admin = env.TELEGRAM_ADMIN_ID;
  const databaseUrl = env.DATABASE_URL;
  const publicUrl = env.PUBLIC_URL;
  if (!botToken || !admin || !databaseUrl || !publicUrl) {
    throw new Error("Missing BOT_TOKEN, TELEGRAM_ADMIN_ID, DATABASE_URL, or PUBLIC_URL");
  }
  return {
    botToken,
    adminTelegramId: BigInt(admin),
    databaseUrl,
    publicUrl,
    port: Number(env.PORT ?? 3000),
  };
}
