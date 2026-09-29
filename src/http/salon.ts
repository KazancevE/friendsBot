import { readFile } from "node:fs/promises";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { DomainError } from "../domain/errors.ts";
import { patchAdminSettings } from "../domain/settings.ts";
import type { Settings } from "../domain/types.ts";
import type { Store } from "../store/types.ts";
import type { BarberLevelName } from "../salon/catalog.ts";
import { IMPORT_FIELD_LABEL, IMPORT_FIELDS, parseSpreadsheet, readSampleImportCsv } from "../salon/import.ts";
import { DEMO_GUEST_TELEGRAM_ID, SalonService } from "../salon/service.ts";
import { issueAdminCookie, issueGuestToken, readAdminCookie, readGuestToken, type AdminCookie } from "../salon/session.ts";
import type { Notifier } from "../salon/outbound.ts";
import { canDo, canDeleteAccount, scopedBranch } from "../prod/access.ts";
import { authenticateAdmin, type StoredAdmin } from "../prod/admin-auth.ts";
import { consentPageHtml, operatorFromEnv, privacyPolicyHtml } from "../prod/policy-page.ts";
import { hashPassword, passwordAccepted } from "../prod/passwords.ts";
import { clientIp, loginAttempt } from "../prod/rate-limit.ts";

export type AdminDirectory = {
  list(): Promise<StoredAdmin[]>;
  create(input: { login: string; passwordHash: string; role: StoredAdmin["role"]; branchId: string | null }): Promise<StoredAdmin>;
  setPassword(login: string, passwordHash: string): Promise<void>;
  remove(login: string): Promise<void>;
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
  admins: AdminDirectory;
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

  const adminActor = (cookie: string | undefined) => readAdminCookie(deps.sessionSecret, cookie);

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
    const ip = clientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
    const gate = loginAttempt(ip, false);
    if (!gate.allowed) {
      return c.json({ message: "Слишком много попыток. Подождите 15 минут." }, 429);
    }
    const body = (await c.req.json()) as { login?: string; password?: string };
    const accounts = await deps.admins.list();
    const actor = body.login && body.password ? authenticateAdmin(accounts, deps.adminLogin, deps.adminPassword, body.login, body.password) : null;
    if (!actor) {
      return c.json({ message: "Неверный логин или пароль" }, 401);
    }
    loginAttempt(ip, true);
    const cookie = issueAdminCookie(deps.sessionSecret, actor, 60 * 60 * 24 * 12);
    setCookie(c, "salon_admin", cookie, { httpOnly: true, path: "/", sameSite: "Lax", maxAge: 60 * 60 * 24 * 12 });
    return c.json({ ok: true, role: actor.role });
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
    const actor = adminActor(getCookie(c, "salon_admin"));
    if (!actor) {
      return c.json({ message: "Нужен вход" }, 401);
    }
    const write = c.req.method !== "GET" && c.req.method !== "HEAD";
    const ownPassword = c.req.path.endsWith("/password") || c.req.path.endsWith("/logout");
    if (write && !ownPassword && !canDo(actor, "write")) {
      return c.json({ message: "Только просмотр" }, 403);
    }
    c.set("admin", actor);
    await next();
  });

  const actorFrom = (c: { get: (key: string) => unknown }) => c.get("admin") as AdminCookie;

  const ownerOnly = (c: { get: (key: string) => unknown }) => {
    if (!canDo(actorFrom(c), "network")) {
      return false;
    }
    return true;
  };

  app.get("/api/salon/admin/session", (c) => {
    const actor = actorFrom(c);
    return c.json({ ok: true, login: actor.login, role: actor.role, branchId: actor.branchId });
  });

  app.get("/api/salon/admin/calendar", async (c) => {
    const scope = scopedBranch(actorFrom(c), c.req.query("branchId"));
    if ("error" in scope) {
      return c.json({ message: scope.error }, 403);
    }
    const from = new Date(c.req.query("from") ?? Date.now());
    const to = new Date(c.req.query("to") ?? Date.now() + 7 * 24 * 60 * 60 * 1000);
    return c.json(await deps.salon.calendar({ branchId: scope.branchId, from, to }));
  });

  app.get("/api/salon/admin/clients", async (c) => {
    const scope = scopedBranch(actorFrom(c), c.req.query("branchId"));
    if ("error" in scope) {
      return c.json({ message: scope.error }, 403);
    }
    return c.json(await deps.salon.clients({ query: c.req.query("q"), branchId: scope.branchId }));
  });

  app.post("/api/salon/admin/clients/:id/check", async (c) => {
    const body = (await c.req.json()) as { checkRubles?: number; branchId?: string };
    const scope = scopedBranch(actorFrom(c), body.branchId);
    if ("error" in scope) {
      return c.json({ message: scope.error }, 403);
    }
    if (!body.checkRubles || body.checkRubles <= 0) {
      return c.json({ message: "Сумма чека больше нуля" }, 400);
    }
    try {
      return c.json(await deps.salon.accrue({ guestId: c.req.param("id"), checkRubles: body.checkRubles, branchId: scope.branchId }));
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/salon/admin/clients/:id/redeem", async (c) => {
    const actor = actorFrom(c);
    if (actor.role === "branch_admin") {
      const branches = await deps.salon.clientBranchIds(c.req.param("id"));
      if (!actor.branchId || !branches.includes(actor.branchId)) {
        return c.json({ message: "Клиент не из вашего филиала" }, 403);
      }
    }
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
    if (!ownerOnly(c)) return c.json({ message: "Это действие доступно владельцу сети" }, 403);
    const body = (await c.req.json()) as { name?: string; level?: string; branchId?: string };
    const level = asLevel(body.level);
    if (!body.name || !body.branchId || !level) {
      return c.json({ message: "Имя, филиал и уровень" }, 400);
    }
    return c.json(await deps.salon.createBarber({ name: body.name, level, branchId: body.branchId }));
  });

  app.put("/api/salon/admin/masters/:id/schedule", async (c) => {
    if (!ownerOnly(c)) return c.json({ message: "Это действие доступно владельцу сети" }, 403);
    const body = (await c.req.json()) as { days?: Array<{ weekday: number; startMin: number; endMin: number }> };
    await deps.salon.replaceSchedule(c.req.param("id"), body.days ?? []);
    return c.json({ ok: true });
  });

  app.post("/api/salon/admin/prices", async (c) => {
    if (!ownerOnly(c)) return c.json({ message: "Это действие доступно владельцу сети" }, 403);
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
    const scope = scopedBranch(actorFrom(c), body.branchId);
    if ("error" in scope) {
      return c.json({ message: scope.error }, 403);
    }
    try {
      const result = await deps.salon.broadcast({
        segment: body.segment ?? "all",
        text: body.text ?? "",
        minBalance: body.minBalance,
        branchId: scope.branchId,
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

  const readImportBody = async (c: { req: { json: () => Promise<unknown> } }) => {
    const body = (await c.req.json()) as {
      filename?: string;
      contentBase64?: string;
      mapping?: Record<string, number | null>;
    };
    if (!body.filename || !body.contentBase64) {
      return { error: "Нужен файл" as const };
    }
    const bytes = Buffer.from(body.contentBase64, "base64");
    if (bytes.length === 0 || bytes.length > 5_000_000) {
      return { error: "Файл пустой или больше 5 МБ" as const };
    }
    const table = parseSpreadsheet({ filename: body.filename, bytes });
    if (table.length < 2) {
      return { error: "В файле нет строк клиентов" as const };
    }
    if (table.length > 10_001) {
      return { error: "Не больше 10 000 строк" as const };
    }
    return { filename: body.filename, table, mapping: body.mapping ?? null };
  };

  app.get("/api/salon/admin/import/sample", (c) => {
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", "attachment; filename=\"dikidi-clients-sample.csv\"");
    return c.body(readSampleImportCsv());
  });

  app.post("/api/salon/admin/import/preview", async (c) => {
    if (!ownerOnly(c)) return c.json({ message: "Это действие доступно владельцу сети" }, 403);
    const parsed = await readImportBody(c);
    if ("error" in parsed) {
      return c.json({ message: parsed.error }, 400);
    }
    const plan = await deps.salon.planImport({ table: parsed.table, mapping: parsed.mapping });
    const warnings = plan.rows.reduce((sum, row) => sum + row.warnings.length, 0);
    return c.json({
      headers: plan.headers,
      mapping: plan.mapping,
      fields: IMPORT_FIELDS.map((id) => ({ id, label: IMPORT_FIELD_LABEL[id], column: plan.mapping[id] })),
      counts: {
        create: plan.rows.filter((row) => row.action === "create").length,
        update: plan.rows.filter((row) => row.action === "update").length,
        error: plan.rows.filter((row) => row.action === "error").length,
        warnings,
      },
      rows: plan.rows.map((row) => ({
        line: row.line,
        action: row.action,
        phone: row.phone,
        name: [row.name, row.lastName].filter(Boolean).join(" "),
        birthday: row.birthday ? row.birthday.toISOString().slice(0, 10) : null,
        lastVisit: row.lastVisit ? row.lastVisit.toISOString() : null,
        booking: row.booking ? row.booking.at.toISOString() : null,
        errors: row.errors,
        warnings: row.warnings,
      })),
      messagesSent: 0,
    });
  });

  app.post("/api/salon/admin/import/commit", async (c) => {
    if (!ownerOnly(c)) return c.json({ message: "Это действие доступно владельцу сети" }, 403);
    const parsed = await readImportBody(c);
    if ("error" in parsed) {
      return c.json({ message: parsed.error }, 400);
    }
    const plan = await deps.salon.planImport({ table: parsed.table, mapping: parsed.mapping });
    const report = await deps.salon.applyImport(plan.rows);
    return c.json(report);
  });

  app.get("/api/salon/admin/settings", async (c) => c.json(await deps.store.getSettings()));

  app.patch("/api/salon/admin/settings", async (c) => {
    if (!ownerOnly(c)) return c.json({ message: "Это действие доступно владельцу сети" }, 403);
    const body = (await c.req.json()) as Record<string, unknown>;
    try {
      const patch: Record<string, unknown> = {};
      if (body.percent !== undefined) patch.percent = Number(body.percent);
      if (body.haircutNudgeWeeks !== undefined) patch.haircutNudgeWeeks = Number(body.haircutNudgeWeeks);
      if (body.birthdayBonus !== undefined) patch.birthdayBonus = Number(body.birthdayBonus);
      if (body.referralBonusReferrer !== undefined) patch.referralBonusReferrer = Number(body.referralBonusReferrer);
      if (body.referralBonusReferee !== undefined) patch.referralBonusReferee = Number(body.referralBonusReferee);
      if (body.venueTimezone !== undefined) patch.venueTimezone = String(body.venueTimezone);
      if (body.importWelcomeBonus !== undefined) patch.importWelcomeBonus = Number(body.importWelcomeBonus);
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

  app.post("/api/salon/admin/password", async (c) => {
    const actor = actorFrom(c);
    const body = (await c.req.json()) as { current?: string; next?: string };
    if (!body.current || !body.next || !passwordAccepted(body.next)) {
      return c.json({ message: "Новый пароль не короче 10 символов" }, 400);
    }
    const accounts = await deps.admins.list();
    const matched = authenticateAdmin(accounts, deps.adminLogin, deps.adminPassword, actor.login, body.current);
    if (!matched) {
      return c.json({ message: "Текущий пароль не подошёл" }, 401);
    }
    const passwordHash = hashPassword(body.next);
    if (accounts.some((row) => row.login === actor.login)) {
      await deps.admins.setPassword(actor.login, passwordHash);
    } else {
      await deps.admins.create({ login: actor.login, passwordHash, role: actor.role, branchId: actor.branchId });
    }
    return c.json({ ok: true });
  });

  app.get("/api/salon/admin/accounts", async (c) => {
    if (!canDo(actorFrom(c), "accounts")) {
      return c.json({ message: "Управлять учётками может только владелец" }, 403);
    }
    const rows = await deps.admins.list();
    return c.json(rows.map((row) => ({ login: row.login, role: row.role, branchId: row.branchId })));
  });

  app.post("/api/salon/admin/accounts", async (c) => {
    const actor = actorFrom(c);
    if (!canDo(actor, "accounts")) {
      return c.json({ message: "Управлять учётками может только владелец" }, 403);
    }
    const body = (await c.req.json()) as { login?: string; password?: string; role?: StoredAdmin["role"]; branchId?: string | null };
    if (!body.login || !body.password || !passwordAccepted(body.password)) {
      return c.json({ message: "Нужны логин и пароль не короче 10 символов" }, 400);
    }
    if (body.role !== "owner" && body.role !== "branch_admin" && body.role !== "master") {
      return c.json({ message: "Роль: owner, branch_admin или master" }, 400);
    }
    if (body.role !== "owner" && !body.branchId) {
      return c.json({ message: "Для этой роли нужен филиал" }, 400);
    }
    const accounts = await deps.admins.list();
    if (accounts.some((row) => row.login === body.login)) {
      return c.json({ message: "Такой логин уже есть" }, 400);
    }
    await deps.admins.create({
      login: body.login,
      passwordHash: hashPassword(body.password),
      role: body.role,
      branchId: body.role === "owner" ? null : (body.branchId ?? null),
    });
    return c.json({ ok: true });
  });

  app.delete("/api/salon/admin/accounts/:login", async (c) => {
    const actor = actorFrom(c);
    const accounts = await deps.admins.list();
    const target = accounts.find((row) => row.login === c.req.param("login"));
    if (!target) {
      return c.json({ message: "Учётка не найдена" }, 404);
    }
    const reason = canDeleteAccount(actor, target, accounts.filter((row) => row.role === "owner").length);
    if (reason) {
      return c.json({ message: reason }, 403);
    }
    await deps.admins.remove(target.login);
    return c.json({ ok: true });
  });

  const clientAllowed = async (actor: AdminCookie, userId: string) => {
    if (!canDo(actor, "privacy")) {
      return "Только просмотр";
    }
    if (actor.role === "branch_admin") {
      const branches = await deps.salon.clientBranchIds(userId);
      if (!actor.branchId || !branches.includes(actor.branchId)) {
        return "Клиент не из вашего филиала";
      }
    }
    return null;
  };

  app.get("/api/salon/admin/clients/:id/export", async (c) => {
    const reason = await clientAllowed(actorFrom(c), c.req.param("id"));
    if (reason) {
      return c.json({ message: reason }, 403);
    }
    try {
      const data = await deps.salon.exportClient(c.req.param("id"));
      c.header("content-disposition", `attachment; filename="client-${c.req.param("id")}.json"`);
      return c.json(data);
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 404);
      }
      throw error;
    }
  });

  app.post("/api/salon/admin/clients/:id/anonymize", async (c) => {
    const reason = await clientAllowed(actorFrom(c), c.req.param("id"));
    if (reason) {
      return c.json({ message: reason }, 403);
    }
    try {
      return c.json(await deps.salon.anonymizeClient(c.req.param("id")));
    } catch (error) {
      if (error instanceof DomainError) {
        return c.json({ message: error.message }, 404);
      }
      throw error;
    }
  });

  app.get("/privacy", (c) => c.html(privacyPolicyHtml(operatorFromEnv())));
  app.get("/consent", (c) => c.html(consentPageHtml(operatorFromEnv())));

  app.get("/", async (c) => {
    const html = await readFile("site/index.html", "utf8");
    return c.html(html);
  });
  app.use("/brand/*", serveStatic({ root: "./site" }));
  app.use("/site/*", serveStatic({ root: "." }));
  return app;
};
