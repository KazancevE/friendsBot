import {
  assignBookingTable,
  assignStaffRole,
  createMenuItem,
  createQuizQuestion,
  createVenueTable,
  deleteMenuGalleryItem,
  deleteMenuItem,
  deleteQuizQuestion,
  downloadExport,
  fetchBookings,
  fetchBroadcastHistory,
  fetchBroadcastSegments,
  fetchGuestDirectory,
  fetchGuestVisitPattern,
  fetchHeatmap,
  fetchContentPage,
  fetchFloorPlan,
  fetchGuest,
  fetchGuestLedger,
  fetchLiveQuiz,
  fetchLiveVenue,
  fetchMe,
  fetchMenu,
  fetchPromoRules,
  fetchQuizQuestions,
  fetchRejectedSessions,
  fetchSettings,
  fetchStaffLog,
  fetchStaffMembers,
  fetchStaffStats,
  fetchStats,
  fetchStatsBetween,
  fetchTimeseries,
  fetchVenueCode,
  patchBooking,
  patchContacts,
  patchContentPage,
  patchSettings,
  previewBroadcast,
  saveFloorPlan,
  searchGuests,
  sendBroadcast,
  sendGuestMessage,
  startQuiz,
  updateMenuItem,
  updateQuizQuestion,
  updateStaffSchedule,
  uploadMenuGallery,
  type ContactEntry,
  type BookingRow,
  type FloorPlanView,
  type StatsGranularity,
  type StatsMetric,
  type StatsSummary,
} from "./api.ts";
import { type AdminTab, renderAdminShell, setActiveAdminTab } from "./admin-nav.ts";
import { renderBrandPanel } from "./brand-panel.ts";
import { renderGameSkinsPanel } from "./game-skins-panel.ts";
import { mountFloorEditor } from "./floor-editor.ts";
import { renderScheduleGrid } from "./schedule-grid.ts";
import {
  encodedToTimeValue,
  formatShiftRange,
  timeValueToEndHour,
  timeValueToStartHour,
  validateShiftHours,
} from "./time-helpers.ts";
import {
  bindInfoIcons,
  escapeHtml,
  formatDateTime,
  formatName,
  infoIcon,
  renderVenueQr,
  settingLabel,
  SETTING_HINTS,
} from "./ui-helpers.ts";
import "./style.css";

type Tab = AdminTab;
type DashboardPeriod = 7 | 30 | 90 | 180 | 365;
type DashboardView = {
  period: DashboardPeriod;
  metric: StatsMetric;
  granularity: StatsGranularity;
  heatmapSource: "visits" | "checkins";
};

const PERIOD_OPTIONS: DashboardPeriod[] = [7, 30, 90, 180, 365];
const METRIC_OPTIONS: { id: StatsMetric; label: string }[] = [
  { id: "visits", label: "Визиты" },
  { id: "checkins", label: "Check-in" },
  { id: "bonuses", label: "Бонусы" },
  { id: "registrations", label: "Регистрации" },
  { id: "gameSessions", label: "Игры" },
  { id: "uniqueGuests", label: "Уник. гости" },
];
const GRANULARITY_OPTIONS: { id: StatsGranularity; label: string }[] = [
  { id: "day", label: "Дни" },
  { id: "week", label: "Недели" },
  { id: "month", label: "Месяцы" },
];

const WEEKDAY_LABELS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const renderShell = (root: HTMLElement, active: Tab) => {
  renderAdminShell(root, active, {
    onTab: (tab) => {
      void renderApp(root, tab);
    },
  });
};

const setActiveTab = (root: HTMLElement, active: Tab) => {
  setActiveAdminTab(root, active);
};

const renderPeriodToolbar = (days: number) => {
  return `
    <div class="pill-group" data-period>
      ${PERIOD_OPTIONS.map((option) => `<button type="button" data-days="${option}" class="${option === days ? "active" : ""}">${option} д</button>`).join("")}
    </div>
  `;
};

const bindPeriodToolbar = (host: HTMLElement, onChange: (days: number) => void) => {
  for (const button of host.querySelectorAll("[data-period] [data-days]")) {
    button.addEventListener("click", () => {
      const next = Number(button.getAttribute("data-days"));
      if (next === 7 || next === 30 || next === 90 || next === 180 || next === 365) {
        onChange(next);
      }
    });
  }
};

const preserveScroll = async (fn: () => Promise<void> | void) => {
  const scrollY = window.scrollY;
  await fn();
  window.scrollTo(0, scrollY);
};

const showLoadingIfEmpty = (host: HTMLElement) => {
  if (host.children.length === 0) {
    host.innerHTML = renderDashboardSkeleton();
  }
};

let dashboardRenderGeneration = 0;

const unwrapSettled = <T>(
  result: PromiseSettledResult<Awaited<ReturnType<typeof fetchStats>>>,
  fallbackMessage: string,
) => {
  if (result.status === "rejected") {
    return { kind: "error" as const, message: fallbackMessage };
  }
  return result.value;
};

const renderDashboardSkeleton = () => {
  return `
    <section class="panel skeleton-panel">
      <div class="skeleton skeleton-line skeleton-line--title"></div>
      <div class="dashboard-kpi-grid">
        ${Array.from({ length: 8 }, () => `<div class="skeleton skeleton-stat"></div>`).join("")}
      </div>
      <div class="skeleton skeleton-chart"></div>
    </section>
  `;
};

const viewHost = (root: HTMLElement) => {
  const host = root.querySelector("[data-view]");
  if (!(host instanceof HTMLElement)) {
    throw new Error("view host missing");
  }
  return host;
};

const formatRelativeVisit = (iso: string | null) => {
  if (iso === null) {
    return "никогда";
  }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) {
    return "сегодня";
  }
  if (days === 1) {
    return "вчера";
  }
  return `${days} дн. назад`;
};

const renderHeatmap = (cells: Array<{ weekday: number; hour: number; count: number }>) => {
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const header = `<div class="heatmap-row heatmap-header"><span></span>${hours.map((hour) => `<span>${hour}</span>`).join("")}</div>`;
  const rows = [1, 2, 3, 4, 5, 6, 7]
    .map((weekday) => {
      const label = WEEKDAY_LABELS[weekday] ?? String(weekday);
      const cellsHtml = hours
        .map((hour) => {
          const count = cells.find((cell) => cell.weekday === weekday && cell.hour === hour)?.count ?? 0;
          const intensity = Math.round((count / max) * 100);
          return `<span class="heatmap-cell" style="--intensity:${intensity}" title="${label} ${hour}:00 — ${count}">${count > 0 ? count : ""}</span>`;
        })
        .join("");
      return `<div class="heatmap-row"><span class="heatmap-day">${label}</span>${cellsHtml}</div>`;
    })
    .join("");
  return `<div class="heatmap">${header}${rows}</div>`;
};

const formatStatDelta = (current: number, previous: number) => {
  const delta = current - previous;
  if (delta === 0) {
    return `<span class="stat-delta stat-delta--flat">0</span>`;
  }
  const sign = delta > 0 ? "+" : "";
  const tone = delta > 0 ? "up" : "down";
  return `<span class="stat-delta stat-delta--${tone}">${sign}${delta}</span>`;
};

