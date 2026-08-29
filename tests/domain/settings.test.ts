import { expect, test } from "vitest";
import { patchAdminSettings } from "../../src/domain/settings.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("patchAdminSettings validates percent range", async () => {
  const store = new MemoryStore();
  await expect(patchAdminSettings(store, { percent: 101 })).rejects.toThrow("100");
  const settings = await patchAdminSettings(store, { percent: 15 });
  expect(settings.percent).toBe(15);
});

test("patchAdminSettings rejects empty patch", async () => {
  const store = new MemoryStore();
  await expect(patchAdminSettings(store, {})).rejects.toThrow("Нет полей");
});
