import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { assignRole } from "../../src/domain/roles.ts";
import { applyCheck } from "../../src/domain/ledger.ts";
import { registerGuest } from "../../src/domain/users.ts";

test("admin can promote telegram id to master without signup bonus", async () => {
  const store = new MemoryStore();
  const admin = await store.createUser({
    telegramId: 100n,
    role: "admin",
    firstName: "Админ",
    lastName: "А",
    birthday: null,
    phone: null,
    qrToken: "admintok01",
  });
  const master = await assignRole(store, {
    actorId: admin.id,
    telegramId: 200n,
    role: "master",
  });
  expect(master.role).toBe("master");
  expect(master.balance).toBe(0);
});

test("master cannot assign roles", async () => {
  const store = new MemoryStore();
  const master = await store.createUser({
    telegramId: 2n,
    role: "master",
    firstName: "M",
    lastName: "M",
    birthday: null,
    phone: null,
    qrToken: "mastertok1",
  });
  await expect(
    assignRole(store, { actorId: master.id, telegramId: 3n, role: "master" }),
  ).rejects.toMatchObject({ code: "forbidden" });
});

test("master cannot apply check if we only check role in ledger", async () => {
  const store = new MemoryStore();
  const guest = await registerGuest(store, {
    telegramId: 1n,
    firstName: "Г",
    lastName: "О",
    birthday: new Date("1990-01-01"),
    phone: "79992222222",
  });
  await expect(
    applyCheck(store, {
      guestId: guest.id,
      actorId: guest.id,
      checkRubles: 100,
      now: new Date(),
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
});