const renderStat = (label: string, value: string | number, delta?: string) => {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}${delta ?? ""}</div></div>`;
};

const renderDashboard = async (host: HTMLElement, view: DashboardView) => {
  const { period, metric, granularity, heatmapSource } = view;
  const generation = ++dashboardRenderGeneration;
  host.innerHTML = renderDashboardSkeleton();
  const now = new Date();
  const currentFrom = new Date(now.getTime() - (period - 1) * 24 * 60 * 60 * 1000);
  const previousTo = new Date(currentFrom.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - (period - 1) * 24 * 60 * 60 * 1000);

  try {
    const [
      statsResult,
      previousStatsResult,
      seriesResult,
      staffResult,
      liveResult,
      heatmapResult,
      bookingsResult,
    ] = await Promise.allSettled([
      fetchStats(period),
      fetchStatsBetween(previousFrom, previousTo),
      fetchTimeseries(metric, period, granularity),
      fetchStaffStats(period),
      fetchLiveVenue(),
      fetchHeatmap(period, heatmapSource),
      fetchBookings(7, "pending"),
    ]);

    if (generation !== dashboardRenderGeneration) {
      return;
    }

    const stats = unwrapSettled(statsResult, "Не удалось загрузить статистику");
    const previousStats = unwrapSettled(previousStatsResult, "Не удалось загрузить сравнение");
    const series = unwrapSettled(seriesResult, "Не удалось загрузить динамику");
    const staff = unwrapSettled(staffResult, "Не удалось загрузить персонал");
    const live = unwrapSettled(liveResult, "Не удалось загрузить зал");
    const heatmap = unwrapSettled(heatmapResult, "Не удалось загрузить загруженность");
    const bookings = unwrapSettled(bookingsResult, "Не удалось загрузить брони");

    if (stats.kind === "error") {
      host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(stats.message)}</p></section>`;
      return;
    }
  const s = stats.data;
  const prev = previousStats.kind === "ok" ? previousStats.data : null;
  const delta = (key: keyof StatsSummary) =>
    prev === null ? "" : formatStatDelta(Number(s[key] ?? 0), Number(prev[key] ?? 0));
  const maxValue =
    series.kind === "ok" ? Math.max(1, ...series.data.points.map((point) => point.value)) : 1;
  const chartRows =
    series.kind === "ok"
      ? series.data.points
          .map((point) => {
            const width = Math.round((point.value / maxValue) * 100);
            const label = granularity === "month" ? point.date : point.date.slice(5);
            return `<div class="chart-row chart-row--area" title="${label}: ${point.value}"><span class="chart-label">${label}</span><div class="chart-bar"><span style="width:${width}%"></span></div><span class="chart-value">${point.value}</span></div>`;
          })
          .join("")
      : `<p class="error">${escapeHtml(series.kind === "error" ? series.message : "Нет данных")}</p>`;
  const heatmapBlock =
    heatmap.kind === "ok"
      ? `<section class="panel">
          <div class="toolbar">
            <h2>Загруженность</h2>
            <div class="pill-group" data-heatmap-source>
              <button type="button" data-source="visits" class="${heatmapSource === "visits" ? "active" : ""}">Визиты</button>
              <button type="button" data-source="checkins" class="${heatmapSource === "checkins" ? "active" : ""}">Check-in</button>
            </div>
          </div>
          <p class="muted">Пик: ${heatmap.data.peak ? `${WEEKDAY_LABELS[heatmap.data.peak.weekday] ?? ""} ${heatmap.data.peak.hour}:00 (${heatmap.data.peak.count})` : "—"} · всего ${heatmap.data.total}</p>
          ${renderHeatmap(heatmap.data.cells)}
        </section>`
      : "";
  const peakLabel =
    s.peakHour !== null && s.peakWeekday !== null
      ? `${WEEKDAY_LABELS[s.peakWeekday] ?? ""} ${s.peakHour}:00`
      : "—";
  const staffRows =
    staff.kind === "ok"
      ? staff.data.rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.name)}</td><td>${row.actions}</td></tr>`,
          )
          .join("")
      : "";
  const liveBlock =
    live.kind === "ok"
      ? `<section class="panel">
          <h2>Сейчас в зале</h2>
          <p class="muted">Check-in сегодня: ${live.data.checkInsToday} · активных визитов: ${live.data.visits.length}</p>
          <div class="table-wrap">
            <table><thead><tr><th>Гость</th><th>До</th><th>Check-in</th></tr></thead><tbody>${
              live.data.visits
                .map(
                  (visit) =>
                    `<tr><td>${escapeHtml(formatName(visit.firstName, visit.lastName))}</td><td>${formatDateTime(visit.endsAt)}</td><td>${escapeHtml(visit.checkInMethod ?? "—")}</td></tr>`,
                )
                .join("") || '<tr><td colspan="3" class="muted">Никого</td></tr>'
            }</tbody></table>
          </div>
        </section>`
      : "";
  const pendingBookings =
    bookings.kind === "ok"
      ? bookings.data.filter((row) => row.status === "pending" || row.status === "confirmed").length
      : 0;
  const todayBlock = `
    <section class="panel dashboard-today">
      <h2>Сегодня</h2>
      <div class="dashboard-kpi-grid">
        <div class="stat"><div class="stat-label">Check-in</div><div class="stat-value">${live.kind === "ok" ? live.data.checkInsToday : "—"}</div></div>
        <div class="stat"><div class="stat-label">В зале</div><div class="stat-value">${live.kind === "ok" ? live.data.visits.length : "—"}</div></div>
        <div class="stat"><div class="stat-label">Брони ожидают</div><div class="stat-value">${pendingBookings}</div></div>
        <div class="stat"><div class="stat-label">Регистрации (${period} д)</div><div class="stat-value">${s.registrations}</div></div>
      </div>
    </section>`;
  host.innerHTML = `
    ${todayBlock}
    ${liveBlock}
    <section class="panel">
      <div class="toolbar">
        <h2>Дашборд</h2>
        <div class="pill-group" data-period>
          ${PERIOD_OPTIONS.map((days) => `<button type="button" data-days="${days}" class="${days === period ? "active" : ""}">${days} д</button>`).join("")}
        </div>
      </div>
      <div class="grid dashboard-kpi-grid">
        ${renderStat("Регистрации", s.registrations, delta("registrations"))}
        ${renderStat("Визиты", s.visits, delta("visits"))}
        ${renderStat("Check-in", s.checkIns, delta("checkIns"))}
        ${renderStat("Начислено", s.bonusesCredited, delta("bonusesCredited"))}
        ${renderStat("Списано", s.bonusesRedeemed, delta("bonusesRedeemed"))}
        ${renderStat("Liability", s.bonusLiability, delta("bonusLiability"))}
        ${renderStat("Средний чек", s.averageCheckRubles ?? "—")}
        ${renderStat("Рефералы", s.referralActivations, delta("referralActivations"))}
        ${renderStat("Игры", s.gameSessions, delta("gameSessions"))}
        ${renderStat("Игроков", s.uniqueGamePlayers, delta("uniqueGamePlayers"))}
        ${renderStat("Визитов/день", s.avgVisitsPerDay, delta("avgVisitsPerDay"))}
        ${renderStat("Пик", peakLabel)}
        ${renderStat("Повторные", `${s.returningGuestsPct ?? "—"}${s.returningGuestsPct === null ? "" : "%"}`)}
      </div>
    </section>
    <section class="panel">
      <div class="toolbar">
        <h2>Динамика</h2>
        <div class="pill-group" data-granularity>
          ${GRANULARITY_OPTIONS.map((option) => `<button type="button" data-granularity="${option.id}" class="${option.id === granularity ? "active" : ""}">${option.label}</button>`).join("")}
        </div>
        <div class="pill-group" data-metric-group>
          ${METRIC_OPTIONS.map((option) => `<button type="button" data-metric="${option.id}" class="${option.id === metric ? "active" : ""}">${option.label}</button>`).join("")}
        </div>
      </div>
      <div class="chart">${chartRows}</div>
    </section>
    ${heatmapBlock}
    <section class="panel">
      <h2>Топ персонала</h2>
      <table><thead><tr><th>Сотрудник</th><th>Действий</th></tr></thead><tbody>${staffRows || '<tr><td colspan="2" class="muted">Нет данных</td></tr>'}</tbody></table>
    </section>
  `;
  for (const button of host.querySelectorAll("[data-period] [data-days]")) {
    button.addEventListener("click", () => {
      const days = Number(button.getAttribute("data-days"));
      if (PERIOD_OPTIONS.includes(days as DashboardPeriod)) {
        void preserveScroll(() => renderDashboard(host, { ...view, period: days as DashboardPeriod }));
      }
    });
  }
  for (const button of host.querySelectorAll("[data-metric-group] [data-metric]")) {
    button.addEventListener("click", () => {
      const nextMetric = button.getAttribute("data-metric");
      if (METRIC_OPTIONS.some((option) => option.id === nextMetric)) {
        void preserveScroll(() => renderDashboard(host, { ...view, metric: nextMetric as StatsMetric }));
      }
    });
  }
  for (const button of host.querySelectorAll("[data-granularity] [data-granularity]")) {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-granularity");
      if (GRANULARITY_OPTIONS.some((option) => option.id === next)) {
        void preserveScroll(() => renderDashboard(host, { ...view, granularity: next as StatsGranularity }));
      }
    });
  }
  for (const button of host.querySelectorAll("[data-heatmap-source] [data-source]")) {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-source");
      if (next === "visits" || next === "checkins") {
        void preserveScroll(() => renderDashboard(host, { ...view, heatmapSource: next }));
      }
    });
  }
  } catch {
    if (generation !== dashboardRenderGeneration) {
      return;
    }
    host.innerHTML = `<section class="panel"><p class="error">Не удалось загрузить дашборд. Проверьте соединение и обновите страницу.</p></section>`;
  }
};

const renderGuests = (host: HTMLElement) => {
  let listOffset = 0;
  const listLimit = 50;
  let listSort = "lastVisitAt";
  let listFilter = "";

  const loadDirectory = async (results: HTMLElement) => {
    results.innerHTML = `<p class="muted">Загрузка…</p>`;
    const found = await fetchGuestDirectory({
      offset: listOffset,
      limit: listLimit,
      sort: listSort,
      order: "desc",
      filter: listFilter,
    });
    if (found.kind === "error") {
      results.innerHTML = `<p class="error">${escapeHtml(found.message)}</p>`;
      return;
    }
    const rows = found.data.guests
      .map(
        (guest) => `<tr>
          <td><button type="button" class="linkish" data-guest="${guest.id}">${escapeHtml(formatName(guest.firstName, guest.lastName))}</button></td>
          <td>${guest.telegramUsername ? `@${escapeHtml(guest.telegramUsername)}` : "—"}</td>
          <td>${escapeHtml(guest.phoneMasked ?? "—")}</td>
          <td>${guest.balance}</td>
          <td>${guest.totalVisits}</td>
          <td>${formatRelativeVisit(guest.lastVisitAt)}</td>
          <td>${guest.visitActive ? "в зале" : guest.broadcastOptOut ? "opt-out" : ""}</td>
        </tr>`,
      )
      .join("");
    const pages = Math.max(1, Math.ceil(found.data.total / listLimit));
    const page = Math.floor(listOffset / listLimit) + 1;
    results.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Имя</th><th>Telegram</th><th>Телефон</th><th>Баланс</th><th>Визиты</th><th>Последний раз</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">Нет гостей</td></tr>'}</tbody>
        </table>
      </div>
      <div class="toolbar" style="margin-top:0.75rem">
        <span class="muted">Всего ${found.data.total} · стр. ${page}/${pages}</span>
        <div class="pill-group">
          <button type="button" data-page-prev ${listOffset === 0 ? "disabled" : ""}>Назад</button>
          <button type="button" data-page-next ${listOffset + listLimit >= found.data.total ? "disabled" : ""}>Вперёд</button>
        </div>
      </div>
    `;
    for (const button of results.querySelectorAll("[data-guest]")) {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-guest");
        if (id !== null) {
          void showGuest(host.querySelector("[data-detail]"), id);
        }
      });
    }
    results.querySelector("[data-page-prev]")?.addEventListener("click", () => {
      listOffset = Math.max(0, listOffset - listLimit);
      void loadDirectory(results);
    });
    results.querySelector("[data-page-next]")?.addEventListener("click", () => {
      listOffset += listLimit;
      void loadDirectory(results);
    });
  };

  host.innerHTML = `
    <section class="panel">
      <h2>Гости</h2>
      <div class="pill-group" data-guest-mode style="margin-bottom:0.75rem">
        <button type="button" data-mode="list" class="active">Список</button>
        <button type="button" data-mode="search">Поиск</button>
      </div>
      <div data-list-tools class="toolbar" style="margin-bottom:0.75rem">
        <select data-sort>
          <option value="lastVisitAt">Последний визит</option>
          <option value="createdAt">Регистрация</option>
          <option value="balance">Баланс</option>
          <option value="totalVisits">Визиты</option>
        </select>
        <select data-filter>
          <option value="">Все</option>
          <option value="in_venue">В зале</option>
          <option value="inactive_30d">Не были 30+ дн</option>
          <option value="opt_out">Opt-out</option>
          <option value="has_coupon">С купоном</option>
        </select>
      </div>
      <div data-search-tools class="hidden" style="display:flex;gap:0.5rem;margin-bottom:0.75rem">
        <input type="search" placeholder="Имя, телефон, @username" data-query style="flex:1" />
        <button type="button" class="action" data-search>Найти</button>
      </div>
      <div data-results class="list"></div>
      <div data-detail class="panel hidden" style="margin-top:1rem"></div>
    </section>
  `;

  const results = host.querySelector("[data-results]");
  const detail = host.querySelector("[data-detail]");
  const listTools = host.querySelector("[data-list-tools]");
  const searchTools = host.querySelector("[data-search-tools]");
  if (!(results instanceof HTMLElement)) {
    return;
  }

  const setMode = (mode: "list" | "search") => {
    for (const button of host.querySelectorAll("[data-guest-mode] [data-mode]")) {
      button.classList.toggle("active", button.getAttribute("data-mode") === mode);
    }
    listTools?.classList.toggle("hidden", mode !== "list");
    searchTools?.classList.toggle("hidden", mode !== "search");
    if (mode === "list") {
      void loadDirectory(results);
    } else {
      results.innerHTML = `<p class="muted">Введите минимум 2 символа</p>`;
    }
  };

  for (const button of host.querySelectorAll("[data-guest-mode] [data-mode]")) {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-mode");
      if (mode === "list" || mode === "search") {
        setMode(mode);
      }
    });
  }

  const sortSelect = host.querySelector("[data-sort]");
  if (sortSelect instanceof HTMLSelectElement) {
    sortSelect.addEventListener("change", () => {
      listSort = sortSelect.value;
      listOffset = 0;
      void loadDirectory(results);
    });
  }
  const filterSelect = host.querySelector("[data-filter]");
  if (filterSelect instanceof HTMLSelectElement) {
    filterSelect.addEventListener("change", () => {
      listFilter = filterSelect.value;
      listOffset = 0;
      void loadDirectory(results);
    });
  }

  const queryInput = host.querySelector("[data-query]");
  const runSearch = async () => {
    if (!(queryInput instanceof HTMLInputElement)) {
      return;
    }
    const q = queryInput.value.trim();
    if (q.length < 2) {
      results.innerHTML = `<p class="muted">Введите минимум 2 символа</p>`;
      return;
    }
    results.innerHTML = `<p class="muted">Поиск…</p>`;
    const found = await searchGuests(q);
    if (found.kind === "error") {
      results.innerHTML = `<p class="error">${escapeHtml(found.message)}</p>`;
      return;
    }
    if (found.data.guests.length === 0) {
      results.innerHTML = `<p class="muted">Не найдено</p>`;
      return;
    }
    results.innerHTML = found.data.guests
      .map(
        (guest) =>
          `<button type="button" data-guest="${guest.id}">${escapeHtml(formatName(guest.firstName, guest.lastName))}${guest.telegramUsername ? ` · @${escapeHtml(guest.telegramUsername)}` : ""} · ${guest.balance} б.</button>`,
      )
      .join("");
    for (const button of results.querySelectorAll("[data-guest]")) {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-guest");
        if (id !== null) {
          void showGuest(detail, id);
        }
      });
    }
  };
  host.querySelector("[data-search]")?.addEventListener("click", () => {
    void runSearch();
  });
  if (queryInput instanceof HTMLInputElement) {
    queryInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        void runSearch();
      }
    });
  }

  void loadDirectory(results);
};

