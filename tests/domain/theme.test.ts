import { expect, test } from "vitest";
import {
  cssVariablesForTheme,
  getActiveTheme,
  resolveActiveThemePack,
  upsertThemePack,
  setActiveThemeId,
  updateThemeAsset,
  type ThemePack,
} from "../../src/domain/theme.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const samplePack = (overrides: Partial<ThemePack> = {}): ThemePack => ({
  id: "pack-1",
  name: "Новый год",
  activeFrom: "2026-01-01",
  activeTo: "2026-01-07",
  isManualActive: false,
  assets: {
    logoUrl: null,
    interiorUrls: [],
    hubBackgroundUrl: null,
    heroBannerUrl: null,
    decorUrl: null,
  },
  colors: { accent: "#ff0000", bg: "#101010" },
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

test("resolveActiveThemePack prefers manual active id", () => {
  const packs = [samplePack(), samplePack({ id: "pack-2", name: "Лето" })];
  const resolved = resolveActiveThemePack(packs, "pack-2", new Date("2026-06-01T12:00:00.000Z"));
  expect(resolved?.id).toBe("pack-2");
});

test("resolveActiveThemePack picks scheduled pack by date", () => {
  const packs = [samplePack({ activeFrom: "2026-12-20", activeTo: "2026-12-31" })];
  const resolved = resolveActiveThemePack(packs, null, new Date("2026-12-25T12:00:00.000Z"));
  expect(resolved?.name).toBe("Новый год");
});

test("cssVariablesForTheme maps accent and bg", () => {
  const vars = cssVariablesForTheme(samplePack());
  expect(vars["--accent"]).toBe("#ff0000");
  expect(vars["--bg"]).toBe("#101010");
});

test("upsertThemePack creates and updates packs", async () => {
  const store = new MemoryStore();
  const created = await upsertThemePack(store, { name: "Весна" });
  expect(created.name).toBe("Весна");

  const updated = await upsertThemePack(store, {
    id: created.id,
    name: "Весна 2026",
    colors: { accent: "#00aa00" },
  });
  expect(updated.name).toBe("Весна 2026");
  expect(updated.colors.accent).toBe("#00aa00");
});

test("setActiveThemeId and getActiveTheme return active assets", async () => {
  const store = new MemoryStore();
  const pack = await upsertThemePack(store, { name: "Осень", colors: { accent: "#aa5500" } });
  await updateThemeAsset(store, { packId: pack.id, kind: "logoUrl", url: "/uploads/logo.png" });
  await setActiveThemeId(store, pack.id);

  const active = await getActiveTheme(store, new Date("2026-08-31T12:00:00.000Z"));
  expect(active.id).toBe(pack.id);
  expect(active.assets.logoUrl).toBe("/uploads/logo.png");
  expect(active.cssVariables["--accent"]).toBe("#aa5500");
});
