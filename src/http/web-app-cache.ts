import type { Context, Next } from "hono";

const NO_CACHE = "no-cache, no-store, must-revalidate";
const IMMUTABLE_ASSET = "public, max-age=31536000, immutable";

export const applyWebAppCacheHeaders = async (c: Context, next: Next) => {
  await next();
  if (c.res.status !== 200) {
    return;
  }
  const path = c.req.path;
  if (!path.startsWith("/app") && !path.startsWith("/admin")) {
    return;
  }
  if (path.includes("/assets/")) {
    c.res.headers.set("Cache-Control", IMMUTABLE_ASSET);
    return;
  }
  c.res.headers.set("Cache-Control", NO_CACHE);
  c.res.headers.set("Pragma", "no-cache");
};
