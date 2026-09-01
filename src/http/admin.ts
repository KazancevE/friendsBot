import { Hono } from "hono";
import type { Api } from "grammy";
import { broadcastSegmentLabel, previewSegmentCount, runBroadcast } from "../domain/broadcast.ts";
import { addMenuItem } from "../domain/content.ts";
import { exportCsv, exportRowCount, EXPORT_ROW_LIMIT, type ExportType } from "../domain/export.ts";
import { consumeExportToken, createExportToken } from "../domain/export-token.ts";
import { buildStaffGuestCard } from "../domain/guest-card.ts";
import { listRejectedSessions } from "../domain/games.ts";
import { searchGuests } from "../domain/guest-search.ts";
import { parseContactEntries, serializeContactEntries } from "../domain/contacts.ts";
import { promoRuleKindLabelRu } from "../domain/promo-rules.ts";
import { addQuizQuestion, getLiveQuiz, notifyActiveGuestsOfQuiz, removeQuizQuestion, startQuizSession } from "../domain/quiz.ts";
import { patchAdminSettings } from "../domain/settings.ts";
import { listGuestsPage } from "../domain/guest-list.ts";
import { getGuestVisitPattern } from "../domain/visit-pattern.ts";
import { getStatsSummary, getStatsHeatmap, getStatsStaff, getStatsTimeseries, periodLastDays, periodToday } from "../domain/stats.ts";
import { assignRole } from "../domain/roles.ts";
import { addMenuGalleryImage, isGalleryMenuItem, removeMenuGalleryImage, reorderMenuGallery, saveMenuUpload } from "../domain/menu-gallery.ts";
import {
  saveAssetUpload,
  themeAssetFolder,
  themeAssetMaxBytes,
  type ThemeAssetKind,
} from "../domain/asset-upload.ts";
import {
  deleteGameSkin,
  listGameSkins,
  patchGameSkin,
  upsertGameSkinTile,
} from "../domain/game-skin.ts";
import {
  deleteThemePack,
  listThemePacks,
  removeThemeInterior,
  setActiveThemeId,
  updateThemeAsset,
  upsertThemePack,
} from "../domain/theme.ts";
import { handleBookingRequest, formatBookingSlot, assignTableToBooking, moveBookingTable, swapBookingTables, markBookingSeated } from "../domain/booking.ts";
import { getActiveFloorPlanView, saveFloorPlan, saveVenueTable, removeVenueTable, saveFloorElement, removeFloorElement } from "../domain/floor-plan.ts";
import { venueDayRangeFor } from "../domain/booking-slots.ts";
import { savePage } from "../domain/content.ts";
import { ensureActiveVenueCode, venueQrPayload } from "../domain/venue-code.ts";
import { replaceStaffWeeklySchedule } from "../domain/staff-schedule.ts";
import {
  fillStaffShiftsFromTemplate,
  listStaffShiftsView,
  removeStaffShift,
  replaceStaffShiftsForDay,
  upsertStaffShift,
} from "../domain/staff-shifts.ts";
import { parseVenueDay, toStoreCalendarDate } from "../domain/venue-time.ts";
import { extendActiveVisit } from "../domain/visits.ts";
import { DomainError } from "../domain/errors.ts";
import type { BroadcastSegmentId, GuestListFilter, GuestListSort, Role, Settings } from "../domain/types.ts";
import type { Store } from "../store/types.ts";
import { resolveActor } from "./auth.ts";

type CreateAdminRoutesParameters = {
  readonly store: Store;
  readonly botToken: string;
  readonly botApi?: Api;
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
  bookingHoursStart: settings.bookingHoursStart,
  bookingHoursEnd: settings.bookingHoursEnd,
  bookingSlotMinutes: settings.bookingSlotMinutes,
  bookingClosedWeekdays: settings.bookingClosedWeekdays,
  bookingDurationMinutes: settings.bookingDurationMinutes,
  venueTimezone: settings.venueTimezone,
});

const isBroadcastSegment = (value: string): value is BroadcastSegmentId => {
  return (BROADCAST_SEGMENTS as readonly string[]).includes(value);
};

const readJsonBody = async (c: { req: { json(): Promise<unknown> } }) => {
  const body: unknown = await c.req.json();
  if (typeof body !== "object" || body === null) {
    throw new DomainError("bad_request", "Некорректное тело");
  }
  return body;
};

