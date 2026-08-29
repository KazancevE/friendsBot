import {
  createMenuItem,
  downloadExport,
  fetchBroadcastSegments,
  fetchGuest,
  fetchGuestLedger,
  fetchLiveQuiz,
  fetchMe,
  fetchMenu,
  fetchPromoRules,
  fetchRejectedSessions,
  fetchSettings,
  fetchStaffLog,
  fetchStaffStats,
  fetchStats,
  fetchTimeseries,
  patchSettings,
  previewBroadcast,
  searchGuests,
  sendBroadcast,
  startQuiz,
  updateMenuItem,
  type StatsMetric,
} from "./api.ts";
import "./style.css";

type Tab = "dashboard" | "guests" | "broadcasts" | "settings" | "menu" | "staff" | "export" | "games";
type DashboardPeriod = 7 | 30 | 90;

const PERIOD_OPTIONS: DashboardPeriod[] = [7, 30, 90];
const METRIC_OPTIONS: { id: StatsMetric; label: string }[] = [
  { id: "visits", label: "Визиты" },
  { id: "checkins", label: "Check-in" },
  { id: "bonuses", label: "Бонусы" },
];

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const formatName = (first: string | null, last: string | null) => {
  return `${first ?? ""} ${last ?? ""}`.trim() || "—";
};

const formatDateTime = (value: string | null | undefined) => {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Date(value).toLocaleString("ru-RU");
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
      if (next === 7 || next === 30 || next === 90) {
        onChange(next);
      }
    });
  }
};

const renderShell = (root: HTMLElement, active: Tab) => {
  root.innerHTML = `
    <header>
      <div>
        <h1>Друзья — админ</h1>
        <p class="muted">Веб-панель v1</p>
      </div>
    </header>
    <nav>
      ${["dashboard", "guests", "broadcasts", "settings", "menu", "staff", "export", "games"]
        .map((tab) => {
          const label =
            tab === "dashboard"
              ? "Дашборд"
              : tab === "guests"
                ? "Гости"
                : tab === "broadcasts"
                  ? "Рассылки"
                  : tab === "settings"
                    ? "Настройки"
                    : tab === "menu"
                      ? "Меню"
                      : tab === "staff"
                        ? "Персонал"
                        : tab === "export"
                          ? "Экспорт"
                          : "Игры";
          return `<button type="button" data-tab="${tab}" class="${tab === active ? "active" : ""}">${label}</button>`;
        })
        .join("")}
    </nav>
    <main data-view></main>
  `;
  for (const button of root.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-tab") as Tab;
      void renderApp(root, tab);
    });
  }
};

const viewHost = (root: HTMLElement) => {
  const host = root.querySelector("[data-view]");
  if (!(host instanceof HTMLElement)) {
    throw new Error("view host missing");
  }
  return host;
};

