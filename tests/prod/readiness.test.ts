import { expect, test } from "vitest";
import { canDeleteAccount, canDo, scopedBranch } from "../../src/prod/access.ts";
import { authenticateAdmin } from "../../src/prod/admin-auth.ts";
import { collectProblems, shouldSendAlert } from "../../src/prod/alerts.ts";
import { productionProblems } from "../../src/prod/config.ts";
import { hashPassword, passwordAccepted, verifyPassword } from "../../src/prod/passwords.ts";
import { consentPageHtml, privacyPolicyHtml } from "../../src/prod/policy-page.ts";
import { anonymizedProfile, consentDecision } from "../../src/prod/privacy.ts";
import { clientIp, loginAttempt, resetLoginAttempts } from "../../src/prod/rate-limit.ts";
import { backupStamp, isWeeklySlot, pruneBackups } from "../../src/prod/retention.ts";
import { createSalonRoutes } from "../../src/http/salon.ts";
import type { SalonService } from "../../src/salon/service.ts";
import type { Store } from "../../src/store/types.ts";
import { issueAdminCookie } from "../../src/salon/session.ts";

const productionEnv = () => ({
  APP_ENV: "production",
  ADMIN_LOGIN: "egor",
  ADMIN_PASSWORD: "correct-horse-battery",
  ADMIN_SESSION_SECRET: "a-long-session-secret-value",
  DATABASE_URL: "postgresql://salon:real-secret@postgres:5432/daddyson",
  POSTGRES_PASSWORD: "real-secret",
  PUBLIC_URL: "https://daddy.example",
  CADDY_DOMAIN: "daddy.example",
  TELEGRAM_BOT_TOKEN: "token",
  DEV_ALERT_CHAT_ID: "1",
  OPERATOR_LEGAL_NAME: "ИП Тест",
  OPERATOR_INN: "123456789012",
  ALLOW_DEMO_GUEST: "false",
});

test("production mode rejects demo secrets and ignores other environments", () => {
  expect(productionProblems({ APP_ENV: "development", ADMIN_PASSWORD: "daddyson-demo" })).toEqual([]);
  expect(productionProblems(productionEnv())).toEqual([]);
  const problems = productionProblems({
    ...productionEnv(),
    ADMIN_PASSWORD: "daddyson-demo",
    ADMIN_SESSION_SECRET: "change-me-please",
    DATABASE_URL: "postgresql://daddyson:daddyson@postgres:5432/daddyson",
    POSTGRES_PASSWORD: "daddyson",
    OPERATOR_INN: "123",
    ALLOW_DEMO_GUEST: "true",
  });
  expect(problems.join(" ")).toContain("ADMIN_PASSWORD");
  expect(problems.join(" ")).toContain("ADMIN_SESSION_SECRET");
  expect(problems.join(" ")).toContain("DATABASE_URL");
  expect(problems.join(" ")).toContain("POSTGRES_PASSWORD");
  expect(problems.join(" ")).toContain("OPERATOR_INN");
  expect(problems.join(" ")).toContain("ALLOW_DEMO_GUEST");
});

test("passwords are scrypt hashes and new ones need 10 characters", () => {
  const stored = hashPassword("long-enough");
  expect(stored.startsWith("scrypt$")).toBe(true);
  expect(verifyPassword("long-enough", stored)).toBe(true);
  expect(verifyPassword("other-value", stored)).toBe(false);
  expect(verifyPassword("long-enough", "plain")).toBe(false);
  expect(passwordAccepted("123456789")).toBe(false);
  expect(passwordAccepted("1234567890")).toBe(true);
});