const showGuest = async (detail: Element | null, guestId: string) => {
  if (!(detail instanceof HTMLElement)) {
    return;
  }
  detail.classList.remove("hidden");
  detail.innerHTML = `<p class="muted">Загрузка карточки…</p>`;
  const [card, ledger, pattern] = await Promise.all([
    fetchGuest(guestId),
    fetchGuestLedger(guestId),
    fetchGuestVisitPattern(guestId),
  ]);
  if (card.kind === "error") {
    detail.innerHTML = `<p class="error">${escapeHtml(card.message)}</p>`;
    return;
  }
  const ledgerRows =
    ledger.kind === "ok"
      ? ledger.data.rows
          .slice(-15)
          .reverse()
          .map(
            (row) =>
              `<tr><td>${new Date(row.createdAt).toLocaleString("ru-RU")}</td><td>${escapeHtml(row.type)}</td><td>${row.amount}</td><td>${escapeHtml(row.comment ?? "")}</td></tr>`,
          )
          .join("")
      : "";
  const patternBlock =
    pattern.kind === "ok"
      ? `<section style="margin:0.75rem 0">
          <h4>Когда бывает</h4>
          <p>Чаще: ${pattern.data.topWeekdays.length > 0 ? pattern.data.topWeekdays.join(", ") : "—"} · ${pattern.data.topHours.length > 0 ? pattern.data.topHours.join(", ") : "—"}</p>
          <p class="muted">В среднем: ${pattern.data.visitsPerMonth ?? "—"} визита/мес · последний: ${pattern.data.daysSinceLastVisit === null ? "никогда" : `${pattern.data.daysSinceLastVisit} дн. назад`}</p>
        </section>`
      : "";
  detail.innerHTML = `
    <h3>${escapeHtml(formatName(card.data.firstName, card.data.lastName))}</h3>
    <div class="grid guest-meta">
      <div class="stat"><div class="stat-label">Телефон</div><div class="stat-value stat-value-sm">${escapeHtml(card.data.phone ?? "—")}</div></div>
      <div class="stat"><div class="stat-label">Баланс</div><div class="stat-value stat-value-sm">${card.data.balance}</div></div>
      <div class="stat"><div class="stat-label">Визитов</div><div class="stat-value stat-value-sm">${card.data.totalVisits ?? "—"}</div></div>
      <div class="stat"><div class="stat-label">Check-in сегодня</div><div class="stat-value stat-value-sm">${card.data.checkedInToday ? "да" : "нет"}</div></div>
    </div>
    ${patternBlock}
    ${card.data.visitActive ? `<p>Активный визит до ${formatDateTime(card.data.visitEndsAt ?? null)}</p>` : ""}
    ${card.data.birthdayWeek ? `<p>Неделя ДР${card.data.birthdayDaysUntil !== null && card.data.birthdayDaysUntil !== undefined ? ` · через ${card.data.birthdayDaysUntil} д` : ""}</p>` : ""}
    ${card.data.staffNote ? `<p>Заметка: ${escapeHtml(card.data.staffNote)}</p>` : ""}
    ${
      card.data.referral
        ? `<p>Рефералы: пригласил ${card.data.referral.invited} · активировано ${card.data.referral.activated}</p>`
        : ""
    }
    ${
      card.data.coupons && card.data.coupons.length > 0
        ? `<p>Купоны: ${card.data.coupons.map((coupon) => escapeHtml(coupon.title)).join(", ")}</p>`
        : ""
    }
    <h4>Личное сообщение</h4>
    <textarea data-guest-message rows="3" style="width:100%"></textarea>
    <button type="button" class="action" data-send-guest-message style="margin-top:0.5rem">Отправить в Telegram</button>
    <p class="muted" data-guest-message-status></p>
    <h4>История</h4>
    <div class="table-wrap">
      <table><thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Комментарий</th></tr></thead><tbody>${ledgerRows}</tbody></table>
    </div>
  `;
  detail.querySelector("[data-send-guest-message]")?.addEventListener("click", () => {
    const input = detail.querySelector("[data-guest-message]");
    const status = detail.querySelector("[data-guest-message-status]");
    if (!(input instanceof HTMLTextAreaElement) || !(status instanceof HTMLElement)) {
      return;
    }
    const body = input.value.trim();
    if (body.length === 0) {
      status.textContent = "Введите текст";
      status.className = "error";
      return;
    }
    status.textContent = "Отправка…";
    status.className = "muted";
    void sendGuestMessage(guestId, body).then((result) => {
      status.textContent = result.kind === "ok" ? "Сообщение отправлено" : result.message;
      status.className = result.kind === "ok" ? "muted" : "error";
      if (result.kind === "ok") {
        input.value = "";
      }
    });
  });
};

