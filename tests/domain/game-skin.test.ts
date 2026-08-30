import { expect, test } from "vitest";
import {
  deleteGameSkin,
  getGameSkin,
  patchGameSkin,
  upsertGameSkinTile,
} from "../../src/domain/game-skin.ts";
import { MemoryStore } from "../../src/store/memory.ts";

test("upsertGameSkinTile stores tile by index", async () => {
  const store = new MemoryStore();
  const skin = await upsertGameSkinTile(store, {
    gameSlug: "blockblast",
    index: 0,
    imageUrl: "/uploads/tile0.png",
  });
  expect(skin.tiles).toHaveLength(1);
  expect(skin.tiles[0]?.imageUrl).toBe("/uploads/tile0.png");

  const loaded = await getGameSkin(store, "blockblast");
  expect(loaded?.tiles[0]?.index).toBe(0);
});

test("patchGameSkin updates backgrounds", async () => {
  const store = new MemoryStore();
  await upsertGameSkinTile(store, { gameSlug: "blockblast", index: 1, imageUrl: "/tile1.png" });
  const skin = await patchGameSkin(store, "blockblast", {
    boardBackgroundUrl: "/board.png",
    trayBackgroundUrl: "/tray.png",
  });
  expect(skin.boardBackgroundUrl).toBe("/board.png");
  expect(skin.trayBackgroundUrl).toBe("/tray.png");
});

test("deleteGameSkin removes custom skin", async () => {
  const store = new MemoryStore();
  await upsertGameSkinTile(store, { gameSlug: "blockblast", index: 2, imageUrl: "/tile2.png" });
  await deleteGameSkin(store, "blockblast");
  expect(await getGameSkin(store, "blockblast")).toBeNull();
});

test("upsertGameSkinTile rejects invalid index", async () => {
  const store = new MemoryStore();
  await expect(
    upsertGameSkinTile(store, { gameSlug: "blockblast", index: 9, imageUrl: "/bad.png" }),
  ).rejects.toThrow("0");
});