test("login attempts lock one address after eight failures", () => {
  resetLoginAttempts();
  const now = 1_700_000_000_000;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    expect(loginAttempt("203.0.113.5", false, now).allowed).toBe(true);
  }
  expect(loginAttempt("203.0.113.5", false, now).allowed).toBe(false);
  expect(loginAttempt("203.0.113.6", false, now).allowed).toBe(true);
  expect(loginAttempt("203.0.113.5", true, now).allowed).toBe(true);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    expect(loginAttempt("203.0.113.5", false, now).allowed).toBe(true);
  }
  expect(loginAttempt("203.0.113.5", false, now + 15 * 60 * 1000).allowed).toBe(true);
  expect(clientIp("203.0.113.9, 10.0.0.1", "10.0.0.2")).toBe("203.0.113.9");
});

test("roles limit a branch admin and a read-only master", () => {
  const owner = { login: "egor", role: "owner" as const, branchId: null };
  const branch = { login: "vasil", role: "branch_admin" as const, branchId: "b1" };
  const master = { login: "ivan", role: "master" as const, branchId: "b1" };
  expect(canDo(owner, "network")).toBe(true);
  expect(canDo(branch, "privacy")).toBe(true);
  expect(canDo(branch, "accounts")).toBe(false);
  expect(canDo(master, "read")).toBe(true);
  expect(canDo(master, "write")).toBe(false);
  expect(scopedBranch(branch, "b2")).toEqual({ error: "Этот филиал вам не назначен" });
  expect(scopedBranch(branch, undefined)).toEqual({ branchId: "b1" });
  expect(scopedBranch(owner, "b2")).toEqual({ branchId: "b2" });
  expect(canDeleteAccount(owner, owner, 1)).toBe("Нельзя удалить единственного владельца");
  expect(canDeleteAccount(branch, master, 2)).toBe("Управлять учётками может только владелец");
  expect(canDeleteAccount(owner, master, 1)).toBeNull();
});

test("env password works only until the first stored account", () => {
  expect(authenticateAdmin([], "admin", "secret-value", "admin", "secret-value")?.role).toBe("owner");
  const stored = hashPassword("branch-secret");
  expect(
    authenticateAdmin(
      [{ login: "vasil", passwordHash: stored, role: "branch_admin", branchId: "b1" }],
      "admin",
      "secret-value",
      "admin",
      "secret-value",
    ),
  ).toBeNull();
  expect(
    authenticateAdmin(
      [{ login: "vasil", passwordHash: stored, role: "branch_admin", branchId: "b1" }],
      "admin",
      "secret-value",
      "vasil",
      "branch-secret",
    )?.branchId,
  ).toBe("b1");
});

test("backup rotation keeps seven daily and four weekly files", () => {
  const files = Array.from({ length: 9 }, (_, index) => ({
    name: `daily-${index}`,
    kind: "daily" as const,
    at: `2026-09-${String(index + 1).padStart(2, "0")}`,
  })).concat(
    Array.from({ length: 5 }, (_, index) => ({
      name: `weekly-${index}`,
      kind: "weekly" as const,
      at: `2026-08-${String(index + 1).padStart(2, "0")}`,
    })),
  );
  const plan = pruneBackups(files);
  expect(plan.keep.filter((file) => file.kind === "daily")).toHaveLength(7);
  expect(plan.keep.filter((file) => file.kind === "weekly")).toHaveLength(4);
  expect(plan.drop.map((file) => file.name)).toEqual(["daily-1", "daily-0", "weekly-0"]);
  const sundayMorningBarnaul = new Date("2026-09-26T20:15:00.000Z");
  expect(isWeeklySlot(sundayMorningBarnaul, "Asia/Barnaul")).toBe(true);
  expect(isWeeklySlot(sundayMorningBarnaul, "UTC")).toBe(false);
  expect(backupStamp(sundayMorningBarnaul, "Asia/Barnaul")).toBe("2026-09-27");
});

