import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DomainError } from "./errors.ts";
import type { MenuItemRecord } from "./types.ts";
import type { Store } from "../store/types.ts";
import { loadS3Config } from "../storage/s3-config.ts";
import {
  buildObjectKey,
  deleteObject,
  keyFromPublicUrl,
  uploadObject,
} from "../storage/object-storage.ts";

const MENU_UPLOAD_DIR = join(process.cwd(), "uploads", "menu");
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const contentTypeForExtension = (ext: string) => {
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
};

export const menuUploadDir = () => MENU_UPLOAD_DIR;

export const menuImagePublicPath = (filename: string) => `/uploads/menu/${filename}`;

const validateUpload = (input: { bytes: Uint8Array; originalName: string }) => {
  const ext = extname(input.originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new DomainError("bad_request", "Формат: JPG, PNG или WebP");
  }
  if (input.bytes.length > 8 * 1024 * 1024) {
    throw new DomainError("bad_request", "Файл не больше 8 МБ");
  }
  return ext;
};

async function saveMenuUploadLocal(input: { bytes: Uint8Array; originalName: string }): Promise<string> {
  const ext = validateUpload(input);
  await mkdir(MENU_UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(MENU_UPLOAD_DIR, filename), input.bytes);
  return menuImagePublicPath(filename);
}

async function saveMenuUploadS3(input: { bytes: Uint8Array; originalName: string }): Promise<string> {
  const s3 = loadS3Config();
  if (s3 === null) {
    throw new Error("S3 is not configured");
  }
  const ext = validateUpload(input);
  const filename = `${randomUUID()}${ext}`;
  const key = buildObjectKey(s3.keyPrefix, filename);
  return uploadObject(s3, {
    key,
    bytes: input.bytes,
    contentType: contentTypeForExtension(ext),
  });
}

export async function saveMenuUpload(input: {
  bytes: Uint8Array;
  originalName: string;
}): Promise<string> {
  if (loadS3Config() !== null) {
    return saveMenuUploadS3(input);
  }
  return saveMenuUploadLocal(input);
}

async function deleteStoredMenuUpload(imageUrl: string | null) {
  if (imageUrl === null) {
    return;
  }

  const s3 = loadS3Config();
  if (imageUrl.startsWith("http") && s3 !== null) {
    const key = keyFromPublicUrl(s3, imageUrl);
    if (key !== null) {
      try {
        await deleteObject(s3, key);
      } catch {
        // ignore missing objects
      }
    }
    return;
  }

  if (imageUrl.startsWith("/uploads/menu/")) {
    const filename = imageUrl.slice("/uploads/menu/".length);
    if (filename.length === 0 || filename.includes("/") || filename.includes("..")) {
      return;
    }
    try {
      await unlink(join(MENU_UPLOAD_DIR, filename));
    } catch {
      // ignore missing files
    }
  }
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

  await deleteStoredMenuUpload(item.imageUrl);
  await store.deleteMenuItem(item.id);
}
