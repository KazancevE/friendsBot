import { DomainError } from "./errors.ts";
import type { Store } from "../store/types.ts";

export type GameSkinTile = {
  index: number;
  imageUrl: string;
  label?: string | null;
};

export type GameSkin = {
  gameSlug: string;
  tiles: GameSkinTile[];
  boardBackgroundUrl: string | null;
  trayBackgroundUrl: string | null;
  updatedAt: string;
};

const GAME_SKINS_KEY = "game_skins";

const parseTile = (value: unknown): GameSkinTile | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.index !== "number" || typeof raw.imageUrl !== "string") {
    return null;
  }
  return {
    index: raw.index,
    imageUrl: raw.imageUrl,
    label: typeof raw.label === "string" ? raw.label : null,
  };
};

const parseSkin = (value: unknown): GameSkin | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.gameSlug !== "string") {
    return null;
  }
  const tiles = Array.isArray(raw.tiles)
    ? raw.tiles.flatMap((item) => {
        const tile = parseTile(item);
        return tile === null ? [] : [tile];
      })
    : [];
  return {
    gameSlug: raw.gameSlug,
    tiles,
    boardBackgroundUrl: typeof raw.boardBackgroundUrl === "string" ? raw.boardBackgroundUrl : null,
    trayBackgroundUrl: typeof raw.trayBackgroundUrl === "string" ? raw.trayBackgroundUrl : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
};

export const parseGameSkins = (json: string | null): Record<string, GameSkin> => {
  if (json === null || json.trim().length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const out: Record<string, GameSkin> = {};
  for (const [slug, value] of Object.entries(parsed)) {
    const skin = parseSkin({ ...(value as object), gameSlug: slug });
    if (skin !== null) {
      out[slug] = skin;
    }
  }
  return out;
};

const saveGameSkins = async (store: Store, skins: Record<string, GameSkin>) => {
  await store.upsertSettingValue(GAME_SKINS_KEY, JSON.stringify(skins));
};

export const listGameSkins = async (store: Store) => {
  const json = await store.getSettingValue(GAME_SKINS_KEY);
  return parseGameSkins(json);
};

export const getGameSkin = async (store: Store, gameSlug: string) => {
  const skins = await listGameSkins(store);
  return skins[gameSlug] ?? null;
};

export const upsertGameSkinTile = async (
  store: Store,
  input: { gameSlug: string; index: number; imageUrl: string; label?: string | null },
) => {
  if (!Number.isInteger(input.index) || input.index < 0 || input.index > 7) {
    throw new DomainError("bad_request", "Индекс плитки от 0 до 7");
  }
  const skins = await listGameSkins(store);
  const current =
    skins[input.gameSlug] ??
    ({
      gameSlug: input.gameSlug,
      tiles: [],
      boardBackgroundUrl: null,
      trayBackgroundUrl: null,
      updatedAt: new Date().toISOString(),
    } satisfies GameSkin);
  const tiles = current.tiles.filter((tile) => tile.index !== input.index);
  tiles.push({ index: input.index, imageUrl: input.imageUrl, label: input.label ?? null });
  tiles.sort((a, b) => a.index - b.index);
  const next: GameSkin = {
    ...current,
    tiles,
    updatedAt: new Date().toISOString(),
  };
  skins[input.gameSlug] = next;
  await saveGameSkins(store, skins);
  return next;
};

export const patchGameSkin = async (
  store: Store,
  gameSlug: string,
  patch: { boardBackgroundUrl?: string | null; trayBackgroundUrl?: string | null },
) => {
  const skins = await listGameSkins(store);
  const current =
    skins[gameSlug] ??
    ({
      gameSlug,
      tiles: [],
      boardBackgroundUrl: null,
      trayBackgroundUrl: null,
      updatedAt: new Date().toISOString(),
    } satisfies GameSkin);
  const next: GameSkin = {
    ...current,
    boardBackgroundUrl: patch.boardBackgroundUrl === undefined ? current.boardBackgroundUrl : patch.boardBackgroundUrl,
    trayBackgroundUrl: patch.trayBackgroundUrl === undefined ? current.trayBackgroundUrl : patch.trayBackgroundUrl,
    updatedAt: new Date().toISOString(),
  };
  skins[gameSlug] = next;
  await saveGameSkins(store, skins);
  return next;
};

export const deleteGameSkin = async (store: Store, gameSlug: string) => {
  const skins = await listGameSkins(store);
  if (!(gameSlug in skins)) {
    throw new DomainError("not_found", "Скин не найден");
  }
  delete skins[gameSlug];
  await saveGameSkins(store, skins);
};
