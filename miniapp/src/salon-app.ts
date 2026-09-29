import "./salon.css";
import { readLaunchInitData, readyTelegram } from "./telegram.ts";

type Card = {
  firstName: string | null;
  balance: number;
  cashbackPercent: number;
  referralBonus: number;
  referralLink: string;
  qrDataUrl: string;
  appointments: Array<{ id: string; branch: string; service: string; barber: string; when: string; priceRub: number }>;
};

type Branch = { id: string; name: string; address: string };
type ServiceRow = { id: string; name: string; minPrice: number; from: boolean };
type Master = { id: string; name: string; levelLabel: string; priceRub: number; priceFrom: boolean; durationMinutes: number };
type Slot = { startMin: number; barberId: string; barberName: string; priceRub: number; priceFrom: boolean; durationMinutes: number };

const money = (value: number, from = false) => `${from ? "от " : ""}${value.toLocaleString("ru-RU")} ₽`;
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const authHeader = () => {
  const token = sessionStorage.getItem("daddyson-token");
  return token ? { authorization: `Bearer ${token}` } : {};
};

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...authHeader(), ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? "Ошибка");
  }
  return data as T;
};

const escapeText = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const showGate = (root: HTMLElement, message: string) => {
  root.innerHTML = `<p class="mark">Daddyson</p><div class="caps">BARBERSHOP · БИЙСК</div><p class="notice">${escapeText(message)}</p>`;
};

const openMessengerSession = async () => {
  const launch = readLaunchInitData();
  if (!launch) {
    return { message: "Мессенджер не передал данные входа. Откройте карту кнопкой меню бота или inline-кнопкой в чате. Ссылка в браузере и кнопка обычной клавиатуры карту не открывают." };
  }
  const response = await fetch("/api/salon/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(launch),
  });
  const data = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
  if (data.token) {
    sessionStorage.setItem("daddyson-token", data.token);
    return null;
  }
  return { message: data.message ?? "Не удалось открыть карту. Вернитесь в чат бота и нажмите «Старт»." };
};

