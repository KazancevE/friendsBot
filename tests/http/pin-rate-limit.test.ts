import { expect, test } from "vitest";
import { checkPinRateLimit, resetPinRateLimit } from "../../src/http/pin-rate-limit.ts";

test("allows five attempts then rate limits", () => {
  const key = "pin-test-1";
  resetPinRateLimit(key);
  const now = 1_000_000;
  for (let index = 0; index < 5; index += 1) {
    checkPinRateLimit(key, now);
  }
  expect(() => checkPinRateLimit(key, now)).toThrow("rate_limited");
});

test("resets after the window", () => {
  const key = "pin-test-2";
  resetPinRateLimit(key);
  const now = 2_000_000;
  for (let index = 0; index < 5; index += 1) {
    checkPinRateLimit(key, now);
  }
  expect(() => checkPinRateLimit(key, now)).toThrow("rate_limited");
  checkPinRateLimit(key, now + 60_000);
});
