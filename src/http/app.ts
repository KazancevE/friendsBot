import { serveStatic } from "@hono/node-server/serve-static";
import type { Bot } from "grammy";
import { webhookCallback } from "grammy";
import { Hono } from "hono";
import type { Store } from "../store/types.ts";
import { createAdminRoutes } from "./admin.ts";
import { createCashierRoutes } from "./cashier.ts";
import { createCheckInRoutes } from "./check-in.ts";
import { createGameRoutes } from "./games.ts";

type CreateHttpAppParameters = {
  readonly store: Store;
  readonly botToken: string;
  readonly bot?: Bot;
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

export const createHttpApp = ({ store, botToken, bot }: CreateHttpAppParameters) => {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/", createCashierRoutes({ store, botToken }));
  app.route("/", createCheckInRoutes({ store, botToken, botApi: bot?.api }));
  app.route("/", createGameRoutes({ store, botToken }));
  app.route("/", createAdminRoutes({ store, botToken }));

  if (bot !== undefined) {
    const handleUpdate = webhookCallback(bot, "hono");
    app.post("/tg/:token", async (c) => {
      const token = c.req.param("token");
      if (token !== botToken) {
        return c.json({ code: "forbidden", message: "Неверный токен" }, 403);
      }
      return handleUpdate(c);
    });
  }

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
