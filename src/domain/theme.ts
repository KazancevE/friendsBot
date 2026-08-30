import { DateTime } from "luxon";
import { DomainError } from "./errors.ts";
import { MOSCOW } from "./week.ts";
import type { Store } from "../store/types.ts";

export type ThemeAssets = {
  logoUrl: string | null;
  interiorUrls: string[];
  hubBackgroundUrl: string | null;
  heroBannerUrl: string | null;
  decorUrl: string | null;
};

export type ThemeColors = {
  accent: string | null;
  bg: string | null;
};

export type ThemePack = {
  id: string;
  name: string;
  activeFrom: string | null;
  activeTo: string | null;
  isManualActive: boolean;
  assets: ThemeAssets;
  colors: ThemeColors;
  updatedAt: string;
};

export type ActiveThemeResponse = {
  id: string | null;
  name: string | null;
  assets: ThemeAssets;
  cssVariables: Record<string, string>;
};

const THEME_PACKS_KEY = "theme_packs";
const ACTIVE_THEME_ID_KEY = "active_theme_id";

const emptyAssets = (): ThemeAssets => ({
  logoUrl: null,
  interiorUrls: [],
  hubBackgroundUrl: null,
  heroBannerUrl: null,
  decorUrl: null,
});

const parseAssets = (value: unknown): ThemeAssets => {
  if (typeof value !== "object" || value === null) {
    return emptyAssets();
  }
  const raw = value as Record<string, unknown>;
  return {
    logoUrl: typeof raw.logoUrl === "string" ? raw.logoUrl : null,
    interiorUrls: Array.isArray(raw.interiorUrls)
      ? raw.interiorUrls.filter((item): item is string => typeof item === "string")
      : [],
    hubBackgroundUrl: typeof raw.hubBackgroundUrl === "string" ? raw.hubBackgroundUrl : null,
    heroBannerUrl: typeof raw.heroBannerUrl === "string" ? raw.heroBannerUrl : null,
    decorUrl: typeof raw.decorUrl === "string" ? raw.decorUrl : null,
  };
};

const parseColors = (value: unknown): ThemeColors => {
  if (typeof value !== "object" || value === null) {
    return { accent: null, bg: null };
  }
  const raw = value as Record<string, unknown>;
  return {
    accent: typeof raw.accent === "string" ? raw.accent : null,
    bg: typeof raw.bg === "string" ? raw.bg : null,
  };
};

const parsePack = (value: unknown): ThemePack | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    activeFrom: typeof raw.activeFrom === "string" ? raw.activeFrom : null,
    activeTo: typeof raw.activeTo === "string" ? raw.activeTo : null,
    isManualActive: raw.isManualActive === true,
    assets: parseAssets(raw.assets),
    colors: parseColors(raw.colors),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
};

export const parseThemePacks = (json: string | null): ThemePack[] => {
  if (json === null || json.trim().length === 0) {
    return [];
  }
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((item) => {
    const pack = parsePack(item);
    return pack === null ? [] : [pack];
  });
};

const serializeThemePacks = (packs: ReadonlyArray<ThemePack>) => JSON.stringify(packs);

export const listThemePacks = async (store: Store) => {
  const [packsJson, activeId] = await Promise.all([
    store.getSettingValue(THEME_PACKS_KEY),
    store.getSettingValue(ACTIVE_THEME_ID_KEY),
  ]);
  return {
    packs: parseThemePacks(packsJson),
    activeId: activeId === null || activeId.length === 0 ? null : activeId,
  };
};

const saveThemePacks = async (store: Store, packs: ReadonlyArray<ThemePack>) => {
  await store.upsertSettingValue(THEME_PACKS_KEY, serializeThemePacks(packs));
};

export const cssVariablesForTheme = (pack: ThemePack | null): Record<string, string> => {
  if (pack === null) {
    return {};
  }
  const vars: Record<string, string> = {};
  if (pack.colors.accent !== null && pack.colors.accent.length > 0) {
    vars["--ember"] = pack.colors.accent;
    vars["--accent"] = pack.colors.accent;
  }
  if (pack.colors.bg !== null && pack.colors.bg.length > 0) {
    vars["--bg"] = pack.colors.bg;
  }
  return vars;
};

const isDateInRange = (now: DateTime, from: string | null, to: string | null) => {
  const day = now.toISODate();
  if (day === null) {
    return false;
  }
  if (from !== null && day < from) {
    return false;
  }
  if (to !== null && day > to) {
    return false;
  }
  return true;
};

export const resolveActiveThemePack = (
  packs: ReadonlyArray<ThemePack>,
  activeId: string | null,
  now: Date,
): ThemePack | null => {
  if (activeId !== null) {
    const manual = packs.find((pack) => pack.id === activeId);
    if (manual !== undefined) {
      return manual;
    }
  }
  const moscowNow = DateTime.fromJSDate(now, { zone: MOSCOW });
  const scheduled = packs.filter((pack) => isDateInRange(moscowNow, pack.activeFrom, pack.activeTo));
  if (scheduled.length === 0) {
    return null;
  }
  const manualScheduled = scheduled.find((pack) => pack.isManualActive);
  if (manualScheduled !== undefined) {
    return manualScheduled;
  }
  return scheduled.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
};