const renderStaff = async (host: HTMLElement, days = 7) => {
  showLoadingIfEmpty(host);
  const [log, members, venueCode] = await Promise.all([fetchStaffLog(days), fetchStaffMembers(), fetchVenueCode()]);
  if (log.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(log.message)}</p></section>`;
    return;
  }
  const logRows = log.data.rows
    .map((row) => {
      const guestLabel = row.guestId
        ? `${formatName(row.guestFirstName, row.guestLastName)}${row.guestTelegramUsername ? ` @${row.guestTelegramUsername}` : ""}`
        : "—";
      const guestCell =
        row.guestId === null
          ? "—"
          : `<button type="button" class="linkish" data-guest-log="${row.guestId}">${escapeHtml(guestLabel)}</button>`;
      return `<tr><td>${new Date(row.createdAt).toLocaleString("ru-RU")}</td><td>${escapeHtml(row.action)}</td><td>${guestCell}</td></tr>`;
    })
    .join("");
  const memberRows =
    members.kind === "ok"
      ? members.data.members
          .map((member) => {
            const schedule =
              member.schedule.length === 0
                ? "—"
                : member.schedule
                    .map((slot) => `${WEEKDAY_LABELS[slot.weekday] ?? slot.weekday} ${formatShiftRange(slot.startHour, slot.endHour)}`)
                    .join(", ");
            return `<tr>
              <td>${escapeHtml(formatName(member.firstName, member.lastName))}</td>
              <td><code>${escapeHtml(member.telegramId)}</code></td>
              <td>${escapeHtml(member.role)}</td>
              <td class="muted">${escapeHtml(schedule)}</td>
              <td><button type="button" class="action" data-edit-schedule="${member.id}">Смены</button></td>
            </tr>`;
          })
          .join("")
      : "";
  const venueBlock =
    venueCode.kind === "ok"
      ? `<section class="panel">
          <h2>Код зала</h2>
          <p>PIN: <strong>${escapeHtml(venueCode.data.pin)}</strong></p>
          <p class="muted">Действует до ${formatDateTime(venueCode.data.validUntil)}</p>
          <canvas data-venue-qr class="venue-qr" aria-label="QR-код зала"></canvas>
        </section>`
      : "";
  host.innerHTML = `
    ${venueBlock}
    <div data-staff-guest-detail class="panel hidden" style="margin-bottom:1rem"></div>
    <section class="panel">
      <h2>Добавить мастера</h2>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem">
        <input type="search" placeholder="Имя, @ник или Telegram ID" data-staff-search style="flex:1" />
        <button type="button" class="action" data-staff-search-btn>Найти</button>
      </div>
      <div data-staff-search-results class="list" style="margin-bottom:0.75rem"></div>
      <div class="form-grid">
        <label>Telegram ID<input type="text" data-staff-tg-id /></label>
        <label>Роль
          <select data-staff-role>
            <option value="master">master</option>
            <option value="admin">admin</option>
            <option value="guest">guest</option>
          </select>
        </label>
      </div>
      <button type="button" class="action" data-assign-role style="margin-top:0.75rem">Назначить</button>
      <p class="muted" data-staff-status style="margin-top:0.5rem"></p>
    </section>
    <section class="panel">
      <h2>Сотрудники</h2>
      <div data-schedule-grid style="margin-bottom:1rem"></div>
      <div class="table-wrap">
        <table><thead><tr><th>Имя</th><th>Telegram</th><th>Роль</th><th>Смены</th><th></th></tr></thead><tbody>${memberRows || '<tr><td colspan="5" class="muted">Пусто</td></tr>'}</tbody></table>
      </div>
      <div data-schedule-editor class="hidden" style="margin-top:1rem"></div>
    </section>
    <section class="panel">
      <div class="toolbar">
        <h2>История персонала</h2>
        ${renderPeriodToolbar(days)}
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Дата</th><th>Действие</th><th>Гость</th></tr></thead><tbody>${logRows || '<tr><td colspan="3" class="muted">Пусто</td></tr>'}</tbody></table>
      </div>
    </section>
  `;
  bindPeriodToolbar(host, (next) => {
    void preserveScroll(() => renderStaff(host, next));
  });
  if (venueCode.kind === "ok") {
    const canvas = host.querySelector("[data-venue-qr]");
    if (canvas instanceof HTMLCanvasElement) {
      void renderVenueQr(canvas, venueCode.data.qrPayload);
    }
  }
  const staffGuestDetail = host.querySelector("[data-staff-guest-detail]");
  for (const button of host.querySelectorAll("[data-guest-log]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-guest-log");
      if (id !== null && staffGuestDetail instanceof HTMLElement) {
        void showGuest(staffGuestDetail, id);
      }
    });
  }
  const runStaffSearch = async () => {
    const input = host.querySelector("[data-staff-search]");
    const results = host.querySelector("[data-staff-search-results]");
    const tgInput = host.querySelector("[data-staff-tg-id]");
    if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement) || !(tgInput instanceof HTMLInputElement)) {
      return;
    }
    const q = input.value.trim();
    if (q.length < 2) {
      results.innerHTML = `<p class="muted">Введите минимум 2 символа</p>`;
      return;
    }
    if (/^\d+$/.test(q)) {
      tgInput.value = q;
      results.innerHTML = `<p class="muted">Telegram ID подставлен</p>`;
      return;
    }
    results.innerHTML = `<p class="muted">Поиск…</p>`;
    const found = await searchGuests(q);
    if (found.kind === "error" || found.data.guests.length === 0) {
      results.innerHTML = `<p class="muted">Не найдено</p>`;
      return;
    }
    results.innerHTML = found.data.guests
      .map((guest) => {
        const username = guest.telegramUsername ? ` @${guest.telegramUsername}` : "";
        return `<button type="button" class="action" data-pick-tg="${guest.telegramId ?? ""}">${escapeHtml(formatName(guest.firstName, guest.lastName))}${escapeHtml(username)}</button>`;
      })
      .join("");
    for (const pick of results.querySelectorAll("[data-pick-tg]")) {
      pick.addEventListener("click", () => {
        const telegramId = pick.getAttribute("data-pick-tg");
        if (telegramId !== null && telegramId.length > 0) {
          tgInput.value = telegramId;
          results.innerHTML = `<p class="muted">Telegram ID подставлен</p>`;
        }
      });
    }
  };
  host.querySelector("[data-staff-search-btn]")?.addEventListener("click", () => {
    void runStaffSearch();
  });
  const staffStatus = host.querySelector("[data-staff-status]");
  host.querySelector("[data-assign-role]")?.addEventListener("click", () => {
    const tgInput = host.querySelector("[data-staff-tg-id]");
    const roleSelect = host.querySelector("[data-staff-role]");
    if (!(tgInput instanceof HTMLInputElement) || !(roleSelect instanceof HTMLSelectElement) || !(staffStatus instanceof HTMLElement)) {
      return;
    }
    const telegramId = tgInput.value.trim();
    if (telegramId.length === 0) {
      staffStatus.textContent = "Введите Telegram ID";
      staffStatus.className = "error";
      return;
    }
    staffStatus.textContent = "Сохранение…";
    void assignStaffRole(telegramId, roleSelect.value as "guest" | "master" | "admin").then((result) => {
      staffStatus.textContent = result.kind === "ok" ? "Роль назначена" : result.message;
      staffStatus.className = result.kind === "ok" ? "muted" : "error";
      if (result.kind === "ok") {
        void preserveScroll(() => renderStaff(host, days));
      }
    });
  });
  if (members.kind === "ok") {
    const scheduleGridHost = host.querySelector("[data-schedule-grid]");
    if (scheduleGridHost instanceof HTMLElement) {
      renderScheduleGrid(scheduleGridHost, members.data.members, (member) => {
        const button = host.querySelector(`[data-edit-schedule="${member.id}"]`);
        if (button instanceof HTMLButtonElement) {
          button.click();
        }
      });
    }
    for (const button of host.querySelectorAll("[data-edit-schedule]")) {
      button.addEventListener("click", () => {
        const userId = button.getAttribute("data-edit-schedule");
        const editor = host.querySelector("[data-schedule-editor]");
        if (userId === null || !(editor instanceof HTMLElement)) {
          return;
        }
        const member = members.data.members.find((row) => row.id === userId);
        if (member === undefined) {
          return;
        }
        editor.classList.remove("hidden");
        const slots = [...member.schedule];
        const renderEditor = () => {
          editor.innerHTML = `
            <h3>Смены: ${escapeHtml(formatName(member.firstName, member.lastName))}</h3>
            <div data-slot-list>${slots
              .map(
                (slot, index) =>
                  `<div class="form-grid" style="margin-bottom:0.5rem">
                    <label>День<select data-weekday="${index}">${[1, 2, 3, 4, 5, 6, 7]
                      .map(
                        (day) =>
                          `<option value="${day}" ${day === slot.weekday ? "selected" : ""}>${WEEKDAY_LABELS[day]}</option>`,
                      )
                      .join("")}</select></label>
                    <label>С<input type="time" data-start="${index}" value="${encodedToTimeValue(slot.startHour)}" step="3600" /></label>
                    <label>До<input type="time" data-end="${index}" value="${encodedToTimeValue(slot.endHour)}" step="3600" /></label>
                    <button type="button" class="action" data-remove-slot="${index}">×</button>
                  </div>`,
              )
              .join("")}</div>
            <button type="button" class="action" data-add-slot>Добавить день</button>
            <button type="button" class="action" data-save-schedule style="margin-left:0.5rem">Сохранить</button>
            <p class="muted" data-schedule-status style="margin-top:0.5rem"></p>
          `;
          editor.querySelector("[data-add-slot]")?.addEventListener("click", () => {
            slots.push({ weekday: 1, startHour: 18, endHour: 26 });
            renderEditor();
          });
          for (const removeButton of editor.querySelectorAll("[data-remove-slot]")) {
            removeButton.addEventListener("click", () => {
              const index = Number(removeButton.getAttribute("data-remove-slot"));
              slots.splice(index, 1);
              renderEditor();
            });
          }
          editor.querySelector("[data-save-schedule]")?.addEventListener("click", () => {
            const status = editor.querySelector("[data-schedule-status]");
            const parsed: Array<{ weekday: number; startHour: number; endHour: number }> = [];
            for (let index = 0; index < slots.length; index += 1) {
              const weekdaySelect = editor.querySelector(`[data-weekday="${index}"]`);
              const startInput = editor.querySelector(`[data-start="${index}"]`);
              const endInput = editor.querySelector(`[data-end="${index}"]`);
              if (
                weekdaySelect instanceof HTMLSelectElement &&
                startInput instanceof HTMLInputElement &&
                endInput instanceof HTMLInputElement
              ) {
                const startHour = timeValueToStartHour(startInput.value);
                const endHour = timeValueToEndHour(endInput.value, startHour);
                const error = validateShiftHours(startHour, endHour);
                if (error !== null) {
                  if (status instanceof HTMLElement) {
                    status.textContent = error;
                    status.className = "error";
                  }
                  return;
                }
                parsed.push({
                  weekday: Number(weekdaySelect.value),
                  startHour,
                  endHour,
                });
              }
            }
            slots.splice(0, slots.length, ...parsed);
            if (status instanceof HTMLElement) {
              status.textContent = "Сохранение…";
              status.className = "muted";
            }
            void updateStaffSchedule(userId, slots).then((result) => {
              if (status instanceof HTMLElement) {
                status.textContent = result.kind === "ok" ? "Сохранено" : result.message;
                status.className = result.kind === "ok" ? "muted" : "error";
              }
              if (result.kind === "ok") {
                member.schedule = [...slots];
                const row = host.querySelector(`[data-edit-schedule="${userId}"]`)?.closest("tr");
                const scheduleCell = row?.querySelector("td:nth-child(4)");
                if (scheduleCell instanceof HTMLElement) {
                  scheduleCell.textContent =
                    slots.length === 0
                      ? "—"
                      : slots
                          .map((slot) => `${WEEKDAY_LABELS[slot.weekday] ?? slot.weekday} ${formatShiftRange(slot.startHour, slot.endHour)}`)
                          .join(", ");
                }
                const gridHost = host.querySelector("[data-schedule-grid]");
                if (gridHost instanceof HTMLElement && members.kind === "ok") {
                  const updated = members.data.members.map((row) =>
                    row.id === userId ? { ...row, schedule: [...slots] } : row,
                  );
                  renderScheduleGrid(gridHost, updated, (edited) => {
                    const editButton = host.querySelector(`[data-edit-schedule="${edited.id}"]`);
                    if (editButton instanceof HTMLButtonElement) {
                      editButton.click();
                    }
                  });
                }
              }
            });
          });
        };
        renderEditor();
      });
    }
  }
};

const renderExport = (host: HTMLElement) => {
  let days = 7;
  const render = () => {
    host.innerHTML = `
      <section class="panel">
        <div class="toolbar">
          <h2>Экспорт CSV</h2>
          ${renderPeriodToolbar(days)}
        </div>
        <p class="muted">Скачивание через текущую Telegram-сессию</p>
        <label>Тип
          <select data-type>
            <option value="ledger">ledger</option>
            <option value="visits">visits</option>
            <option value="checkins">checkins</option>
            <option value="coupons">coupons</option>
            <option value="staff_log">staff_log</option>
          </select>
        </label>
        <div style="margin-top:0.75rem">
          <button type="button" class="action" data-download>Скачать</button>
        </div>
        <p class="muted" data-status style="margin-top:0.5rem"></p>
      </section>
    `;
    bindPeriodToolbar(host, (next) => {
      days = next;
      render();
    });
    host.querySelector("[data-download]")?.addEventListener("click", () => {
      const typeSelect = host.querySelector("[data-type]");
      const status = host.querySelector("[data-status]");
      const type = typeSelect instanceof HTMLSelectElement ? typeSelect.value : "ledger";
      if (status instanceof HTMLElement) {
        status.textContent = "Загрузка…";
        status.className = "muted";
      }
      void downloadExport(type, days).then((result) => {
        if (!(status instanceof HTMLElement)) {
          return;
        }
        status.textContent = result.kind === "ok" ? "Файл скачан" : result.message;
        status.className = result.kind === "ok" ? "muted" : "error";
      });
    });
  };
  render();
};

const renderBroadcasts = async (host: HTMLElement) => {
  showLoadingIfEmpty(host);
  const [data, history] = await Promise.all([fetchBroadcastSegments(), fetchBroadcastHistory()]);
  if (data.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(data.message)}</p></section>`;
    return;
  }
  const options = data.data.segments
    .map((segment) => `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.label)} (${segment.count})</option>`)
    .join("");
  const rows = data.data.segments
    .map(
      (segment) =>
        `<tr><td>${escapeHtml(segment.label)}</td><td><code>${escapeHtml(segment.id)}</code></td><td>${segment.count}</td></tr>`,
    )
    .join("");
  const historyRows =
    history.kind === "ok"
      ? history.data.rows
          .map(
            (row) =>
              `<tr><td>${new Date(row.createdAt).toLocaleString("ru-RU")}</td><td>${escapeHtml(row.body)}</td><td>${escapeHtml(row.segment ?? "—")}</td><td>${row.recipients ?? "—"}</td><td>${row.sent ?? "—"}</td><td>${row.failed ?? "—"}</td></tr>`,
          )
          .join("")
      : "";
  host.innerHTML = `
    <section class="panel">
      <h2>Новая рассылка</h2>
      <label>Сегмент<select data-segment>${options}</select></label>
      <label style="display:block;margin-top:0.5rem">Мин. баланс (для balance_gt)
        <input type="number" data-balance-min value="500" min="0" />
      </label>
      <label style="display:block;margin-top:0.5rem">Текст
        <textarea data-body rows="4" style="width:100%;margin-top:0.25rem"></textarea>
      </label>
      <label style="display:block;margin-top:0.5rem">Telegram photo file_id (опционально)
        <input type="text" data-photo-id placeholder="AgAC..." />
      </label>
      <label style="display:flex;gap:0.5rem;margin-top:0.5rem;align-items:center">
        <input type="checkbox" data-feed /> Показать в «Акции»
      </label>
      <label style="display:flex;gap:0.5rem;margin-top:0.5rem;align-items:center">
        <input type="checkbox" data-save-only /> Только в ленту (не отправлять)
      </label>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
        <button type="button" class="action" data-preview>Предпросмотр</button>
        <button type="button" class="action" data-send>Отправить</button>
      </div>
      <p class="muted" data-status style="margin-top:0.5rem"></p>
    </section>
    <section class="panel">
      <h2>История рассылок</h2>
      <div class="table-wrap">
        <table><thead><tr><th>Дата</th><th>Текст</th><th>Сегмент</th><th>Получателей</th><th>Отправлено</th><th>Ошибок</th></tr></thead><tbody>${historyRows || '<tr><td colspan="6" class="muted">Пока пусто</td></tr>'}</tbody></table>
      </div>
    </section>
    <section class="panel">
      <h2>Сегменты</h2>
      <div class="table-wrap">
        <table><thead><tr><th>Сегмент</th><th>ID</th><th>Получателей</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </section>
  `;
  const readForm = () => {
    const segment = host.querySelector("[data-segment]");
    const body = host.querySelector("[data-body]");
    const balanceMin = host.querySelector("[data-balance-min]");
    const feed = host.querySelector("[data-feed]");
    const saveOnly = host.querySelector("[data-save-only]");
    const photoInput = host.querySelector("[data-photo-id]");
    if (!(segment instanceof HTMLSelectElement) || !(body instanceof HTMLTextAreaElement)) {
      return null;
    }
    const photoRaw = photoInput instanceof HTMLInputElement ? photoInput.value.trim() : "";
    const params =
      segment.value === "balance_gt" && balanceMin instanceof HTMLInputElement
        ? { balanceMin: Number(balanceMin.value) }
        : undefined;
    return {
      segment: segment.value,
      body: body.value.trim(),
      showInFeed: feed instanceof HTMLInputElement && feed.checked,
      sendNow: !(saveOnly instanceof HTMLInputElement && saveOnly.checked),
      photoId: photoRaw.length > 0 ? photoRaw : undefined,
      params,
    };
  };
  const status = host.querySelector("[data-status]");
  host.querySelector("[data-preview]")?.addEventListener("click", () => {
    const form = readForm();
    if (form === null || !(status instanceof HTMLElement)) {
      return;
    }
    status.textContent = "Считаем…";
    void previewBroadcast(form.segment, form.params).then((result) => {
      status.textContent = result.kind === "ok" ? `Получателей: ${result.data.count}` : result.message;
      status.className = result.kind === "ok" ? "muted" : "error";
    });
  });
  host.querySelector("[data-send]")?.addEventListener("click", () => {
    const form = readForm();
    if (form === null || !(status instanceof HTMLElement)) {
      return;
    }
    if (form.body.length === 0) {
      status.textContent = "Введите текст";
      status.className = "error";
      return;
    }
    status.textContent = "Отправка…";
    void sendBroadcast(form).then((result) => {
      status.textContent =
        result.kind === "ok"
          ? `Отправлено ${result.data.sent}, ошибок ${result.data.failed}, всего ${result.data.recipients}`
          : result.message;
      status.className = result.kind === "ok" ? "muted" : "error";
    });
  });
};

