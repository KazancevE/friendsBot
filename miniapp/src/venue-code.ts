import QRCode from "qrcode";
import {
  fetchActiveVisits,
  fetchVenueCode,
  lookupGuestByVisit,
  regenerateVenueCode,
  type ActiveVisits,
  type GuestCard,
  type VenueCodeInfo,
} from "./api.ts";
import { bindGuestActions, guestActionsMarkup, guestName } from "./guest-actions.ts";

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

const renderActiveList = (listEl: HTMLElement, visits: ActiveVisits, onGuestClick: (visitId: string) => void) => {
  if (visits.guests.length === 0) {
    listEl.innerHTML = `<p class="muted">Пока никого</p>`;
    return;
  }
  listEl.innerHTML = `<ul class="active-visits">${visits.guests
    .map(
      (row) =>
        `<li><button type="button" class="active-visit-btn" data-visit-id="${escapeHtml(row.visitId)}"><strong>${escapeHtml(guestName(row))}</strong> — до ${formatTime(row.endsAt)} (${methodLabel(row.checkInMethod)})</button></li>`,
    )
    .join("")}</ul>`;

  for (const button of listEl.querySelectorAll("[data-visit-id]")) {
    if (button instanceof HTMLButtonElement) {
      button.addEventListener("click", () => {
        const visitId = button.dataset.visitId;
        if (visitId !== undefined) {
          onGuestClick(visitId);
        }
      });
    }
  }
};

const renderVenuePanel = async (
  root: HTMLElement,
  code: VenueCodeInfo,
  visits: ActiveVisits,
  onGuestClick: (visitId: string) => void,
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
    renderActiveList(listEl, visits, onGuestClick);
  }
};

const guestSheetMarkup = () => {
  return `
    <div class="hub-sheet-backdrop" data-guest-sheet hidden>
      <div class="hub-sheet panel" role="dialog" aria-modal="true" aria-label="Гость">
        <button type="button" class="hub-sheet-close" data-guest-sheet-close aria-label="Закрыть">×</button>
        <div class="hub-sheet-body" data-guest-sheet-body></div>
      </div>
    </div>
  `;
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
      <p class="muted venue-list-hint">Нажмите на гостя для операций с бонусами</p>
      <div data-active-list></div>
      <button type="button" data-refresh>Обновить список</button>
    </section>
    <p data-status class="status"></p>
    ${guestSheetMarkup()}
  `;

  const sheetBackdrop = root.querySelector("[data-guest-sheet]");
  const sheetBody = root.querySelector("[data-guest-sheet-body]");
  if (!(sheetBackdrop instanceof HTMLElement) || !(sheetBody instanceof HTMLElement)) {
    return;
  }

  sheetBody.innerHTML = guestActionsMarkup();
  let currentGuest: GuestCard | undefined;

  const guestUi = bindGuestActions({
    root: sheetBody,
    getGuest: () => currentGuest,
    setGuest: (guest) => {
      currentGuest = guest;
    },
    onChanged: () => {
      void reload();
    },
  });

  const closeGuestSheet = () => {
    sheetBackdrop.hidden = true;
    document.body.classList.remove("hub-sheet-open");
    currentGuest = undefined;
  };

  const openGuestSheet = async (visitId: string) => {
    guestUi.setStatus("Загрузка…");
    sheetBackdrop.hidden = false;
    document.body.classList.add("hub-sheet-open");
    const result = await lookupGuestByVisit(visitId);
    if (result.kind === "error") {
      guestUi.setStatus(result.message, true);
      return;
    }
    currentGuest = result.data;
    guestUi.showGuest(result.data);
  };

  sheetBackdrop.addEventListener("click", (event) => {
    if (event.target === sheetBackdrop) {
      closeGuestSheet();
    }
  });

  const sheetClose = root.querySelector("[data-guest-sheet-close]");
  if (sheetClose instanceof HTMLButtonElement) {
    sheetClose.addEventListener("click", closeGuestSheet);
  }

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
    await renderVenuePanel(root, code.data, visits.data, (visitId) => {
      void openGuestSheet(visitId);
    });
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
        await renderVenuePanel(root, result.data, visits.data, (visitId) => {
          void openGuestSheet(visitId);
        });
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
