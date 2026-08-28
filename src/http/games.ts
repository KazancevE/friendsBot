import { Hono } from "hono";
import { DomainError } from "../domain/errors.ts";
import { getGameRules, getLeaderboard, getOverallLeaderboard, listGames, submitScoreOrPractice } from "../domain/games.ts";
import type { Store } from "../store/types.ts";
import { resolveActor } from "./auth.ts";

type CreateGameRoutesParameters = {
  readonly store: Store;
  readonly botToken: string;
};

const isJsonObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readJsonBody = async (c: { req: { json: () => Promise<unknown> } }) => {
  try {
    const parsed: unknown = await c.req.json();
    if (!isJsonObject(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};

const readInitData = (headerValue: string | undefined, body: Record<string, unknown>) => {
  if (headerValue !== undefined && headerValue.length > 0) {
    return headerValue;
  }
  if (typeof body.initData === "string" && body.initData.length > 0) {
    return body.initData;
  }
  throw new DomainError("bad_init_data", "Нет initData");
};

type RequireRegisteredParameters = {
  readonly store: Store;
  readonly initData: string;
  readonly botToken: string;
};

const requireRegistered = async ({ store, initData, botToken }: RequireRegisteredParameters) => {
  const { user } = await resolveActor(store, initData, botToken);
  if (user === undefined) {
    throw new DomainError("not_found", "Пользователь не найден");
  }
  return user;
};

export const createGameRoutes = ({ store, botToken }: CreateGameRoutesParameters) => {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ code: err.code, message: err.message }, 400);
    }
    const message = err instanceof Error ? err.message : "Ошибка";
    return c.json({ code: "internal", message }, 500);
  });

  app.post("/api/games/score", async (c) => {
    const body = await readJsonBody(c);
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), body);
    const user = await requireRegistered({ store, initData, botToken });
    if (typeof body.slug !== "string" || body.slug.length === 0) {
      throw new DomainError("bad_request", "Нужен slug");
    }
    if (typeof body.points !== "number") {
      throw new DomainError("score_cap", "Слишком много очков за партию");
    }
    const result = await submitScoreOrPractice(store, {
      userId: user.id,
      slug: body.slug,
      points: body.points,
      now: new Date(),
    });
    return c.json(result);
  });

  app.get("/api/games", async (c) => {
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), {});
    await requireRegistered({ store, initData, botToken });
    const games = await listGames(store);
    return c.json(games);
  });

  app.get("/api/games/rules", async (c) => {
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), {});
    await requireRegistered({ store, initData, botToken });
    const rules = await getGameRules(store);
    return c.json(rules);
  });

  app.get("/api/games/leaderboard", async (c) => {
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), {});
    const user = await requireRegistered({ store, initData, botToken });
    const slug = c.req.query("slug");
    if (slug === undefined || slug.length === 0) {
      throw new DomainError("bad_request", "Нужен slug");
    }
    const board = await getLeaderboard(store, {
      userId: user.id,
      slug,
      now: new Date(),
      viewerRole: user.role,
    });
    return c.json(board);
  });

  app.get("/api/tournament/leaderboard", async (c) => {
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), {});
    const user = await requireRegistered({ store, initData, botToken });
    const board = await getOverallLeaderboard(store, {
      userId: user.id,
      now: new Date(),
      viewerRole: user.role,
    });
    return c.json(board);
  });

  return app;
};
