import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { DomainError } from "../../src/domain/errors.ts";

test("registers guest with 500 bonuses once", async () => {
  const store = new MemoryStore();
  const user = await registerGuest(store, {
    telegramId: 10n,
    firstName: "Анна",
    lastName: "Кирова",
    birthday: new Date("1995-03-01"),
    phone: "+7 999 111-22-33",
  });
  expect(user.balance).toBe(500);
  expect(user.phone).toBe("79991112233");
  expect(user.qrToken.length).toBeGreaterThanOrEqual(8);
  const ledger = await store.listLedger(user.id);
  expect(ledger[0]?.type).toBe("registration");
  expect(ledger[0]?.amount).toBe(500);
});

test("same telegram id is not duplicated", async () => {
  const store = new MemoryStore();
  const input = {
    telegramId: 10n,
    firstName: "Анна",
    lastName: "Кирова",
    birthday: new Date("1995-03-01"),
    phone: "79991112233",
  };
  await registerGuest(store, input);
  await expect(registerGuest(store, input)).rejects.toBeInstanceOf(DomainError);
});

test("duplicate phone is rejected", async () => {
  const store = new MemoryStore();
  await registerGuest(store, {
    telegramId: 1n,
    firstName: "A",
    lastName: "B",
    birthday: new Date("1990-01-01"),
    phone: "79990000001",
  });
  await expect(
    registerGuest(store, {
      telegramId: 2n,
      firstName: "C",
      lastName: "D",
      birthday: new Date("1990-01-01"),
      phone: "79990000001",
    }),
  ).rejects.toMatchObject({ code: "phone_taken" });
});