const renderSettings = async (host: HTMLElement) => {
  showLoadingIfEmpty(host);
  const [settings, promos] = await Promise.all([fetchSettings(), fetchPromoRules()]);
  if (settings.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(settings.message)}</p></section>`;
    return;
  }
  const s = settings.data.settings;
  const promoRows =
    promos.kind === "ok"
      ? promos.data.rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.label)}</td><td>${row.priority}</td><td>${escapeHtml(JSON.stringify(row.params))}</td></tr>`,
          )
          .join("")
      : "";
  host.innerHTML = `
    <section class="panel">
      <h2>Настройки</h2>
      <form data-settings class="form-grid">
        ${settingLabel("percent", "% с чека", `<input type="number" name="percent" value="${s.percent}" min="0" max="100" />`)}
        ${settingLabel("registrationBonus", "Регистрация", `<input type="number" name="registrationBonus" value="${s.registrationBonus}" min="0" />`)}
        ${settingLabel("birthdayBonus", "ДР бонус", `<input type="number" name="birthdayBonus" value="${s.birthdayBonus}" min="0" />`)}
        ${settingLabel("visitHours", "Визит, ч", `<input type="number" name="visitHours" value="${s.visitHours}" min="1" max="24" />`)}
        ${settingLabel("referralBonusReferrer", "Реф. пригласившему", `<input type="number" name="referralBonusReferrer" value="${s.referralBonusReferrer}" min="0" />`)}
        ${settingLabel("referralBonusReferee", "Реф. другу", `<input type="number" name="referralBonusReferee" value="${s.referralBonusReferee}" min="0" />`)}
        ${settingLabel("maxSessionsPerHour", "Античит/ч", `<input type="number" name="maxSessionsPerHour" value="${s.maxSessionsPerHour}" min="0" />`)}
        ${settingLabel("bookingHoursStart", "Бронь с", `<input type="time" name="bookingHoursStart" value="${encodedToTimeValue(s.bookingHoursStart)}" step="3600" />`)}
        ${settingLabel("bookingHoursEnd", "Бронь до", `<input type="time" name="bookingHoursEnd" value="${encodedToTimeValue(s.bookingHoursEnd)}" step="3600" />`)}
        ${settingLabel("bookingSlotMinutes", "Шаг, мин", `<input type="number" name="bookingSlotMinutes" value="${s.bookingSlotMinutes}" min="15" step="15" />`)}
        ${settingLabel("bookingDurationMinutes", "Длительность брони, мин", `<input type="number" name="bookingDurationMinutes" value="${s.bookingDurationMinutes}" min="30" step="30" />`)}
        <label class="checkbox-row" style="grid-column:1/-1">Закрытые дни (1=Пн … 7=Вс, через запятую) ${infoIcon(SETTING_HINTS.bookingClosedWeekdays ?? "")}
          <input name="bookingClosedWeekdays" value="${s.bookingClosedWeekdays.join(", ")}" />
        </label>
        <label class="checkbox-row">${infoIcon(SETTING_HINTS.referralEnabled ?? "")}<input type="checkbox" name="referralEnabled" ${s.referralEnabled ? "checked" : ""} /><span>Рефералы вкл</span></label>
      </form>
      <button type="button" class="action" data-save-settings style="margin-top:0.75rem">Сохранить</button>
      <p class="muted" data-settings-status style="margin-top:0.5rem"></p>
    </section>
    <section class="panel">
      <h2>Активные акции</h2>
      <div class="table-wrap">
        <table><thead><tr><th>Тип</th><th>Приоритет</th><th>Параметры</th></tr></thead><tbody>${promoRows || '<tr><td colspan="3" class="muted">Нет активных</td></tr>'}</tbody></table>
      </div>
      <p class="muted" style="margin-top:0.5rem">Создание promo rules — в боте</p>
    </section>
  `;
  bindInfoIcons(host);
  host.querySelector("[data-save-settings]")?.addEventListener("click", () => {
    const form = host.querySelector("[data-settings]");
    const status = host.querySelector("[data-settings-status]");
    if (!(form instanceof HTMLFormElement) || !(status instanceof HTMLElement)) {
      return;
    }
    const data = new FormData(form);
    const closedRaw = String(data.get("bookingClosedWeekdays") ?? "").trim();
    const bookingClosedWeekdays =
      closedRaw.length === 0
        ? []
        : closedRaw
            .split(",")
            .map((part) => Number(part.trim()))
            .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
    const bookingStartHour = timeValueToStartHour(String(data.get("bookingHoursStart") ?? "18:00"));
    const bookingEndHour = timeValueToEndHour(String(data.get("bookingHoursEnd") ?? "02:00"), bookingStartHour);
    const bookingHoursError = validateShiftHours(bookingStartHour, bookingEndHour);
    if (bookingHoursError !== null) {
      status.textContent = bookingHoursError;
      status.className = "error";
      return;
    }
    const patch = {
      percent: Number(data.get("percent")),
      registrationBonus: Number(data.get("registrationBonus")),
      birthdayBonus: Number(data.get("birthdayBonus")),
      visitHours: Number(data.get("visitHours")),
      referralBonusReferrer: Number(data.get("referralBonusReferrer")),
      referralBonusReferee: Number(data.get("referralBonusReferee")),
      maxSessionsPerHour: Number(data.get("maxSessionsPerHour")),
      bookingHoursStart: bookingStartHour,
      bookingHoursEnd: bookingEndHour,
      bookingSlotMinutes: Number(data.get("bookingSlotMinutes")),
      bookingDurationMinutes: Number(data.get("bookingDurationMinutes")),
      bookingClosedWeekdays,
      referralEnabled: data.get("referralEnabled") === "on",
    };
    status.textContent = "Сохранение…";
    void patchSettings(patch).then((result) => {
      status.textContent = result.kind === "ok" ? "Сохранено" : result.message;
      status.className = result.kind === "ok" ? "muted" : "error";
    });
  });
};

