import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { registerGuest } from "../../src/domain/users.ts";
import { recipientsForBroadcast } from "../../src/domain/broadcast.ts";

test("skips opt-out and staff", async () => {
  const store = new MemoryStore();
  const a = await registerGuest(store, {
    telegramId: 1n,
    firstName: "A",
    lastName: "A",
    birthday: new Date("1990-01-01"),
    phone: "79990000001",
  });
  await registerGuest(store, {
    telegramId: 2n,
    firstName: "B",
    lastName: "B",
    birthday: new Date("1990-01-01"),
    phone: "79990000002",
  });
  await store.updateUser(a.id, { broadcastOptOut: true });
  await store.createUser({
    telegramId: 3n,
    role: "master",
    firstName: "M",
    lastName: "M",
    birthday: null,
    phone: null,
    qrToken: "mst1234567",
  });
  const ids = await recipientsForBroadcast(store);
  expect(ids).toEqual([2n]);
});
