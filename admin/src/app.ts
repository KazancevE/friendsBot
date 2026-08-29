import {
  downloadExport,
  fetchBroadcastSegments,
  fetchGuest,
  fetchGuestLedger,
  fetchLiveQuiz,
  fetchMe,
  fetchPromoRules,
  fetchRejectedSessions,
  fetchSettings,
  fetchStaffLog,
  fetchStats,
  searchGuests,
} from "./api.ts";
import "./style.css";

type Tab = "dashboard" | "guests" | "broadcasts" | "settings" | "staff" | "export" | "games";

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const formatName = (first: string | null, last: string | null) => {
  return `${first ?? ""} ${last ?? ""}`.trim() || "—";
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
      ${["dashboard", "guests", "broadcasts", "settings", "staff", "export", "games"]
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

const renderDashboard = async (host: HTMLElement) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const days = 7;
  const stats = await fetchStats(days);
  if (stats.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(stats.message)}</p></section>`;
    return;
  }
  const s = stats.data;
  host.innerHTML = `
    <section class="panel">
      <h2>Дашборд · ${days} дней</h2>
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
  `;
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
    <p>Телефон: ${escapeHtml(card.data.phone ?? "—")}</p>
    <p>Баланс: ${card.data.balance}</p>
    ${card.data.staffNote ? `<p>Заметка: ${escapeHtml(card.data.staffNote)}</p>` : ""}
    <h4>История</h4>
    <table><thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Комментарий</th></tr></thead><tbody>${ledgerRows}</tbody></table>
  `;
};

const renderStaff = async (host: HTMLElement) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const log = await fetchStaffLog();
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
      <h2>История персонала</h2>
      <table><thead><tr><th>Дата</th><th>Действие</th><th>Гость</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
  `;
};

const renderExport = (host: HTMLElement) => {
  host.innerHTML = `
    <section class="panel">
      <h2>Экспорт CSV</h2>
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
        <button type="button" class="action" data-download>Скачать за 7 дней</button>
      </div>
      <p class="muted" data-status style="margin-top:0.5rem"></p>
    </section>
  `;
  host.querySelector("[data-download]")?.addEventListener("click", () => {
    const typeSelect = host.querySelector("[data-type]");
    const status = host.querySelector("[data-status]");
    const type = typeSelect instanceof HTMLSelectElement ? typeSelect.value : "ledger";
    if (status instanceof HTMLElement) {
      status.textContent = "Загрузка…";
    }
    void downloadExport(type, 7).then((result) => {
      if (!(status instanceof HTMLElement)) {
        return;
      }
      status.textContent = result.kind === "ok" ? "Файл скачан" : result.message;
      status.className = result.kind === "ok" ? "muted" : "error";
    });
  });
};

const renderBroadcasts = async (host: HTMLElement) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const data = await fetchBroadcastSegments();
  if (data.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="error">${escapeHtml(data.message)}</p></section>`;
    return;
  }
  const rows = data.data.segments
    .map(
      (segment) =>
        `<tr><td>${escapeHtml(segment.label)}</td><td><code>${escapeHtml(segment.id)}</code></td><td>${segment.count}</td></tr>`,
    )
    .join("");
  host.innerHTML = `
    <section class="panel">
      <h2>Сегменты рассылки</h2>
      <p class="muted">Отправка — в боте. Здесь предпросмотр аудитории (balance_gt ≥ 500, weekly_top топ-3).</p>
      <table><thead><tr><th>Сегмент</th><th>ID</th><th>Получателей</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
  `;
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
      <div class="grid">
        <div class="stat"><div class="stat-label">% с чека</div><div class="stat-value">${s.percent}</div></div>
        <div class="stat"><div class="stat-label">Регистрация</div><div class="stat-value">${s.registrationBonus}</div></div>
        <div class="stat"><div class="stat-label">ДР бонус</div><div class="stat-value">${s.birthdayBonus}</div></div>
        <div class="stat"><div class="stat-label">Визит, ч</div><div class="stat-value">${s.visitHours}</div></div>
        <div class="stat"><div class="stat-label">Реферал вкл</div><div class="stat-value">${s.referralEnabled ? "да" : "нет"}</div></div>
        <div class="stat"><div class="stat-label">Реф. бонус</div><div class="stat-value">${s.referralBonusReferrer}/${s.referralBonusReferee}</div></div>
        <div class="stat"><div class="stat-label">TTL чека</div><div class="stat-value">${s.checkBonusTtlDays} д</div></div>
        <div class="stat"><div class="stat-label">Античит/ч</div><div class="stat-value">${s.maxSessionsPerHour}</div></div>
      </div>
    </section>
    <section class="panel" style="margin-top:1rem">
      <h2>Активные акции</h2>
      <table><thead><tr><th>Тип</th><th>Приоритет</th><th>Параметры</th></tr></thead><tbody>${promoRows || '<tr><td colspan="3" class="muted">Нет активных</td></tr>'}</tbody></table>
      <p class="muted" style="margin-top:0.5rem">Создание и редактирование — в боте</p>
    </section>
  `;
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
      <p class="muted">Запуск — в боте «Викторина»</p>
    </section>
    <section class="panel" style="margin-top:1rem">
      <h2>Подозрительные партии</h2>
      <table><thead><tr><th>Игра</th><th>Очки</th><th>Причина</th><th>Дата</th></tr></thead><tbody>${body || '<tr><td colspan="4" class="muted">Пусто</td></tr>'}</tbody></table>
    </section>
  `;
};

const renderApp = async (root: HTMLElement, tab: Tab) => {
  renderShell(root, tab);
  const host = viewHost(root);
  switch (tab) {
    case "dashboard":
      await renderDashboard(host);
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
    case "staff":
      await renderStaff(host);
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
