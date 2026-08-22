import { expect, test } from "vitest";
import { qrPngBuffer } from "../../src/bot/qr.ts";

test("renders png buffer", async () => {
  const buf = await qrPngBuffer("abc12345");
  expect(buf[0]).toBe(0x89);
  expect(buf[1]).toBe(0x50);
});
