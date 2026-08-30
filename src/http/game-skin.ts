import { getGameSkin } from "../domain/game-skin.ts";
import type { Store } from "../store/types.ts";
import { Hono } from "hono";

type CreatePublicGameSkinRoutesParameters = {
  readonly store: Store;
};

export const createPublicGameSkinRoutes = ({ store }: CreatePublicGameSkinRoutesParameters) => {
  const app = new Hono();

  app.get("/api/games/:slug/skin", async (c) => {
    const slug = c.req.param("slug");
    const skin = await getGameSkin(store, slug);
    if (skin === null) {
      return c.json(null);
    }
    return c.json(skin);
  });

  return app;
};
