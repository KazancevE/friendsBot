import type { Bot } from "grammy";
import { webhookCallback } from "grammy";
import { Hono } from "hono";
import type { Store } from "../store/types.ts";
import { createCashierRoutes } from "./cashier.ts";

type CreateHttpAppParameters = {
  readonly store: Store;
  readonly botToken: string;
  readonly bot?: Bot;
};

export const createHttpApp = ({ store, botToken, bot }: CreateHttpAppParameters) => {
  const app = new Hono();
  app.route("/", createCashierRoutes({ store, botToken }));

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

  return app;
};