export const getActiveTheme = async (store: Store, now = new Date()): Promise<ActiveThemeResponse> => {
  const { packs, activeId } = await listThemePacks(store);
  const pack = resolveActiveThemePack(packs, activeId, now);
  if (pack === null) {
    return {
      id: null,
      name: null,
      assets: emptyAssets(),
      cssVariables: {},
    };
  }
  return {
    id: pack.id,
    name: pack.name,
    assets: pack.assets,
    cssVariables: cssVariablesForTheme(pack),
  };
};

export const upsertThemePack = async (
  store: Store,
  input: {
    id?: string;
    name: string;
    activeFrom?: string | null;
    activeTo?: string | null;
    isManualActive?: boolean;
    colors?: Partial<ThemeColors>;
  },
) => {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new DomainError("bad_request", "Укажите название темы");
  }
  const { packs } = await listThemePacks(store);
  const now = new Date().toISOString();
  if (input.id !== undefined) {
    const index = packs.findIndex((pack) => pack.id === input.id);
    if (index === -1) {
      throw new DomainError("not_found", "Тема не найдена");
    }
    const current = packs[index]!;
    const next: ThemePack = {
      ...current,
      name,
      activeFrom: input.activeFrom === undefined ? current.activeFrom : input.activeFrom,
      activeTo: input.activeTo === undefined ? current.activeTo : input.activeTo,
      isManualActive: input.isManualActive ?? current.isManualActive,
      colors: {
        accent: input.colors?.accent === undefined ? current.colors.accent : input.colors.accent,
        bg: input.colors?.bg === undefined ? current.colors.bg : input.colors.bg,
      },
      updatedAt: now,
    };
    const copy = [...packs];
    copy[index] = next;
    await saveThemePacks(store, copy);
    return next;
  }
  const created: ThemePack = {
    id: crypto.randomUUID(),
    name,
    activeFrom: input.activeFrom ?? null,
    activeTo: input.activeTo ?? null,
    isManualActive: input.isManualActive ?? false,
    assets: emptyAssets(),
    colors: {
      accent: input.colors?.accent ?? null,
      bg: input.colors?.bg ?? null,
    },
    updatedAt: now,
  };
  await saveThemePacks(store, [...packs, created]);
  return created;
};

export const setActiveThemeId = async (store: Store, packId: string | null) => {
  if (packId !== null) {
    const { packs } = await listThemePacks(store);
    if (!packs.some((pack) => pack.id === packId)) {
      throw new DomainError("not_found", "Тема не найдена");
    }
  }
  await store.upsertSettingValue(ACTIVE_THEME_ID_KEY, packId ?? "");
};

export const updateThemeAsset = async (
  store: Store,
  input: {
    packId: string;
    kind: keyof ThemeAssets | "interiorAppend";
    url: string | null;
  },
) => {
  const { packs } = await listThemePacks(store);
  const index = packs.findIndex((pack) => pack.id === input.packId);
  if (index === -1) {
    throw new DomainError("not_found", "Тема не найдена");
  }
  const current = packs[index]!;
  const assets = { ...current.assets };
  if (input.kind === "interiorAppend") {
    if (input.url !== null) {
      assets.interiorUrls = [...assets.interiorUrls, input.url].slice(0, 5);
    }
  } else if (input.kind === "interiorUrls") {
    assets.interiorUrls = input.url === null ? [] : [input.url];
  } else {
    assets[input.kind] = input.url;
  }
  const next = { ...current, assets, updatedAt: new Date().toISOString() };
  const copy = [...packs];
  copy[index] = next;
  await saveThemePacks(store, copy);
  return next;
};

export const removeThemeInterior = async (store: Store, packId: string, url: string) => {
  const { packs } = await listThemePacks(store);
  const index = packs.findIndex((pack) => pack.id === packId);
  if (index === -1) {
    throw new DomainError("not_found", "Тема не найдена");
  }
  const current = packs[index]!;
  const next = {
    ...current,
    assets: {
      ...current.assets,
      interiorUrls: current.assets.interiorUrls.filter((item) => item !== url),
    },
    updatedAt: new Date().toISOString(),
  };
  const copy = [...packs];
  copy[index] = next;
  await saveThemePacks(store, copy);
  return next;
};

export const deleteThemePack = async (store: Store, packId: string) => {
  const state = await listThemePacks(store);
  const next = state.packs.filter((pack) => pack.id !== packId);
  if (next.length === state.packs.length) {
    throw new DomainError("not_found", "Тема не найдена");
  }
  await saveThemePacks(store, next);
  if (state.activeId === packId) {
    await setActiveThemeId(store, null);
  }
};
