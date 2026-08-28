import { submitCheckIn } from "./api.ts";

type DetectedBarcode = {
  readonly rawValue: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<ReadonlyArray<DetectedBarcode>>;
};

type BarcodeDetectorConstructor = new (options: {
  readonly formats: ReadonlyArray<string>;
}) => BarcodeDetectorInstance;

const barcodeDetectorCtor = (): BarcodeDetectorConstructor | undefined => {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
};

const canScanCamera = () => {
  return barcodeDetectorCtor() !== undefined && navigator.mediaDevices?.getUserMedia !== undefined;
};

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
  const scanAvailable = canScanCamera();
  root.innerHTML = `
    <header>
      <h1>Отметка в зале</h1>
      <p class="muted">Сканируйте QR с экрана персонала или введите 4 цифры</p>
    </header>
    <section class="panel">
      ${scanAvailable ? `<video data-preview playsinline muted hidden></video>` : ""}
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
  const startScan = async () => {
    const Ctor = barcodeDetectorCtor();
    const video = root.querySelector("[data-preview]");
    const scanButtonEl = root.querySelector("[data-scan]");
    if (Ctor === undefined || !(video instanceof HTMLVideoElement)) {
      setStatus(root, "Камера недоступна", true);
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
              scanButtonEl.textContent = "Сканировать QR";
            }
            await submitToken(value);
            return;
          }
        } catch {
          // keep scanning
        }
        requestAnimationFrame(() => {
          void tick();
        });
      };
      void tick();
    } catch {
      setStatus(root, "Нет доступа к камере", true);
    }
  };

  if (scanButton instanceof HTMLButtonElement) {
    scanButton.addEventListener("click", () => {
      if (scanStop !== undefined) {
        scanStop();
        scanStop = undefined;
        scanButton.textContent = "Сканировать QR";
        return;
      }
      void startScan();
    });
  }
};
