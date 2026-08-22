import { expect, test } from "vitest";
import { normalizePhone } from "../../src/domain/phone.ts";

test("normalizes RU 8 and plus-7 to 11 digits", () => {
  expect(normalizePhone("8 (999) 123-45-67")).toBe("79991234567");
  expect(normalizePhone("+7 999 123 45 67")).toBe("79991234567");
});

test("rejects short numbers", () => {
  expect(() => normalizePhone("123")).toThrow();
});
