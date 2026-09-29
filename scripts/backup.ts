import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { backupStamp, isWeeklySlot, pruneBackups, type BackupFile } from "../src/prod/retention.ts";
import { log } from "../src/prod/log.ts";

const dir = process.env.BACKUP_DIR ?? "/var/backups/daddyson";

const stampOf = (name: string) => name.slice(name.indexOf("-") + 1, name.indexOf("-") + 11);

const listKind = async (kind: "daily" | "weekly"): Promise<BackupFile[]> => {
  const folder = path.join(dir, kind);
  await mkdir(folder, { recursive: true });
  const names = await readdir(folder);
  return names
    .filter((name) => name.endsWith(".dump"))
    .map((name) => ({ name: path.join(folder, name), kind, at: stampOf(name) }));
};

const dump = (file: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--file", file, process.env.DATABASE_URL ?? ""], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump ${code}`))));
  });

const upload = async (file: string) => {
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  if (!bucket) {
    return;
  }
  const client = new S3Client({
    region: process.env.BACKUP_S3_REGION || "ru-central1",
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.BACKUP_S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  const key = `${process.env.BACKUP_S3_PREFIX ?? "daddyson"}/${path.basename(path.dirname(file))}/${path.basename(file)}`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file) }));
  log("info", "backup uploaded", { key });
};

const writeStatus = async (ok: boolean, error?: string) => {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "status.json"), JSON.stringify({ ok, at: new Date().toISOString(), error }));
};

export const runBackup = async (now = new Date()) => {
  const zone = process.env.VENUE_TIMEZONE || "UTC";
  const stamp = backupStamp(now, zone);
  const daily = path.join(dir, "daily", `daily-${stamp}.dump`);
  await mkdir(path.dirname(daily), { recursive: true });
  await dump(daily);
  if (isWeeklySlot(now, zone)) {
    const weekly = path.join(dir, "weekly", `weekly-${stamp}.dump`);
    await mkdir(path.dirname(weekly), { recursive: true });
    await copyFile(daily, weekly);
  }
  const files = [...(await listKind("daily")), ...(await listKind("weekly"))];
  const plan = pruneBackups(files);
  for (const file of plan.drop) {
    await rm(file.name, { force: true });
  }
  await upload(daily);
  await writeStatus(true);
  log("info", "backup stored", { file: daily });
};

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  runBackup().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "backup failed";
    await writeStatus(false, message).catch(() => undefined);
    log("error", message);
    process.exit(1);
  });
}
