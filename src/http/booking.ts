import { DateTime } from "luxon";
import { Hono } from "hono";
import type { Api } from "grammy";
import {
  assignTableToBooking,
  createBookingRequest,
  formatBookingSlot,
  getActiveFloorPlanView,
  handleBookingRequest,
  listAvailableBookingSlots,
  listAvailableTablesForSlot,
  markBookingSeated,
  moveBookingTable,
  swapBookingTables,
} from "../domain/booking.ts";
import { DomainError } from "../domain/errors.ts";
import type { Store } from "../store/types.ts";
import { MOSCOW } from "../domain/week.ts";
import { resolveActor } from "./auth.ts";

type CreateBookingRoutesParameters = {
  readonly store: Store;
  readonly botToken: string;
  readonly botApi?: Api;
};

const readInitData = (headerValue: string | undefined, body: Record<string, unknown>) => {
  if (headerValue !== undefined && headerValue.length > 0) {
    return headerValue;
  }
  const fromBody = body.initData;
  if (typeof fromBody === "string" && fromBody.length > 0) {
    return fromBody;
  }
  throw new DomainError("bad_init_data", "Нет initData");
};

const requireGuest = async (store: Store, initData: string, botToken: string) => {
  const { user } = await resolveActor(store, initData, botToken);
  if (user === undefined) {
    throw new DomainError("forbidden", "Сначала зарегистрируйтесь");
  }
  return user;
};

const requireStaff = async (store: Store, initData: string, botToken: string) => {
  const { user } = await resolveActor(store, initData, botToken);
  if (user === undefined || (user.role !== "master" && user.role !== "admin")) {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  return user;
};

const readJsonBody = async (c: { req: { json(): Promise<unknown> } }) => {
  const body: unknown = await c.req.json();
  if (typeof body !== "object" || body === null) {
    throw new DomainError("bad_request", "Некорректное тело");
  }
  return body as Record<string, unknown>;
};

const parseMoscowDay = (value: string | undefined) => {
  if (value === undefined || value.length === 0) {
    throw new DomainError("bad_request", "Нужна date");
  }
  const parsed = DateTime.fromISO(value, { zone: MOSCOW });
  if (!parsed.isValid) {
    const alt = DateTime.fromFormat(value, "dd.MM.yyyy", { zone: MOSCOW });
    if (!alt.isValid) {
      throw new DomainError("bad_request", "Некорректная дата");
    }
    return alt.startOf("day").toJSDate();
  }
  return parsed.startOf("day").toJSDate();
};

const parseDateTime = (value: unknown) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new DomainError("bad_request", "Некорректное время");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError("bad_request", "Некорректное время");
  }
  return parsed;
};

const serializeTable = (table: {
  id: string;
  label: string;
  description: string;
  highlights: string[];
  photoUrl: string | null;
  seatsMin: number;
  seatsMax: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  sort: number;
  active: boolean;
  free?: boolean;
}) => ({
  id: table.id,
  label: table.label,
  description: table.description,
  highlights: table.highlights,
  photoUrl: table.photoUrl,
  seatsMin: table.seatsMin,
  seatsMax: table.seatsMax,
  posX: table.posX,
  posY: table.posY,
  width: table.width,
  height: table.height,
  rotation: table.rotation,
  sort: table.sort,
  active: table.active,
  ...(table.free === undefined ? {} : { free: table.free }),
});

