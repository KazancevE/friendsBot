import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { S3Config } from "./s3-config.ts";

const clients = new Map<string, S3Client>();

const clientFor = (config: S3Config) => {
  const cacheKey = `${config.endpoint}|${config.region}|${config.accessKeyId}`;
  const cached = clients.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
  clients.set(cacheKey, client);
  return client;
};

export const buildObjectKey = (prefix: string, filename: string) => {
  const normalized = prefix.replace(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? `${normalized}/${filename}` : filename;
};

export const buildPublicUrl = (config: S3Config, key: string) => {
  return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
};

export const keyFromPublicUrl = (config: S3Config, url: string): string | null => {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  if (!url.startsWith(`${base}/`)) {
    return null;
  }
  const key = url.slice(base.length + 1);
  return key.length > 0 ? key : null;
};

export async function uploadObject(
  config: S3Config,
  input: { key: string; bytes: Uint8Array; contentType: string },
): Promise<string> {
  await clientFor(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
      ACL: "public-read",
    }),
  );
  return buildPublicUrl(config, input.key);
}

export async function deleteObject(config: S3Config, key: string): Promise<void> {
  await clientFor(config).send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}
