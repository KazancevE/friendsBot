import { submitCheckIn } from "./api.ts";
import { canScanCamera, canScanQr, prefersTelegramScanner, scanQr } from "./qr-scan.ts";
import { hapticImpact } from "./telegram.ts";

const VENUE_QR_PREFIX = "friends://checkin?t=";

const parseVenueToken = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.startsWith(VENUE_QR_PREFIX)) {
    return trimmed.slice(VENUE_QR_PREFIX.length);
  }
  const queryMatch = /[?&]t=([^&]+)/.exec(trimmed);
  if (queryMatch?.[1] !== undefined) {
    return queryMatch[1];
  }
  return trimmed;
};

type RenderCheckInOptions = {
  readonly root: HTMLElement;
  readonly onSuccess: () => void;
  readonly compact?: boolean;
};

const setStatus = (root: HTMLElement, message: string, isError = false) => {
  const status = root.querySelector("[data-status]");
  if (!(status instanceof HTMLElement)) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const readPin = (root: HTMLElement) => {
  const inputs = root.querySelectorAll("[data-pin-digit]");
  return [...inputs]
    .map((input) => (input instanceof HTMLInputElement ? input.value : ""))
    .join("");
};

const bindPinInputs = (root: HTMLElement, onComplete: (pin: string) => void) => {
  const inputs = [...root.querySelectorAll("[data-pin-digit]")].filter(
    (input): input is HTMLInputElement => input instanceof HTMLInputElement,
  );
  if (inputs.length === 0) {
    return;
  }
  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(-1);
      if (input.value.length === 1 && index < inputs.length - 1) {
        inputs[index + 1]?.focus();
      }
      const pin = readPin(root);
      if (pin.length === inputs.length) {
        onComplete(pin);
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && input.value.length === 0 && index > 0) {
        inputs[index - 1]?.focus();
      }
    });
  });
};

export const renderCheckIn = ({ root, onSuccess, compact = false }: RenderCheckInOptions) => {
  const scanAvailable = canScanQr();
  const useCamera = scanAvailable && canScanCamera() && !prefersTelegramScanner();
  root.innerHTML = `
    ${compact ? "" : `<header>
      <h1>Отметка в зале</h1>
      <p class="muted">Сканируйте QR с экрана персонала или введите 4 цифры</p>
    </header>`}
    <section class="panel check-in-panel">
      ${compact ? `<h2 class="check-in-sheet-title">Отметка в зале</h2><p class="muted">Сканируйте QR или введите код с экрана персонала</p>` : ""}
      ${useCamera ? `<video data-preview playsinline muted hidden></video>` : ""}
      ${scanAvailable ? `<button type="button" data-scan>Сканировать QR</button>` : ""}
      <p class="check-in-divider">или</p>
      <form data-pin>
        <label class="check-in-pin-label">
          Код с экрана
          <div class="check-in-pin" data-pin-group>
            <input data-pin-digit inputmode="numeric" maxlength="1" autocomplete="one-time-code" aria-label="Цифра 1" required />
            <input data-pin-digit inputmode="numeric" maxlength="1" aria-label="Цифра 2" required />
            <input data-pin-digit inputmode="numeric" maxlength="1" aria-label="Цифра 3" required />
            <input data-pin-digit inputmode="numeric" maxlength="1" aria-label="Цифра 4" required />
          </div>
        </label>
        <button type="submit">Отметиться</button>
      </form>
    </section>
    <p data-status class="status"></p>
  `;

  let scanStop: (() => void) | undefined;

  const submitPin = async (pin: string) => {
    if (pin.length !== 4) {
      setStatus(root, "Введите 4 цифры", true);
      return;
    }
    setStatus(root, "Проверяем…");
    const result = await submitCheckIn({ method: "pin", pin });
    if (result.kind === "error") {
      setStatus(root, result.message, true);
      return;
    }
    hapticImpact("medium");
    setStatus(root, result.data.message);
    onSuccess();
  };

  const submitToken = async (token: string) => {
    const parsed = parseVenueToken(token);
    if (parsed.length === 0) {
      setStatus(root, "Не удалось прочитать QR-код", true);
      return;
    }
    setStatus(root, "Проверяем…");
    const result = await submitCheckIn({ method: "qr", token: parsed });
    if (result.kind === "error") {
      setStatus(root, result.message, true);
      return;
    }
    hapticImpact("medium");
    setStatus(root, result.data.message);
    onSuccess();
  };

  bindPinInputs(root, (pin) => {
    void submitPin(pin);
  });

  const pinForm = root.querySelector("[data-pin]");
  if (pinForm instanceof HTMLFormElement) {
    pinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitPin(readPin(root));
    });
  }

  const scanButton = root.querySelector("[data-scan]");
  const resetScanButton = () => {
    if (scanButton instanceof HTMLButtonElement) {
      scanButton.textContent = "Сканировать QR";
    }
  };

  const startScan = async () => {
    if (scanButton instanceof HTMLButtonElement) {
      scanButton.disabled = true;
    }
    setStatus(root, "Открываем сканер…");
    const video = root.querySelector("[data-preview]");
    const stop = await scanQr({
      hint: "Наведите на QR с экрана персонала",
      video: video instanceof HTMLVideoElement ? video : undefined,
      onCode: async (value) => {
        scanStop = undefined;
        resetScanButton();
        await submitToken(value);
      },
      onCancel: () => {
        setStatus(root, "");
      },
      onError: (message) => {
        scanStop = undefined;
        resetScanButton();
        setStatus(root, message, true);
      },
    });
    if (scanButton instanceof HTMLButtonElement) {
      scanButton.disabled = false;
    }
    if (stop !== undefined) {
      scanStop = stop;
      if (scanButton instanceof HTMLButtonElement) {
        scanButton.textContent = "Стоп";
      }
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
};
