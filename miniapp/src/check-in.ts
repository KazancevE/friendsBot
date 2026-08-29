import { submitCheckIn } from "./api.ts";
import { canScanCamera, canScanQr, prefersTelegramScanner, scanQr } from "./qr-scan.ts";

const setStatus = (root: HTMLElement, message: string, isError = false) => {
  const status = root.querySelector("[data-status]");
  if (!(status instanceof HTMLElement)) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
};

type RenderCheckInParameters = {
  readonly root: HTMLElement;
  readonly onSuccess: () => void;
};

export const renderCheckIn = ({ root, onSuccess }: RenderCheckInParameters) => {
  const scanAvailable = canScanQr();
  const useCamera = scanAvailable && canScanCamera() && !prefersTelegramScanner();
  root.innerHTML = `
    <header>
      <h1>Отметка в зале</h1>
      <p class="muted">Сканируйте QR с экрана персонала или введите 4 цифры</p>
    </header>
    <section class="panel">
      ${useCamera ? `<video data-preview playsinline muted hidden></video>` : ""}
      ${scanAvailable ? `<button type="button" data-scan>Сканировать QR</button>` : ""}
      <p class="check-in-divider">или</p>
      <form data-pin>
        <label>
          Код с экрана
          <input name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" autocomplete="one-time-code" required />
        </label>
        <button type="submit">Отметиться</button>
      </form>
    </section>
    <p data-status class="status"></p>
  `;

  let scanStop: (() => void) | undefined;

  const submitPin = async (pin: string) => {
    setStatus(root, "Проверяем…");
    const result = await submitCheckIn({ method: "pin", pin });
    if (result.kind === "error") {
      setStatus(root, result.message, true);
      return;
    }
    setStatus(root, result.data.message);
    onSuccess();
  };

  const submitToken = async (token: string) => {
    setStatus(root, "Проверяем…");
    const result = await submitCheckIn({ method: "qr", token });
    if (result.kind === "error") {
      setStatus(root, result.message, true);
      return;
    }
    setStatus(root, result.data.message);
    onSuccess();
  };

  const pinForm = root.querySelector("[data-pin]");
  if (pinForm instanceof HTMLFormElement) {
    pinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(pinForm);
      const pin = String(data.get("pin") ?? "").trim();
      void submitPin(pin);
    });
  }

  const scanButton = root.querySelector("[data-scan]");
  const resetScanButton = () => {
    if (scanButton instanceof HTMLButtonElement) {
      scanButton.textContent = "Сканировать QR";
    }
  };

  const startScan = async () => {
    const video = root.querySelector("[data-preview]");
    const stop = await scanQr({
      hint: "Наведите на QR с экрана персонала",
      video: video instanceof HTMLVideoElement ? video : undefined,
      onCode: async (value) => {
        scanStop = undefined;
        resetScanButton();
        await submitToken(value);
      },
      onError: (message) => {
        scanStop = undefined;
        resetScanButton();
        setStatus(root, message, true);
      },
    });
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
