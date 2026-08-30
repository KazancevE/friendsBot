import { Hono } from "hono";
import { getActiveTheme } from "../domain/theme.ts";
import type { Store } from "../store/types.ts";

type CreateThemeRoutesParameters = {
  readonly store: Store;
};

export const createThemeRoutes = ({ store }: CreateThemeRoutesParameters) => {
  const app = new Hono();

  app.get("/api/theme/active", async (c) => {
    const theme = await getActiveTheme(store, new Date());
    return c.json(theme);
  });

  return app;
};
