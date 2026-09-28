import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { DomainError } from "../domain/errors.ts";
import { patchAdminSettings } from "../domain/settings.ts";
import type { Settings } from "../domain/types.ts";
import type { Store } from "../store/types.ts";
import type { BarberLevelName } from "../salon/catalog.ts";
import { DEMO_GUEST_TELEGRAM_ID, SalonService } from "../salon/service.ts";
import { issueAdminCookie, issueGuestToken, readAdminCookie, readGuestToken } from "../salon/session.ts";
import type { Notifier } from "../salon/outbound.ts";

const safePassword = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
};

const asLevel = (value: unknown): BarberLevelName | null => {
  if (value === "junior" || value === "barber" || value === "senior" || value === "chef") {
    return value;
  }
  return null;
};

export const createSalonRoutes = (deps: {
  salon: SalonService;
  store: Store;
  notifier: Notifier;
  adminLogin: string;
  adminPassword: string;
  sessionSecret: string;
  allowDemoGuest: boolean;
  links: { telegram: string | null; max: string | null; app: string };
  onNotice?: (text: string) => Promise<void>;
}) => {
  const app = new Hono();

  const guestId = (header: string | undefined) => {
    if (!header) {
      return null;
    }
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;
    return readGuestToken(deps.sessionSecret, token);
  };

  const adminLogin = (cookie: string | undefined) => readAdminCookie(deps.sessionSecret, cookie);

  app.get("/api/salon/public", async (c) => {
    const catalog = await deps.salon.publicCatalog();
    return c.json({ ...catalog, links: deps.links });
  });

  app.get("/api/salon/demo", async (c) => {
    if (!deps.allowDemoGuest) {
      return c.json({ message: "Демо-вход выключен" }, 404);
    }
    const user = await deps.store.findUserByTelegramId(DEMO_GUEST_TELEGRAM_ID);
    if (!user) {
      return c.json({ message: "Нет демо-гостя. Запустите сид." }, 404);
    }
    const token = issueGuestToken(deps.sessionSecret, user.id, 60 * 60 * 24 * 14);
    return c.json({ token, userId: user.id });
  });

  app.get("/api/salon/me", async (c) => {
    const id = guestId(c.req.header("authorization"));
    if (!id) {
      return c.json({ message: "Нужна карта гостя" }, 401);
    }
    return c.json(await deps.salon.card(id));
  });

  app.get("/api/salon/branches", async (c) => c.json(await deps.salon.branches()));

  app.get("/api/salon/services", async (c) => {
    const branchId = c.req.query("branchId");
    if (!branchId) {
      return c.json({ message: "Нужен филиал" }, 400);
    }
    return c.json(await deps.salon.servicesForBranch(branchId));
  });

  app.get("/api/salon/masters", async (c) => {
    const branchId = c.req.query("branchId");
    const serviceId = c.req.query("serviceId");
    if (!branchId || !serviceId) {
      return c.json({ message: "Нужны филиал и услуга" }, 400);
    }
    return c.json(await deps.salon.barbersForService(branchId, serviceId));
  });

  app.get("/api/salon/slots", async (c) => {
    const branchId = c.req.query("branchId");
    const serviceId = c.req.query("serviceId");
    const barberId = c.req.query("barberId") ?? "any";
    const date = c.req.query("date");
    if (!branchId || !serviceId || !date) {
      return c.json({ message: "Не хватает параметров" }, 400);
    }
    const slots = await deps.salon.listSlots({ branchId, serviceId, barberId, date });
    return c.json(slots);
  });

  app.get("/api/salon/dates", (c) => c.json(deps.salon.upcomingDates()));

  app.get("/api/salon/appointments", async (c) => {
    const id = guestId(c.req.header("authorization"));
    if (!id) {
      return c.json({ message: "Нужна карта гостя" }, 401);
    }
    return c.json(await deps.salon.myAppointments(id));
  });

  app.post("/api/salon/appointments", async (c) => {
    const id = guestId(c.req.header("authorization"));
    if (!id) {
      return c.json({ message: "Нужна карта гостя" }, 401);
    }
    const body = (await c.req.json()) as {
      branchId?: string;
      serviceId?: string;
      barberId?: string;
      date?: string;
      startMin?: number;
    };
    if (!body.branchId || !body.serviceId || !body.barberId || !body.date || body.startMin === undefined) {
      return c.json({ message: "Заполните запись" }, 400);
    }
    try {
      const booked = await deps.salon.book({
        userId: id,
        branchId: body.branchId,
        serviceId: body.serviceId,
        barberId: body.barberId,
        date: body.date,
        startMin: body.startMin,
      });
      await deps.onNotice?.(booked.notice);
      return c.json({
        id: booked.appointment.id,
        when: booked.appointment.startsAt,
        notice: booked.notice,
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/salon/appointments/:id/cancel", async (c) => {
    const id = guestId(c.req.header("authorization"));
    if (!id) {
      return c.json({ message: "Нужна карта гостя" }, 401);
    }
    try {
      const cancelled = await deps.salon.cancel(id, c.req.param("id"));
      await deps.onNotice?.(cancelled.notice);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/salon/admin/login", async (c) => {
    const body = (await c.req.json()) as { login?: string; password?: string };
    if (!body.login || !body.password || body.login !== deps.adminLogin || !safePassword(body.password, deps.adminPassword)) {
      return c.json({ message: "Неверный логин или пароль" }, 401);
    }
    const cookie = issueAdminCookie(deps.sessionSecret, body.login, 60 * 60 * 24 * 12);
    setCookie(c, "salon_admin", cookie, { httpOnly: true, path: "/", sameSite: "Lax", maxAge: 60 * 60 * 24 * 12 });
    return c.json({ ok: true });
  });

  app.post("/api/salon/admin/logout", (c) => {
    deleteCookie(c, "salon_admin", { path: "/" });
    return c.json({ ok: true });
  });

  app.use("/api/salon/admin/*", async (c, next) => {
    if (c.req.path.endsWith("/login")) {
      await next();
      return;
    }
    if (!adminLogin(getCookie(c, "salon_admin"))) {
      return c.json({ message: "Нужен вход" }, 401);
    }
    await next();
  });

  app.get("/api/salon/admin/session", (c) => c.json({ ok: true }));

  app.get("/api/salon/admin/calendar", async (c) => {
    const from = new Date(c.req.query("from") ?? Date.now());
    const to = new Date(c.req.query("to") ?? Date.now() + 7 * 24 * 60 * 60 * 1000);
    return c.json(await deps.salon.calendar({ branchId: c.req.query("branchId"), from, to }));
  });

  app.get("/api/salon/admin/clients", async (c) => {
    return c.json(await deps.salon.clients({ query: c.req.query("q"), branchId: c.req.query("branchId") }));
  });

  app.post("/api/salon/admin/clients/:id/check", async (c) => {
    const body = (await c.req.json()) as { checkRubles?: number; branchId?: string };
    if (!body.checkRubles || body.checkRubles <= 0) {
      return c.json({ message: "Сумма чека больше нуля" }, 400);
    }
    try {
      return c.json(await deps.salon.accrue({ guestId: c.req.param("id"), checkRubles: body.checkRubles, branchId: body.branchId }));
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/salon/admin/clients/:id/redeem", async (c) => {
    const body = (await c.req.json()) as { amount?: number };
    if (!body.amount || body.amount <= 0) {
      return c.json({ message: "Сумма больше нуля" }, 400);
    }
    try {
      return c.json(await deps.salon.redeem({ guestId: c.req.param("id"), amount: body.amount }));
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.get("/api/salon/admin/masters", async (c) => c.json(await deps.salon.schedules()));

  app.post("/api/salon/admin/masters", async (c) => {
    const body = (await c.req.json()) as { name?: string; level?: string; branchId?: string };
    const level = asLevel(body.level);
    if (!body.name || !body.branchId || !level) {
      return c.json({ message: "Имя, филиал и уровень" }, 400);
    }
    return c.json(await deps.salon.createBarber({ name: body.name, level, branchId: body.branchId }));
  });

  app.put("/api/salon/admin/masters/:id/schedule", async (c) => {
    const body = (await c.req.json()) as { days?: Array<{ weekday: number; startMin: number; endMin: number }> };
    await deps.salon.replaceSchedule(c.req.param("id"), body.days ?? []);
    return c.json({ ok: true });
  });

  app.post("/api/salon/admin/prices", async (c) => {
    const body = (await c.req.json()) as {
      serviceId?: string;
      branchId?: string;
      level?: string;
      priceRub?: number;
      durationMinutes?: number;
      priceFrom?: boolean;
    };
    const level = asLevel(body.level);
    if (!body.serviceId || !body.branchId || !level || !body.priceRub || !body.durationMinutes) {
      return c.json({ message: "Не хватает полей цены" }, 400);
    }
    return c.json(
      await deps.salon.updatePrice({
        serviceId: body.serviceId,
        branchId: body.branchId,
        level,
        priceRub: body.priceRub,
        durationMinutes: body.durationMinutes,
        priceFrom: Boolean(body.priceFrom),
      }),
    );
  });

  app.post("/api/salon/admin/broadcast", async (c) => {
    const body = (await c.req.json()) as { segment?: string; text?: string; minBalance?: number; branchId?: string };
    try {
      const result = await deps.salon.broadcast({
        segment: body.segment ?? "all",
        text: body.text ?? "",
        minBalance: body.minBalance,
        branchId: body.branchId,
      });
      for (const delivery of result.deliveries) {
        await deps.notifier.send(delivery.channel, delivery.externalId, { text: delivery.text });
      }
      return c.json({ recipients: result.recipients });
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.get("/api/salon/admin/notices", async (c) => c.json(await deps.salon.notices()));

  app.get("/api/salon/admin/settings", async (c) => c.json(await deps.store.getSettings()));

  app.patch("/api/salon/admin/settings", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    try {
      const patch: Record<string, unknown> = {};
      if (body.percent !== undefined) patch.percent = Number(body.percent);
      if (body.haircutNudgeWeeks !== undefined) patch.haircutNudgeWeeks = Number(body.haircutNudgeWeeks);
      if (body.birthdayBonus !== undefined) patch.birthdayBonus = Number(body.birthdayBonus);
      if (body.referralBonusReferrer !== undefined) patch.referralBonusReferrer = Number(body.referralBonusReferrer);
      if (body.referralBonusReferee !== undefined) patch.referralBonusReferee = Number(body.referralBonusReferee);
      if (body.venueTimezone !== undefined) patch.venueTimezone = String(body.venueTimezone);
      if (Array.isArray(body.reminderLeadHours)) patch.reminderLeadHours = body.reminderLeadHours.map((value) => Number(value));
      const settings = await patchAdminSettings(deps.store, patch as Partial<Settings>);
      return c.json(settings);
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/salon/admin/appointments/:id/cancel", async (c) => {
    try {
      const cancelled = await deps.salon.cancel(c.req.param("id"), c.req.param("id"), true);
      await deps.onNotice?.(cancelled.notice);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.get("/", async (c) => {
    const html = await readFile("site/index.html", "utf8");
    return c.html(html);
  });
  app.use("/brand/*", serveStatic({ root: "./site" }));
  app.use("/site/*", serveStatic({ root: "." }));
  return app;
};
