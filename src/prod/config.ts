export type ProductionEnv = Record<string, string | undefined>;

const DEMO_PASSWORDS = new Set(["daddyson-demo", "admin", "password", "changeme"]);
const DEMO_SECRETS = new Set(["daddyson-demo-session", "change-me-please", "secret"]);

export const productionProblems = (env: ProductionEnv): string[] => {
  if (env.APP_ENV !== "production") {
    return [];
  }
  const problems: string[] = [];
  const password = env.ADMIN_PASSWORD ?? "";
  const session = env.ADMIN_SESSION_SECRET ?? "";
  const database = env.DATABASE_URL ?? "";
  const postgresPassword = env.POSTGRES_PASSWORD ?? "";
  const publicUrl = env.PUBLIC_URL ?? "";
  const domain = env.CADDY_DOMAIN ?? "";
  const inn = env.OPERATOR_INN ?? "";

  if (!env.ADMIN_LOGIN?.trim()) {
    problems.push("ADMIN_LOGIN пуст");
  }
  if (password.length < 12 || DEMO_PASSWORDS.has(password)) {
    problems.push("ADMIN_PASSWORD слишком простой или совпадает с демо");
  }
  if (session.length < 24 || DEMO_SECRETS.has(session)) {
    problems.push("ADMIN_SESSION_SECRET слишком короткий или совпадает с демо");
  }
  if (!database.startsWith("postgresql://") && !database.startsWith("postgres://")) {
    problems.push("DATABASE_URL не задан");
  } else if (database.includes("://daddyson:daddyson@")) {
    problems.push("DATABASE_URL использует пароль демо");
  }
  if (!postgresPassword || postgresPassword === "daddyson") {
    problems.push("POSTGRES_PASSWORD пуст или совпадает с демо");
  }
  if (!publicUrl.startsWith("https://")) {
    problems.push("PUBLIC_URL должен начинаться с https://");
  }
  if (!domain || domain === "localhost") {
    problems.push("CADDY_DOMAIN не задан");
  }
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) {
    problems.push("TELEGRAM_BOT_TOKEN пуст: без него нет ни бота, ни тревог");
  }
  if (!env.DEV_ALERT_CHAT_ID?.trim()) {
    problems.push("DEV_ALERT_CHAT_ID пуст");
  }
  if (!env.OPERATOR_LEGAL_NAME?.trim()) {
    problems.push("OPERATOR_LEGAL_NAME пуст");
  }
  if (!/^\d{10}(\d{2})?$/.test(inn)) {
    problems.push("OPERATOR_INN должен содержать 10 или 12 цифр");
  }
  if (env.ALLOW_DEMO_GUEST === "true" || env.ALLOW_DEMO_GUEST === "1") {
    problems.push("ALLOW_DEMO_GUEST в продакшене должен быть false");
  }
  return problems;
};

export const assertProductionConfig = (env: ProductionEnv = process.env) => {
  const problems = productionProblems(env);
  if (problems.length > 0) {
    throw new Error(`Продакшен не запущен:\n- ${problems.join("\n- ")}`);
  }
};
