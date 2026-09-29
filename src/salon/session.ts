import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (secret: string, payload: string) => {
  return createHmac("sha256", secret).update(payload).digest("base64url");
};

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
};

export const issueGuestToken = (secret: string, userId: string, ttlSeconds: number, now = Date.now()) => {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: now + ttlSeconds * 1000 })).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
};

export const readGuestToken = (secret: string, token: string, now = Date.now()): string | null => {
  const [payload, mac] = token.split(".");
  if (!payload || !mac || !safeEqual(sign(secret, payload), mac)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; exp?: number };
    if (!parsed.uid || typeof parsed.exp !== "number" || parsed.exp < now) {
      return null;
    }
    return parsed.uid;
  } catch {
    return null;
  }
};

export type AdminCookie = {
  login: string;
  role: "owner" | "branch_admin" | "master";
  branchId: string | null;
};

export const issueAdminCookie = (secret: string, admin: AdminCookie, ttlSeconds: number, now = Date.now()) => {
  const payload = Buffer.from(JSON.stringify({ ...admin, exp: now + ttlSeconds * 1000 })).toString("base64url");
  return `${payload}.${sign(secret, `admin:${payload}`)}`;
};

export const readAdminCookie = (secret: string, cookie: string | undefined, now = Date.now()): AdminCookie | null => {
  if (!cookie) {
    return null;
  }
  const [payload, mac] = cookie.split(".");
  if (!payload || !mac || !safeEqual(sign(secret, `admin:${payload}`), mac)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      login?: string;
      role?: AdminCookie["role"];
      branchId?: string | null;
      exp?: number;
    };
    if (!parsed.login || typeof parsed.exp !== "number" || parsed.exp < now) {
      return null;
    }
    const role = parsed.role === "branch_admin" || parsed.role === "master" || parsed.role === "owner" ? parsed.role : "owner";
    return { login: parsed.login, role, branchId: parsed.branchId ?? null };
  } catch {
    return null;
  }
};