export const createAdminRoutes = ({ store, botToken, botApi }: CreateAdminRoutesParameters) => {
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

  app.get("/api/admin/stats/summary", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodToday(now).from);
    const to = parseDate(c.req.query("to"), now);
    const summary = await getStatsSummary(store, { from, to }, now);
    return c.json(summary);
  });

  app.get("/api/admin/stats/timeseries", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodLastDays(now, 7).from);
    const to = parseDate(c.req.query("to"), now);
    const metricRaw = c.req.query("metric") ?? "visits";
    const granularityRaw = c.req.query("granularity") ?? "day";
    const allowedMetrics = new Set([
      "visits",
      "bonuses",
      "checkins",
      "registrations",
      "gameSessions",
      "uniqueGuests",
    ]);
    if (!allowedMetrics.has(metricRaw)) {
      throw new DomainError("bad_request", "Неизвестная метрика");
    }
    if (granularityRaw !== "day" && granularityRaw !== "week" && granularityRaw !== "month") {
      throw new DomainError("bad_request", "Неизвестная гранулярность");
    }
    const series = await getStatsTimeseries(store, {
      period: { from, to },
      metric: metricRaw as
        | "visits"
        | "bonuses"
        | "checkins"
        | "registrations"
        | "gameSessions"
        | "uniqueGuests",
      granularity: granularityRaw,
    });
    return c.json(series);
  });

  app.get("/api/admin/stats/heatmap", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodLastDays(now, 30).from);
    const to = parseDate(c.req.query("to"), now);
    const sourceRaw = c.req.query("source") ?? "visits";
    if (sourceRaw !== "visits" && sourceRaw !== "checkins") {
      throw new DomainError("bad_request", "Неизвестный источник");
    }
    const heatmap = await getStatsHeatmap(store, {
      period: { from, to },
      source: sourceRaw,
    });
    return c.json({
      source: heatmap.source,
      period: { from: heatmap.period.from.toISOString(), to: heatmap.period.to.toISOString() },
      cells: heatmap.cells,
      peak: heatmap.peak,
      total: heatmap.total,
    });
  });

  app.get("/api/admin/stats/staff", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodLastDays(now, 7).from);
    const to = parseDate(c.req.query("to"), now);
    const staff = await getStatsStaff(store, { from, to });
    return c.json(staff);
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
    return c.json({
      rows: rows.map((row) => ({
        id: row.id,
        action: row.action,
        actorId: row.actorId,
        guestId: row.guestId,
        guestFirstName: row.guestFirstName ?? null,
        guestLastName: row.guestLastName ?? null,
        guestTelegramId: row.guestTelegramId ?? null,
        guestTelegramUsername: row.guestTelegramUsername ?? null,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
      })),
    });
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
    const count = await exportRowCount(store, { type: typeRaw, from, to });
    if (count > EXPORT_ROW_LIMIT) {
      const token = createExportToken({ type: typeRaw, from, to, now });
      return c.json({
        tooLarge: true,
        rowCount: count,
        downloadUrl: `/api/admin/export.csv?token=${token}`,
      });
    }
    const csv = await exportCsv(store, { type: typeRaw, from, to });
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${typeRaw}.csv"`);
    return c.body(csv);
  });

  app.get("/api/admin/export.csv", async (c) => {
    const token = c.req.query("token") ?? "";
    const payload = consumeExportToken(token, new Date());
    if (payload === null) {
      throw new DomainError("not_found", "Ссылка недействительна или истекла");
    }
    const csv = await exportCsv(store, { type: payload.type, from: payload.from, to: payload.to });
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${payload.type}.csv"`);
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

  app.post("/api/admin/broadcast/preview", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const segmentRaw = "segment" in body && typeof body.segment === "string" ? body.segment : null;
    if (segmentRaw === null || !isBroadcastSegment(segmentRaw)) {
      throw new DomainError("bad_request", "Неизвестный сегмент");
    }
    const params =
      "params" in body && typeof body.params === "object" && body.params !== null
        ? (body.params as { balanceMin?: number; weeklyTopPlace?: number })
        : undefined;
    const count = await previewSegmentCount(store, { segment: segmentRaw, params, now: new Date() });
    return c.json({ count });
  });

  app.post("/api/admin/broadcast/send", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    if (botApi === undefined) {
      throw new DomainError("unavailable", "Bot API недоступен");
    }
    const body = await readJsonBody(c);
    const segmentRaw = "segment" in body && typeof body.segment === "string" ? body.segment : null;
    const text = "body" in body && typeof body.body === "string" ? body.body : null;
    if (segmentRaw === null || !isBroadcastSegment(segmentRaw) || text === null) {
      throw new DomainError("bad_request", "Нужны segment и body");
    }
    const params =
      "params" in body && typeof body.params === "object" && body.params !== null
        ? (body.params as { balanceMin?: number; weeklyTopPlace?: number })
        : undefined;
    const showInFeed = "showInFeed" in body && body.showInFeed === true;
    const photoId = "photoId" in body && typeof body.photoId === "string" ? body.photoId : undefined;
    const sendNow = !("sendNow" in body && body.sendNow === false);
    const result = await runBroadcast(store, {
      api: botApi,
      segment: segmentRaw,
      params,
      body: text,
      showInFeed,
      photoId,
      sendNow,
      now: new Date(),
    });
    return c.json(result);
  });

  app.get("/api/admin/broadcasts", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
    const rows = await store.listPromos(limit);
    return c.json({
      rows: rows.map((row) => ({
        promoId: row.id,
        body: row.body.length > 120 ? `${row.body.slice(0, 117)}...` : row.body,
        createdAt: row.createdAt.toISOString(),
        showInFeed: row.showInFeed,
        segment: row.broadcastSegment,
        recipients: row.broadcastRecipients,
        sent: row.broadcastSent,
        failed: row.broadcastFailed,
      })),
    });
  });

  app.get("/api/admin/guests", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const limit = Number(c.req.query("limit") ?? "50");
    const offset = Number(c.req.query("offset") ?? "0");
    const sortRaw = c.req.query("sort") ?? "lastVisitAt";
    const orderRaw = c.req.query("order") ?? "desc";
    const filterRaw = c.req.query("filter");
    const allowedSort = new Set(["lastVisitAt", "createdAt", "balance", "totalVisits"]);
    const allowedFilter = new Set(["in_venue", "inactive_30d", "opt_out", "has_coupon"]);
    if (!allowedSort.has(sortRaw)) {
      throw new DomainError("bad_request", "Неизвестная сортировка");
    }
    if (orderRaw !== "asc" && orderRaw !== "desc") {
      throw new DomainError("bad_request", "Порядок: asc или desc");
    }
    if (filterRaw !== undefined && filterRaw.length > 0 && !allowedFilter.has(filterRaw)) {
      throw new DomainError("bad_request", "Неизвестный фильтр");
    }
    const page = await listGuestsPage(store, {
      limit,
      offset,
      sort: sortRaw as GuestListSort,
      order: orderRaw,
      filter: filterRaw === undefined || filterRaw.length === 0 ? undefined : (filterRaw as GuestListFilter),
      now: new Date(),
    });
    return c.json(page);
  });

  app.get("/api/admin/guest/:id/visit-pattern", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const guest = await store.findUserById(c.req.param("id"));
    if (guest === null || guest.role !== "guest") {
      throw new DomainError("not_found", "Гость не найден");
    }
    const pattern = await getGuestVisitPattern(store, guest.id, new Date());
    return c.json(pattern);
  });

  app.post("/api/admin/guest/:id/message", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    if (botApi === undefined) {
      throw new DomainError("unavailable", "Bot API недоступен");
    }
    const guest = await store.findUserById(c.req.param("id"));
    if (guest === null || guest.role !== "guest") {
      throw new DomainError("not_found", "Гость не найден");
    }
    const body = await readJsonBody(c);
    const text = "body" in body && typeof body.body === "string" ? body.body.trim() : "";
    if (text.length === 0) {
      throw new DomainError("bad_request", "Текст сообщения не должен быть пустым");
    }
    try {
      await botApi.sendMessage(guest.telegramId.toString(), text);
    } catch {
      throw new DomainError("unavailable", "Не удалось отправить сообщение");
    }
    await store.createStaffActionLog({
      actorId: admin.id,
      guestId: guest.id,
      action: "guest_message",
      payload: { length: text.length },
    });
    return c.json({ ok: true });
  });

  app.patch("/api/admin/settings", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const patch =
      "patch" in body && typeof body.patch === "object" && body.patch !== null
        ? (body.patch as Partial<Settings>)
        : null;
    if (patch === null) {
      throw new DomainError("bad_request", "Нужен patch");
    }
    const settings = await patchAdminSettings(store, patch);
    return c.json({ settings: settingsToJson(settings) });
  });

  app.get("/api/admin/quiz/questions", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const quiz = await store.findActiveQuiz();
    if (quiz === null) {
      return c.json({ rows: [] });
    }
    const rows = await store.listQuizQuestions(quiz.id);
    return c.json({
      rows: rows.map((row) => ({
        id: row.id,
        sort: row.sort,
        text: row.text,
        imageUrl: row.imageUrl,
        options: row.options,
        correctIndex: row.correctIndex,
      })),
    });
  });

  app.post("/api/admin/quiz/questions", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const quiz = await store.findActiveQuiz();
    if (quiz === null) {
      throw new DomainError("not_found", "Нет активной викторины");
    }
    const body = await readJsonBody(c);
    const text = "text" in body && typeof body.text === "string" ? body.text : "";
    const options = "options" in body && Array.isArray(body.options) ? body.options.map(String) : [];
    const correctIndex = "correctIndex" in body && typeof body.correctIndex === "number" ? body.correctIndex : 0;
    const imageUrl =
      "imageUrl" in body && (typeof body.imageUrl === "string" || body.imageUrl === null) ? body.imageUrl : null;
    const question = await store.createQuizQuestion({
      quizId: quiz.id,
      sort: (await store.listQuizQuestions(quiz.id)).length + 1,
      text,
      imageUrl,
      options,
      correctIndex,
    });
    return c.json({ question });
  });

  app.patch("/api/admin/quiz/questions/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const patch: Partial<{
      text: string;
      imageUrl: string | null;
      options: string[];
      correctIndex: number;
      sort: number;
    }> = {};
    if ("text" in body && typeof body.text === "string") {
      patch.text = body.text;
    }
    if ("imageUrl" in body && (typeof body.imageUrl === "string" || body.imageUrl === null)) {
      patch.imageUrl = body.imageUrl;
    }
    if ("options" in body && Array.isArray(body.options)) {
      patch.options = body.options.map(String);
    }
    if ("correctIndex" in body && typeof body.correctIndex === "number") {
      patch.correctIndex = body.correctIndex;
    }
    if ("sort" in body && typeof body.sort === "number") {
      patch.sort = body.sort;
    }
    const question = await store.updateQuizQuestion(c.req.param("id"), patch);
    return c.json({ question });
  });

  app.delete("/api/admin/quiz/questions/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    await removeQuizQuestion(store, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/admin/quiz/start", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const durationMinutes =
      "durationMinutes" in body && typeof body.durationMinutes === "number" ? body.durationMinutes : 30;
    const quiz = await store.findActiveQuiz();
    if (quiz === null) {
      throw new DomainError("not_found", "Нет активной викторины");
    }
    const now = new Date();
    const session = await startQuizSession(store, {
      quizId: quiz.id,
      durationMinutes,
      now,
    });
    let notified = 0;
    if (botApi !== undefined) {
      notified = await notifyActiveGuestsOfQuiz(store, botApi, { quizTitle: quiz.title, now });
    }
    return c.json({
      sessionId: session.id,
      endsAt: session.endsAt.toISOString(),
      notified,
    });
  });

  app.get("/api/admin/live", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const settings = await store.getSettings();
    const day = venueDayRangeFor(now, settings);
    const [visits, checkInsToday] = await Promise.all([
      store.listActiveVisits(now),
      store.countCheckInsBetween(day.from, day.to),
    ]);
    return c.json({
      visits: visits.map((visit) => ({
        visitId: visit.visitId,
        userId: visit.userId,
        firstName: visit.firstName,
        lastName: visit.lastName,
        startedAt: visit.startedAt.toISOString(),
        endsAt: visit.endsAt.toISOString(),
        checkInMethod: visit.checkInMethod,
      })),
      checkInsToday,
    });
  });

  app.get("/api/admin/venue-code", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const code = await ensureActiveVenueCode(store, now);
    return c.json({
      pin: code.pin,
      token: code.token,
      qrPayload: venueQrPayload(code.token),
      validFrom: code.validFrom.toISOString(),
      validUntil: code.validUntil.toISOString(),
    });
  });

  app.get("/api/admin/pages/:slug", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const slugRaw = c.req.param("slug");
    if (slugRaw !== "contacts" && slugRaw !== "directions") {
      throw new DomainError("bad_request", "Неизвестная страница");
    }
    const page = await store.getPage(slugRaw);
    const stored = page ?? { slug: slugRaw, body: "", mapUrl: null };
    if (slugRaw === "contacts") {
      return c.json({
        page: stored,
        contacts: parseContactEntries(stored.body),
      });
    }
    return c.json({ page: stored });
  });

  app.patch("/api/admin/pages/:slug", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const slugRaw = c.req.param("slug");
    if (slugRaw !== "contacts" && slugRaw !== "directions") {
      throw new DomainError("bad_request", "Неизвестная страница");
    }
    const body = await readJsonBody(c);
    const text = "body" in body && typeof body.body === "string" ? body.body : "";
    const contacts =
      "contacts" in body && Array.isArray(body.contacts) ? body.contacts : null;
    const mapUrl =
      "mapUrl" in body && (typeof body.mapUrl === "string" || body.mapUrl === null) ? body.mapUrl : null;
    const pageBody =
      contacts !== null
        ? serializeContactEntries(
            contacts
              .filter((row): row is { label: string; value: string; description?: string } => {
                return (
                  typeof row === "object" &&
                  row !== null &&
                  typeof (row as { label: unknown }).label === "string" &&
                  typeof (row as { value: unknown }).value === "string"
                );
              })
              .map((row) => ({
                label: row.label.trim(),
                value: row.value.trim(),
                description:
                  typeof row.description === "string" && row.description.trim().length > 0
                    ? row.description.trim()
                    : undefined,
              })),
          )
        : text;
    const page = await savePage(store, {
      actorId: admin.id,
      slug: slugRaw,
      body: pageBody,
      mapUrl,
    });
    if (slugRaw === "contacts") {
      return c.json({ page, contacts: parseContactEntries(page.body) });
    }
    return c.json({ page });
  });

  app.get("/api/admin/bookings", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const now = new Date();
    const from = parseDate(c.req.query("from"), periodLastDays(now, 7).from);
    const to = parseDate(c.req.query("to"), periodLastDays(now, 7).to);
    const statusRaw = c.req.query("status");
    const status =
      statusRaw === "pending" ||
      statusRaw === "confirmed" ||
      statusRaw === "seated" ||
      statusRaw === "cancelled" ||
      statusRaw === "completed" ||
      statusRaw === "no_show"
        ? statusRaw
        : undefined;
    const rows = await store.listBookingsBetween({ from, to, status });
    return c.json({
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        guestName: `${row.guestFirstName ?? ""} ${row.guestLastName ?? ""}`.trim(),
        guestPhone: row.guestPhone,
        requestedFor: row.requestedFor.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
        partySize: row.partySize,
        comment: row.comment,
        status: row.status,
        tableId: row.tableId,
        tableLabel: row.tableLabel,
        handledAt: row.handledAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.patch("/api/admin/bookings/:id/assign-table", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const tableId = "tableId" in body && typeof body.tableId === "string" ? body.tableId : null;
    if (tableId === null) {
      throw new DomainError("bad_request", "Нужен tableId");
    }
    const booking = await assignTableToBooking(store, {
      bookingId: c.req.param("id"),
      tableId,
      actorId: admin.id,
      now: new Date(),
    });
    return c.json({ booking: { id: booking.id, tableId: booking.tableId } });
  });

  app.patch("/api/admin/bookings/:id/move-table", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const tableId = "tableId" in body && typeof body.tableId === "string" ? body.tableId : null;
    if (tableId === null) {
      throw new DomainError("bad_request", "Нужен tableId");
    }
    const booking = await moveBookingTable(store, {
      bookingId: c.req.param("id"),
      tableId,
      actorId: admin.id,
      now: new Date(),
    });
    return c.json({ booking: { id: booking.id, tableId: booking.tableId } });
  });

  app.post("/api/admin/bookings/swap-tables", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
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
      actorId: admin.id,
      now: new Date(),
    });
    return c.json({
      bookings: [
        { id: result.a.id, tableId: result.a.tableId },
        { id: result.b.id, tableId: result.b.tableId },
      ],
    });
  });

  app.patch("/api/admin/bookings/:id/seated", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const booking = await markBookingSeated(store, {
      bookingId: c.req.param("id"),
      actorId: admin.id,
      now: new Date(),
    });
    return c.json({ booking: { id: booking.id, status: booking.status } });
  });

  app.get("/api/admin/floor-plan", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const floorPlan = await getActiveFloorPlanView(store);
    if (floorPlan === null) {
      return c.json({ floorPlan: null });
    }
    return c.json({
      floorPlan: {
        ...floorPlan,
        tables: floorPlan.tables.map((table) => ({
          ...table,
        })),
      },
    });
  });

  app.put("/api/admin/floor-plan", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const name = "name" in body && typeof body.name === "string" ? body.name : "Зал";
    const floorPlan = await saveFloorPlan(store, {
      id: "id" in body && typeof body.id === "string" ? body.id : undefined,
      name,
      width: "width" in body ? Number(body.width) : undefined,
      height: "height" in body ? Number(body.height) : undefined,
      backgroundImageUrl:
        "backgroundImageUrl" in body &&
        (typeof body.backgroundImageUrl === "string" || body.backgroundImageUrl === null)
          ? body.backgroundImageUrl
          : undefined,
      active: true,
    });
    return c.json({ floorPlan });
  });

  app.post("/api/admin/tables", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const floorPlanId = "floorPlanId" in body && typeof body.floorPlanId === "string" ? body.floorPlanId : null;
    const label = "label" in body && typeof body.label === "string" ? body.label : null;
    if (floorPlanId === null || label === null) {
      throw new DomainError("bad_request", "Нужны floorPlanId и label");
    }
    const table = await saveVenueTable(store, {
      floorPlanId,
      label,
      description: "description" in body && typeof body.description === "string" ? body.description : "",
      highlights: "highlights" in body ? body.highlights : [],
      photoUrl:
        "photoUrl" in body && (typeof body.photoUrl === "string" || body.photoUrl === null)
          ? body.photoUrl
          : null,
      seatsMin: "seatsMin" in body ? Number(body.seatsMin) : undefined,
      seatsMax: "seatsMax" in body ? Number(body.seatsMax) : undefined,
      posX: "posX" in body ? Number(body.posX) : undefined,
      posY: "posY" in body ? Number(body.posY) : undefined,
      width: "width" in body ? Number(body.width) : undefined,
      height: "height" in body ? Number(body.height) : undefined,
      rotation: "rotation" in body ? Number(body.rotation) : undefined,
      sort: "sort" in body ? Number(body.sort) : undefined,
      active: "active" in body ? Boolean(body.active) : undefined,
    });
    return c.json({ table });
  });

  app.patch("/api/admin/tables/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const existing = await store.findTableById(c.req.param("id"));
    if (existing === null) {
      throw new DomainError("not_found", "Стол не найден");
    }
    const table = await saveVenueTable(store, {
      id: existing.id,
      floorPlanId: existing.floorPlanId,
      label: "label" in body && typeof body.label === "string" ? body.label : existing.label,
      description:
        "description" in body && typeof body.description === "string" ? body.description : existing.description,
      highlights: "highlights" in body ? body.highlights : existing.highlights,
      photoUrl:
        "photoUrl" in body && (typeof body.photoUrl === "string" || body.photoUrl === null)
          ? body.photoUrl
          : existing.photoUrl,
      seatsMin: "seatsMin" in body ? Number(body.seatsMin) : existing.seatsMin,
      seatsMax: "seatsMax" in body ? Number(body.seatsMax) : existing.seatsMax,
      posX: "posX" in body ? Number(body.posX) : existing.posX,
      posY: "posY" in body ? Number(body.posY) : existing.posY,
      width: "width" in body ? Number(body.width) : existing.width,
      height: "height" in body ? Number(body.height) : existing.height,
      rotation: "rotation" in body ? Number(body.rotation) : existing.rotation,
      sort: "sort" in body ? Number(body.sort) : existing.sort,
      active: "active" in body ? Boolean(body.active) : existing.active,
    });
    return c.json({ table });
  });

  app.delete("/api/admin/tables/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    await removeVenueTable(store, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/admin/floor-elements", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const floorPlanId = "floorPlanId" in body && typeof body.floorPlanId === "string" ? body.floorPlanId : null;
    const kind = "kind" in body && typeof body.kind === "string" ? body.kind : null;
    if (floorPlanId === null || kind === null) {
      throw new DomainError("bad_request", "Нужны floorPlanId и kind");
    }
    const element = await saveFloorElement(store, {
      floorPlanId,
      kind,
      label: "label" in body && typeof body.label === "string" ? body.label : "",
      posX: "posX" in body ? Number(body.posX) : undefined,
      posY: "posY" in body ? Number(body.posY) : undefined,
      width: "width" in body ? Number(body.width) : undefined,
      height: "height" in body ? Number(body.height) : undefined,
      rotation: "rotation" in body ? Number(body.rotation) : undefined,
      sort: "sort" in body ? Number(body.sort) : undefined,
    });
    return c.json({ element });
  });

  app.patch("/api/admin/floor-elements/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const existing = await store.getActiveFloorPlan();
    const current = existing?.elements.find((row) => row.id === c.req.param("id"));
    if (current === undefined) {
      throw new DomainError("not_found", "Элемент не найден");
    }
    const element = await saveFloorElement(store, {
      id: current.id,
      floorPlanId: current.floorPlanId,
      kind: "kind" in body && typeof body.kind === "string" ? body.kind : current.kind,
      label: "label" in body && typeof body.label === "string" ? body.label : current.label,
      posX: "posX" in body ? Number(body.posX) : current.posX,
      posY: "posY" in body ? Number(body.posY) : current.posY,
      width: "width" in body ? Number(body.width) : current.width,
      height: "height" in body ? Number(body.height) : current.height,
      rotation: "rotation" in body ? Number(body.rotation) : current.rotation,
      sort: "sort" in body ? Number(body.sort) : current.sort,
    });
    return c.json({ element });
  });

  app.delete("/api/admin/floor-elements/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    await removeFloorElement(store, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.patch("/api/admin/bookings/:id", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const statusRaw = "status" in body && typeof body.status === "string" ? body.status : null;
    if (statusRaw !== "confirmed" && statusRaw !== "cancelled") {
      throw new DomainError("bad_request", "Статус: confirmed или cancelled");
    }
    const booking = await handleBookingRequest(store, {
      bookingId: c.req.param("id"),
      actorId: admin.id,
      status: statusRaw,
      now: new Date(),
    });
    if (botApi !== undefined) {
      const guest = await store.findUserById(booking.userId);
      if (guest !== null) {
        const settings = await store.getSettings();
        const label = statusRaw === "confirmed" ? "подтверждена" : "отменена";
        try {
          await botApi.sendMessage(
            guest.telegramId.toString(),
            `Ваша заявка на ${formatBookingSlot(booking.requestedFor, settings)} ${label}`,
          );
        } catch {
          // ignore
        }
      }
    }
    return c.json({
      booking: {
        id: booking.id,
        status: booking.status,
        handledAt: booking.handledAt?.toISOString() ?? null,
      },
    });
  });

  app.get("/api/admin/staff", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const members = await store.listStaffMembers();
    const schedules = await store.listAllStaffWeeklySchedules();
    return c.json({
      members: members.map((member) => ({
        id: member.id,
        telegramId: member.telegramId.toString(),
        role: member.role,
        firstName: member.firstName,
        lastName: member.lastName,
        schedule: schedules
          .filter((slot) => slot.userId === member.id)
          .map((slot) => ({
            weekday: slot.weekday,
            startHour: slot.startHour,
            endHour: slot.endHour,
          })),
      })),
    });
  });

  app.post("/api/admin/staff/role", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const telegramIdRaw = "telegramId" in body ? body.telegramId : null;
    const roleRaw = "role" in body && typeof body.role === "string" ? body.role : null;
    if (telegramIdRaw === null || roleRaw === null) {
      throw new DomainError("bad_request", "Нужны telegramId и role");
    }
    if (roleRaw !== "guest" && roleRaw !== "master" && roleRaw !== "admin") {
      throw new DomainError("bad_request", "Роль: guest, master или admin");
    }
    const user = await assignRole(store, {
      actorId: admin.id,
      telegramId: BigInt(String(telegramIdRaw)),
      role: roleRaw,
    });
    return c.json({
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  });

  app.get("/api/admin/staff/shifts", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const settings = await store.getSettings();
    const fromRaw = c.req.query("from");
    const toRaw = c.req.query("to");
    const fromParsed = fromRaw ? parseVenueDay(fromRaw, settings) : null;
    const toParsed = toRaw ? parseVenueDay(toRaw, settings) : null;
    if (fromParsed === null || toParsed === null) {
      throw new DomainError("bad_request", "Нужны from и to (YYYY-MM-DD)");
    }
    const shifts = await listStaffShiftsView(store, {
      from: toStoreCalendarDate(fromParsed.toJSDate(), settings),
      to: toStoreCalendarDate(toParsed.toJSDate(), settings),
      settings,
    });
    return c.json({ shifts });
  });

  app.put("/api/admin/staff/shifts/day", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const dateRaw = "date" in body && typeof body.date === "string" ? body.date : null;
    if (dateRaw === null) {
      throw new DomainError("bad_request", "Нужна date");
    }
    const settings = await store.getSettings();
    const parsed = parseVenueDay(dateRaw, settings);
    if (parsed === null) {
      throw new DomainError("bad_request", "Некорректная дата");
    }
    const shifts =
      "shifts" in body && Array.isArray(body.shifts)
        ? body.shifts.map((slot) => {
            if (typeof slot !== "object" || slot === null) {
              throw new DomainError("bad_request", "Некорректные смены");
            }
            return {
              userId: String((slot as { userId?: unknown }).userId),
              startHour: Number((slot as { startHour?: unknown }).startHour),
              endHour: Number((slot as { endHour?: unknown }).endHour),
            };
          })
        : [];
    const saved = await replaceStaffShiftsForDay(store, {
      actorId: admin.id,
      date: parsed.toJSDate(),
      shifts,
    });
    return c.json({
      shifts: saved.map((shift) => ({
        id: shift.id,
        userId: shift.userId,
        startHour: shift.startHour,
        endHour: shift.endHour,
      })),
    });
  });

  app.post("/api/admin/staff/shifts", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const dateRaw = "date" in body && typeof body.date === "string" ? body.date : null;
    const userId = "userId" in body && typeof body.userId === "string" ? body.userId : null;
    if (dateRaw === null || userId === null) {
      throw new DomainError("bad_request", "Нужны date и userId");
    }
    const settings = await store.getSettings();
    const parsed = parseVenueDay(dateRaw, settings);
    if (parsed === null) {
      throw new DomainError("bad_request", "Некорректная дата");
    }
    const shift = await upsertStaffShift(store, {
      actorId: admin.id,
      userId,
      date: parsed.toJSDate(),
      startHour: Number(body.startHour ?? 18),
      endHour: Number(body.endHour ?? 26),
    });
    return c.json({
      shift: {
        id: shift.id,
        userId: shift.userId,
        startHour: shift.startHour,
        endHour: shift.endHour,
      },
    });
  });

  app.delete("/api/admin/staff/shifts/:id", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    await removeStaffShift(store, { actorId: admin.id, shiftId: c.req.param("id") });
    return c.json({ ok: true });
  });

  app.post("/api/admin/staff/shifts/fill-template", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const weekStartRaw = "weekStart" in body && typeof body.weekStart === "string" ? body.weekStart : null;
    if (weekStartRaw === null) {
      throw new DomainError("bad_request", "Нужен weekStart");
    }
    const settings = await store.getSettings();
    const parsed = parseVenueDay(weekStartRaw, settings);
    if (parsed === null) {
      throw new DomainError("bad_request", "Некорректная дата");
    }
    await fillStaffShiftsFromTemplate(store, {
      actorId: admin.id,
      weekStart: parsed.toJSDate(),
      settings,
    });
    return c.json({ ok: true });
  });

  app.put("/api/admin/staff/:id/schedule", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const slots =
      "slots" in body && Array.isArray(body.slots)
        ? body.slots.map((slot) => {
            if (typeof slot !== "object" || slot === null) {
              throw new DomainError("bad_request", "Некорректное расписание");
            }
            return {
              weekday: Number((slot as { weekday?: unknown }).weekday),
              startHour: Number((slot as { startHour?: unknown }).startHour),
              endHour: Number((slot as { endHour?: unknown }).endHour),
            };
          })
        : [];
    const schedule = await replaceStaffWeeklySchedule(store, {
      actorId: admin.id,
      userId: c.req.param("id"),
      slots,
    });
    return c.json({
      schedule: schedule.map((slot) => ({
        weekday: slot.weekday,
        startHour: slot.startHour,
        endHour: slot.endHour,
      })),
    });
  });

  app.post("/api/admin/menu/upload", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new DomainError("bad_request", "Нужен файл");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageUrl = await saveMenuUpload({ bytes, originalName: file.name });
    const item = await addMenuGalleryImage(store, {
      actorId: admin.id,
      imageUrl,
      imageFileId: null,
    });
    return c.json({
      item: {
        id: item.id,
        imageUrl: item.imageUrl,
        sort: item.sort,
        active: item.active,
      },
    });
  });

  app.post("/api/admin/menu/gallery", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const fileId = "fileId" in body && typeof body.fileId === "string" ? body.fileId.trim() : "";
    if (fileId.length === 0) {
      throw new DomainError("bad_request", "Нужен fileId");
    }
    const item = await addMenuGalleryImage(store, {
      actorId: admin.id,
      imageUrl: null,
      imageFileId: fileId,
    });
    return c.json({
      item: {
        id: item.id,
        imageFileId: item.imageFileId,
        sort: item.sort,
        active: item.active,
      },
    });
  });

  app.delete("/api/admin/menu/gallery/:id", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    await removeMenuGalleryImage(store, { actorId: admin.id, id: c.req.param("id") });
    return c.json({ ok: true });
  });

  app.patch("/api/admin/menu/gallery/order", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const orderedIds =
      "orderedIds" in body && Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
    await reorderMenuGallery(store, { actorId: admin.id, orderedIds });
    return c.json({ ok: true });
  });

  app.get("/api/admin/menu", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const rows = await store.listAllMenuItems();
    return c.json({
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        priceRubles: row.priceRubles,
        imageFileId: row.imageFileId,
        imageUrl: row.imageUrl,
        sort: row.sort,
        active: row.active,
        isGallery: isGalleryMenuItem(row),
      })),
    });
  });

  app.post("/api/admin/menu", async (c) => {
    const admin = await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const title = "title" in body && typeof body.title === "string" ? body.title.trim() : "";
    const description = "description" in body && typeof body.description === "string" ? body.description : "";
    const priceRubles =
      "priceRubles" in body && (typeof body.priceRubles === "number" || body.priceRubles === null)
        ? body.priceRubles
        : null;
    const item = await addMenuItem(store, {
      actorId: admin.id,
      title,
      description,
      priceRubles,
    });
    return c.json({
      item: {
        id: item.id,
        title: item.title,
        description: item.description,
        priceRubles: item.priceRubles,
        sort: item.sort,
        active: item.active,
      },
    });
  });

  app.patch("/api/admin/menu/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const existing = (await store.listAllMenuItems()).find((row) => row.id === c.req.param("id"));
    if (existing === undefined) {
      throw new DomainError("not_found", "Позиция не найдена");
    }
    const body = await readJsonBody(c);
    const title = "title" in body && typeof body.title === "string" ? body.title.trim() : existing.title;
    const description =
      "description" in body && typeof body.description === "string" ? body.description : existing.description;
    const priceRubles =
      "priceRubles" in body && (typeof body.priceRubles === "number" || body.priceRubles === null)
        ? body.priceRubles
        : existing.priceRubles;
    const active = "active" in body && typeof body.active === "boolean" ? body.active : existing.active;
    const imageUrl =
      "imageUrl" in body && (typeof body.imageUrl === "string" || body.imageUrl === null)
        ? body.imageUrl
        : existing.imageUrl;
    const item = await store.upsertMenuItem({
      id: existing.id,
      title,
      description,
      priceRubles,
      imageFileId: existing.imageFileId,
      imageUrl,
      sort: existing.sort,
      active,
    });
    return c.json({
      item: {
        id: item.id,
        title: item.title,
        description: item.description,
        priceRubles: item.priceRubles,
        sort: item.sort,
        active: item.active,
      },
    });
  });

  app.delete("/api/admin/menu/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const existing = (await store.listAllMenuItems()).find((row) => row.id === c.req.param("id"));
    if (existing === undefined) {
      throw new DomainError("not_found", "Позиция не найдена");
    }
    if (isGalleryMenuItem(existing)) {
      throw new DomainError("bad_request", "Для фото галереи используйте удаление галереи");
    }
    await store.deleteMenuItem(existing.id);
    return c.json({ ok: true });
  });

  app.get("/api/cashier/search", async (c) => {
    await requireStaff(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const q = c.req.query("q") ?? "";
    const now = new Date();
    const guests = await searchGuests(store, { query: q, now });
    return c.json({
      guests: guests.map((guest) => ({
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        phone: guest.phoneMasked,
        telegramUsername: guest.telegramUsername,
        telegramId: guest.telegramId,
        balance: guest.balance,
        visitActive: guest.visitActive,
      })),
    });
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

  app.get("/api/admin/theme", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const state = await listThemePacks(store);
    return c.json(state);
  });

  app.post("/api/admin/theme", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const pack = await upsertThemePack(store, {
      id: typeof body.id === "string" ? body.id : undefined,
      name: typeof body.name === "string" ? body.name : "",
      activeFrom: typeof body.activeFrom === "string" ? body.activeFrom : body.activeFrom === null ? null : undefined,
      activeTo: typeof body.activeTo === "string" ? body.activeTo : body.activeTo === null ? null : undefined,
      isManualActive: typeof body.isManualActive === "boolean" ? body.isManualActive : undefined,
      colors: {
        accent: typeof body.accent === "string" ? body.accent : body.accent === null ? null : undefined,
        bg: typeof body.bg === "string" ? body.bg : body.bg === null ? null : undefined,
      },
    });
    return c.json({ pack });
  });

  app.patch("/api/admin/theme/active", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    if (body.clear === true) {
      await setActiveThemeId(store, null);
      return c.json({ activeId: null });
    }
    const packId = typeof body.packId === "string" ? body.packId : null;
    if (packId === null) {
      throw new DomainError("bad_request", "Нужен packId или clear");
    }
    await setActiveThemeId(store, packId);
    return c.json({ activeId: packId });
  });

  app.post("/api/admin/theme/:id/upload", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await c.req.parseBody();
    const kindRaw = typeof body.kind === "string" ? body.kind : "";
    const kindMap: Record<string, ThemeAssetKind> = {
      logo: "logo",
      interior: "interior",
      hubBg: "hubBg",
      heroBanner: "heroBanner",
      decor: "decor",
    };
    const kind = kindMap[kindRaw];
    if (kind === undefined) {
      throw new DomainError("bad_request", "Некорректный kind");
    }
    const file = body.file;
    if (!(file instanceof File)) {
      throw new DomainError("bad_request", "Нужен файл");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await saveAssetUpload({
      folder: themeAssetFolder(kind),
      bytes,
      originalName: file.name,
      maxBytes: themeAssetMaxBytes(kind),
    });
    const packId = c.req.param("id");
    const pack = await updateThemeAsset(store, {
      packId,
      kind: kind === "interior" ? "interiorAppend" : kind === "logo" ? "logoUrl" : kind === "hubBg" ? "hubBackgroundUrl" : kind === "heroBanner" ? "heroBannerUrl" : "decorUrl",
      url,
    });
    return c.json({ pack, url });
  });

  app.delete("/api/admin/theme/:id/interior", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const body = await readJsonBody(c);
    const url = typeof body.url === "string" ? body.url : "";
    if (url.length === 0) {
      throw new DomainError("bad_request", "Нужен url");
    }
    const pack = await removeThemeInterior(store, c.req.param("id"), url);
    return c.json({ pack });
  });

  app.delete("/api/admin/theme/:id", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    await deleteThemePack(store, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/admin/game-skins", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const skins = await listGameSkins(store);
    return c.json({ skins: Object.values(skins) });
  });

  app.post("/api/admin/game-skins/:slug/upload", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    const slug = c.req.param("slug");
    const body = await c.req.parseBody();
    const kind = typeof body.kind === "string" ? body.kind : "";
    const file = body.file;
    if (!(file instanceof File)) {
      throw new DomainError("bad_request", "Нужен файл");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await saveAssetUpload({
      folder: themeAssetFolder("gameTile"),
      bytes,
      originalName: file.name,
      maxBytes: themeAssetMaxBytes("gameTile"),
    });
    if (kind === "tile") {
      const index = Number(body.index);
      const skin = await upsertGameSkinTile(store, { gameSlug: slug, index, imageUrl: url });
      return c.json({ skin, url });
    }
    if (kind === "boardBg") {
      const skin = await patchGameSkin(store, slug, { boardBackgroundUrl: url });
      return c.json({ skin, url });
    }
    if (kind === "trayBg") {
      const skin = await patchGameSkin(store, slug, { trayBackgroundUrl: url });
      return c.json({ skin, url });
    }
    throw new DomainError("bad_request", "kind: tile | boardBg | trayBg");
  });

  app.delete("/api/admin/game-skins/:slug", async (c) => {
    await requireAdmin(store, readInitData(c.req.header("X-Telegram-Init-Data")), botToken);
    await deleteGameSkin(store, c.req.param("slug"));
    return c.json({ ok: true });
  });

  return app;
};
