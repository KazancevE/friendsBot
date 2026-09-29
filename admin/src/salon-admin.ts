import "./salon.css";

type Catalog = {
  branches: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string; prices: Array<{ branchId: string; level: string; levelLabel: string; priceRub: number; durationMinutes: number; priceFrom: boolean }> }>;
  masters: Array<{ id: string; name: string; levelLabel: string; branchName: string }>;
};

const api = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? "Ошибка");
  }
  return data;
};

const barnaul = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Barnaul", ...options }).format(new Date(iso));

export const bootSalonAdmin = (root: HTMLElement) => {
  root.innerHTML = `
    <div class="login">
      <form id="login">
        <img class="brand-logo" src="/site/logo.png" alt="BRO" />
        <p class="muted">Кабинет сети BRO, Барнаул.</p>
        <div class="row"><input name="login" placeholder="Логин" value="admin" /></div>
        <div class="row"><input name="password" type="password" placeholder="Пароль" /></div>
        <button class="primary" type="submit">Войти</button>
        <p class="error" id="login-error"></p>
      </form>
    </div>`;
  root.querySelector("#login")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const login = (form.elements.namedItem("login") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    try {
      await api("/api/salon/admin/login", { method: "POST", body: JSON.stringify({ login, password }) });
      renderApp(root);
    } catch (error) {
      const node = root.querySelector("#login-error");
      if (node) node.textContent = error instanceof Error ? error.message : "Ошибка входа";
    }
  });
  void api("/api/salon/admin/session").then(() => renderApp(root)).catch(() => undefined);
};

type AdminSession = { role: "owner" | "branch_admin" | "master"; login: string; branchId: string | null };
let adminSession: AdminSession = { role: "owner", login: "", branchId: null };

type OpenTab = (view: HTMLElement) => Promise<void> | void;

const lockBranchSelect = (view: HTMLElement, selector = "#branch") => {
  const select = view.querySelector(selector) as HTMLSelectElement | null;
  if (!select || adminSession.role === "owner" || !adminSession.branchId) {
    return;
  }
  if (![...select.options].some((item) => item.value === adminSession.branchId)) {
    const extra = document.createElement("option");
    extra.value = adminSession.branchId;
    extra.textContent = "Ваш филиал";
    select.append(extra);
  }
  select.value = adminSession.branchId;
  select.disabled = true;
};

const renderApp = async (root: HTMLElement) => {
  adminSession = (await api("/api/salon/admin/session")) as AdminSession;
  const tabs: Array<[string, OpenTab]> =
    adminSession.role === "master"
      ? [
          ["Записи", renderCalendar],
          ["Клиенты", renderClients],
          ["Пароль", renderPassword],
        ]
      : adminSession.role === "branch_admin"
        ? [
            ["Записи", renderCalendar],
            ["Клиенты", renderClients],
            ["Рассылка", renderBroadcast],
            ["Уведомления", renderNotices],
            ["Пароль", renderPassword],
          ]
        : [
            ["Записи", renderCalendar],
            ["Клиенты", renderClients],
            ["Импорт", renderImport],
            ["Мастера", renderMasters],
            ["Услуги", renderPrices],
            ["Рассылка", renderBroadcast],
            ["Акции", renderPromos],
            ["Настройки", renderSettings],
            ["Уведомления", renderNotices],
            ["Доступ", renderAccounts],
            ["Пароль", renderPassword],
          ];
  root.innerHTML = `
    <div class="shell">
      <nav>
        <img class="brand-logo small" src="/site/logo.png" alt="BRO" />
        ${tabs
          .map(([label], index) => `<button data-tab="${index}" class="${index === 0 ? "active" : ""}">${label}</button>`)
          .join("")}
        <button id="logout" type="button">Выйти</button>
      </nav>
      <main id="view"></main>
    </div>`;
  const view = root.querySelector("#view") as HTMLElement;
  const openers = tabs.map(([, opener]) => opener);
  root.querySelectorAll("nav button[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll("nav button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      const index = Number((button as HTMLButtonElement).dataset.tab);
      void openers[index]?.(view);
    });
  });
  root.querySelector("#logout")?.addEventListener("click", async () => {
    await api("/api/salon/admin/logout", { method: "POST", body: "{}" });
    bootSalonAdmin(root);
  });
  void renderCalendar(view);
};

