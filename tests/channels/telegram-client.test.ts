import { expect, test } from "vitest";
import { telegramClientOptions, telegramProxyAgent } from "../../src/channels/telegram-client.ts";

test("blank proxy leaves Telegram on a direct connection", () => {
  expect(telegramProxyAgent("")).toBeUndefined();
  expect(telegramProxyAgent("   ")).toBeUndefined();
  expect(telegramClientOptions("")).toBeUndefined();
});

test("socks and http proxy urls select the matching agent", () => {
  const socks = telegramProxyAgent("socks5h://user:secret@proxy.example:1080");
  const http = telegramProxyAgent("http://proxy.example:8080");
  expect(socks?.constructor.name).toBe("SocksProxyAgent");
  expect(http?.constructor.name).toBe("HttpsProxyAgent");
  expect(telegramClientOptions("socks5://user:secret@proxy.example:1080")?.baseFetchConfig).toMatchObject({
    agent: expect.anything(),
  });
});
