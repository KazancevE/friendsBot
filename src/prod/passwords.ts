import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
};

export const verifyPassword = (password: string, stored: string) => {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "base64url");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
};

export const passwordAccepted = (password: string) => password.trim().length >= 10;
