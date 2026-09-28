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
        <p class="mark">Daddyson</p>
        <p class="muted">Кабинет сети. Данные остаются у вас.</p>
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

const renderApp = (root: HTMLElement) => {
  root.innerHTML = `
    <div class="shell">
      <nav>
        <div class="mark" style="font-size:36px">Daddyson</div>
        ${["Записи", "Клиенты", "Мастера", "Услуги", "Рассылка", "Настройки", "Уведомления"]
          .map((label, index) => `<button data-tab="${index}" class="${index === 0 ? "active" : ""}">${label}</button>`)
          .join("")}
        <button id="logout" type="button">Выйти</button>
      </nav>
      <main id="view"></main>
    </div>`;
  const view = root.querySelector("#view") as HTMLElement;
  const tabs = [
    () => renderCalendar(view),
    () => renderClients(view),
    () => renderMasters(view),
    () => renderPrices(view),
    () => renderBroadcast(view),
    () => renderSettings(view),
    () => renderNotices(view),
  ];
  root.querySelectorAll("nav button[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll("nav button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      const index = Number((button as HTMLButtonElement).dataset.tab);
      void tabs[index]?.();
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
        ${data.barbers.map((barber) => `<div class="cal-head"><strong>${barber.name}</strong><div class="muted">${barber.levelLabel}</div></div>`).join("")}
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
  const load = async () => {
    const q = (view.querySelector("#q") as HTMLInputElement).value;
    const branchId = (view.querySelector("#branch") as HTMLSelectElement).value;
    const rows = (await api(`/api/salon/admin/clients?q=${encodeURIComponent(q)}&branchId=${branchId}`)) as Array<{
      id: string;
      name: string;
      phone: string | null;
      balance: number;
      channels: { telegram: boolean; max: boolean };
    }>;
    view.querySelector("#list")!.innerHTML = `<table><tr><th>Клиент</th><th>Телефон</th><th>Баланс</th><th>Каналы</th><th></th></tr>${rows
      .map(
        (row) => `<tr><td>${row.name}</td><td>${row.phone ?? "—"}</td><td>${row.balance} ₽</td><td>${row.channels.telegram ? "TG " : ""}${row.channels.max ? "MAX" : ""}</td><td>
          <button data-check="${row.id}" type="button">Чек</button>
          <button data-redeem="${row.id}" type="button">Списать</button>
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
  };
  view.querySelector("#find")?.addEventListener("click", () => void load());
  await load();
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
      <select name="level"><option value="junior">Новый барбер</option><option value="barber">Барбер</option><option value="senior">Старший барбер</option><option value="chef">Шеф-барбер</option></select>
      <button class="primary" type="submit">Добавить</button>
    </form>
    <table>${masters
      .map(
        (master) =>
          `<tr><td><strong>${master.name}</strong><div class="muted">${master.levelLabel} · ${master.branchName}</div></td><td>${master.schedules.map((row) => `${days[row.weekday]} ${row.label}`).join(", ")}</td></tr>`,
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
      }),
    });
    const status = view.querySelector("#settings-status");
    if (status) status.textContent = "Сохранено";
  });
};

const renderNotices = async (view: HTMLElement) => {
  const notices = (await api("/api/salon/admin/notices")) as Array<{ body: string; createdAt: string; kind: string }>;
  view.innerHTML = `<h1>Уведомления</h1>${notices
    .map((notice) => `<p class="panel"><span class="muted">${barnaul(notice.createdAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><br>${notice.body}</p>`)
    .join("") || "<p class='muted'>Пока пусто</p>"}`;
};
