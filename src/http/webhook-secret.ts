import { createHash, timingSafeEqual } from "node:crypto";
import { DomainError } from "../domain/errors.ts";

export const WEBHOOK_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

export const deriveWebhookSecret = (botToken: string) => {
  return createHash("sha256").update(`webhook:${botToken}`).digest("hex");
};

const secretsEqual = (left: string, right: string) => {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length === 0 || leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
};

export const assertWebhookSecret = (headerValue: string | undefined, secret: string) => {
  if (headerValue === undefined || !secretsEqual(headerValue, secret)) {
    throw new DomainError("forbidden", "Неверный секрет webhook");
  }
};
