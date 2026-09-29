import { expect, test } from "vitest";
import {
  DEFAULT_TELEGRAM_ADMIN_ID,
  adminCommandReply,
  devAlertChatId,
  isTelegramAdmin,
  parseTelegramAdminIds,
  telegramAdminIdsFromEnv,
} from "../../src/prod/telegram-admins.ts";

test("the default owner is recognized, and another env list replaces him", () => {
  expect(DEFAULT_TELEGRAM_ADMIN_ID).toBe("500459806");
  expect(telegramAdminIdsFromEnv(undefined)).toEqual([500459806n]);
  expect(telegramAdminIdsFromEnv("")).toEqual([500459806n]);
  expect(isTelegramAdmin(500459806n, telegramAdminIdsFromEnv(undefined))).toBe(true);

  const custom = telegramAdminIdsFromEnv("42, 500459806, no, 42");
  expect(custom).toEqual([42n, 500459806n]);
  expect(isTelegramAdmin(42n, custom)).toBe(true);
  expect(isTelegramAdmin(7n, custom)).toBe(false);

  const replaced = parseTelegramAdminIds("7");
  expect(isTelegramAdmin(500459806n, replaced)).toBe(false);
  expect(isTelegramAdmin(7n, telegramAdminIdsFromEnv("7"))).toBe(true);
});

test("admin command and alert chat follow the env id", () => {
  expect(adminCommandReply(true, "https://daddy.example/")).toContain("https://daddy.example/admin/");
  expect(adminCommandReply(false, "https://daddy.example")).toContain("TELEGRAM_ADMIN_ID");
  expect(devAlertChatId(undefined)).toBe("500459806");
  expect(devAlertChatId("  ")).toBe("500459806");
  expect(devAlertChatId("12345")).toBe("12345");
});
