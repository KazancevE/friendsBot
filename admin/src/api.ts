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
  gameSessions: number;
  uniqueGamePlayers: number;
  avgVisitsPerDay: number;
  peakHour: number | null;
  peakWeekday: number | null;
  returningGuestsPct: number | null;
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

export type StatsMetric =
  | "visits"
  | "bonuses"
  | "checkins"
  | "registrations"
  | "gameSessions"
  | "uniqueGuests";

export type StatsGranularity = "day" | "week" | "month";

export const fetchTimeseries = (
  metric: StatsMetric,
  days: number,
  granularity: StatsGranularity = "day",
) => {
  const params = periodParams(days);
  params.set("metric", metric);
  params.set("granularity", granularity);
  return getJson(`/api/admin/stats/timeseries?${params.toString()}`, isTimeseries);
};

export type StatsHeatmapCell = {
  weekday: number;
  hour: number;
  count: number;
};

const isHeatmap = (
  value: unknown,
): value is { cells: StatsHeatmapCell[]; peak: StatsHeatmapCell | null; total: number; source: string } => {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { cells: unknown }).cells) &&
    typeof (value as { total: number }).total === "number"
  );
};

export const fetchHeatmap = (days: number, source: "visits" | "checkins" = "visits") => {
  const params = periodParams(days);
  params.set("source", source);
  return getJson(`/api/admin/stats/heatmap?${params.toString()}`, isHeatmap);
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
  telegramUsername: string | null;
  telegramId?: string;
  balance: number;
  visitActive?: boolean;
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
  referral?: { invited: number; activated: number; bonusesEarned: number };
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
  guestFirstName: string | null;
  guestLastName: string | null;
  guestTelegramId: string | null;
  guestTelegramUsername: string | null;
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
  bookingHoursStart: number;
  bookingHoursEnd: number;
  bookingSlotMinutes: number;
  bookingClosedWeekdays: number[];
  bookingDurationMinutes: number;
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
  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed: unknown = await res.json();
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "tooLarge" in parsed &&
      parsed.tooLarge === true &&
      "downloadUrl" in parsed &&
      typeof parsed.downloadUrl === "string"
    ) {
      window.open(parsed.downloadUrl, "_blank");
      return { kind: "ok", data: null };
    }
    return { kind: "error", message: "Неожиданный ответ экспорта" };
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
  sendNow?: boolean;
  photoId?: string;
  params?: { balanceMin?: number };
}) =>
  postJson("/api/admin/broadcast/send", input, (value): value is { sent: number; failed: number; recipients: number } => {
    return typeof value === "object" && value !== null && typeof (value as { sent: number }).sent === "number";
  });

export type BroadcastHistoryRow = {
  promoId: string;
  body: string;
  createdAt: string;
  showInFeed: boolean;
  segment: string | null;
  recipients: number | null;
  sent: number | null;
  failed: number | null;
};

const isBroadcastHistory = (value: unknown): value is { rows: BroadcastHistoryRow[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchBroadcastHistory = () => getJson("/api/admin/broadcasts?limit=20", isBroadcastHistory);

export type GuestDirectoryRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  telegramUsername: string | null;
  phoneMasked: string | null;
  balance: number;
  totalVisits: number;
  lastVisitAt: string | null;
  visitActive: boolean;
  broadcastOptOut: boolean;
  createdAt: string;
};

const isGuestDirectory = (
  value: unknown,
): value is { guests: GuestDirectoryRow[]; total: number; offset: number; limit: number } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { guests: unknown }).guests);
};

export const fetchGuestDirectory = (input: {
  offset?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  filter?: string;
}) => {
  const params = new URLSearchParams();
  if (input.offset !== undefined) {
    params.set("offset", String(input.offset));
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.sort !== undefined) {
    params.set("sort", input.sort);
  }
  if (input.order !== undefined) {
    params.set("order", input.order);
  }
  if (input.filter !== undefined && input.filter.length > 0) {
    params.set("filter", input.filter);
  }
  return getJson(`/api/admin/guests?${params.toString()}`, isGuestDirectory);
};

export type GuestVisitPattern = {
  totalVisits: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  topWeekdays: string[];
  topHours: string[];
  visitsPerMonth: number | null;
};

const isVisitPattern = (value: unknown): value is GuestVisitPattern => {
  return typeof value === "object" && value !== null && typeof (value as GuestVisitPattern).totalVisits === "number";
};

export const fetchGuestVisitPattern = (guestId: string) =>
  getJson(`/api/admin/guest/${guestId}/visit-pattern`, isVisitPattern);

