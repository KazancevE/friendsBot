const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export const checkPinRateLimit = (key: string, now = Date.now()) => {
  const bucket = buckets.get(key);
  if (bucket === undefined || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    throw new Error("rate_limited");
  }
};

export const resetPinRateLimit = (key: string) => {
  buckets.delete(key);
};
