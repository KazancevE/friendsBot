import { expect, test } from "vitest";
import { assertWebhookSecret, deriveWebhookSecret } from "../../src/http/webhook-secret.ts";

test("deriveWebhookSecret is stable and telegram-safe", () => {
  const secret = deriveWebhookSecret("bot-token");
  expect(secret).toBe(deriveWebhookSecret("bot-token"));
  expect(secret).not.toBe(deriveWebhookSecret("other"));
  expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(secret.length).toBeGreaterThan(0);
  expect(secret.length).toBeLessThanOrEqual(256);
});

test("assertWebhookSecret rejects missing or wrong header", () => {
  const secret = deriveWebhookSecret("bot-token");
  expect(() => assertWebhookSecret(undefined, secret)).toThrow();
  expect(() => assertWebhookSecret("nope", secret)).toThrow();
  expect(() => assertWebhookSecret(secret, secret)).not.toThrow();
});