export const sendGuestMessage = (guestId: string, body: string) =>
  postJson(`/api/admin/guest/${guestId}/message`, { body }, (value): value is { ok: true } => {
    return typeof value === "object" && value !== null && (value as { ok: boolean }).ok === true;
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

export type QuizQuestionView = {
  id: string;
  sort: number;
  text: string;
  imageUrl: string | null;
  options: string[];
  correctIndex: number;
};

const isQuizQuestions = (value: unknown): value is { rows: QuizQuestionView[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchQuizQuestions = () => getJson("/api/admin/quiz/questions", isQuizQuestions);

export const createQuizQuestion = (input: {
  text: string;
  options: string[];
  correctIndex: number;
  imageUrl?: string | null;
}) => postJson("/api/admin/quiz/questions", input, (value): value is { question: QuizQuestionView } => {
  return typeof value === "object" && value !== null && typeof (value as { question: QuizQuestionView }).question?.id === "string";
});

export const updateQuizQuestion = (
  id: string,
  patch: Partial<{ text: string; options: string[]; correctIndex: number; imageUrl: string | null }>,
) =>
  fetch(`/api/admin/quiz/questions/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка" };
    }
    return { kind: "ok" as const, data: null };
  });

export const deleteQuizQuestion = (id: string) =>
  fetch(`/api/admin/quiz/questions/${id}`, {
    method: "DELETE",
    headers: { "X-Telegram-Init-Data": initData() },
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка" };
    }
    return { kind: "ok" as const, data: null };
  });

export type MenuItem = {
  id: string;
  title: string;
  description: string;
  priceRubles: number | null;
  imageFileId: string | null;
  imageUrl: string | null;
  sort: number;
  active: boolean;
  isGallery?: boolean;
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
  patch: Partial<{ title: string; description: string; priceRubles: number | null; active: boolean; imageUrl: string | null }>,
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

export const deleteMenuItem = (id: string) =>
  fetch(`/api/admin/menu/${id}`, {
    method: "DELETE",
    headers: { "X-Telegram-Init-Data": initData() },
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка удаления" };
    }
    return { kind: "ok" as const, data: null };
  });

export type LiveVisitRow = {
  visitId: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  startedAt: string;
  endsAt: string;
  checkInMethod: string | null;
};

const isLiveVenue = (value: unknown): value is { visits: LiveVisitRow[]; checkInsToday: number } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { visits: unknown }).visits);
};

export const fetchLiveVenue = () => getJson("/api/admin/live", isLiveVenue);

export type VenueCodeView = {
  pin: string;
  token: string;
  qrPayload: string;
  validFrom: string;
  validUntil: string;
};

const isVenueCode = (value: unknown): value is VenueCodeView => {
  return typeof value === "object" && value !== null && typeof (value as VenueCodeView).pin === "string";
};

export const fetchVenueCode = () => getJson("/api/admin/venue-code", isVenueCode);

export type ContactEntry = {
  label: string;
  value: string;
  description?: string;
};

export type ContentPageView = {
  slug: string;
  body: string;
  mapUrl: string | null;
};

const isContactsPage = (
  value: unknown,
): value is { page: ContentPageView; contacts: ContactEntry[] } => {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { contacts: unknown }).contacts)
  );
};

const isContentPage = (value: unknown): value is { page: ContentPageView } => {
  return typeof value === "object" && value !== null && typeof (value as { page: ContentPageView }).page?.slug === "string";
};

export const fetchContentPage = (slug: "contacts" | "directions") =>
  getJson(`/api/admin/pages/${slug}`, slug === "contacts" ? isContactsPage : isContentPage);

export const patchContacts = (contacts: ContactEntry[]) =>
  fetch("/api/admin/pages/contacts", {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ contacts }),
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка" };
    }
    return { kind: "ok" as const, data: null };
  });

export const patchContentPage = (slug: "contacts" | "directions", body: string, mapUrl: string | null) =>
  fetch(`/api/admin/pages/${slug}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ body, mapUrl }),
  }).then(async (res) => {
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => ({}));
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    const parsed: unknown = await res.json();
    if (!isContentPage(parsed)) {
      return { kind: "error" as const, message: "Некорректный ответ" };
    }
    return { kind: "ok" as const, data: parsed.page };
  });

export type BookingRow = {
  id: string;
  userId: string;
  guestName: string;
  guestPhone: string | null;
  requestedFor: string;
  endsAt: string | null;
  partySize: number;
  comment: string | null;
  status: string;
  tableId: string | null;
  tableLabel: string | null;
  handledAt: string | null;
  createdAt: string;
};

const isBookings = (value: unknown): value is { rows: BookingRow[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { rows: unknown }).rows);
};

export const fetchBookings = (days = 14) => {
  const params = periodParams(days);
  return getJson(`/api/admin/bookings?${params.toString()}`, isBookings);
};

