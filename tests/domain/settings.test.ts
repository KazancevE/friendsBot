import { expect, test } from "vitest";
import { patchAdminSettings } from "../../src/domain/settings.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("patchAdminSettings validates percent range", async () => {
  const store = new MemoryStore();
  await expect(patchAdminSettings(store, { percent: 101 })).rejects.toThrow("100");
  const settings = await patchAdminSettings(store, { percent: 15 });
  expect(settings.percent).toBe(15);
});

test("patchAdminSettings stores allowGamesOutsideVisit", async () => {
  const store = new MemoryStore();
  const settings = await patchAdminSettings(store, { allowGamesOutsideVisit: false });
  expect(settings.allowGamesOutsideVisit).toBe(false);
});

test("patchAdminSettings stores gameAnticheatEnabled", async () => {
  const store = new MemoryStore();
  const settings = await patchAdminSettings(store, { gameAnticheatEnabled: true });
  expect(settings.gameAnticheatEnabled).toBe(true);
});