const renderDashboard = async (host: HTMLElement, period: DashboardPeriod, metric: StatsMetric) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const [stats, series, staff] = await Promise.all([
    fetchStats(period),
    fetchTimeseries(metric, period),
    fetchStaffStats(period),
  ]);
  if (stats.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(stats.message)}</p></section>`;
    return;
  }
  const s = stats.data;
  const maxValue =
    series.kind === "ok" ? Math.max(1, ...series.data.points.map((point) => point.value)) : 1;
  const chartRows =
    series.kind === "ok"
      ? series.data.points
          .map((point) => {
            const width = Math.round((point.value / maxValue) * 100);
            const label = point.date.slice(5);
            return `<div class="chart-row"><span class="chart-label">${label}</span><div class="chart-bar"><span style="width:${width}%"></span></div><span class="chart-value">${point.value}</span></div>`;
          })
          .join("")
      : `<p class="error">${escapeHtml(series.message)}</p>`;
  const staffRows =
    staff.kind === "ok"
      ? staff.data.rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.name)}</td><td>${row.actions}</td></tr>`,
          )
          .join("")
      : "";
  host.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <h2>Дашборд</h2>
        <div class="pill-group" data-period>
          ${PERIOD_OPTIONS.map((days) => `<button type="button" data-days="${days}" class="${days === period ? "active" : ""}">${days} д</button>`).join("")}
        </div>
      </div>
      <div class="grid">
        <div class="stat"><div class="stat-label">Регистрации</div><div class="stat-value">${s.registrations}</div></div>
        <div class="stat"><div class="stat-label">Визиты</div><div class="stat-value">${s.visits}</div></div>
        <div class="stat"><div class="stat-label">Check-in</div><div class="stat-value">${s.checkIns}</div></div>
        <div class="stat"><div class="stat-label">Начислено</div><div class="stat-value">${s.bonusesCredited}</div></div>
        <div class="stat"><div class="stat-label">Списано</div><div class="stat-value">${s.bonusesRedeemed}</div></div>
        <div class="stat"><div class="stat-label">Liability</div><div class="stat-value">${s.bonusLiability}</div></div>
        <div class="stat"><div class="stat-label">Средний чек</div><div class="stat-value">${s.averageCheckRubles ?? "—"}</div></div>
        <div class="stat"><div class="stat-label">Рефералы</div><div class="stat-value">${s.referralActivations}</div></div>
      </div>
    </section>
    <section class="panel">
      <div class="toolbar">
        <h2>По дням</h2>
        <div class="pill-group" data-metric-group>
          ${METRIC_OPTIONS.map((option) => `<button type="button" data-metric="${option.id}" class="${option.id === metric ? "active" : ""}">${option.label}</button>`).join("")}
        </div>
      </div>
      <div class="chart">${chartRows}</div>
    </section>
    <section class="panel">
      <h2>Топ персонала</h2>
      <table><thead><tr><th>Сотрудник</th><th>Действий</th></tr></thead><tbody>${staffRows || '<tr><td colspan="2" class="muted">Нет данных</td></tr>'}</tbody></table>
    </section>
  `;
  for (const button of host.querySelectorAll("[data-period] [data-days]")) {
    button.addEventListener("click", () => {
      const days = Number(button.getAttribute("data-days"));
      if (days === 7 || days === 30 || days === 90) {
        void renderDashboard(host, days, metric);
      }
    });
  }
  for (const button of host.querySelectorAll("[data-metric-group] [data-metric]")) {
    button.addEventListener("click", () => {
      const nextMetric = button.getAttribute("data-metric");
      if (nextMetric === "visits" || nextMetric === "checkins" || nextMetric === "bonuses") {
        void renderDashboard(host, period, nextMetric);
      }
    });
  }
};

const renderGuests = (host: HTMLElement) => {
  host.innerHTML = `
    <section class="panel">
      <h2>Гости</h2>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem">
        <input type="search" placeholder="Имя или телефон" data-query style="flex:1" />
        <button type="button" class="action" data-search>Найти</button>
      </div>
      <div data-results class="list"></div>
      <div data-detail class="panel hidden" style="margin-top:1rem"></div>
    </section>
  `;
  const queryInput = host.querySelector("[data-query]");
  const results = host.querySelector("[data-results]");
  const detail = host.querySelector("[data-detail]");
  const runSearch = async () => {
    if (!(queryInput instanceof HTMLInputElement) || !(results instanceof HTMLElement)) {
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
          `<button type="button" data-guest="${guest.id}">${escapeHtml(formatName(guest.firstName, guest.lastName))} · ${guest.balance} б.</button>`,
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
};

const showGuest = async (detail: Element | null, guestId: string) => {
  if (!(detail instanceof HTMLElement)) {
    return;
  }
  detail.classList.remove("hidden");
  detail.innerHTML = `<p class="muted">Загрузка карточки…</p>`;
  const [card, ledger] = await Promise.all([fetchGuest(guestId), fetchGuestLedger(guestId)]);
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
  detail.innerHTML = `
    <h3>${escapeHtml(formatName(card.data.firstName, card.data.lastName))}</h3>
    <div class="grid guest-meta">
      <div class="stat"><div class="stat-label">Телефон</div><div class="stat-value stat-value-sm">${escapeHtml(card.data.phone ?? "—")}</div></div>
      <div class="stat"><div class="stat-label">Баланс</div><div class="stat-value stat-value-sm">${card.data.balance}</div></div>
      <div class="stat"><div class="stat-label">Визитов</div><div class="stat-value stat-value-sm">${card.data.totalVisits ?? "—"}</div></div>
      <div class="stat"><div class="stat-label">Check-in сегодня</div><div class="stat-value stat-value-sm">${card.data.checkedInToday ? "да" : "нет"}</div></div>
    </div>
    ${card.data.visitActive ? `<p>Активный визит до ${formatDateTime(card.data.visitEndsAt ?? null)}</p>` : ""}
    ${card.data.birthdayWeek ? `<p>Неделя ДР${card.data.birthdayDaysUntil !== null && card.data.birthdayDaysUntil !== undefined ? ` · через ${card.data.birthdayDaysUntil} д` : ""}</p>` : ""}
    ${card.data.staffNote ? `<p>Заметка: ${escapeHtml(card.data.staffNote)}</p>` : ""}
    ${
      card.data.coupons && card.data.coupons.length > 0
        ? `<p>Купоны: ${card.data.coupons.map((coupon) => escapeHtml(coupon.title)).join(", ")}</p>`
        : ""
    }
    <h4>История</h4>
    <div class="table-wrap">
      <table><thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Комментарий</th></tr></thead><tbody>${ledgerRows}</tbody></table>
    </div>
  `;
};

const renderStaff = async (host: HTMLElement, days = 7) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const log = await fetchStaffLog(days);
  if (log.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(log.message)}</p></section>`;
    return;
  }
  const rows = log.data.rows
    .map(
      (row) =>
        `<tr><td>${new Date(row.createdAt).toLocaleString("ru-RU")}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.guestId ?? "—")}</td></tr>`,
    )
    .join("");
  host.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <h2>История персонала</h2>
        ${renderPeriodToolbar(days)}
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Дата</th><th>Действие</th><th>Гость</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">Пусто</td></tr>'}</tbody></table>
      </div>
    </section>
  `;
  bindPeriodToolbar(host, (next) => {
    void renderStaff(host, next);
  });
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
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const data = await fetchBroadcastSegments();
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
      <label style="display:flex;gap:0.5rem;margin-top:0.5rem;align-items:center">
        <input type="checkbox" data-feed /> Показать в «Акции»
      </label>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
        <button type="button" class="action" data-preview>Предпросмотр</button>
        <button type="button" class="action" data-send>Отправить</button>
      </div>
      <p class="muted" data-status style="margin-top:0.5rem"></p>
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
    if (!(segment instanceof HTMLSelectElement) || !(body instanceof HTMLTextAreaElement)) {
      return null;
    }
    const params =
      segment.value === "balance_gt" && balanceMin instanceof HTMLInputElement
        ? { balanceMin: Number(balanceMin.value) }
        : undefined;
    return {
      segment: segment.value,
      body: body.value.trim(),
      showInFeed: feed instanceof HTMLInputElement && feed.checked,
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
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
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
        <label>% с чека<input type="number" name="percent" value="${s.percent}" min="0" max="100" /></label>
        <label>Регистрация<input type="number" name="registrationBonus" value="${s.registrationBonus}" min="0" /></label>
        <label>ДР бонус<input type="number" name="birthdayBonus" value="${s.birthdayBonus}" min="0" /></label>
        <label>Визит, ч<input type="number" name="visitHours" value="${s.visitHours}" min="1" max="24" /></label>
        <label>Реф. пригласившему<input type="number" name="referralBonusReferrer" value="${s.referralBonusReferrer}" min="0" /></label>
        <label>Реф. другу<input type="number" name="referralBonusReferee" value="${s.referralBonusReferee}" min="0" /></label>
        <label>Античит/ч<input type="number" name="maxSessionsPerHour" value="${s.maxSessionsPerHour}" min="0" /></label>
        <label style="display:flex;align-items:center;gap:0.5rem"><input type="checkbox" name="referralEnabled" ${s.referralEnabled ? "checked" : ""} /> Рефералы вкл</label>
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
  host.querySelector("[data-save-settings]")?.addEventListener("click", () => {
    const form = host.querySelector("[data-settings]");
    const status = host.querySelector("[data-settings-status]");
    if (!(form instanceof HTMLFormElement) || !(status instanceof HTMLElement)) {
      return;
    }
    const data = new FormData(form);
    const patch = {
      percent: Number(data.get("percent")),
      registrationBonus: Number(data.get("registrationBonus")),
      birthdayBonus: Number(data.get("birthdayBonus")),
      visitHours: Number(data.get("visitHours")),
      referralBonusReferrer: Number(data.get("referralBonusReferrer")),
      referralBonusReferee: Number(data.get("referralBonusReferee")),
      maxSessionsPerHour: Number(data.get("maxSessionsPerHour")),
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
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const menu = await fetchMenu();
  if (menu.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(menu.message)}</p></section>`;
    return;
  }
  const rows = menu.data.rows
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.title)}</td><td>${item.priceRubles ?? "—"}</td><td>${item.active ? "да" : "нет"}</td><td><button type="button" class="action" data-toggle="${item.id}" data-active="${item.active ? "0" : "1"}">${item.active ? "Скрыть" : "Показать"}</button></td></tr>`,
    )
    .join("");
  host.innerHTML = `
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
      <h2>Меню</h2>
      <div class="table-wrap">
        <table><thead><tr><th>Название</th><th>Цена</th><th>Активна</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Пусто</td></tr>'}</tbody></table>
      </div>
    </section>
  `;
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
      void renderMenu(host);
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
        void renderMenu(host);
      });
    });
  }
};

const renderGames = async (host: HTMLElement) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const [quiz, rows] = await Promise.all([fetchLiveQuiz(), fetchRejectedSessions()]);
  if (rows.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(rows.message)}</p></section>`;
    return;
  }
  const quizBlock =
    quiz.kind === "ok" && quiz.data.live !== null
      ? `<p>Live викторина · ${quiz.data.live.questionCount} вопр. · до ${new Date(quiz.data.live.endsAt).toLocaleString("ru-RU")}</p>`
      : `<p class="muted">Live викторина не запущена</p>`;
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
      void renderGames(host);
    });
  });
};

const renderApp = async (root: HTMLElement, tab: Tab) => {
  renderShell(root, tab);
  const host = viewHost(root);
  switch (tab) {
    case "dashboard":
      await renderDashboard(host, 7, "visits");
      break;
    case "guests":
      renderGuests(host);
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
    case "export":
      renderExport(host);
      break;
    case "games":
      await renderGames(host);
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