const renderMenu = async (host: HTMLElement) => {
  showLoadingIfEmpty(host);
  const menu = await fetchMenu();
  if (menu.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(menu.message)}</p></section>`;
    return;
  }
  const textItems = menu.data.rows.filter((item) => !item.isGallery);
  const galleryItems = menu.data.rows.filter((item) => item.isGallery);
  const rows = textItems
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(item.title)}</td>
          <td>${item.priceRubles ?? "—"}</td>
          <td>${item.active ? "да" : "нет"}</td>
          <td>
            <button type="button" class="action" data-edit-menu="${item.id}">✎</button>
            <button type="button" class="action" data-delete-menu="${item.id}">✕</button>
            <button type="button" class="action" data-toggle="${item.id}" data-active="${item.active ? "0" : "1"}">${item.active ? "Скрыть" : "Показать"}</button>
          </td>
        </tr>`,
    )
    .join("");
  const gallery = galleryItems
    .map(
      (item) =>
        `<div class="gallery-item">
          ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : `<p class="muted">Telegram photo</p>`}
          <button type="button" class="action" data-delete-gallery="${item.id}">Удалить</button>
        </div>`,
    )
    .join("");
  host.innerHTML = `
    <section class="panel">
      <h2>Галерея меню</h2>
      <p class="muted">Загрузите фото прайса или картинок меню</p>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-gallery-upload />
      <div class="gallery-grid" style="margin-top:0.75rem">${gallery || '<p class="muted">Пока нет фото</p>'}</div>
      <p class="muted" data-gallery-status style="margin-top:0.5rem"></p>
    </section>
    <section class="panel">
      <h2>Добавить позицию</h2>
      <form data-menu-create class="form-grid">
        <label>Название<input name="title" required /></label>
        <label>Описание<input name="description" /></label>
        <label>Цена<input name="priceRubles" type="number" min="0" /></label>
      </form>
      <button type="button" class="action" data-menu-add style="margin-top:0.75rem">Добавить</button>
      <p class="muted" data-menu-status style="margin-top:0.5rem"></p>
    </section>
    <section class="panel">
      <h2>Текстовое меню</h2>
      <div class="table-wrap">
        <table><thead><tr><th>Название</th><th>Цена</th><th>Активна</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Пусто</td></tr>'}</tbody></table>
      </div>
      <div data-menu-editor class="hidden panel" style="margin-top:1rem"></div>
    </section>
  `;
  const galleryStatus = host.querySelector("[data-gallery-status]");
  const uploadInput = host.querySelector("[data-gallery-upload]");
  if (uploadInput instanceof HTMLInputElement && galleryStatus instanceof HTMLElement) {
    uploadInput.addEventListener("change", () => {
      const files = uploadInput.files;
      if (files === null || files.length === 0) {
        return;
      }
      galleryStatus.textContent = "Загрузка…";
      void Promise.all([...files].map((file) => uploadMenuGallery(file))).then((results) => {
        const failed = results.find((result) => result.kind === "error");
        galleryStatus.textContent = failed?.kind === "error" ? failed.message : `Загружено: ${results.length}`;
        galleryStatus.className = failed?.kind === "error" ? "error" : "muted";
        void preserveScroll(() => renderMenu(host));
      });
    });
  }
  for (const button of host.querySelectorAll("[data-delete-gallery]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-delete-gallery");
      if (id === null) {
        return;
      }
      void deleteMenuGalleryItem(id).then(() => {
        void preserveScroll(() => renderMenu(host));
      });
    });
  }
  const status = host.querySelector("[data-menu-status]");
  host.querySelector("[data-menu-add]")?.addEventListener("click", () => {
    const form = host.querySelector("[data-menu-create]");
    if (!(form instanceof HTMLFormElement) || !(status instanceof HTMLElement)) {
      return;
    }
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "");
    const priceRaw = String(data.get("priceRubles") ?? "").trim();
    const priceRubles = priceRaw.length === 0 ? null : Number(priceRaw);
    void createMenuItem({ title, description, priceRubles }).then((result) => {
      if (result.kind === "error") {
        status.textContent = result.message;
        status.className = "error";
        return;
      }
      void preserveScroll(() => renderMenu(host));
    });
  });
  for (const button of host.querySelectorAll("[data-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-toggle");
      const active = button.getAttribute("data-active") === "1";
      if (id === null) {
        return;
      }
      void updateMenuItem(id, { active }).then(() => {
        void preserveScroll(() => renderMenu(host));
      });
    });
  }
  const editor = host.querySelector("[data-menu-editor]");
  for (const button of host.querySelectorAll("[data-edit-menu]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-edit-menu");
      const item = textItems.find((row) => row.id === id);
      if (id === null || item === undefined || !(editor instanceof HTMLElement)) {
        return;
      }
      editor.classList.remove("hidden");
      editor.innerHTML = `
        <h3>Редактировать: ${escapeHtml(item.title)}</h3>
        <form data-menu-edit class="form-grid">
          <label>Название<input name="title" value="${escapeHtml(item.title)}" required /></label>
          <label>Описание<input name="description" value="${escapeHtml(item.description)}" /></label>
          <label>Цена<input name="priceRubles" type="number" min="0" value="${item.priceRubles ?? ""}" /></label>
          <label>URL картинки<input name="imageUrl" value="${escapeHtml(item.imageUrl ?? "")}" /></label>
        </form>
        <button type="button" class="action" data-save-menu-edit>Сохранить</button>
        <p class="muted" data-menu-edit-status></p>
      `;
      editor.querySelector("[data-save-menu-edit]")?.addEventListener("click", () => {
        const form = editor.querySelector("[data-menu-edit]");
        const editStatus = editor.querySelector("[data-menu-edit-status]");
        if (!(form instanceof HTMLFormElement) || !(editStatus instanceof HTMLElement)) {
          return;
        }
        const data = new FormData(form);
        const title = String(data.get("title") ?? "").trim();
        const description = String(data.get("description") ?? "");
        const priceRaw = String(data.get("priceRubles") ?? "").trim();
        const priceRubles = priceRaw.length === 0 ? null : Number(priceRaw);
        const imageUrlRaw = String(data.get("imageUrl") ?? "").trim();
        editStatus.textContent = "Сохранение…";
        void updateMenuItem(id, {
          title,
          description,
          priceRubles,
          imageUrl: imageUrlRaw.length > 0 ? imageUrlRaw : null,
        }).then((result) => {
          editStatus.textContent = result.kind === "ok" ? "Сохранено" : result.message;
          editStatus.className = result.kind === "ok" ? "muted" : "error";
          if (result.kind === "ok") {
            void preserveScroll(() => renderMenu(host));
          }
        });
      });
    });
  }
  for (const button of host.querySelectorAll("[data-delete-menu]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-delete-menu");
      if (id === null || !confirm("Удалить позицию?")) {
        return;
      }
      void deleteMenuItem(id).then(() => {
        void preserveScroll(() => renderMenu(host));
      });
    });
  }
};

const BOOKING_STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: "", label: "Все" },
  { id: "pending", label: "Ожидают" },
  { id: "confirmed", label: "Подтверждены" },
  { id: "seated", label: "За столом" },
  { id: "cancelled", label: "Отменены" },
];

const bookingStatusLabel = (status: string) => {
  switch (status) {
    case "pending":
      return "ожидает";
    case "confirmed":
      return "подтверждена";
    case "seated":
      return "за столом";
    case "cancelled":
      return "отменена";
    case "completed":
      return "завершена";
    case "no_show":
      return "не пришёл";
    default:
      return status;
  }
};

let bookingsFloorPlanCache: FloorPlanView | null = null;

const renderBookingRowHtml = (row: BookingRow, tableOptions: string, hasFloorPlan: boolean) =>
  `<tr>
    <td>${formatDateTime(row.requestedFor)}</td>
    <td>${escapeHtml(row.guestName || "—")}</td>
    <td>${row.partySize}</td>
    <td>${escapeHtml(row.tableLabel ?? "—")}</td>
    <td>${escapeHtml(bookingStatusLabel(row.status))}</td>
    <td>${escapeHtml(row.comment ?? "")}</td>
    <td>${
      row.status === "pending"
        ? `<button type="button" class="action" data-booking-confirm="${row.id}">✓</button>
           <button type="button" class="action" data-booking-cancel="${row.id}">✕</button>`
        : row.status === "confirmed" && hasFloorPlan
          ? `<select data-booking-table="${row.id}"><option value="">Стол…</option>${tableOptions}</select>
             <button type="button" class="action" data-booking-assign="${row.id}">→</button>`
          : "—"
    }</td>
  </tr>`;

