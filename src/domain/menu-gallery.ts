import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DomainError } from "./errors.ts";
import type { MenuItemRecord } from "./types.ts";
import type { Store } from "../store/types.ts";

const MENU_UPLOAD_DIR = join(process.cwd(), "uploads", "menu");
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export const menuUploadDir = () => MENU_UPLOAD_DIR;

export const menuImagePublicPath = (filename: string) => `/uploads/menu/${filename}`;

export async function saveMenuUpload(input: {
  bytes: Uint8Array;
  originalName: string;
}): Promise<string> {
  const ext = extname(input.originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new DomainError("bad_request", "Формат: JPG, PNG или WebP");
  }
  if (input.bytes.length > 8 * 1024 * 1024) {
    throw new DomainError("bad_request", "Файл не больше 8 МБ");
  }

  await mkdir(MENU_UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(MENU_UPLOAD_DIR, filename), input.bytes);
  return menuImagePublicPath(filename);
}

export const isGalleryMenuItem = (item: MenuItemRecord) => {
  return item.title.trim().length === 0 && (item.imageUrl !== null || item.imageFileId !== null);
};

export async function addMenuGalleryImage(
  store: Store,
  input: {
    actorId: string;
    imageUrl: string | null;
    imageFileId: string | null;
  },
) {
  if (input.imageUrl === null && input.imageFileId === null) {
    throw new DomainError("bad_request", "Нужно фото");
  }

  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }

  const menu = await store.listMenu();
  const gallerySort = menu
    .filter((item) => isGalleryMenuItem(item))
    .reduce((max, item) => Math.max(max, item.sort), -1);

  return store.upsertMenuItem({
    title: "",
    description: "",
    priceRubles: null,
    imageFileId: input.imageFileId,
    imageUrl: input.imageUrl,
    sort: gallerySort + 1,
    active: true,
  });
}

export async function reorderMenuGallery(store: Store, input: { actorId: string; orderedIds: string[] }) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }

  const menu = await store.listMenu();
  const galleryIds = new Set(menu.filter((item) => isGalleryMenuItem(item)).map((item) => item.id));
  for (const id of input.orderedIds) {
    if (!galleryIds.has(id)) {
      throw new DomainError("bad_request", "Неизвестное фото меню");
    }
  }

  await Promise.all(
    input.orderedIds.map((id, index) => {
      const item = menu.find((row) => row.id === id);
      if (item === undefined) {
        return Promise.resolve();
      }
      return store.upsertMenuItem({ ...item, sort: index });
    }),
  );

  return store.listMenu();
}

export async function removeMenuGalleryImage(store: Store, input: { actorId: string; id: string }) {
  const actor = await store.findUserById(input.actorId);
  if (!actor || actor.role !== "admin") {
    throw new DomainError("forbidden", "Только админ");
  }

  const menu = await store.listMenu();
  const item = menu.find((row) => row.id === input.id);
  if (item === undefined || !isGalleryMenuItem(item)) {
    throw new DomainError("not_found", "Фото не найдено");
  }

  await store.deleteMenuItem(item.id);
}
