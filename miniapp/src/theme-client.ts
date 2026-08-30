import type { ActiveThemeResponse } from "../../src/domain/theme.ts";
import type { GameSkin } from "../../src/domain/game-skin.ts";

export type { ActiveThemeResponse, GameSkin };

let cachedTheme: ActiveThemeResponse | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isActiveTheme = (value: unknown): value is ActiveThemeResponse => {
  if (!isRecord(value)) {
    return false;
  }
  return isRecord(value.assets) && isRecord(value.cssVariables);
};

const isGameSkin = (value: unknown): value is GameSkin => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.gameSlug === "string" && Array.isArray(value.tiles);
};

export const getCachedTheme = () => cachedTheme;

export const fetchActiveTheme = async (): Promise<ActiveThemeResponse | null> => {
  try {
    const res = await fetch("/api/theme/active");
    if (!res.ok) {
      return null;
    }
    const parsed: unknown = await res.json();
    return isActiveTheme(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const initTheme = async () => {
  cachedTheme = await fetchActiveTheme();
  applyThemeToDocument(cachedTheme);
  return cachedTheme;
};

export const applyThemeToDocument = (theme: ActiveThemeResponse | null) => {
  const root = document.documentElement;
  for (const key of ["--ember", "--accent", "--bg", "--hub-bg-image"]) {
    root.style.removeProperty(key);
  }
  root.classList.remove("theme-active");
  if (theme === null || theme.id === null) {
    return;
  }
  root.classList.add("theme-active");
  for (const [key, value] of Object.entries(theme.cssVariables)) {
    root.style.setProperty(key, value);
  }
  if (theme.assets.hubBackgroundUrl !== null) {
    root.style.setProperty("--hub-bg-image", `url("${theme.assets.hubBackgroundUrl}")`);
  }
};

export const fetchGameSkin = async (slug: string): Promise<GameSkin | null> => {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(slug)}/skin`);
    if (!res.ok) {
      return null;
    }
    const parsed: unknown = await res.json();
    if (parsed === null) {
      return null;
    }
    return isGameSkin(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const tileImageUrl = (skin: GameSkin | null, tileIndex: number) => {
  if (skin === null) {
    return null;
  }
  const tile = skin.tiles.find((entry) => entry.index === tileIndex);
  if (tile === undefined) {
    return null;
  }
  const separator = tile.imageUrl.includes("?") ? "&" : "?";
  return `${tile.imageUrl}${separator}v=${encodeURIComponent(skin.updatedAt)}`;
};

export const gameCoverUrl = (skin: GameSkin | null) => {
  if (skin === null) {
    return null;
  }
  if (skin.boardBackgroundUrl !== null) {
    const separator = skin.boardBackgroundUrl.includes("?") ? "&" : "?";
    return `${skin.boardBackgroundUrl}${separator}v=${encodeURIComponent(skin.updatedAt)}`;
  }
  const firstTile = skin.tiles[0];
  if (firstTile === undefined) {
    return null;
  }
  return tileImageUrl(skin, firstTile.index);
};
