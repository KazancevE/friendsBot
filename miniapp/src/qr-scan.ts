import { canScanViaTelegram, scanViaTelegramPopup } from "./telegram.ts";

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

export const canScanCamera = () => {
  return barcodeDetectorCtor() !== undefined && navigator.mediaDevices?.getUserMedia !== undefined;
};

export const canScanQr = () => {
  return canScanViaTelegram() || canScanCamera();
};

export const prefersTelegramScanner = () => {
  return canScanViaTelegram();
};

type StartCameraScanParameters = {
  readonly video: HTMLVideoElement;
  readonly onCode: (value: string) => void | Promise<void>;
  readonly onError: (message: string) => void;
};

export const startCameraScan = ({
  video,
  onCode,
  onError,
}: StartCameraScanParameters): (() => void) | undefined => {
  const Ctor = barcodeDetectorCtor();
  if (Ctor === undefined) {
    onError("Камера недоступна");
    return undefined;
  }

  let active = true;
  let stream: MediaStream | undefined;

  const stop = () => {
    active = false;
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    video.srcObject = null;
    video.hidden = true;
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      const detector = new Ctor({ formats: ["qr_code"] });
      const tick = async () => {
        if (!active) {
          return;
        }
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value !== undefined && value.length > 0) {
            stop();
            await onCode(value);
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
      stop();
      onError("Нет доступа к камере");
    }
  })();

  return stop;
};

type ScanQrParameters = {
  readonly hint?: string;
  readonly video?: HTMLVideoElement;
  readonly onCode: (value: string) => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly onError?: (message: string) => void;
};

export const scanQr = async ({
  hint,
  video,
  onCode,
  onCancel,
  onError,
}: ScanQrParameters): Promise<(() => void) | undefined> => {
  if (canScanViaTelegram()) {
    const value = await scanViaTelegramPopup(hint);
    if (value === undefined || value.length === 0) {
      onCancel?.();
      return undefined;
    }
    await onCode(value);
    return undefined;
  }

  if (!canScanCamera() || video === undefined) {
    onError?.("Сканирование недоступно");
    return undefined;
  }

  return startCameraScan({
    video,
    onCode,
    onError: (message) => {
      onError?.(message);
    },
  });
};
