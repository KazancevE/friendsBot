export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  keyPrefix: string;
};

const requireEnv = (env: NodeJS.ProcessEnv, key: string) => {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing ${key} (required when S3_BUCKET is set)`);
  }
  return value.trim();
};

export const loadS3Config = (env: NodeJS.ProcessEnv = process.env): S3Config | null => {
  const bucket = env.S3_BUCKET?.trim();
  if (bucket === undefined || bucket.length === 0) {
    return null;
  }

  const endpoint = requireEnv(env, "S3_ENDPOINT");
  const region = requireEnv(env, "S3_REGION");
  const accessKeyId = requireEnv(env, "S3_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv(env, "S3_SECRET_ACCESS_KEY");
  const publicBaseUrl = (env.S3_PUBLIC_BASE_URL ?? "").trim();
  const keyPrefix = (env.S3_KEY_PREFIX ?? "menu").trim().replace(/^\/+|\/+$/g, "");

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl:
      publicBaseUrl.length > 0
        ? publicBaseUrl.replace(/\/$/, "")
        : `${endpoint.replace(/\/$/, "")}/${bucket}`,
    keyPrefix,
  };
};

export const isS3Configured = (env: NodeJS.ProcessEnv = process.env) => loadS3Config(env) !== null;
