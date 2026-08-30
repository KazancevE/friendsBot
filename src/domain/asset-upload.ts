import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DomainError } from "./errors.ts";
import { loadS3Config } from "../storage/s3-config.ts";
import {
  buildObjectKey,
  uploadObject,
} from "../storage/object-storage.ts";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);

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
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  return "application/octet-stream";
};

const validateUpload = (input: { bytes: Uint8Array; originalName: string; maxBytes: number }) => {
  const ext = extname(input.originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new DomainError("bad_request", "Формат: JPG, PNG, WebP или SVG");
  }
  if (input.bytes.length > input.maxBytes) {
    throw new DomainError("bad_request", `Файл не больше ${Math.round(input.maxBytes / (1024 * 1024))} МБ`);
  }
  return ext;
};

export const assetPublicPath = (folder: string, filename: string) => `/uploads/${folder}/${filename}`;

export async function saveAssetUpload(input: {
  folder: string;
  bytes: Uint8Array;
  originalName: string;
  maxBytes?: number;
}): Promise<string> {
  const maxBytes = input.maxBytes ?? 8 * 1024 * 1024;
  const ext = validateUpload({ ...input, maxBytes });
  const filename = `${randomUUID()}${ext}`;
  const s3 = loadS3Config();
  if (s3 !== null) {
    const key = buildObjectKey(s3.keyPrefix, `${input.folder}/${filename}`);
    return uploadObject(s3, {
      key,
      bytes: input.bytes,
      contentType: contentTypeForExtension(ext),
    });
  }
  const dir = join(process.cwd(), "uploads", input.folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), input.bytes);
  return assetPublicPath(input.folder, filename);
}

export type ThemeAssetKind =
  | "logo"
  | "interior"
  | "hubBg"
  | "heroBanner"
  | "decor"
  | "gameTile"
  | "gameBoardBg"
  | "gameTrayBg";

export const themeAssetMaxBytes = (kind: ThemeAssetKind) => {
  if (kind === "logo") {
    return 2 * 1024 * 1024;
  }
  if (kind === "gameTile") {
    return 512 * 1024;
  }
  if (kind === "hubBg" || kind === "heroBanner") {
    return 4 * 1024 * 1024;
  }
  return 8 * 1024 * 1024;
};

export const themeAssetFolder = (kind: ThemeAssetKind) => {
  if (kind === "gameTile" || kind === "gameBoardBg" || kind === "gameTrayBg") {
    return "game-skins";
  }
  return "theme";
};
