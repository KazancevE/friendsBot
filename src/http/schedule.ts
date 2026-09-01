import { Hono } from "hono";
import { listGuestStaffSchedule } from "../domain/staff-shifts.ts";
import { DomainError } from "../domain/errors.ts";
import type { Store } from "../store/types.ts";
import { resolveActor } from "./auth.ts";

type CreateScheduleRoutesParameters = {
  readonly store: Store;
  readonly botToken: string;
};

const readInitData = (headerValue: string | undefined) => {
  if (headerValue !== undefined && headerValue.length > 0) {
    return headerValue;
  }
  throw new DomainError("bad_init_data", "Нет initData");
};

export const createScheduleRoutes = ({ store, botToken }: CreateScheduleRoutesParameters) => {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      const status =
        err.code === "forbidden" ? 403 : err.code === "unavailable" ? 503 : err.code === "not_found" ? 404 : 400;
      return c.json({ code: err.code, message: err.message }, status);
    }
    const message = err instanceof Error ? err.message : "Ошибка";
    return c.json({ code: "internal", message }, 500);
  });

  app.get("/api/schedule", async (c) => {
    await resolveActor(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const days = Number(c.req.query("days") ?? "7");
    if (!Number.isInteger(days) || days < 1 || days > 14) {
      throw new DomainError("bad_request", "days от 1 до 14");
    }
    const schedule = await listGuestStaffSchedule(store, { now: new Date(), days });
    return c.json(schedule);
  });

  return app;
};
