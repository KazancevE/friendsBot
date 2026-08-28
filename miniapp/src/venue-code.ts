import QRCode from "qrcode";
import {
  fetchActiveVisits,
  fetchVenueCode,
  regenerateVenueCode,
  type ActiveVisits,
  type VenueCodeInfo,
} from "./api.ts";

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const guestName = (row: ActiveVisits["guests"][number]) => {
  const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return name === "" ? "—" : name;
};

const formatTime = (iso: string) => {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const methodLabel = (method: ActiveVisits["guests"][number]["checkInMethod"]) => {
  if (method === "qr") {
    return "QR";
  }
  if (method === "pin") {
    return "код";
  }
  return "касса";
};

const setStatus = (root: HTMLElement, message: string, isError = false) => {
  const status = root.querySelector("[data-status]");
  if (!(status instanceof HTMLElement)) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const renderQr = async (canvas: HTMLCanvasElement, payload: string) => {
  await QRCode.toCanvas(canvas, payload, { width: 240, margin: 2 });
};

const renderActiveList = (listEl: HTMLElement, visits: ActiveVisits) => {
  if (visits.guests.length === 0) {
    listEl.innerHTML = `<p class="muted">Пока никого</p>`;
    return;
  }
  listEl.innerHTML = `<ul class="active-visits">${visits.guests
    .map(
      (row) =>
        `<li><strong>${escapeHtml(guestName(row))}</strong> — до ${formatTime(row.endsAt)} (${methodLabel(row.checkInMethod)})</li>`,
    )
    .join("")}</ul>`;
};

const renderVenuePanel = async (
  root: HTMLElement,
  code: VenueCodeInfo,
  visits: ActiveVisits,
) => {
  const pinEl = root.querySelector("[data-pin]");
  const untilEl = root.querySelector("[data-until]");
  const countEl = root.querySelector("[data-count]");
  const canvas = root.querySelector("[data-qr]");
  const listEl = root.querySelector("[data-active-list]");
  if (pinEl instanceof HTMLElement) {
    pinEl.textContent = code.pin;
  }
  if (untilEl instanceof HTMLElement) {
    untilEl.textContent = formatTime(code.validUntil);
  }
  if (countEl instanceof HTMLElement) {
    countEl.textContent = String(visits.count);
  }
  if (canvas instanceof HTMLCanvasElement) {
    await renderQr(canvas, code.qrPayload);
  }
  if (listEl instanceof HTMLElement) {
    renderActiveList(listEl, visits);
  }
};

export const renderVenueCode = (root: HTMLElement) => {
  root.innerHTML = `
    <header>
      <h1>Код зала</h1>
      <p class="muted">Покажите QR или цифры гостям для отметки в зале</p>
    </header>
    <section class="panel venue-code-panel">
      <p class="venue-pin" data-pin>----</p>
      <p class="muted">действует до <span data-until>--:--</span></p>
      <canvas data-qr class="venue-qr" aria-label="QR-код зала"></canvas>
      <button type="button" data-regenerate>Обновить код</button>
    </section>
    <section class="panel">
      <h2>Сейчас в зале: <span data-count>0</span></h2>
      <div data-active-list></div>
      <button type="button" data-refresh>Обновить список</button>
    </section>
    <p data-status class="status"></p>
  `;

  const reload = async () => {
    setStatus(root, "Загрузка…");
    const [code, visits] = await Promise.all([fetchVenueCode(), fetchActiveVisits()]);
    if (code.kind === "error") {
      setStatus(root, code.message, true);
      return;
    }
    if (visits.kind === "error") {
      setStatus(root, visits.message, true);
      return;
    }
    await renderVenuePanel(root, code.data, visits.data);
    setStatus(root, "");
  };

  const regenerateButton = root.querySelector("[data-regenerate]");
  if (regenerateButton instanceof HTMLButtonElement) {
    regenerateButton.addEventListener("click", () => {
      void (async () => {
        setStatus(root, "Обновляем код…");
        const result = await regenerateVenueCode();
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        const visits = await fetchActiveVisits();
        if (visits.kind === "error") {
          setStatus(root, visits.message, true);
          return;
        }
        await renderVenuePanel(root, result.data, visits.data);
        setStatus(root, "Код обновлён");
      })();
    });
  }

  const refreshButton = root.querySelector("[data-refresh]");
  if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.addEventListener("click", () => {
      void reload();
    });
  }

  void reload();
};