const renderCalendar = async (view: HTMLElement) => {
  const catalog = (await api("/api/salon/public")) as Catalog;
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const next = new Date(monday);
  next.setDate(monday.getDate() + 7);
  view.innerHTML = `
    <h1>Записи</h1>
    <div class="row">
      <select id="branch">${catalog.branches.map((branch) => `<option value="${branch.id}">${branch.name}</option>`).join("")}</select>
      <span class="muted">Неделя с ${monday.toLocaleDateString("ru-RU")} · время Барнаул, UTC+7</span>
    </div>
    <div id="grid"></div>`;
  lockBranchSelect(view);
  const draw = async () => {
    const branchId = (view.querySelector("#branch") as HTMLSelectElement).value;
    const data = (await api(`/api/salon/admin/calendar?branchId=${branchId}&from=${monday.toISOString()}&to=${next.toISOString()}`)) as {
      barbers: Array<{ id: string; name: string; levelLabel: string }>;
      appointments: Array<{ id: string; barberId: string; startsAt: string; endsAt: string; service: string; guest: string; status: string }>;
    };
    const cols = Math.max(data.barbers.length, 1);
    const hours = Array.from({ length: 22 }, (_, index) => {
      const minutes = 10 * 60 + index * 30;
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    });
    view.querySelector("#grid")!.innerHTML = `
      <div class="cal" style="--cols:${cols}">
        <div></div>
        ${data.barbers.map((barber) => `<div class="cal-head"><strong>${barber.name}</strong>${barber.name === barber.levelLabel ? "" : `<div class="muted">${barber.levelLabel}</div>`}</div>`).join("")}
        <div class="hours">${hours.map((hour) => `<div>${hour}</div>`).join("")}</div>
        ${data.barbers
          .map((barber) => {
            const blocks = data.appointments
              .filter((item) => item.barberId === barber.id)
              .map((item) => {
                const start = barnaulParts(item.startsAt);
                const end = barnaulParts(item.endsAt);
                const top = ((start - 600) / 30) * 28;
                const height = Math.max(((end - start) / 30) * 28, 52);
                const when = barnaul(item.startsAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                return `<div class="appt" style="top:${top}px;height:${height}px"><b>${item.guest}</b><br>${when}<br>${item.service}</div>`;
              })
              .join("");
            return `<div class="col">${blocks}</div>`;
          })
          .join("")}
      </div>`;
  };
  view.querySelector("#branch")?.addEventListener("change", () => void draw());
  await draw();
};

const barnaulParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Barnaul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
};