const bindBookingRowActions = (host: HTMLElement, reloadList: () => void) => {
  for (const button of host.querySelectorAll("[data-booking-confirm]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-booking-confirm");
      if (id !== null) {
        void patchBooking(id, "confirmed").then(() => void preserveScroll(reloadList));
      }
    });
  }
  for (const button of host.querySelectorAll("[data-booking-cancel]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-booking-cancel");
      if (id !== null) {
        void patchBooking(id, "cancelled").then(() => void preserveScroll(reloadList));
      }
    });
  }
  for (const button of host.querySelectorAll("[data-booking-assign]")) {
    button.addEventListener("click", () => {
      const bookingId = button.getAttribute("data-booking-assign");
      if (bookingId === null) {
        return;
      }
      const select = host.querySelector(`[data-booking-table="${bookingId}"]`);
      if (!(select instanceof HTMLSelectElement) || select.value.length === 0) {
        return;
      }
      void assignBookingTable(bookingId, select.value).then(() => void preserveScroll(reloadList));
    });
  }
};

const tableOptionsHtml = (floorPlan: FloorPlanView | null) =>
  floorPlan?.tables
    .filter((table) => table.active)
    .map((table) => `<option value="${table.id}">${escapeHtml(table.label)}</option>`)
    .join("") ?? "";

const renderVenueTablesList = (floorPlan: FloorPlanView) =>
  floorPlan.tables
    .map(
      (table) =>
        `<tr><td>${escapeHtml(table.label)}</td><td>${table.seatsMin}-${table.seatsMax}</td><td>${escapeHtml(table.description)}</td><td>${escapeHtml(table.highlights.join(", "))}</td></tr>`,
    )
    .join("") || '<tr><td colspan="4" class="muted">Столов пока нет</td></tr>';

const refreshBookingsList = async (host: HTMLElement) => {
  const statusFilter = host.dataset.bookingsStatus ?? "";
  const listHost = host.querySelector("[data-bookings-list]");
  if (!(listHost instanceof HTMLElement)) {
    return;
  }
  const data = await fetchBookings(14, statusFilter || undefined);
  if (data.kind === "error") {
    listHost.innerHTML = `<p class="error">${escapeHtml(data.message)}</p>`;
    return;
  }
  const tableOptions = tableOptionsHtml(bookingsFloorPlanCache);
  const rows = data.data.rows
    .map((row) => renderBookingRowHtml(row, tableOptions, bookingsFloorPlanCache !== null))
    .join("");
  listHost.innerHTML = `<div class="table-wrap">
    <table><thead><tr><th>Когда</th><th>Гость</th><th>Гостей</th><th>Стол</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="muted">Пусто</td></tr>'}</tbody></table>
  </div>`;
  bindBookingRowActions(host, () => refreshBookingsList(host));
  const pendingCount = data.data.rows.filter((row) => row.status === "pending").length;
  const badge = host.querySelector("[data-pending-count]");
  if (badge instanceof HTMLElement) {
    badge.textContent = pendingCount > 0 ? String(pendingCount) : "";
    badge.classList.toggle("hidden", pendingCount === 0);
  }
};

const mountBookingsFloorSection = (host: HTMLElement, floorPlan: FloorPlanView | null) => {
  const floorHost = host.querySelector("[data-floor-section]");
  if (!(floorHost instanceof HTMLElement)) {
    return;
  }
  if (floorPlan === null) {
    floorHost.innerHTML = `
      <section class="panel" style="margin-top:1rem">
        <h2>Зал</h2>
        <p class="muted">План зала ещё не создан</p>
        <button type="button" class="action" data-create-floor-plan>Создать зал</button>
      </section>`;
    floorHost.querySelector("[data-create-floor-plan]")?.addEventListener("click", () => {
      void saveFloorPlan({ name: "Зал" }).then(() => void preserveScroll(() => renderBookings(host)));
    });
    return;
  }
  bookingsFloorPlanCache = floorPlan;
  floorHost.innerHTML = `
    <section class="panel" style="margin-top:1rem">
      <h2>План зала · ${escapeHtml(floorPlan.name)}</h2>
      <div data-floor-editor></div>
      <form data-new-table class="form-grid" style="margin:1rem 0">
        <label>Название<input name="label" required /></label>
        <label>Мест мин<input type="number" name="seatsMin" value="1" min="1" /></label>
        <label>Мест макс<input type="number" name="seatsMax" value="4" min="1" /></label>
        <label style="grid-column:1/-1">Описание<input name="description" /></label>
        <label style="grid-column:1/-1">Преимущества (через запятую)<input name="highlights" /></label>
      </form>
      <button type="button" class="action" data-add-table>Добавить стол</button>
      <div class="table-wrap" style="margin-top:1rem">
        <table><thead><tr><th>Стол</th><th>Места</th><th>Описание</th><th>Преимущества</th></tr></thead>
        <tbody data-tables-list>${renderVenueTablesList(floorPlan)}</tbody></table>
      </div>
    </section>`;
  const editorHost = floorHost.querySelector("[data-floor-editor]");
  if (editorHost instanceof HTMLElement) {
    mountFloorEditor(editorHost, floorPlan, {
      onStructureChange: () => {
        const list = floorHost.querySelector("[data-tables-list]");
        if (list instanceof HTMLElement && bookingsFloorPlanCache !== null) {
          list.innerHTML = renderVenueTablesList(bookingsFloorPlanCache);
        }
      },
    });
  }
  floorHost.querySelector("[data-add-table]")?.addEventListener("click", () => {
    const form = floorHost.querySelector("[data-new-table]");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    const formData = new FormData(form);
    const highlightsRaw = String(formData.get("highlights") ?? "").trim();
    void createVenueTable({
      floorPlanId: floorPlan.id,
      label: String(formData.get("label") ?? ""),
      description: String(formData.get("description") ?? ""),
      highlights:
        highlightsRaw.length === 0
          ? []
          : highlightsRaw.split(",").map((part) => part.trim()).filter((part) => part.length > 0),
      seatsMin: Number(formData.get("seatsMin")),
      seatsMax: Number(formData.get("seatsMax")),
    }).then(async (result) => {
      if (result.kind !== "ok") {
        return;
      }
      const refreshed = await fetchFloorPlan();
      if (refreshed.kind === "ok" && refreshed.data.floorPlan !== null) {
        bookingsFloorPlanCache = refreshed.data.floorPlan;
        const list = floorHost.querySelector("[data-tables-list]");
        if (list instanceof HTMLElement) {
          list.innerHTML = renderVenueTablesList(refreshed.data.floorPlan);
        }
        if (editorHost instanceof HTMLElement) {
          mountFloorEditor(editorHost, refreshed.data.floorPlan, {
            onStructureChange: () => {
              const list = floorHost.querySelector("[data-tables-list]");
              if (list instanceof HTMLElement && bookingsFloorPlanCache !== null) {
                list.innerHTML = renderVenueTablesList(bookingsFloorPlanCache);
              }
            },
          });
        }
        form.reset();
        void refreshBookingsList(host);
      }
    });
  });
};

const renderBookings = async (host: HTMLElement) => {
  showLoadingIfEmpty(host);
  const statusFilter = host.dataset.bookingsStatus ?? "";
  const [data, floorPlanData] = await Promise.all([
    fetchBookings(14, statusFilter || undefined),
    fetchFloorPlan(),
  ]);
  if (data.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(data.message)}</p></section>`;
    return;
  }
  const floorPlan = floorPlanData.kind === "ok" ? floorPlanData.data.floorPlan : null;
  bookingsFloorPlanCache = floorPlan;
  const pendingCount = data.data.rows.filter((row) => row.status === "pending").length;
  host.innerHTML = `
    <section class="panel">
      <h2>Брони (14 дней) <span class="pill-badge ${pendingCount === 0 ? "hidden" : ""}" data-pending-count>${pendingCount > 0 ? pendingCount : ""}</span></h2>
      <div class="booking-filters">
        ${BOOKING_STATUS_FILTERS.map(
          (filter) =>
            `<button type="button" class="action ${filter.id === statusFilter ? "active-filter" : ""}" data-booking-status="${filter.id}">${filter.label}</button>`,
        ).join("")}
        <button type="button" class="action" data-refresh-bookings>↻ Обновить</button>
      </div>
      <div data-bookings-list></div>
    </section>
    <div data-floor-section></div>
  `;
  for (const button of host.querySelectorAll("[data-booking-status]")) {
    button.addEventListener("click", () => {
      host.dataset.bookingsStatus = button.getAttribute("data-booking-status") ?? "";
      void preserveScroll(() => refreshBookingsList(host));
      for (const other of host.querySelectorAll("[data-booking-status]")) {
        other.classList.toggle("active-filter", other === button);
      }
    });
  }
  host.querySelector("[data-refresh-bookings]")?.addEventListener("click", () => {
    void preserveScroll(async () => {
      await refreshBookingsList(host);
      const refreshed = await fetchFloorPlan();
      if (refreshed.kind === "ok") {
        mountBookingsFloorSection(host, refreshed.data.floorPlan);
      }
    });
  });
  await refreshBookingsList(host);
  mountBookingsFloorSection(host, floorPlan);
};

const renderContactEntryRow = (entry: ContactEntry, index: number) => {
  return `<div class="form-grid contact-row" data-contact-row="${index}" style="margin-bottom:0.75rem">
    <label>Название<input data-contact-label value="${escapeHtml(entry.label)}" /></label>
    <label>Значение<input data-contact-value value="${escapeHtml(entry.value)}" /></label>
    <label>Описание<input data-contact-description value="${escapeHtml(entry.description ?? "")}" placeholder="Необязательно" /></label>
    <button type="button" class="action" data-remove-contact="${index}">Удалить</button>
  </div>`;
};

const renderContent = async (host: HTMLElement) => {
  showLoadingIfEmpty(host);
  const [contacts, directions] = await Promise.all([fetchContentPage("contacts"), fetchContentPage("directions")]);
  if (contacts.kind === "error" || directions.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">Ошибка загрузки</p></section>`;
    return;
  }
  const contactEntries: ContactEntry[] =
    "contacts" in contacts.data && Array.isArray(contacts.data.contacts)
      ? contacts.data.contacts
      : [{ label: "Контакты", value: contacts.data.page.body }];
  host.innerHTML = `
    <section class="panel">
      <h2>Контакты</h2>
      <div data-contacts-list>${contactEntries.map((entry, index) => renderContactEntryRow(entry, index)).join("")}</div>
      <button type="button" class="action" data-add-contact style="margin-top:0.5rem">Добавить контакт</button>
      <button type="button" class="action" data-save-contacts style="margin-top:0.75rem">Сохранить</button>
      <p class="muted" data-contacts-status style="margin-top:0.5rem"></p>
    </section>
    <section class="panel">
      <h2>Как доехать</h2>
      <textarea data-directions rows="5" style="width:100%">${escapeHtml(directions.data.page.body)}</textarea>
      <label style="display:block;margin-top:0.5rem">Ссылка на карту
        <input data-map-url value="${escapeHtml(directions.data.page.mapUrl ?? "")}" style="width:100%" />
      </label>
      <button type="button" class="action" data-save-directions style="margin-top:0.75rem">Сохранить</button>
      <p class="muted" data-content-status style="margin-top:0.5rem"></p>
    </section>
  `;
  const status = host.querySelector("[data-content-status]");
  const contactsStatus = host.querySelector("[data-contacts-status]");
  const contactsList = host.querySelector("[data-contacts-list]");
  const readContacts = (): ContactEntry[] => {
    if (!(contactsList instanceof HTMLElement)) {
      return [];
    }
    return [...contactsList.querySelectorAll("[data-contact-row]")].map((row) => {
      const label = row.querySelector("[data-contact-label]");
      const value = row.querySelector("[data-contact-value]");
      const description = row.querySelector("[data-contact-description]");
      return {
        label: label instanceof HTMLInputElement ? label.value.trim() : "",
        value: value instanceof HTMLInputElement ? value.value.trim() : "",
        description:
          description instanceof HTMLInputElement && description.value.trim().length > 0
            ? description.value.trim()
            : undefined,
      };
    });
  };
  host.querySelector("[data-add-contact]")?.addEventListener("click", () => {
    if (!(contactsList instanceof HTMLElement)) {
      return;
    }
    const index = contactsList.querySelectorAll("[data-contact-row]").length;
    contactsList.insertAdjacentHTML("beforeend", renderContactEntryRow({ label: "", value: "" }, index));
  });
  contactsList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const remove = target.closest("[data-remove-contact]");
    if (remove instanceof HTMLElement) {
      remove.closest("[data-contact-row]")?.remove();
    }
  });
  host.querySelector("[data-save-contacts]")?.addEventListener("click", () => {
    if (!(contactsStatus instanceof HTMLElement)) {
      return;
    }
    contactsStatus.textContent = "Сохранение…";
    void patchContacts(readContacts()).then((result) => {
      contactsStatus.textContent = result.kind === "ok" ? "Сохранено" : result.message;
      contactsStatus.className = result.kind === "ok" ? "muted" : "error";
    });
  });
  host.querySelector("[data-save-directions]")?.addEventListener("click", () => {
    const textarea = host.querySelector("[data-directions]");
    const mapInput = host.querySelector("[data-map-url]");
    if (!(textarea instanceof HTMLTextAreaElement) || !(mapInput instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
      return;
    }
    status.textContent = "Сохранение…";
    void patchContentPage("directions", textarea.value, mapInput.value.trim() || null).then((result) => {
      status.textContent = result.kind === "ok" ? "Сохранено" : result.message;
      status.className = result.kind === "ok" ? "muted" : "error";
    });
  });
};