test("alerts fire on downtime and backup failure, then wait out the cooldown", () => {
  const now = 1_000_000;
  expect(
    collectProblems({ healthOk: false, backup: { ok: true, at: new Date(now).toISOString() }, now, maxBackupAgeMs: 1000, backupGraceMs: 1000, startedAt: now }),
  ).toEqual(["сайт или база не отвечают"]);
  expect(
    collectProblems({ healthOk: true, backup: null, now, maxBackupAgeMs: 1000, backupGraceMs: 5_000, startedAt: now }),
  ).toEqual([]);
  expect(
    collectProblems({ healthOk: true, backup: { ok: false, at: new Date(now).toISOString(), error: "pg_dump 1" }, now, maxBackupAgeMs: 1000, backupGraceMs: 0, startedAt: 0 }).join(" "),
  ).toContain("pg_dump 1");
  const problems = ["резервная копия не удалась"];
  expect(shouldSendAlert({ problems, lastKey: null, lastSentAt: null, now, cooldownMs: 100 })).toBe(true);
  expect(shouldSendAlert({ problems, lastKey: problems.join("|"), lastSentAt: now, now: now + 50, cooldownMs: 100 })).toBe(false);
  expect(shouldSendAlert({ problems, lastKey: problems.join("|"), lastSentAt: now, now: now + 100, cooldownMs: 100 })).toBe(true);
  expect(shouldSendAlert({ problems: [], lastKey: null, lastSentAt: null, now, cooldownMs: 100 })).toBe(false);
});

test("consent is explicit and anonymized profile drops personal fields", () => {
  expect(consentDecision({ hasConsent: true, callback: null })).toBe("pass");
  expect(consentDecision({ hasConsent: false, callback: null })).toBe("ask");
  expect(consentDecision({ hasConsent: false, callback: "pd:yes" })).toBe("accept");
  expect(consentDecision({ hasConsent: false, callback: "pd:no" })).toBe("refuse");
  expect(anonymizedProfile()).toMatchObject({
    firstName: "Удалён",
    phone: null,
    birthday: null,
    personalDataConsentAt: null,
    promoConsentAt: null,
    promoConsentGranted: null,
    broadcastOptOut: true,
  });
});

test("policy pages print the operator and escape markup", () => {
  const operator = { legalName: "ИП <Тест>", inn: "7700000000", address: "Бийск", policyVersion: "2026-09-29" };
  const privacy = privacyPolicyHtml(operator);
  const consent = consentPageHtml(operator);
  expect(privacy).toContain("ИП &lt;Тест&gt;");
  expect(privacy).toContain("7700000000");
  expect(privacy).not.toContain("<Тест>");
  expect(consent).toContain("Согласие на обработку персональных данных");
  expect(consent).toContain("/privacy");
});

test("admin login is rate limited and a master cannot export a client", async () => {
  resetLoginAttempts();
  const app = createSalonRoutes({
    salon: {} as SalonService,
    store: {} as Store,
    notifier: { send: async () => undefined },
    adminLogin: "admin",
    adminPassword: "daddyson-demo",
    admins: {
      list: async () => [],
      create: async () => {
        throw new Error("не создаём");
      },
      setPassword: async () => undefined,
      remove: async () => undefined,
    },
    sessionSecret: "test-secret-test-secret-test",
    allowDemoGuest: false,
    links: { telegram: null, max: null, app: "/app" },
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await app.request("/api/salon/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "198.51.100.8" },
      body: JSON.stringify({ login: "admin", password: "wrong-password" }),
    });
    expect(response.status).toBe(401);
  }
  const locked = await app.request("/api/salon/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "198.51.100.8" },
    body: JSON.stringify({ login: "admin", password: "daddyson-demo" }),
  });
  expect(locked.status).toBe(429);

  const cookie = issueAdminCookie("test-secret-test-secret-test", { login: "ivan", role: "master", branchId: "b1" }, 60);
  const denied = await app.request("/api/salon/admin/clients/user-1/export", { headers: { cookie: `salon_admin=${cookie}` } });
  expect(denied.status).toBe(403);
});