const renderClients = async (view: HTMLElement) => {
  const catalog = (await api("/api/salon/public")) as Catalog;
  view.innerHTML = `
    <h1>Клиенты</h1>
    <div class="row">
      <input id="q" placeholder="Имя или телефон" />
      <select id="branch"><option value="">Все филиалы</option>${catalog.branches.map((branch) => `<option value="${branch.id}">${branch.name}</option>`).join("")}</select>
      <button id="find" class="primary" type="button">Найти</button>
    </div>
    <div id="list"></div>`;
  lockBranchSelect(view);
  const load = async () => {
    const q = (view.querySelector("#q") as HTMLInputElement).value;
    const branchId = (view.querySelector("#branch") as HTMLSelectElement).value;
    const rows = (await api(`/api/salon/admin/clients?q=${encodeURIComponent(q)}&branchId=${branchId}`)) as Array<{
      id: string;
      name: string;
      phone: string | null;
      balance: number;
      channels: { telegram: boolean; max: boolean };
      imported: boolean;
    }>;
    view.querySelector("#list")!.innerHTML = `<table><tr><th>Клиент</th><th>Телефон</th><th>Баланс</th><th>Каналы</th><th></th></tr>${rows
      .map(
        (row) => `<tr><td>${row.name}</td><td>${row.phone ?? "—"}</td><td>${row.balance} ₽</td><td>${row.channels.telegram ? "TG " : ""}${row.channels.max ? "MAX" : ""}${row.imported && !row.channels.telegram && !row.channels.max ? "импорт" : ""}</td><td>
          ${
            adminSession.role === "master"
              ? ""
              : `<button data-check="${row.id}" type="button">Чек</button> <button data-redeem="${row.id}" type="button">Списать</button> <button data-export="${row.id}" type="button">Выгрузка</button> <button data-forget="${row.id}" type="button">Удалить данные</button>`
          }
        </td></tr>`,
      )
      .join("")}</table>`;
    view.querySelectorAll("[data-check]").forEach((button) => {
      button.addEventListener("click", async () => {
        const amount = Number(prompt("Сумма чека, ₽", "1900"));
        if (!amount) return;
        const branch = (view.querySelector("#branch") as HTMLSelectElement).value || catalog.branches[0]?.id;
        await api(`/api/salon/admin/clients/${(button as HTMLButtonElement).dataset.check}/check`, {
          method: "POST",
          body: JSON.stringify({ checkRubles: amount, branchId: branch }),
        });
        await load();
      });
    });
    view.querySelectorAll("[data-redeem]").forEach((button) => {
      button.addEventListener("click", async () => {
        const amount = Number(prompt("Списать бонусов", "100"));
        if (!amount) return;
        await api(`/api/salon/admin/clients/${(button as HTMLButtonElement).dataset.redeem}/redeem`, {
          method: "POST",
          body: JSON.stringify({ amount }),
        });
        await load();
      });
    });
    view.querySelectorAll("[data-export]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = (button as HTMLButtonElement).dataset.export ?? "";
        const data = await api(`/api/salon/admin/clients/${id}/export`);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `client-${id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    });
    view.querySelectorAll("[data-forget]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Удалить имя, телефон и дату рождения? Записи и баллы останутся без этих данных.")) {
          return;
        }
        await api(`/api/salon/admin/clients/${(button as HTMLButtonElement).dataset.forget}/anonymize`, {
          method: "POST",
          body: "{}",
        });
        await load();
      });
    });
  };
  view.querySelector("#find")?.addEventListener("click", () => void load());
  await load();
};

const renderPassword = async (view: HTMLElement) => {
  view.innerHTML = `
    <h1>Пароль</h1>
    <form id="password" class="panel">
      <div class="row"><input name="current" type="password" placeholder="Текущий пароль" required /></div>
      <div class="row"><input name="next" type="password" placeholder="Новый пароль, от 10 символов" required /></div>
      <button class="primary" type="submit">Сменить</button>
      <p id="password-status" class="muted"></p>
    </form>`;
  view.querySelector("#password")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const status = view.querySelector("#password-status");
    try {
      await api("/api/salon/admin/password", {
        method: "POST",
        body: JSON.stringify({
          current: (form.elements.namedItem("current") as HTMLInputElement).value,
          next: (form.elements.namedItem("next") as HTMLInputElement).value,
        }),
      });
      if (status) status.textContent = "Пароль изменён";
      form.reset();
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Ошибка";
    }
  });
};

const roleLabel = (role: string) => (role === "owner" ? "Владелец" : role === "branch_admin" ? "Администратор филиала" : "Мастер, только просмотр");

const renderAccounts = async (view: HTMLElement) => {
  const catalog = (await api("/api/salon/public")) as Catalog;
  const accounts = (await api("/api/salon/admin/accounts")) as Array<{ login: string; role: string; branchId: string | null }>;
  const branchName = (id: string | null) => catalog.branches.find((branch) => branch.id === id)?.name ?? "вся сеть";
  view.innerHTML = `
    <h1>Доступ</h1>
    <form id="account" class="panel row">
      <input name="login" placeholder="Логин" required />
      <input name="password" type="password" placeholder="Пароль, от 10 символов" required />
      <select name="role">
        <option value="branch_admin">Администратор филиала</option>
        <option value="master">Мастер, только просмотр</option>
        <option value="owner">Владелец</option>
      </select>
      <select name="branchId"><option value="">Филиал</option>${catalog.branches.map((branch) => `<option value="${branch.id}">${branch.name}</option>`).join("")}</select>
      <button class="primary" type="submit">Добавить</button>
    </form>
    <p id="account-status" class="error"></p>
    <table><tr><th>Логин</th><th>Роль</th><th>Филиал</th><th></th></tr>${accounts
      .map(
        (row) =>
          `<tr><td>${row.login}</td><td>${roleLabel(row.role)}</td><td>${branchName(row.branchId)}</td><td><button data-drop="${row.login}" type="button">Удалить</button></td></tr>`,
      )
      .join("")}</table>`;
  view.querySelector("#account")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const status = view.querySelector("#account-status");
    try {
      await api("/api/salon/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          login: (form.elements.namedItem("login") as HTMLInputElement).value,
          password: (form.elements.namedItem("password") as HTMLInputElement).value,
          role: (form.elements.namedItem("role") as HTMLSelectElement).value,
          branchId: (form.elements.namedItem("branchId") as HTMLSelectElement).value || null,
        }),
      });
      await renderAccounts(view);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Ошибка";
    }
  });
  view.querySelectorAll("[data-drop]").forEach((button) => {
    button.addEventListener("click", async () => {
      const login = (button as HTMLButtonElement).dataset.drop ?? "";
      if (!confirm(`Удалить учётку ${login}?`)) return;
      const status = view.querySelector("#account-status");
      try {
        await api(`/api/salon/admin/accounts/${encodeURIComponent(login)}`, { method: "DELETE" });
        await renderAccounts(view);
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : "Ошибка";
      }
    });
  });
};

const renderMasters = async (view: HTMLElement) => {
  const catalog = (await api("/api/salon/public")) as Catalog;
  const masters = (await api("/api/salon/admin/masters")) as Array<{
    id: string;
    name: string;
    levelLabel: string;
    branchName: string;
    schedules: Array<{ weekday: number; label: string }>;
  }>;
  const days = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  view.innerHTML = `
    <h1>Мастера и график</h1>
    <form id="add" class="row panel">
      <input name="name" placeholder="Имя" required />
      <select name="branchId">${catalog.branches.map((branch) => `<option value="${branch.id}">${branch.name}</option>`).join("")}</select>
      <select name="level"><option value="barber">Мастер</option><option value="senior">Топ-мастер</option><option value="chef">Амбассадор</option></select>
      <button class="primary" type="submit">Добавить</button>
    </form>
    <table>${masters
      .map(
        (master) =>
          `<tr><td><strong>${master.name}</strong><div class="muted">${master.name === master.levelLabel ? master.branchName : `${master.levelLabel} · ${master.branchName}`}</div></td><td>${master.schedules.map((row) => `${days[row.weekday]} ${row.label}`).join(", ")}</td></tr>`,
      )
      .join("")}</table>`;
  view.querySelector("#add")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    await api("/api/salon/admin/masters", {
      method: "POST",
      body: JSON.stringify({
        name: (form.elements.namedItem("name") as HTMLInputElement).value,
        branchId: (form.elements.namedItem("branchId") as HTMLSelectElement).value,
        level: (form.elements.namedItem("level") as HTMLSelectElement).value,
      }),
    });
    await renderMasters(view);
  });
};

const renderPrices = async (view: HTMLElement) => {
  const catalog = (await api("/api/salon/public")) as Catalog;
  const branches = new Map(catalog.branches.map((branch) => [branch.id, branch.name]));
  view.innerHTML = `<h1>Услуги и цены</h1><table><tr><th>Услуга</th><th>Филиал</th><th>Уровень</th><th>Цена</th><th>Мин</th><th></th></tr>${catalog.services
    .flatMap((service) =>
      service.prices.map(
        (price) => `<tr>
          <td>${service.name}</td><td>${branches.get(price.branchId) ?? ""}</td><td>${price.levelLabel}</td>
          <td><input data-price="${service.id}|${price.branchId}|${price.level}" value="${price.priceRub}" /></td>
          <td><input data-duration="${service.id}|${price.branchId}|${price.level}" value="${price.durationMinutes}" /></td>
          <td><button data-save="${service.id}|${price.branchId}|${price.level}" type="button">Сохранить</button></td>
        </tr>`,
      ),
    )
    .join("")}</table>`;
  view.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = (button as HTMLButtonElement).dataset.save ?? "";
      const [serviceId, branchId, level] = key.split("|");
      const priceRub = Number((view.querySelector(`[data-price="${key}"]`) as HTMLInputElement).value);
      const durationMinutes = Number((view.querySelector(`[data-duration="${key}"]`) as HTMLInputElement).value);
      await api("/api/salon/admin/prices", {
        method: "POST",
        body: JSON.stringify({ serviceId, branchId, level, priceRub, durationMinutes, priceFrom: false }),
      });
      button.textContent = "Ок";
    });
  });
};

const renderBroadcast = async (view: HTMLElement) => {
  const catalog = (await api("/api/salon/public")) as Catalog;
  view.innerHTML = `
    <h1>Рассылка</h1>
    <p class="muted">Уходит только тем, кто отдельно согласился на рекламные сообщения. Отказ не отключает подтверждения записи и напоминания о визите.</p>
    <form id="cast" class="panel">
      <div class="row">
        <select name="segment">
          <option value="all">Все</option>
          <option value="inactive_30d">Не были 30 дней</option>
          <option value="birthday_week">День рождения на неделе</option>
          <option value="balance_gt">Баланс больше</option>
          <option value="branch">Были в филиале</option>
        </select>
        <input name="minBalance" type="number" placeholder="Порог баланса" value="500" />
        <select name="branchId"><option value="">Филиал</option>${catalog.branches.map((branch) => `<option value="${branch.id}">${branch.name}</option>`).join("")}</select>
      </div>
      <textarea name="text" rows="4" style="width:100%" placeholder="Текст сообщения"></textarea>
      <p><button class="primary" type="submit">Отправить</button> <span id="cast-status" class="muted"></span></p>
    </form>`;
  lockBranchSelect(view, "select[name=branchId]");
  view.querySelector("#cast")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const result = (await api("/api/salon/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({
        segment: (form.elements.namedItem("segment") as HTMLSelectElement).value,
        text: (form.elements.namedItem("text") as HTMLTextAreaElement).value,
        minBalance: Number((form.elements.namedItem("minBalance") as HTMLInputElement).value),
        branchId: (form.elements.namedItem("branchId") as HTMLSelectElement).value || undefined,
      }),
    })) as { recipients: number };
    const status = view.querySelector("#cast-status");
    if (status) status.textContent = `Получателей: ${result.recipients}`;
  });
};

const renderSettings = async (view: HTMLElement) => {
  const settings = (await api("/api/salon/admin/settings")) as {
    percent: number;
    haircutNudgeWeeks: number;
    reminderLeadHours: number[];
    birthdayBonus: number;
    referralBonusReferrer: number;
    referralBonusReferee: number;
    venueTimezone: string;
    importWelcomeBonus: number;
  };
  view.innerHTML = `
    <h1>Настройки</h1>
    <form id="settings" class="panel">
      <div class="row">Кэшбэк, % <input name="percent" type="number" value="${settings.percent}" /></div>
      <div class="row">«Пора стричься», недель <input name="haircutNudgeWeeks" type="number" value="${settings.haircutNudgeWeeks}" /></div>
      <div class="row">Напоминания, часы через запятую <input name="reminderLeadHours" value="${settings.reminderLeadHours.join(",")}" /></div>
      <div class="row">Бонус ДР <input name="birthdayBonus" type="number" value="${settings.birthdayBonus}" /></div>
      <div class="row">Реферал пригласившему <input name="referralBonusReferrer" type="number" value="${settings.referralBonusReferrer}" /></div>
      <div class="row">Реферал другу <input name="referralBonusReferee" type="number" value="${settings.referralBonusReferee}" /></div>
      <div class="row">Часовой пояс <input name="venueTimezone" value="${settings.venueTimezone}" /></div>
      <div class="row">Приветственный бонус при первой привязке импорта, ₽ <input name="importWelcomeBonus" type="number" value="${settings.importWelcomeBonus}" /></div>
      <button class="primary" type="submit">Сохранить</button>
      <p id="settings-status" class="muted"></p>
    </form>`;
  view.querySelector("#settings")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    await api("/api/salon/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        percent: Number(value("percent")),
        haircutNudgeWeeks: Number(value("haircutNudgeWeeks")),
        reminderLeadHours: value("reminderLeadHours").split(",").map((item) => Number(item.trim())),
        birthdayBonus: Number(value("birthdayBonus")),
        referralBonusReferrer: Number(value("referralBonusReferrer")),
        referralBonusReferee: Number(value("referralBonusReferee")),
        venueTimezone: value("venueTimezone"),
        importWelcomeBonus: Number(value("importWelcomeBonus")),
      }),
    });
    const status = view.querySelector("#settings-status");
    if (status) status.textContent = "Сохранено";
  });
};

type ImportPreview = {
  headers: string[];
  fields: Array<{ id: string; label: string; column: number | null }>;
  counts: { create: number; update: number; error: number; warnings: number };
  rows: Array<{
    line: number;
    action: "create" | "update" | "error";
    phone: string | null;
    name: string;
    errors: string[];
    warnings: string[];
  }>;
  messagesSent: number;
};

const renderImport = (view: HTMLElement) => {
  view.innerHTML = `
    <h1>Импорт базы</h1>
    <p class="muted">CSV или Excel из текущей записи. Клиенты попадают в базу без сообщения в мессенджер. Повтор того же файла не плодит дубли: сверка по телефону.</p>
    <div class="row">
      <input id="file" type="file" accept=".csv,.xlsx,.xls,text/csv" />
      <button id="parse" class="primary" type="button">Разобрать</button>
      <a href="/api/salon/admin/import/sample">Скачать образец</a>
    </div>
    <div id="map"></div>
    <p id="counts" class="muted"></p>
    <div id="preview"></div>
    <p><button id="commit" class="primary" type="button" disabled>Импортировать</button> <span id="report" class="muted"></span></p>`;
  let filename = "";
  let contentBase64 = "";
  const fileInput = view.querySelector("#file") as HTMLInputElement;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    filename = file.name;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    contentBase64 = btoa(binary);
  });
  const payload = () => {
    const mapping: Record<string, number | null> = {};
    view.querySelectorAll<HTMLSelectElement>("[data-field]").forEach((select) => {
      mapping[select.dataset.field ?? ""] = select.value === "" ? null : Number(select.value);
    });
    return { filename, contentBase64, mapping: Object.keys(mapping).length ? mapping : undefined };
  };
  const draw = (preview: ImportPreview) => {
    const headers = preview.headers;
    view.querySelector("#map")!.innerHTML = `<div class="panel"><div class="row">${preview.fields
      .map(
        (field) => `<label>${field.label}<br><select data-field="${field.id}">
          <option value="">не импортировать</option>
          ${headers.map((header, index) => `<option value="${index}" ${field.column === index ? "selected" : ""}>${header || "столбец " + (index + 1)}</option>`).join("")}
        </select></label>`,
      )
      .join("")}</div></div>`;
    view.querySelector("#counts")!.textContent = `Новых ${preview.counts.create}, обновлений ${preview.counts.update}, ошибок ${preview.counts.error}, предупреждений ${preview.counts.warnings}. Сообщений: ${preview.messagesSent}.`;
    view.querySelector("#preview")!.innerHTML = `<table><tr><th>Строка</th><th></th><th>Клиент</th><th>Телефон</th><th>Замечания</th></tr>${preview.rows
      .map(
        (row) => `<tr>
          <td>${row.line}</td>
          <td><span class="tag ${row.action}">${row.action === "create" ? "новый" : row.action === "update" ? "слияние" : "ошибка"}</span></td>
          <td>${row.name || "—"}</td>
          <td>${row.phone ?? "—"}</td>
          <td>${[...row.errors.map((item) => `<div class="error">${item}</div>`), ...row.warnings.map((item) => `<div class="warn">${item}</div>`)].join("")}</td>
        </tr>`,
      )
      .join("")}</table>`;
    (view.querySelector("#commit") as HTMLButtonElement).disabled = preview.counts.create + preview.counts.update === 0;
    view.querySelectorAll("[data-field]").forEach((select) => {
      select.addEventListener("change", () => void run());
    });
  };
  const run = async () => {
    if (!contentBase64) return;
    const preview = (await api("/api/salon/admin/import/preview", {
      method: "POST",
      body: JSON.stringify(payload()),
    })) as ImportPreview;
    draw(preview);
  };
  view.querySelector("#parse")?.addEventListener("click", () => void run().catch((error: unknown) => {
    view.querySelector("#report")!.textContent = error instanceof Error ? error.message : "Ошибка";
  }));
  view.querySelector("#commit")?.addEventListener("click", async () => {
    const report = (await api("/api/salon/admin/import/commit", {
      method: "POST",
      body: JSON.stringify(payload()),
    })) as { created: number; updated: number; unchanged: number; errors: number; messagesSent: number; bookingsCreated: number };
    view.querySelector("#report")!.textContent = `Создано ${report.created}, обновлено ${report.updated}, без изменений ${report.unchanged}, ошибок ${report.errors}, записей ${report.bookingsCreated}. Сообщений: ${report.messagesSent}.`;
    await run();
  });
};

const renderPromos = async (view: HTMLElement) => {
  const promos = (await api("/api/salon/admin/promos")) as Array<{ body: string }>;
  view.innerHTML = `<h1>Акции</h1><p class="muted">Карточка ниже — пример. Скидка в записи и в чеке сама не считается.</p>${
    promos.map((promo) => `<article class="panel"><p>${promo.body}</p></article>`).join("") || "<p class='muted'>Пока пусто</p>"
  }`;
};

const renderNotices = async (view: HTMLElement) => {
  const notices = (await api("/api/salon/admin/notices")) as Array<{ body: string; createdAt: string; kind: string }>;
  view.innerHTML = `<h1>Уведомления</h1>${notices
    .map((notice) => `<p class="panel"><span class="muted">${barnaul(notice.createdAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><br>${notice.body}</p>`)
    .join("") || "<p class='muted'>Пока пусто</p>"}`;
};
