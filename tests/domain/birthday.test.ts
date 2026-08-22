import { expect, test } from "vitest";
import { grantDueBirthdays, isBirthdayWeek } from "../../src/domain/birthday.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("12 May is in window 9–15 May", () => {
  expect(isBirthdayWeek(new Date("1990-05-12"), new Date("2026-05-12"))).toBe(true);
  expect(isBirthdayWeek(new Date("1990-05-12"), new Date("2026-05-08"))).toBe(false);
});

test("Feb 29 uses Feb 28 in non-leap year", () => {
  expect(isBirthdayWeek(new Date("2000-02-29"), new Date("2026-02-28"))).toBe(true);
});

test("grants once per year", async () => {
  const store = new MemoryStore();
  const g = await registerGuest(store, {
    telegramId: 15n,
    firstName: "Гость",
    lastName: "Деньрождения",
    birthday: new Date("1990-05-12"),
    phone: "79001500015",
  });
  const n = await grantDueBirthdays(store, new Date("2026-05-12T02:00:00+03:00"));
  expect(n).toBe(1);
  const again = await grantDueBirthdays(store, new Date("2026-05-12T03:00:00+03:00"));
  expect(again).toBe(0);
  expect((await store.findUserById(g.id))!.balance).toBe(1000);
});

test("does not grant twice in the same Moscow calendar year", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 16n,
    firstName: "Гость",
    lastName: "Январь",
    birthday: new Date("1990-01-01"),
    phone: "79001600016",
  });
  const firstAt = new Date("2026-01-01T02:00:00+03:00");
  expect(await grantDueBirthdays(store, firstAt)).toBe(1);
  for (const row of store.ledger) {
    if (row.type === "birthday" && row.userId === guest.id) {
      row.createdAt = firstAt;
    }
  }
  expect(firstAt.getUTCFullYear()).toBe(2025);
  const again = await grantDueBirthdays(store, new Date("2026-01-01T04:00:00+03:00"));
  expect(again).toBe(0);
  expect((await store.findUserById(guest.id))!.balance).toBe(1000);
});
