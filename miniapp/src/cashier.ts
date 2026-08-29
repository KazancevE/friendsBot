import type { GuestCard, GuestSearchHit } from "./api.ts";
import { lookupGuest } from "./api.ts";
import { bindGuestActions, guestActionsMarkup } from "./guest-actions.ts";
import { canScanCamera, canScanQr, prefersTelegramScanner, scanQr } from "./qr-scan.ts";

type GuestQuery =
  | { readonly phone: string }
  | { readonly qrToken: string }
  | { readonly nameQuery: string }
  | { readonly guestId: string };

const parseQuery = (raw: string): GuestQuery => {
  const trimmed = raw.trim();
  if (trimmed.includes(" ") || (/^[a-zA-Zа-яА-ЯёЁ-]+$/.test(trimmed) && trimmed.length >= 2)) {
    return { nameQuery: trimmed };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) {
    return { phone: trimmed };
  }
  return { qrToken: trimmed };
};

const setStatus = (root: HTMLElement, message: string, isError = false) => {
  const status = root.querySelector("[data-status]");
  if (!(status instanceof HTMLElement)) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
};

export const renderCashier = (root: HTMLElement) => {
  const useCamera = canScanQr() && canScanCamera() && !prefersTelegramScanner();
  root.innerHTML = `
    <header>
      <h1>Касса</h1>
      <p class="muted">Сканируйте QR гостя или введите телефон / код</p>
    </header>
    <section class="panel">
      ${useCamera ? `<video data-preview playsinline muted hidden></video>` : ""}
      ${canScanQr() ? `<button type="button" data-scan>Сканировать</button>` : ""}
      <form data-lookup>
        <label>
          Телефон, QR или имя
          <input name="query" autocomplete="off" inputmode="text" required />
        </label>
        <button type="submit">Найти</button>
      </form>
      <div data-search-results hidden class="panel"></div>
    </section>
    <div data-guest-panel hidden>
      ${guestActionsMarkup()}
    </div>
    <p data-status class="status"></p>
  `;

  let current: GuestCard | undefined;
  let scanStop: (() => void) | undefined;

  const guestPanel = root.querySelector("[data-guest-panel]");
  if (!(guestPanel instanceof HTMLElement)) {
    return;
  }

  const guestUi = bindGuestActions({
    root: guestPanel,
    getGuest: () => current,
    setGuest: (guest) => {
      current = guest;
    },
  });

  const showGuest = (card: GuestCard) => {
    current = card;
    guestPanel.hidden = false;
    guestUi.showGuest(card);
  };

  const lookup = async (query: GuestQuery) => {
    setStatus(root, "Ищем…");
    const result = await lookupGuest(query);
    if (result.kind === "error") {
      setStatus(root, result.message, true);
      return;
    }
    if ("guests" in result.data) {
      renderSearchResults(result.data.guests);
      setStatus(root, "Выберите гостя");
      return;
    }
    showGuest(result.data);
    setStatus(root, "Гость найден");
  };

  const searchResults = root.querySelector("[data-search-results]");
  const renderSearchResults = (hits: ReadonlyArray<GuestSearchHit>) => {
    if (!(searchResults instanceof HTMLElement)) {
      return;
    }
    searchResults.hidden = false;
    searchResults.innerHTML = hits
      .map((hit) => {
        const name = `${hit.firstName ?? ""} ${hit.lastName ?? ""}`.trim() || "—";
        return `<button type="button" data-pick="${hit.id}">${name} · ${hit.phoneMasked ?? "—"}</button>`;
      })
      .join("");
    for (const button of searchResults.querySelectorAll("[data-pick]")) {
      if (button instanceof HTMLButtonElement) {
        button.addEventListener("click", () => {
          void lookup({ guestId: button.dataset.pick! });
        });
      }
    }
  };

  const lookupForm = root.querySelector("[data-lookup]");
  if (lookupForm instanceof HTMLFormElement) {
    lookupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(lookupForm);
      const raw = String(data.get("query") ?? "");
      void lookup(parseQuery(raw));
    });
  }

  const scanButton = root.querySelector("[data-scan]");
  const resetScanButton = () => {
    if (scanButton instanceof HTMLButtonElement) {
      scanButton.textContent = "Сканировать";
    }
  };

  if (scanButton instanceof HTMLButtonElement) {
    scanButton.addEventListener("click", () => {
      if (scanStop !== undefined) {
        scanStop();
        scanStop = undefined;
        resetScanButton();
        return;
      }
      void startScan();
    });
  }

  const startScan = async () => {
    const video = root.querySelector("[data-preview]");
    const stop = await scanQr({
      hint: "Наведите на QR гостя",
      video: video instanceof HTMLVideoElement ? video : undefined,
      onCode: async (value) => {
        scanStop = undefined;
        resetScanButton();
        await lookup(parseQuery(value));
      },
      onError: (message) => {
        scanStop = undefined;
        resetScanButton();
        setStatus(root, `${message}, введите код вручную`, true);
      },
    });
    if (stop !== undefined) {
      scanStop = stop;
      if (scanButton instanceof HTMLButtonElement) {
        scanButton.textContent = "Стоп";
      }
    }
  };
};