const renderGames = async (host: HTMLElement) => {
  showLoadingIfEmpty(host);
  const [quiz, rows, questions] = await Promise.all([
    fetchLiveQuiz(),
    fetchRejectedSessions(),
    fetchQuizQuestions(),
  ]);
  if (rows.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(rows.message)}</p></section>`;
    return;
  }
  const quizBlock =
    quiz.kind === "ok" && quiz.data.live !== null
      ? `<p>Live викторина · ${quiz.data.live.questionCount} вопр. · до ${new Date(quiz.data.live.endsAt).toLocaleString("ru-RU")}</p>`
      : `<p class="muted">Live викторина не запущена</p>`;
  const questionRows =
    questions.kind === "ok"
      ? questions.data.rows
          .map(
            (q) =>
              `<tr>
                <td>${q.sort}</td>
                <td>${escapeHtml(q.text)}</td>
                <td>${q.imageUrl ? "да" : "—"}</td>
                <td>
                  <button type="button" class="action" data-edit-question="${q.id}">✎</button>
                  <button type="button" class="action" data-delete-question="${q.id}">✕</button>
                </td>
              </tr>`,
          )
          .join("")
      : "";
  const body = rows.data.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.slug)}</td><td>${row.points}</td><td>${escapeHtml(row.rejectReason ?? "—")}</td><td>${new Date(row.createdAt).toLocaleString("ru-RU")}</td></tr>`,
    )
    .join("");
  host.innerHTML = `
    <section class="panel">
      <h2>Викторина</h2>
      ${quizBlock}
      <button type="button" class="action" data-start-quiz>Запустить на 30 мин</button>
      <p class="muted" data-quiz-status style="margin-top:0.5rem"></p>
      <h3 style="margin-top:1rem">Вопросы</h3>
      <form data-quiz-create class="form-grid" style="margin-top:0.5rem">
        <label style="grid-column:1/-1">Вопрос<input name="text" required /></label>
        <label>URL картинки<input name="imageUrl" /></label>
        <label>Вариант 1<input name="opt0" required /></label>
        <label>Вариант 2<input name="opt1" required /></label>
        <label>Вариант 3<input name="opt2" required /></label>
        <label>Вариант 4<input name="opt3" required /></label>
        <label>Правильный (1-4)<input name="correct" type="number" min="1" max="4" value="1" /></label>
      </form>
      <button type="button" class="action" data-add-question style="margin-top:0.5rem">Добавить вопрос</button>
      <div class="table-wrap" style="margin-top:0.75rem">
        <table><thead><tr><th>#</th><th>Вопрос</th><th>Фото</th><th></th></tr></thead><tbody>${questionRows || '<tr><td colspan="4" class="muted">Пока нет вопросов</td></tr>'}</tbody></table>
      </div>
      <div data-question-editor class="hidden" style="margin-top:1rem"></div>
    </section>
    <section class="panel" style="margin-top:1rem">
      <h2>Подозрительные партии</h2>
      <table><thead><tr><th>Игра</th><th>Очки</th><th>Причина</th><th>Дата</th></tr></thead><tbody>${body || '<tr><td colspan="4" class="muted">Пусто</td></tr>'}</tbody></table>
    </section>
  `;
  host.querySelector("[data-start-quiz]")?.addEventListener("click", () => {
    const status = host.querySelector("[data-quiz-status]");
    if (!(status instanceof HTMLElement)) {
      return;
    }
    status.textContent = "Запуск…";
    void startQuiz(30).then((result) => {
      if (result.kind === "error") {
        status.textContent = result.message;
        status.className = "error";
        return;
      }
      void preserveScroll(() => renderGames(host));
    });
  });
  host.querySelector("[data-add-question]")?.addEventListener("click", () => {
    const form = host.querySelector("[data-quiz-create]");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    const data = new FormData(form);
    const text = String(data.get("text") ?? "").trim();
    const options = [0, 1, 2, 3].map((index) => String(data.get(`opt${index}`) ?? "").trim());
    const correct = Number(data.get("correct"));
    const imageUrlRaw = String(data.get("imageUrl") ?? "").trim();
    void createQuizQuestion({
      text,
      options,
      correctIndex: Math.max(0, Math.min(3, correct - 1)),
      imageUrl: imageUrlRaw.length > 0 ? imageUrlRaw : null,
    }).then(() => {
      void preserveScroll(() => renderGames(host));
    });
  });
  for (const button of host.querySelectorAll("[data-delete-question]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-delete-question");
      if (id !== null) {
        void deleteQuizQuestion(id).then(() => preserveScroll(() => renderGames(host)));
      }
    });
  }
  if (questions.kind === "ok") {
    const editor = host.querySelector("[data-question-editor]");
    for (const button of host.querySelectorAll("[data-edit-question]")) {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-edit-question");
        const q = questions.data.rows.find((row) => row.id === id);
        if (id === null || q === undefined || !(editor instanceof HTMLElement)) {
          return;
        }
        editor.classList.remove("hidden");
        editor.innerHTML = `
          <form data-quiz-edit class="form-grid">
            <label style="grid-column:1/-1">Вопрос<input name="text" value="${escapeHtml(q.text)}" /></label>
            <label>URL картинки<input name="imageUrl" value="${escapeHtml(q.imageUrl ?? "")}" /></label>
            ${q.options.map((opt, index) => `<label>Вариант ${index + 1}<input name="opt${index}" value="${escapeHtml(opt)}" /></label>`).join("")}
            <label>Правильный (1-4)<input name="correct" type="number" min="1" max="4" value="${q.correctIndex + 1}" /></label>
          </form>
          <button type="button" class="action" data-save-question>Сохранить</button>
        `;
        editor.querySelector("[data-save-question]")?.addEventListener("click", () => {
          const editForm = editor.querySelector("[data-quiz-edit]");
          if (!(editForm instanceof HTMLFormElement)) {
            return;
          }
          const data = new FormData(editForm);
          void updateQuizQuestion(id, {
            text: String(data.get("text") ?? ""),
            imageUrl: String(data.get("imageUrl") ?? "").trim() || null,
            options: [0, 1, 2, 3].map((index) => String(data.get(`opt${index}`) ?? "")),
            correctIndex: Number(data.get("correct")) - 1,
          }).then(() => preserveScroll(() => renderGames(host)));
        });
      });
    }
  }
};

const renderApp = async (root: HTMLElement, tab: Tab) => {
  renderShell(root, tab);
  const host = viewHost(root);
  switch (tab) {
    case "dashboard":
      await renderDashboard(host, {
        period: 7,
        metric: "visits",
        granularity: "day",
        heatmapSource: "visits",
      });
      break;
    case "guests":
      renderGuests(host);
      break;
    case "bookings":
      await renderBookings(host);
      break;
    case "broadcasts":
      await renderBroadcasts(host);
      break;
    case "settings":
      await renderSettings(host);
      break;
    case "menu":
      await renderMenu(host);
      break;
    case "staff":
      await renderStaff(host, 7);
      break;
    case "content":
      await renderContent(host);
      break;
    case "export":
      renderExport(host);
      break;
    case "games":
      await renderGames(host);
      break;
    case "brand":
      await renderBrandPanel(host);
      break;
    case "game-skins":
      await renderGameSkinsPanel(host);
      break;
    default:
      break;
  }
};

export const bootAdmin = async (root: HTMLElement) => {
  const me = await fetchMe();
  if (me.kind === "error") {
    root.textContent = me.message;
    return;
  }
  if (me.data.role !== "admin") {
    root.textContent = "Только для админа";
    return;
  }
  await renderApp(root, "dashboard");
};
