import { afterEach, expect, test, vi } from "vitest";
import { canScanQr } from "../../miniapp/src/qr-scan.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("canScanQr is true when Telegram showScanQrPopup is available", () => {
  vi.stubGlobal("window", {
    Telegram: {
      WebApp: {
        showScanQrPopup: () => {},
      },
    },
  });
  expect(canScanQr()).toBe(true);
});

test("canScanQr is true when BarcodeDetector and getUserMedia are available", () => {
  vi.stubGlobal("window", {
    BarcodeDetector: class {},
  });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () => Promise.resolve(new MediaStream()),
    },
  });
  expect(canScanQr()).toBe(true);
});

test("canScanQr is false without Telegram or camera APIs", () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", {});
  expect(canScanQr()).toBe(false);
});
