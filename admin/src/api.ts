import { initData } from "./telegram.ts";

type ApiError = { kind: "error"; message: string };
type ApiOk<T> = { kind: "ok"; data: T };
export type ApiResult<T> = ApiOk<T> | ApiError;

const headers = () => ({
  "Content-Type": "application/json",
  "X-Telegram-Init-Data": initData(),
});

const getJson = async <T>(path: string, guard: (value: unknown) => value is T): Promise<ApiResult<T>> => {
  const res = await fetch(path, { headers: headers() });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const message =
      typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
        ? body.message
        : "Ошибка";
    return { kind: "error", message };
  }
  const parsed: unknown = await res.json();
  if (!guard(parsed)) {
    return { kind: "error", message: "Некорректный ответ" };
  }
  return { kind: "ok", data: parsed };
};

const postJson = async <T>(
  path: string,
  body: Record<string, unknown>,
  guard: (value: unknown) => value is T,
): Promise<ApiResult<T>> => {
  const res = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => ({}));
    const message =
      typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
        ? parsed.message
        : "Ошибка";
    return { kind: "error", message };
  }
  const parsed: unknown = await res.json();
  if (!guard(parsed)) {
    return { kind: "error", message: "Некорректный ответ" };
  }
  return { kind: "ok", data: parsed };
};

export type Me = { role: "guest" | "master" | "admin"; balance: number; visitActive: boolean };

const isMe = (value: unknown): value is Me => {
  return (
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    (value.role === "guest" || value.role === "master" || value.role === "admin")
  );
};

export const fetchMe = () => postJson("/api/me", {}, isMe);

export type StatsSummary = {
  registrations: number;
  visits: number;
  uniqueGuestsWithVisit: number;
  checkIns: number;
  bonusesCredited: number;
  bonusesRedeemed: number;
  bonusesExpired: number;
  bonusLiability: number;
  averageCheckRubles: number | null;
  staffActions: number;
  referralActivations: number;
};

const isStatsSummary = (value: unknown): value is StatsSummary => {
  return typeof value === "object" && value !== null && typeof (value as StatsSummary).registrations === "number";
};

export const fetchStats = (days: number) => {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return getJson(`/api/admin/stats/summary?${params.toString()}`, isStatsSummary);
};

const periodParams = (days: number) => {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
};

export type StatsTimeseriesPoint = {
  date: string;
  value: number;
};

const isTimeseries = (value: unknown): value is { points: StatsTimeseriesPoint[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { points: unknown }).points);
};

export type StatsMetric = "visits" | "bonuses" | "checkins";

export const fetchTimeseries = (metric: StatsMetric, days: number) => {
  const params = periodParams(days);
  params.set("metric", metric);
  return getJson(`/api/admin/stats/timeseries?${params.toString()}`, isTimeseries);
};

export type StatsStaffRow = {
  actorId: string;
  name: string;
  actions: number;
};

const isStaffStats = (value: unknown): value is { rows: StatsStaffRow[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchStaffStats = (days: number) => {
  const params = periodParams(days);
  return getJson(`/api/admin/stats/staff?${params.toString()}`, isStaffStats);
};

export type GuestHit = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  balance: number;
};

const isGuestHits = (value: unknown): value is { guests: GuestHit[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { guests: unknown }).guests);
};

export const searchGuests = (query: string) => {
  const params = new URLSearchParams({ q: query });
  return getJson(`/api/cashier/search?${params.toString()}`, isGuestHits);
};

export type GuestCard = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  balance: number;
  birthdayWeek?: boolean;
  birthdayDaysUntil?: number | null;
  staffNote?: string | null;
  visitActive?: boolean;
  visitEndsAt?: string | null;
  totalVisits?: number;
  lastVisitAt?: string | null;
  checkedInToday?: boolean;
  coupons?: Array<{ id: string; title: string }>;
  lotSummaries?: Array<{ category: string; remaining: number; expiresAt: string }>;
};

const isGuestCard = (value: unknown): value is GuestCard => {
  return typeof value === "object" && value !== null && typeof (value as GuestCard).id === "string";
};

export const fetchGuest = (id: string) => getJson(`/api/cashier/guest/${id}`, isGuestCard);

export type LedgerRow = {
  id: string;
  type: string;
  amount: number;
  comment: string | null;
  createdAt: string;
};