export const bootSalonApp = async () => {
  readyTelegram();
  const root = document.querySelector("#app");
  if (!(root instanceof HTMLElement)) {
    return;
  }
  const params = new URLSearchParams(location.search);
  if (!sessionStorage.getItem("daddyson-token") && params.get("demo") === "1") {
    const demo = await api<{ token: string }>("/api/salon/demo");
    sessionStorage.setItem("daddyson-token", demo.token);
  }
  if (!sessionStorage.getItem("daddyson-token")) {
    try {
      const gate = await openMessengerSession();
      if (gate) {
        showGate(root, gate.message);
        return;
      }
    } catch {
      showGate(root, "Не удалось связаться с сервером. Закройте окно и откройте карту из бота ещё раз.");
      return;
    }
  }
  let screen: "card" | "book" = "card";
  const draft: { branchId?: string; serviceId?: string; barberId?: string; date?: string; slot?: Slot } = {};

  const paint = async () => {
    if (screen === "card") {
      const card = await api<Card>("/api/salon/me");
      root.innerHTML = `
        <p class="mark">Daddyson</p>
        <div class="caps">BARBERSHOP · БИЙСК</div>
        <div class="tabs">
          <button class="primary" type="button" id="tab-card">Карта</button>
          <button type="button" id="tab-book">Запись</button>
        </div>
        <section class="card">
          <div class="muted">${card.firstName ?? "Гость"}</div>
          <div class="balance">${card.balance} ₽</div>
          <div>Кэшбэк ${card.cashbackPercent}% · общий на оба филиала</div>
          <p><img class="qr" alt="QR для кассы" src="${card.qrDataUrl}" /></p>
          <p class="muted">Покажите QR на кассе, чтобы списать бонусы.</p>
        </section>
        <h1>Ближайшие визиты</h1>
        <div class="list">${
          card.appointments.length
            ? card.appointments
                .map(
                  (item) =>
                    `<button type="button" data-cancel="${item.id}">${item.when}<br>${item.service} · ${item.barber} · ${item.branch}<br><span class="muted">Отменить</span></button>`,
                )
                .join("")
            : `<p class="muted">Записей пока нет</p>`
        }</div>
        <p class="muted">Приведите друга — обоим по ${card.referralBonus} ₽ после первого визита.<br>${card.referralLink}</p>`;
      root.querySelector("#tab-book")?.addEventListener("click", () => {
        screen = "book";
        void paint();
      });
      root.querySelectorAll("[data-cancel]").forEach((button) => {
        button.addEventListener("click", async () => {
          await api(`/api/salon/appointments/${(button as HTMLButtonElement).dataset.cancel}/cancel`, { method: "POST", body: "{}" });
          await paint();
        });
      });
      return;
    }

    const branches = await api<Branch[]>("/api/salon/branches");
    root.innerHTML = `
      <p class="mark">Daddyson</p>
      <div class="tabs">
        <button type="button" id="tab-card">Карта</button>
        <button class="primary" type="button" id="tab-book">Запись</button>
      </div>
      <h1>Филиал</h1>
      <div class="list" id="branches"></div>
      <h1>Услуга</h1>
      <div class="list" id="services"></div>
      <h1>Мастер</h1>
      <div class="list" id="masters"></div>
      <h1>День</h1>
      <select id="date"></select>
      <h1>Время</h1>
      <div class="slots" id="slots"></div>
      <p id="status" class="muted"></p>`;
    root.querySelector("#tab-card")?.addEventListener("click", () => {
      screen = "card";
      void paint();
    });
    const branchBox = root.querySelector("#branches") as HTMLElement;
    const serviceBox = root.querySelector("#services") as HTMLElement;
    const masterBox = root.querySelector("#masters") as HTMLElement;
    const dateBox = root.querySelector("#date") as HTMLSelectElement;
    const slotBox = root.querySelector("#slots") as HTMLElement;
    const status = root.querySelector("#status") as HTMLElement;

    const loadSlots = async () => {
      if (!draft.branchId || !draft.serviceId || !draft.barberId || !draft.date) {
        slotBox.innerHTML = "";
        return;
      }
      const slots = await api<Slot[]>(
        `/api/salon/slots?branchId=${draft.branchId}&serviceId=${draft.serviceId}&barberId=${draft.barberId}&date=${draft.date}`,
      );
      slotBox.innerHTML =
        slots
          .map(
            (slot) =>
              `<button type="button" data-start="${slot.startMin}" data-barber="${slot.barberId}">${hhmm(slot.startMin)} · ${slot.barberName} · ${money(slot.priceRub, slot.priceFrom)}</button>`,
          )
          .join("") || `<p class="muted">Нет окон</p>`;
      slotBox.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
          const node = button as HTMLButtonElement;
          status.textContent = "Записываем…";
          try {
            await api("/api/salon/appointments", {
              method: "POST",
              body: JSON.stringify({
                branchId: draft.branchId,
                serviceId: draft.serviceId,
                barberId: node.dataset.barber,
                date: draft.date,
                startMin: Number(node.dataset.start),
              }),
            });
            screen = "card";
            await paint();
          } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Ошибка";
          }
        });
      });
    };

    const loadDates = async () => {
      const dates = await api<string[]>("/api/salon/dates");
      dateBox.innerHTML = dates.map((date) => `<option value="${date}">${date.split("-").reverse().join(".")}</option>`).join("");
      draft.date = dateBox.value;
      dateBox.onchange = () => {
        draft.date = dateBox.value;
        void loadSlots();
      };
      await loadSlots();
    };

    const loadMasters = async () => {
      if (!draft.branchId || !draft.serviceId) return;
      const masters = await api<Master[]>(`/api/salon/masters?branchId=${draft.branchId}&serviceId=${draft.serviceId}`);
      masterBox.innerHTML = `<button type="button" data-id="any" class="primary">Любой мастер</button>${masters
        .map(
          (master) =>
            `<button type="button" data-id="${master.id}">${master.name} · ${master.levelLabel} · ${money(master.priceRub, master.priceFrom)} · ${master.durationMinutes} мин</button>`,
        )
        .join("")}`;
      masterBox.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
          draft.barberId = (button as HTMLButtonElement).dataset.id;
          masterBox.querySelectorAll("button").forEach((node) => node.classList.remove("primary"));
          button.classList.add("primary");
          await loadSlots();
        });
      });
    };

    const loadServices = async () => {
      if (!draft.branchId) return;
      const services = await api<ServiceRow[]>(`/api/salon/services?branchId=${draft.branchId}`);
      serviceBox.innerHTML = services
        .map((service) => `<button type="button" data-id="${service.id}">${service.name} · ${money(service.minPrice, service.from)}</button>`)
        .join("");
      serviceBox.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
          draft.serviceId = (button as HTMLButtonElement).dataset.id;
          serviceBox.querySelectorAll("button").forEach((node) => node.classList.remove("primary"));
          button.classList.add("primary");
          await loadMasters();
        });
      });
    };

    branchBox.innerHTML = branches
      .map((branch) => `<button type="button" data-id="${branch.id}">${branch.name}<br><span class="muted">${branch.address}</span></button>`)
      .join("");
    branchBox.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        draft.branchId = (button as HTMLButtonElement).dataset.id;
        branchBox.querySelectorAll("button").forEach((node) => node.classList.remove("primary"));
        button.classList.add("primary");
        await loadServices();
        await loadDates();
      });
    });
  };

  await paint();
};
