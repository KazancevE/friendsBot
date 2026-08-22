import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";

test("creates user and finds by telegram id", async () => {
  const store = new MemoryStore();
  const user = await store.createUser({
    telegramId: 1n,
    role: "guest",
    firstName: "Иван",
    lastName: "Петров",
    birthday: new Date("1990-05-12"),
    phone: "79991234567",
    qrToken: "abc12345",
  });
  expect(user.balance).toBe(0);
  const found = await store.findUserByTelegramId(1n);
  expect(found?.id).toBe(user.id);
  const byPhone = await store.findUserByPhone("79991234567");
  expect(byPhone?.id).toBe(user.id);
});
