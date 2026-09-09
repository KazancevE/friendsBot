import { serveStatic } from "@hono/node-server/serve-static";
import type { Bot } from "grammy";
import { webhookCallback } from "grammy";
import { Hono } from "hono";
import type { Store } from "../store/types.ts";
import { createAdminRoutes } from "./admin.ts";
import { createBookingRoutes } from "./booking.ts";
import { createCashierRoutes } from "./cashier.ts";
import { createCheckInRoutes } from "./check-in.ts";
import { createGameRoutes } from "./games.ts";
import { createPublicGameSkinRoutes } from "./game-skin.ts";
import { createScheduleRoutes } from "./schedule.ts";
import { createThemeRoutes } from "./theme.ts";
import { applyWebAppCacheHeaders } from "./web-app-cache.ts";
import { DomainError } from "../domain/errors.ts";
import { assertWebhookSecret, WEBHOOK_SECRET_HEADER } from "./webhook-secret.ts";

type CreateHttpAppParameters = {
  readonly store: Store;
  readonly botToken: string;
  readonly bot?: Bot;
  readonly webhookSecret?: string;
  readonly checkReady?: () => Promise<unknown>;
};

const MINIAPP_INDEX = "miniapp/dist/index.html";
const ADMIN_INDEX = "admin/dist/index.html";

const rewriteMiniAppPath = (path: string) => {
  const stripped = path.replace(/^\/app\/?/, "");
  const file = stripped === "" ? "index.html" : stripped;
  return `miniapp/dist/${file}`;
};

const rewriteAdminPath = (path: string) => {
  const stripped = path.replace(/^\/admin\/?/, "");
  const file = stripped === "" ? "index.html" : stripped;
  return `admin/dist/${file}`;
};

export const createHttpApp = ({ store, botToken, bot, webhookSecret, checkReady }: CreateHttpAppParameters) => {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/health/ready", async (c) => {
    if (checkReady === undefined) {
      return c.json({ ok: true });
    }
    try {
      await checkReady();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });
  app.use("/uploads/*", serveStatic({ root: "." }));
  app.route("/", createCashierRoutes({ store, botToken }));
  app.route("/", createCheckInRoutes({ store, botToken, botApi: bot?.api }));
  app.route("/", createGameRoutes({ store, botToken }));
  app.route("/", createPublicGameSkinRoutes({ store }));
  app.route("/", createThemeRoutes({ store }));
  app.route("/", createBookingRoutes({ store, botToken, botApi: bot?.api }));
  app.route("/", createScheduleRoutes({ store, botToken }));
  app.route("/", createAdminRoutes({ store, botToken, botApi: bot?.api }));

  if (bot !== undefined && webhookSecret !== undefined) {
    const handleUpdate = webhookCallback(bot, "hono");
    app.post("/tg/webhook", async (c) => {
      try {
        assertWebhookSecret(c.req.header(WEBHOOK_SECRET_HEADER), webhookSecret);
      } catch (err) {
        if (err instanceof DomainError) {
          return c.json({ code: err.code, message: err.message }, 403);
        }
        throw err;
      }
      return handleUpdate(c);
    });
  }

  app.use("/app", applyWebAppCacheHeaders);
  app.use("/app/", applyWebAppCacheHeaders);
  app.use("/app/*", applyWebAppCacheHeaders);
  app.use("/admin", applyWebAppCacheHeaders);
  app.use("/admin/", applyWebAppCacheHeaders);
  app.use("/admin/*", applyWebAppCacheHeaders);

  app.use("/app", serveStatic({ root: ".", path: MINIAPP_INDEX }));
  app.use("/app/", serveStatic({ root: ".", path: MINIAPP_INDEX }));
  app.use(
    "/app/*",
    serveStatic({
      root: ".",
      rewriteRequestPath: rewriteMiniAppPath,
    }),
  );

  app.use("/admin", serveStatic({ root: ".", path: ADMIN_INDEX }));
  app.use("/admin/", serveStatic({ root: ".", path: ADMIN_INDEX }));
  app.use(
    "/admin/*",
    serveStatic({
      root: ".",
      rewriteRequestPath: rewriteAdminPath,
    }),
  );

  return app;
};
