import { Hono } from "hono";
import { broadcastSegmentLabel, previewSegmentCount } from "../domain/broadcast.ts";
import { exportCsv, type ExportType } from "../domain/export.ts";
import { buildStaffGuestCard } from "../domain/guest-card.ts";
import { listRejectedSessions } from "../domain/games.ts";
import { searchGuestsByName } from "../domain/guest-search.ts";
import { promoRuleKindLabelRu } from "../domain/promo-rules.ts";
import { getLiveQuiz } from "../domain/quiz.ts";
import { getStatsSummary, periodLastDays, periodToday } from "../domain/stats.ts";
import { extendActiveVisit } from "../domain/visits.ts";
import { DomainError } from "../domain/errors.ts";
import type { BroadcastSegmentId, Role, Settings } from "../domain/types.ts";
import type { Store } from "../store/types.ts";
import { resolveActor } from "./auth.ts";

type CreateAdminRoutesParameters = {
  readonly store: Store;
  readonly botToken: string;
};

const isAdmin = (role: Role) => role === "admin";
const isStaff = (role: Role) => role === "master" || role === "admin";

const readInitData = (headerValue: string | undefined) => {
  if (headerValue !== undefined && headerValue.length > 0) {
    return headerValue;
  }
  throw new DomainError("bad_init_data", "Нет initData");
};

const requireAdmin = async (store: Store, initData: string, botToken: string) => {
  const { user } = await resolveActor(store, initData, botToken);
  if (user === undefined || !isAdmin(user.role)) {
    throw new DomainError("forbidden", "Только для админа");
  }
  return user;
};

const requireStaff = async (store: Store, initData: string, botToken: string) => {
  const { user } = await resolveActor(store, initData, botToken);
  if (user === undefined || !isStaff(user.role)) {
    throw new DomainError("forbidden", "Недостаточно прав");
  }
  return user;
};

const parseDate = (value: string | undefined, fallback: Date) => {
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError("bad_request", "Некорректная дата");
  }
  return parsed;
};

const isExportType = (value: string): value is ExportType => {
  return (
    value === "ledger" ||
    value === "visits" ||
    value === "checkins" ||
    value === "coupons" ||
    value === "staff_log"
  );
};

const BROADCAST_SEGMENTS: BroadcastSegmentId[] = [
  "all",
  "inactive_30d",
  "active_7d",
  "balance_gt",
  "has_coupon",
  "birthday_week",
  "referrers",
  "weekly_top",
];

const settingsToJson = (settings: Settings) => ({
  percent: settings.percent,
  registrationBonus: settings.registrationBonus,
  birthdayBonus: settings.birthdayBonus,
  visitHours: settings.visitHours,
  winnersCount: settings.winnersCount,
  checkBonusTtlDays: settings.checkBonusTtlDays,
  giftBonusTtlDays: settings.giftBonusTtlDays,
  couponClaimDays: settings.couponClaimDays,
  expireNotifyMinBonuses: settings.expireNotifyMinBonuses,
  checkInNotifyEnabled: settings.checkInNotifyEnabled,
  referralBonusReferrer: settings.referralBonusReferrer,
  referralBonusReferee: settings.referralBonusReferee,
  referralActivationDays: settings.referralActivationDays,
  referralEnabled: settings.referralEnabled,
  birthdayNotifyDaysBefore: settings.birthdayNotifyDaysBefore,
  birthdayCouponTitle: settings.birthdayCouponTitle,
  birthdayCouponClaimDays: settings.birthdayCouponClaimDays,
  maxSessionsPerHour: settings.maxSessionsPerHour,
});

