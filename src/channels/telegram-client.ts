import { HttpsProxyAgent } from "https-proxy-agent";
import type { BotConfig, Context } from "grammy";
import { SocksProxyAgent } from "socks-proxy-agent";

type FetchConfig = NonNullable<BotConfig<Context>["client"]>["baseFetchConfig"];

export const telegramProxyAgent = (proxy = process.env.TELEGRAM_PROXY ?? "") => {
  const value = proxy.trim();
  if (!value) {
    return undefined;
  }
  if (value.startsWith("socks")) {
    return new SocksProxyAgent(value);
  }
  return new HttpsProxyAgent(value);
};

export const telegramClientOptions = (proxy = process.env.TELEGRAM_PROXY ?? ""): BotConfig<Context>["client"] => {
  const agent = telegramProxyAgent(proxy);
  if (!agent) {
    return undefined;
  }
  return {
    baseFetchConfig: { agent } as FetchConfig,
  };
};