export const patchBooking = (id: string, status: "confirmed" | "cancelled") =>
  fetch(`/api/admin/bookings/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status }),
  }).then(async (res) => {
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => ({}));
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    return { kind: "ok" as const, data: null };
  });

export type VenueTableView = {
  id: string;
  floorPlanId: string;
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
};

export type FloorElementView = {
  id: string;
  floorPlanId: string;
  kind: string;
  label: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  sort: number;
};

export type FloorPlanView = {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundImageUrl: string | null;
  active: boolean;
  tables: VenueTableView[];
  elements: FloorElementView[];
};

const isFloorPlan = (value: unknown): value is { floorPlan: FloorPlanView | null } => {
  return typeof value === "object" && value !== null && "floorPlan" in value;
};

export const fetchFloorPlan = () => getJson("/api/admin/floor-plan", isFloorPlan);

export const saveFloorPlan = (input: { id?: string; name: string; width?: number; height?: number }) =>
  fetch("/api/admin/floor-plan", {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(input),
  }).then(async (res) => {
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => ({}));
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    const parsed: unknown = await res.json();
    if (!isFloorPlan(parsed) || parsed.floorPlan === null) {
      return { kind: "error" as const, message: "Некорректный ответ" };
    }
    return { kind: "ok" as const, data: parsed.floorPlan };
  });

export const createVenueTable = (input: {
  floorPlanId: string;
  label: string;
  description?: string;
  highlights?: string[];
  seatsMin?: number;
  seatsMax?: number;
}) =>
  fetch("/api/admin/tables", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
  }).then(async (res) => {
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => ({}));
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    return { kind: "ok" as const, data: null };
  });

export const assignBookingTable = (bookingId: string, tableId: string) =>
  fetch(`/api/admin/bookings/${bookingId}/assign-table`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ tableId }),
  }).then(async (res) => {
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => ({}));
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    return { kind: "ok" as const, data: null };
  });

export type StaffMemberView = {
  id: string;
  telegramId: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  schedule: Array<{ weekday: number; startHour: number; endHour: number }>;
};

const isStaffList = (value: unknown): value is { members: StaffMemberView[] } => {
  return typeof value === "object" && value !== null && Array.isArray((value as { members: unknown }).members);
};

export const fetchStaffMembers = () => getJson("/api/admin/staff", isStaffList);

export const assignStaffRole = (telegramId: string, role: "guest" | "master" | "admin") =>
  postJson("/api/admin/staff/role", { telegramId, role }, (value): value is { user: { id: string } } => {
    return typeof value === "object" && value !== null && typeof (value as { user: { id: string } }).user?.id === "string";
  });

export const updateStaffSchedule = (
  userId: string,
  slots: Array<{ weekday: number; startHour: number; endHour: number }>,
) =>
  fetch(`/api/admin/staff/${userId}/schedule`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ slots }),
  }).then(async (res) => {
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => ({}));
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : "Ошибка";
      return { kind: "error" as const, message };
    }
    return { kind: "ok" as const, data: null };
  });

export const uploadMenuGallery = async (file: File): Promise<ApiResult<{ id: string; imageUrl: string | null }>> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/menu/upload", {
    method: "POST",
    headers: { "X-Telegram-Init-Data": initData() },
    body: form,
  });
  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => ({}));
    const message =
      typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
        ? parsed.message
        : "Ошибка загрузки";
    return { kind: "error", message };
  }
  const parsed: unknown = await res.json();
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("item" in parsed) ||
    typeof (parsed as { item: { id: string } }).item?.id !== "string"
  ) {
    return { kind: "error", message: "Некорректный ответ" };
  }
  const item = (parsed as { item: { id: string; imageUrl: string | null } }).item;
  return { kind: "ok", data: { id: item.id, imageUrl: item.imageUrl } };
};

export const deleteMenuGalleryItem = (id: string) =>
  fetch(`/api/admin/menu/gallery/${id}`, {
    method: "DELETE",
    headers: { "X-Telegram-Init-Data": initData() },
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка удаления" };
    }
    return { kind: "ok" as const, data: null };
  });

export const patchVenueTable = (
  id: string,
  patch: Partial<{ posX: number; posY: number; width: number; height: number; rotation: number; label: string }>,
) =>
  fetch(`/api/admin/tables/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка" };
    }
    return { kind: "ok" as const, data: null };
  });

export const saveFloorElement = (input: {
  id?: string;
  floorPlanId: string;
  kind: string;
  label?: string;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  sort?: number;
}) =>
  fetch(input.id ? `/api/admin/floor-elements/${input.id}` : "/api/admin/floor-elements", {
    method: input.id ? "PATCH" : "POST",
    headers: headers(),
    body: JSON.stringify(input),
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка" };
    }
    return { kind: "ok" as const, data: null };
  });

export const deleteFloorElement = (id: string) =>
  fetch(`/api/admin/floor-elements/${id}`, {
    method: "DELETE",
    headers: { "X-Telegram-Init-Data": initData() },
  }).then(async (res) => {
    if (!res.ok) {
      return { kind: "error" as const, message: "Ошибка" };
    }
    return { kind: "ok" as const, data: null };
  });
