import { expect, test } from "vitest";
import { MemoryStore } from "../../src/store/memory.ts";
import { addMenuItem, listActiveMenu, savePage } from "../../src/domain/content.ts";

test("admin adds menu item, guest list sees it", async () => {
  const store = new MemoryStore();
  const admin = await store.createUser({
    telegramId: 1n,
    role: "admin",
    firstName: "A",
    lastName: "A",
    birthday: null,
    phone: null,
    qrToken: "tokadmin01",
  });
  await addMenuItem(store, {
    actorId: admin.id,
    title: "Классика",
    description: "Яблоко",
    priceRubles: 1500,
  });
  const menu = await listActiveMenu(store);
  expect(menu[0]?.title).toBe("Классика");
  expect(menu[0]?.priceRubles).toBe(1500);
});

test("master cannot edit menu", async () => {
  const store = new MemoryStore();
  const master = await store.createUser({
    telegramId: 2n,
    role: "master",
    firstName: "M",
    lastName: "M",
    birthday: null,
    phone: null,
    qrToken: "tokmaster1",
  });
  await expect(
    addMenuItem(store, { actorId: master.id, title: "X", description: "", priceRubles: null }),
  ).rejects.toMatchObject({ code: "forbidden" });
});