export const createAdminRoutes = ({ store, botToken }: CreateAdminRoutesParameters) => {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      const status = err.code === "forbidden" ? 403 : 400;
      return c.json({ code: err.code, message: err.message }, status);
    }
    const message = err instanceof Error ? err.message : "Ошибка";
    return c.json({ code: "internal", message }, 500);
  });

  app.get("/api/admin/stats/summary", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodToday(now).from);
    const to = parseDate(c.req.query("to"), now);
    const summary = await getStatsSummary(store, { from, to }, now);
    return c.json(summary);
  });

  app.get("/api/admin/staff-log", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodLastDays(now, 7).from);
    const to = parseDate(c.req.query("to"), now);
    const limit = Number(c.req.query("limit") ?? "20");
    const offset = Number(c.req.query("offset") ?? "0");
    const actorId = c.req.query("actorId") ?? undefined;
    const rows = await store.listStaffActionLog({ from, to, actorId, limit, offset });
    return c.json({ rows });
  });

  app.get("/api/admin/export", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const typeRaw = c.req.query("type") ?? "ledger";
    if (!isExportType(typeRaw)) {
      throw new DomainError("bad_request", "Неизвестный тип экспорта");
    }
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodLastDays(now, 7).from);
    const to = parseDate(c.req.query("to"), now);
    const csv = await exportCsv(store, { type: typeRaw, from, to });
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${typeRaw}.csv"`);
    return c.body(csv);
  });

  app.get("/api/admin/guest/:id/ledger", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const guest = await store.findUserById(c.req.param("id"));
    if (guest === null) {
      throw new DomainError("not_found", "Гость не найден");
    }
    const rows = await store.listLedger(guest.id);
    return c.json({
      rows: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        comment: row.comment,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.get("/api/admin/game-sessions/rejected", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const limit = Number(c.req.query("limit") ?? "20");
    const rows = await listRejectedSessions(store, limit);
    return c.json({
      rows: rows.map((row) => ({
        slug: row.slug,
        points: row.points,
        rejectReason: row.rejectReason,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.get("/api/admin/broadcast/segments", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const balanceMin = Number(c.req.query("balanceMin") ?? "500");
    const weeklyTopPlace = Number(c.req.query("weeklyTopPlace") ?? "3");
    const segments = await Promise.all(
      BROADCAST_SEGMENTS.map(async (segment) => {
        const params =
          segment === "balance_gt"
            ? { balanceMin }
            : segment === "weekly_top"
              ? { weeklyTopPlace }
              : undefined;
        const count = await previewSegmentCount(store, { segment, params, now });
        return {
          id: segment,
          label: broadcastSegmentLabel(segment),
          count,
        };
      }),
    );
    return c.json({ segments });
  });

  app.get("/api/admin/settings", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const settings = await store.getSettings();
    return c.json({ settings: settingsToJson(settings) });
  });

  app.get("/api/admin/promo-rules", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const rows = await store.listActivePromoRules(now);
    return c.json({
      rows: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: promoRuleKindLabelRu(row.kind),
        params: row.params,
        priority: row.priority,
        validFrom: row.validFrom?.toISOString() ?? null,
        validUntil: row.validUntil?.toISOString() ?? null,
      })),
    });
  });

  app.get("/api/admin/quiz/live", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const live = await getLiveQuiz(store, new Date());
    if (live === null) {
      return c.json({ live: null });
    }
    return c.json({
      live: {
        sessionId: live.session.id,
        status: live.session.status,
        startedAt: live.session.startedAt.toISOString(),
        endsAt: live.session.endsAt.toISOString(),
        questionCount: live.questions.length,
      },
    });
  });

  app.get("/api/cashier/search", async (c) => {
    await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const q = c.req.query("q") ?? "";
    const now = new Date();
    const guests = await searchGuestsByName(store, { query: q, now });
    return c.json({ guests });
  });

  app.get("/api/cashier/guest/:id", async (c) => {
    await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const guest = await store.findUserById(c.req.param("id"));
    if (guest === null) {
      throw new DomainError("not_found", "Гость не найден");
    }
    const card = await buildStaffGuestCard(store, guest, new Date());
    return c.json(card);
  });

  app.post("/api/cashier/extend-visit", async (c) => {
    const staff = await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body: unknown = await c.req.json();
    const guestId =
      typeof body === "object" && body !== null && "guestId" in body && typeof body.guestId === "string"
        ? body.guestId
        : null;
    if (guestId === null) {
      throw new DomainError("bad_request", "Нужен guestId");
    }
    const visit = await extendActiveVisit(store, {
      guestId,
      actorId: staff.id,
      now: new Date(),
    });
    const guest = await store.findUserById(guestId);
    if (guest === null) {
      throw new DomainError("not_found", "Гость не найден");
    }
    const card = await buildStaffGuestCard(store, guest, new Date());
    return c.json({ endsAt: visit.endsAt.toISOString(), card });
  });

  app.post("/api/cashier/staff-note", async (c) => {
    const staff = await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body: unknown = await c.req.json();
    if (typeof body !== "object" || body === null) {
      throw new DomainError("bad_request", "Некорректное тело");
    }
    const guestId = "guestId" in body && typeof body.guestId === "string" ? body.guestId : null;
    const note = "note" in body && typeof body.note === "string" ? body.note.trim() : null;
    if (guestId === null || note === null) {
      throw new DomainError("bad_request", "Нужны guestId и note");
    }
    if (note.length > 500) {
      throw new DomainError("bad_request", "Заметка не длиннее 500 символов");
    }
    const guest = await store.updateUser(guestId, { staffNote: note.length === 0 ? null : note });
    const card = await buildStaffGuestCard(store, guest, new Date());
    return c.json({ card });
  });

  return app;
};
