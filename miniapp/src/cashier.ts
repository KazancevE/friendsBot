import {
  applyCheck,
  lookupGuest,
  openVisit,
  redeemBonuses,
  type GuestCard,
} from "./api.ts";

type DetectedBarcode = {
  readonly rawValue: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<ReadonlyArray<DetectedBarcode>>;
};

type BarcodeDetectorConstructor = new (options: {
  readonly formats: ReadonlyArray<string>;
}) => BarcodeDetectorInstance;

type GuestQuery = { readonly phone: string } | { readonly qrToken: string };

const barcodeDetectorCtor = (): BarcodeDetectorConstructor | undefined => {
  const ctor = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return ctor;
};

const canScanCamera = () => {
  return barcodeDetectorCtor() !== undefined && navigator.mediaDevices?.getUserMedia !== undefined;
};

const parseQuery = (raw: string): GuestQuery => {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) {
    return { phone: trimmed };
  }
  return { qrToken: trimmed };
};

const guestName = (card: GuestCard) => {
  const name = `${card.firstName ?? ""} ${card.lastName ?? ""}`.trim();
  if (name === "") {
    return "—";
  }
  return name;
};

const queryFromCard = (card: GuestCard): GuestQuery => {
  if (card.phone !== null && card.phone.length > 0) {
    return { phone: card.phone };
  }
  return { qrToken: card.qrToken };
};

const setStatus = (root: HTMLElement, message: string, isError = false) => {
  const status = root.querySelector("[data-status]");
  if (!(status instanceof HTMLElement)) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const renderCard = (root: HTMLElement, card: GuestCard) => {
  const cardEl = root.querySelector("[data-card]");
  if (!(cardEl instanceof HTMLElement)) {
    return;
  }
  const coupons = card.coupons.length > 0 ? card.coupons.join(", ") : "нет";
  cardEl.hidden = false;
  cardEl.innerHTML = [
    `<p><strong>${guestName(card)}</strong></p>`,
    `<p>Телефон: ${card.phone ?? "—"}</p>`,
    `<p>Баланс: ${card.balance}</p>`,
    `<p>Визит: ${card.visitActive ? "да" : "нет"}</p>`,
    `<p>Купоны: ${coupons}</p>`,
  ].join("");
  const actions = root.querySelector("[data-actions]");
  if (actions instanceof HTMLElement) {
    actions.hidden = false;
  }
};

export const renderCashier = (root: HTMLElement) => {
  root.innerHTML = `
    <header>
      <h1>Касса</h1>
      <p class="muted">Сканируйте QR гостя или введите телефон / код</p>
    </header>
    <section class="panel">
      <video data-preview playsinline muted hidden></video>
      <button type="button" data-scan>Сканировать</button>
      <form data-lookup>
        <label>
          Телефон или код QR
          <input name="query" autocomplete="off" inputmode="text" required />
        </label>
        <button type="submit">Найти</button>
      </form>
    </section>
    <section class="panel" data-card hidden></section>
    <section class="panel" data-actions hidden>
      <form data-check>
        <label>
          Сумма чека, ₽
          <input name="checkRubles" type="number" min="1" step="1" required />
        </label>
        <button type="submit">Начислить</button>
      </form>
      <form data-redeem>
        <label>
          Списать бонусов
          <input name="amount" type="number" min="1" step="1" required />
        </label>
        <button type="submit">Списать</button>
      </form>
      <button type="button" data-visit>Открыть визит</button>
    </section>
    <p data-status class="status"></p>
  `;

  let current: GuestCard | undefined;
  let scanStop: (() => void) | undefined;

  const lookup = async (query: GuestQuery) => {
    setStatus(root, "Ищем…");
    const result = await lookupGuest(query);
    if (result.kind === "error") {
      setStatus(root, result.message, true);
      return;
    }
    current = result.data;
    renderCard(root, result.data);
    setStatus(root, "Гость найден");
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
  if (scanButton instanceof HTMLButtonElement) {
    if (!canScanCamera()) {
      scanButton.hidden = true;
    }
    scanButton.addEventListener("click", () => {
      if (scanStop !== undefined) {
        scanStop();
        scanStop = undefined;
        scanButton.textContent = "Сканировать";
        return;
      }
      void startScan();
    });
  }

  const startScan = async () => {
    const Ctor = barcodeDetectorCtor();
    const video = root.querySelector("[data-preview]");
    const scanButtonEl = root.querySelector("[data-scan]");
    if (Ctor === undefined || !(video instanceof HTMLVideoElement)) {
      setStatus(root, "Камера недоступна, введите код вручную", true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      const detector = new Ctor({ formats: ["qr_code"] });
      let active = true;
      scanStop = () => {
        active = false;
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        video.srcObject = null;
        video.hidden = true;
      };
      if (scanButtonEl instanceof HTMLButtonElement) {
        scanButtonEl.textContent = "Стоп";
      }
      const tick = async () => {
        if (!active) {
          return;
        }
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value !== undefined && value.length > 0) {
            scanStop?.();
            scanStop = undefined;
            if (scanButtonEl instanceof HTMLButtonElement) {
              scanButtonEl.textContent = "Сканировать";
            }
            await lookup(parseQuery(value));
            return;
          }
        } catch {
          // keep scanning; some frames fail to detect
        }
        requestAnimationFrame(() => {
          void tick();
        });
      };
      void tick();
    } catch {
      setStatus(root, "Нет доступа к камере, введите код вручную", true);
    }
  };

  const checkForm = root.querySelector("[data-check]");
  if (checkForm instanceof HTMLFormElement) {
    checkForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      const data = new FormData(checkForm);
      const checkRubles = Number(data.get("checkRubles"));
      void (async () => {
        const result = await applyCheck({ ...queryFromCard(guest), checkRubles });
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = { ...guest, balance: result.data.balance, visitActive: true };
        renderCard(root, current);
        setStatus(root, `Начислено ${result.data.bonus}. Баланс: ${result.data.balance}`);
      })();
    });
  }

  const redeemForm = root.querySelector("[data-redeem]");
  if (redeemForm instanceof HTMLFormElement) {
    redeemForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      const data = new FormData(redeemForm);
      const amount = Number(data.get("amount"));
      void (async () => {
        const result = await redeemBonuses({ ...queryFromCard(guest), amount });
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = { ...guest, balance: result.data.balance };
        renderCard(root, current);
        setStatus(root, `Списано. Баланс: ${result.data.balance}`);
      })();
    });
  }

  const visitButton = root.querySelector("[data-visit]");
  if (visitButton instanceof HTMLButtonElement) {
    visitButton.addEventListener("click", () => {
      const guest = current;
      if (guest === undefined) {
        setStatus(root, "Сначала найдите гостя", true);
        return;
      }
      void (async () => {
        const result = await openVisit(queryFromCard(guest));
        if (result.kind === "error") {
          setStatus(root, result.message, true);
          return;
        }
        current = { ...guest, visitActive: true };
        renderCard(root, current);
        setStatus(root, "Визит открыт");
      })();
    });
  }
};