export const createBookingRoutes = ({ store, botToken, botApi }: CreateBookingRoutesParameters) => {
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

  app.get("/api/booking/floor-plan", async (c) => {
    await requireGuest(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const floorPlan = await getActiveFloorPlanView(store);
    if (floorPlan === null) {
      return c.json({ floorPlan: null });
    }
    return c.json({
      floorPlan: {
        id: floorPlan.id,
        name: floorPlan.name,
        width: floorPlan.width,
        height: floorPlan.height,
        backgroundImageUrl: floorPlan.backgroundImageUrl,
        tables: floorPlan.tables.map((table) => serializeTable(table)),
      },
    });
  });

  app.get("/api/booking/availability", async (c) => {
    await requireGuest(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const day = parseMoscowDay(c.req.query("date"));
    const partySize = Number(c.req.query("partySize") ?? "0");
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
      throw new DomainError("bad_request", "partySize от 1 до 20");
    }
    const slots = await listAvailableBookingSlots(store, {
      day,
      partySize,
      now: new Date(),
    });
    return c.json({
      slots: slots.map((slot) => ({
        hour: slot.hour,
        minute: slot.minute,
        requestedFor: slot.requestedFor.toISOString(),
        freeTables: slot.freeTables,
      })),
    });
  });

  app.get("/api/booking/tables", async (c) => {
    await requireGuest(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const requestedFor = parseDateTime(c.req.query("requestedFor"));
    const partySize = Number(c.req.query("partySize") ?? "0");
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
      throw new DomainError("bad_request", "partySize от 1 до 20");
    }
    const tables = await listAvailableTablesForSlot(store, { requestedFor, partySize });
    return c.json({ tables: tables.map((table) => serializeTable(table)) });
  });

  app.post("/api/booking", async (c) => {
    const body = await readJsonBody(c);
    const guest = await requireGuest(store, readInitData(c.req.header("X-Telegram-Init-Data"), body), botToken);
    const requestedFor = parseDateTime(body.requestedFor);
    const partySize = Number(body.partySize);
    const comment =
      "comment" in body && (typeof body.comment === "string" || body.comment === null) ? body.comment : null;
    const tableId =
      "tableId" in body && (typeof body.tableId === "string" || body.tableId === null) ? body.tableId : null;
    const booking = await createBookingRequest(store, {
      userId: guest.id,
      requestedFor,
      partySize,
      comment,
      tableId,
      now: new Date(),
    });
    return c.json({
      booking: {
        id: booking.id,
        requestedFor: booking.requestedFor.toISOString(),
        endsAt: booking.endsAt?.toISOString() ?? null,
        partySize: booking.partySize,
        tableId: booking.tableId,
        status: booking.status,
      },
    });
  });

  app.patch("/api/booking/:id/assign-table", async (c) => {
    const staff = await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const body = await readJsonBody(c);
    const tableId = "tableId" in body && typeof body.tableId === "string" ? body.tableId : null;
    if (tableId === null) {
      throw new DomainError("bad_request", "Нужен tableId");
    }
    const booking = await assignTableToBooking(store, {
      bookingId: c.req.param("id"),
      tableId,
      actorId: staff.id,
      now: new Date(),
    });
    return c.json({ booking: { id: booking.id, tableId: booking.tableId } });
  });

  app.patch("/api/booking/:id/move-table", async (c) => {
    const staff = await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const body = await readJsonBody(c);
    const tableId = "tableId" in body && typeof body.tableId === "string" ? body.tableId : null;
    if (tableId === null) {
      throw new DomainError("bad_request", "Нужен tableId");
    }
    const booking = await moveBookingTable(store, {
      bookingId: c.req.param("id"),
      tableId,
      actorId: staff.id,
      now: new Date(),
    });
    return c.json({ booking: { id: booking.id, tableId: booking.tableId } });
  });

  app.post("/api/booking/swap-tables", async (c) => {
    const staff = await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const body = await readJsonBody(c);
    const bookingIdA =
      "bookingIdA" in body && typeof body.bookingIdA === "string" ? body.bookingIdA : null;
    const bookingIdB =
      "bookingIdB" in body && typeof body.bookingIdB === "string" ? body.bookingIdB : null;
    if (bookingIdA === null || bookingIdB === null) {
      throw new DomainError("bad_request", "Нужны bookingIdA и bookingIdB");
    }
    const result = await swapBookingTables(store, {
      bookingIdA,
      bookingIdB,
      actorId: staff.id,
      now: new Date(),
    });
    return c.json({
      bookings: [
        { id: result.a.id, tableId: result.a.tableId },
        { id: result.b.id, tableId: result.b.tableId },
      ],
    });
  });

  app.patch("/api/booking/:id/seated", async (c) => {
    const staff = await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const booking = await markBookingSeated(store, {
      bookingId: c.req.param("id"),
      actorId: staff.id,
      now: new Date(),
    });
    return c.json({ booking: { id: booking.id, status: booking.status } });
  });

  app.patch("/api/booking/:id/status", async (c) => {
    const staff = await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data"), {}), botToken);
    const body = await readJsonBody(c);
    const statusRaw = "status" in body && typeof body.status === "string" ? body.status : null;
    if (statusRaw !== "confirmed" && statusRaw !== "cancelled") {
      throw new DomainError("bad_request", "Статус: confirmed или cancelled");
    }
    const booking = await handleBookingRequest(store, {
      bookingId: c.req.param("id"),
      actorId: staff.id,
      status: statusRaw,
      now: new Date(),
    });
    if (botApi !== undefined) {
      const guest = await store.findUserById(booking.userId);
      if (guest !== null) {
        const label = statusRaw === "confirmed" ? "подтверждена" : "отменена";
        try {
          await botApi.sendMessage(
            guest.telegramId.toString(),
            `Ваша заявка на ${formatBookingSlot(booking.requestedFor)} ${label}`,
          );
        } catch {
          // ignore
        }
      }
    }
    return c.json({ booking: { id: booking.id, status: booking.status } });
  });

  return app;
};