const isLedger = (value: unknown): value is { rows: LedgerRow[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchGuestLedger = (id: string) => getJson(`/api/admin/guest/${id}/ledger`, isLedger);

export type StaffLogRow = {
  id: string;
  action: string;
  actorId: string;
  guestId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

const isStaffLog = (value: unknown): value is { rows: StaffLogRow[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchStaffLog = (days = 7) => {
  const params = periodParams(days);
  params.set("limit", "50");
  return getJson(`/api/admin/staff-log?${params.toString()}`, isStaffLog);
};

export type RejectedSession = {
  slug: string;
  points: number;
  rejectReason: string | null;
  createdAt: string;
};

const isRejected = (value: unknown): value is { rows: RejectedSession[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchRejectedSessions = () => getJson("/api/admin/game-sessions/rejected?limit=20", isRejected);

export type BroadcastSegment = {
  id: string;
  label: string;
  count: number;
};

const isBroadcastSegments = (value: unknown): value is { segments: BroadcastSegment[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { segments: unknown }).segments);
};

export const fetchBroadcastSegments = () => getJson("/api/admin/broadcast/segments", isBroadcastSegments);

export type SettingsView = {
  percent: number;
  registrationBonus: number;
  birthdayBonus: number;
  visitHours: number;
  winnersCount: number;
  checkBonusTtlDays: number;
  giftBonusTtlDays: number;
  couponClaimDays: number;
  expireNotifyMinBonuses: number;
  checkInNotifyEnabled: boolean;
  referralBonusReferrer: number;
  referralBonusReferee: number;
  referralActivationDays: number;
  referralEnabled: boolean;
  birthdayNotifyDaysBefore: number;
  birthdayCouponTitle: string | null;
  birthdayCouponClaimDays: number;
  maxSessionsPerHour: number;
};

const isSettingsResponse = (value: unknown): value is { settings: SettingsView } => {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { settings: unknown }).settings === "object" &&
    (value as { settings: SettingsView }).settings !== null
  );
};

export const fetchSettings = () => getJson("/api/admin/settings", isSettingsResponse);

export type PromoRuleRow = {
  id: string;
  kind: string;
  label: string;
  params: Record<string, unknown>;
  priority: number;
  validFrom: string | null;
  validUntil: string | null;
};

const isPromoRules = (value: unknown): value is { rows: PromoRuleRow[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchPromoRules = () => getJson("/api/admin/promo-rules", isPromoRules);

export type LiveQuizView = {
  sessionId: string;
  status: string;
  startedAt: string;
  endsAt: string;
  questionCount: number;
};

const isLiveQuiz = (value: unknown): value is { live: LiveQuizView | null } => {
  return typeof value === "object" && value !== null && "live" in value;
};

export const fetchLiveQuiz = () => getJson("/api/admin/quiz/live", isLiveQuiz);

export const downloadExport = async (type: string, days: number): Promise<ApiResult<null>> => {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    type,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await fetch(`/api/admin/export?${params.toString()}`, {
    headers: { "X-Telegram-Init-Data": initData() },
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const message =
      typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
        ? body.message
        : "Ошибка экспорта";
    return { kind: "error", message };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  return { kind: "ok", data: null };
};

export const previewBroadcast = (segment: string, params?: { balanceMin?: number }) =>
  postJson("/api/admin/broadcast/preview", { segment, params }, (value): value is { count: number } => {
    return typeof value === "object" && value !== null && typeof (value as { count: number }).count === "number";
  });

export const sendBroadcast = (input: {
  segment: string;
  body: string;
  showInFeed: boolean;
  params?: { balanceMin?: number };
}) =>
  postJson("/api/admin/broadcast/send", input, (value): value is { sent: number; failed: number; recipients: number } => {
    return typeof value === "object" && value !== null && typeof (value as { sent: number }).sent === "number";
  });

export const patchSettings = (patch: Partial<SettingsView>) =>
  fetch("/api/admin/settings", {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ patch }),
  }).then(async (res) => {
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => ({}));
      const message =
        typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
          ? body.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    const parsed: unknown = await res.json();
    if (!isSettingsResponse(parsed)) {
      return { kind: "error" as const, message: "Некорректный ответ" };
    }
    return { kind: "ok" as const, data: parsed.settings };
  });

export const startQuiz = (durationMinutes = 30) =>
  postJson("/api/admin/quiz/start", { durationMinutes }, (value): value is { sessionId: string; endsAt: string } => {
    return typeof value === "object" && value !== null && typeof (value as { sessionId: string }).sessionId === "string";
  });

export type MenuItem = {
  id: string;
  title: string;
  description: string;
  priceRubles: number | null;
  sort: number;
  active: boolean;
};

const isMenuList = (value: unknown): value is { rows: MenuItem[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

const isMenuItemResponse = (value: unknown): value is { item: MenuItem } => {
  return typeof value === "object" && value !== null && typeof (value as { item: MenuItem }).item?.id === "string";
};

export const fetchMenu = () => getJson("/api/admin/menu", isMenuList);

export const createMenuItem = (input: { title: string; description: string; priceRubles: number | null }) =>
  postJson("/api/admin/menu", input, isMenuItemResponse);

export const updateMenuItem = (
  id: string,
  patch: Partial<{ title: string; description: string; priceRubles: number | null; active: boolean }>,
) =>
  fetch(`/api/admin/menu/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  }).then(async (res) => {
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => ({}));
      const message =
        typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
          ? body.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    const parsed: unknown = await res.json();
    if (!isMenuItemResponse(parsed)) {
      return { kind: "error" as const, message: "Некорректный ответ" };
    }
    return { kind: "ok" as const, data: parsed.item };
  });
