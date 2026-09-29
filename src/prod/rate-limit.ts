const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

type Bucket = { failures: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export const resetLoginAttempts = () => {
  buckets.clear();
};

export const loginAttempt = (key: string, success: boolean, now = Date.now()) => {
  if (success) {
    buckets.delete(key);
    return { allowed: true, retryAfterMs: 0 };
  }
  const current = buckets.get(key);
  const fresh = !current || now - current.windowStart >= WINDOW_MS;
  const bucket = fresh ? { failures: 0, windowStart: now } : current;
  if (bucket.failures >= MAX_FAILURES) {
    buckets.set(key, bucket);
    return { allowed: false, retryAfterMs: Math.max(0, WINDOW_MS - (now - bucket.windowStart)) };
  }
  bucket.failures += 1;
  buckets.set(key, bucket);
  return { allowed: true, retryAfterMs: 0 };
};

export const clientIp = (forwardedFor: string | undefined, realIp: string | undefined) => {
  const forwarded = forwardedFor?.split(",")[0]?.trim();
  return forwarded || realIp || "local";
};
