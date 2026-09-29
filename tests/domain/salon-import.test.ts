import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import * as XLSX from "xlsx";
import { isBirthdayToday } from "../../src/domain/birthday.ts";
import { channelIdsToMove } from "../../src/salon/identity.ts";
import {
  birthdayUtcDate,
  buildImportPlan,
  guessMapping,
  importTelegramId,
  importedVisitFeedsNudge,
  isFirstMessengerLink,
  parseSpreadsheet,
  shouldGrantImportWelcome,
} from "../../src/salon/import.ts";

const sample = () => parseSpreadsheet({ filename: "dikidi.csv", bytes: readFileSync("fixtures/dikidi-clients-sample.csv") });

test("DIKIDI-like headers map without a fixed template", () => {
  const table = sample();
  const mapping = guessMapping(table[0] ?? []);
  expect(table[0]?.[mapping.phone!]).toMatch(/Телефон/);
  expect(table[0]?.[mapping.name!]).toBe("Имя");
  expect(table[0]?.[mapping.lastName!]).toBe("Фамилия");
  expect(table[0]?.[mapping.birthday!]).toMatch(/рождения/);
  expect(table[0]?.[mapping.lastVisit!]).toMatch(/Последний/);
  expect(table[0]?.[mapping.visitsCount!]).toMatch(/визит/i);
  expect(table[0]?.[mapping.totalSpent!]).toBe("Оплачено");
  expect(table[0]?.[mapping.preferredMaster!]).toMatch(/Любимый/);
  expect(table[0]?.[mapping.branch!]).toBe("Филиал");
  expect(table[0]?.[mapping.notes!]).toBe("Комментарий");
  expect(table[0]?.[mapping.bookingAt!]).toMatch(/Ближайшая/);
  expect(table[0]?.[mapping.bookingMaster!]).toBe("Мастер записи");
  expect(mapping.bookingMaster).not.toBe(mapping.preferredMaster);
});

test("preview normalizes phones, merges duplicates and flags bad rows", () => {
  const plan = buildImportPlan({
    table: sample(),
    now: new Date("2026-09-28T10:00:00+07:00"),
    zone: "Asia/Barnaul",
  });
  const ivan = plan.rows.find((row) => row.line === 2);
  const duplicate = plan.rows.find((row) => row.line === 4);
  const noPhone = plan.rows.find((row) => row.line === 5);
  const badPhone = plan.rows.find((row) => row.line === 6);
  const past = plan.rows.find((row) => row.line === 7);
  expect(ivan?.phone).toBe("79000000001");
  expect(ivan?.action).toBe("create");
  expect(ivan?.mergedFrom).toEqual([4]);
  expect(ivan?.booking?.service).toBe("Стрижка");
  expect(duplicate?.action).toBe("error");
  expect(duplicate?.errors[0]).toMatch(/Дубль/);
  expect(noPhone?.errors).toContain("Нет телефона");
  expect(badPhone?.errors[0]).toMatch(/не похож/);
  expect(past?.warnings.some((warning) => warning.includes("прошлом"))).toBe(true);
  expect(past?.booking).toBeNull();
  const again = buildImportPlan({
    table: sample(),
    now: new Date("2026-09-28T10:00:00+07:00"),
    existing: [{ phone: "79000000001", birthday: ivan!.birthday }],
  });
  expect(again.rows.find((row) => row.line === 2)?.action).toBe("update");
});

test("manual mapping overrides a guessed column", () => {
  const table = [
    ["Клиент", "Мобильный", "Заметка"],
    ["Анна Тест", "89000000009", "фиктивно"],
  ];
  const guessed = buildImportPlan({ table });
  expect(guessed.rows[0]?.phone).toBe("79000000009");
  const remapped = buildImportPlan({ table, mapping: { phone: null, notes: 1 } });
  expect(remapped.rows[0]?.action).toBe("error");
  expect(remapped.rows[0]?.notes).toBe("89000000009");
});

test("xlsx round-trip uses the same mapper", () => {
  const table = sample();
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(table), "Клиенты");
  const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const parsed = parseSpreadsheet({ filename: "clients.xlsx", bytes });
  expect(parsed[1]?.[1]).toBe("Иван");
  const plan = buildImportPlan({ table: parsed, now: new Date("2026-09-28T10:00:00+07:00") });
  expect(plan.rows.find((row) => row.name === "Иван")?.phone).toBe("79000000001");
});

test("imported last visit feeds the haircut nudge and birthday stays a calendar date", () => {
  const plan = buildImportPlan({
    table: sample(),
    now: new Date("2026-09-28T10:00:00+07:00"),
    zone: "Asia/Barnaul",
  });
  const ivan = plan.rows.find((row) => row.phone === "79000000001")!;
  const recent = plan.rows.find((row) => row.phone === "79000000002")!;
  expect(importedVisitFeedsNudge(ivan.lastVisit!, new Date("2026-09-28T10:00:00+07:00"), 4)).toBe(true);
  expect(importedVisitFeedsNudge(recent.lastVisit!, new Date("2026-09-28T10:00:00+07:00"), 4)).toBe(false);
  const birthday = birthdayUtcDate("15.04.1990")!;
  expect(isBirthdayToday(birthday, new Date("2026-04-15T08:00:00Z"))).toBe(true);
  expect(ivan.birthday?.toISOString().slice(0, 10)).toBe("1990-04-15");
});

test("sharing a phone links the messenger onto the imported card", () => {
  const importedId = importTelegramId("79000000001");
  expect(importedId < 0n).toBe(true);
  const move = channelIdsToMove({
    channel: "telegram",
    currentTelegramId: 4242n,
    currentMaxUserId: null,
    canonicalMaxUserId: null,
    canonicalTelegramId: importedId,
  });
  expect(move.telegramId).toBe(4242n);
  const unlinked = {
    importedAt: new Date(),
    welcomeGrantedAt: null,
    telegramId: importedId,
    maxUserId: null,
  };
  expect(isFirstMessengerLink(unlinked)).toBe(true);
  expect(shouldGrantImportWelcome({ ...unlinked, welcomeBonus: 0 })).toBe(false);
  expect(shouldGrantImportWelcome({ ...unlinked, welcomeBonus: 300 })).toBe(true);
  expect(shouldGrantImportWelcome({ ...unlinked, welcomeBonus: 300, welcomeGrantedAt: new Date() })).toBe(false);
});
