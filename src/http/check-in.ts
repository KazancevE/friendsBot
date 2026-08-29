import { Hono } from "hono";
import type { Api } from "grammy";
import { guestCheckIn } from "../domain/check-in.ts";
import { notifyStaffOfCheckIn } from "../domain/check-in-notify.ts";
import { buildStaffGuestCard } from "../domain/guest-card.ts";
import { DomainError } from "../domain/errors.ts";
import type { Role } from "../domain/types.ts";
import {
  ensureActiveVenueCode,
  regenerateVenueCode,
  venueQrPayload,
} from "../domain/venue-code.ts";
import { MOSCOW } from "../domain/week.ts";
import type { Store } from "../store/types.ts";
import { resolveActor } from "./auth.ts";
import { checkPinRateLimit, resetPinRateLimit } from "./pin-rate-limit.ts";

type CreateCheckInRoutesParameters = {
  readonly store: Store;
  readonly botToken: string;
  readonly botApi?: Api;
};

const isStaffRole = (role: Role) => {
  return role === "master" || role === "admin";
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

const requireRegistered = async (store: Store, initData: string, botToken: string) => {
  const { user } = await resolveActor(store, initData, botToken);
  if (user === undefined) {
    throw new DomainError("not_found", "Пользователь не найден");
  }
  return user;
};

const formatMoscowTime = (at: Date) => {
  return at.toLocaleString("ru-RU", { timeZone: MOSCOW, hour: "2-digit", minute: "2-digit" });
};

export const createCheckInRoutes = ({ store, botToken, botApi }: CreateCheckInRoutesParameters) => {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ code: err.code, message: err.message }, 400);
    }
    if (err instanceof Error && err.message === "rate_limited") {
      return c.json({ code: "rate_limited", message: "Слишком много попыток" }, 429);
    }
    const message = err instanceof Error ? err.message : "Ошибка";
    return c.json({ code: "internal", message }, 500);
  });

  app.post("/api/check-in", async (c) => {
    const body = await readJsonBody(c);
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), body);
    const user = await requireRegistered(store, initData, botToken);
    const method = body.method;
    if (method !== "qr" && method !== "pin") {
      throw new DomainError("bad_request", "Нужен method: qr или pin");
    }
    const now = new Date();
    if (method === "pin") {
      checkPinRateLimit(String(user.telegramId), now.getTime());
    }
    const result = await guestCheckIn(store, {
      userId: user.id,
      method,
      token: typeof body.token === "string" ? body.token : undefined,
      pin: typeof body.pin === "string" ? body.pin : undefined,
      now,
    });
    if (method === "pin") {
      resetPinRateLimit(String(user.telegramId));
    }
    if (botApi !== undefined) {
      void notifyStaffOfCheckIn(store, botApi, {
        guest: user,
        visit: result.visit,
        now,
      });
    }
    return c.json({
      visitActive: true,
      endsAt: result.visit.endsAt.toISOString(),
      message: `Визит открыт до ${formatMoscowTime(result.visit.endsAt)}`,
    });
  });

  app.post("/api/staff/venue-code", async (c) => {
    const body = await readJsonBody(c);
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), body);
    const user = await requireRegistered(store, initData, botToken);
    if (!isStaffRole(user.role)) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const now = new Date();
    const code = await ensureActiveVenueCode(store, now);
    return c.json({
      pin: code.pin,
      qrPayload: venueQrPayload(code.token),
      validFrom: code.validFrom.toISOString(),
      validUntil: code.validUntil.toISOString(),
    });
  });

  app.post("/api/staff/venue-code/regenerate", async (c) => {
    const body = await readJsonBody(c);
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), body);
    const user = await requireRegistered(store, initData, botToken);
    if (!isStaffRole(user.role)) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const now = new Date();
    const code = await regenerateVenueCode(store, user.id, now);
    return c.json({
      pin: code.pin,
      qrPayload: venueQrPayload(code.token),
      validFrom: code.validFrom.toISOString(),
      validUntil: code.validUntil.toISOString(),
    });
  });

  app.post("/api/staff/active-visits", async (c) => {
    const body = await readJsonBody(c);
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), body);
    const user = await requireRegistered(store, initData, botToken);
    if (!isStaffRole(user.role)) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const now = new Date();
    const visits = await store.listActiveVisits(now);
    return c.json({
      count: visits.length,
      guests: visits.map((row) => ({
        visitId: row.visitId,
        firstName: row.firstName,
        lastName: row.lastName,
        startedAt: row.startedAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        checkInMethod: row.checkInMethod,
      })),
    });
  });

  app.post("/api/staff/guest-by-visit", async (c) => {
    const body = await readJsonBody(c);
    const initData = readInitData(c.req.header("X-Telegram-Init-Data"), body);
    const user = await requireRegistered(store, initData, botToken);
    if (!isStaffRole(user.role)) {
      return c.json({ code: "forbidden", message: "Недостаточно прав" }, 403);
    }
    const visitId = body.visitId;
    if (typeof visitId !== "string" || visitId.length === 0) {
      throw new DomainError("bad_request", "Нужен visitId");
    }
    const now = new Date();
    const visits = await store.listActiveVisits(now);
    const visit = visits.find((row) => row.visitId === visitId);
    if (visit === undefined) {
      throw new DomainError("not_found", "Гость не в зале");
    }
    const guest = await store.findUserById(visit.userId);
    if (guest === null) {
      throw new DomainError("not_found", "Гость не найден");
    }
    const card = await buildStaffGuestCard(store, guest, now);
    return c.json(card);
  });

  return app;
};
