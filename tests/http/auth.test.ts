import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { verifyInitData } from "../../src/http/auth.ts";

const BOT_TOKEN = "test-bot-token";

type BuildInitDataUser = {
  id: number;
};

export const buildInitData = (user: BuildInitDataUser, botToken: string) => {
  const params: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: user.id }),
  };
  const dataCheckString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...params, hash }).toString();
};

test("verifyInitData accepts a valid signature", () => {
  const raw = buildInitData({ id: 42 }, BOT_TOKEN);
  const user = verifyInitData(raw, BOT_TOKEN);
  expect(user.id).toBe(42);
});

test("verifyInitData rejects a tampered hash", () => {
  const raw = buildInitData({ id: 42 }, BOT_TOKEN);
  const tampered = raw.replace(/hash=[0-9a-f]+/, "hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(() => verifyInitData(tampered, BOT_TOKEN)).toThrow();
});
