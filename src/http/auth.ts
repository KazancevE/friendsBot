import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "../domain/errors.ts";
import type { UserRecord } from "../domain/types.ts";
import type { Store } from "../store/types.ts";

const WEB_APP_DATA_KEY = "WebAppData";

export type TelegramWebAppUser = {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly username?: string;
};

export type ResolvedActor = {
  readonly telegramId: bigint;
  readonly user: UserRecord | undefined;
};

const isTelegramWebAppUser = (value: unknown): value is TelegramWebAppUser => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("id" in value)) {
    return false;
  }
  return typeof value.id === "number";
};

const safeEqualHex = (left: string, right: string) => {
  const leftBuf = Buffer.from(left, "hex");
  const rightBuf = Buffer.from(right, "hex");
  if (leftBuf.length === 0 || leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
};

export const verifyInitData = (raw: string, botToken: string) => {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (hash === null) {
    throw new DomainError("bad_init_data", "Нет подписи");
  }
  params.delete("hash");
  const dataCheckString = [...params.keys()]
    .sort()
    .map((key) => `${key}=${params.get(key) ?? ""}`)
    .join("\n");
  const secret = createHmac("sha256", WEB_APP_DATA_KEY).update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(hash, expected)) {
    throw new DomainError("bad_init_data", "Неверная подпись");
  }
  const userRaw = params.get("user");
  if (userRaw === null) {
    throw new DomainError("bad_init_data", "Нет пользователя");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    throw new DomainError("bad_init_data", "Некорректный пользователь");
  }
  if (!isTelegramWebAppUser(parsed)) {
    throw new DomainError("bad_init_data", "Некорректный пользователь");
  }
  return parsed;
};

export const resolveActor = async (store: Store, initData: string, botToken: string) => {
  const telegramUser = verifyInitData(initData, botToken);
  const telegramId = BigInt(telegramUser.id);
  const user = (await store.findUserByTelegramId(telegramId)) ?? undefined;
  return { telegramId, user } satisfies ResolvedActor;
};
