type TelegramHapticFeedback = {
  readonly impactOccurred: (style: "light" | "medium" | "heavy") => void;
};

type ScanQrPopupParams = {
  readonly text?: string;
};

type TelegramWebApp = {
  readonly ready: () => void;
  readonly expand?: () => void;
  readonly requestFullscreen?: () => void;
  readonly disableVerticalSwipes?: () => void;
  readonly setHeaderColor?: (color: string) => void;
  readonly setBackgroundColor?: (color: string) => void;
  readonly isVersionAtLeast?: (version: string) => boolean;
  readonly initData: string;
  readonly contentSafeAreaInset?: SafeAreaInset;
  readonly safeAreaInset?: SafeAreaInset;
  readonly HapticFeedback?: TelegramHapticFeedback;
  readonly showScanQrPopup?: (
    params: ScanQrPopupParams,
    callback?: (text: string) => boolean,
  ) => void;
  readonly closeScanQrPopup?: () => void;
  readonly onEvent?: (eventType: string, callback: () => void) => void;
  readonly offEvent?: (eventType: string, callback: () => void) => void;
};

type SafeAreaInset = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

type TelegramNamespace = {
  readonly WebApp: TelegramWebApp;
};

const APP_BG = "#1a1210";

const applySafeAreaInsets = (webApp: TelegramWebApp) => {
  const inset = webApp.contentSafeAreaInset ?? webApp.safeAreaInset;
  if (inset === undefined) {
    return;
  }
  document.documentElement.style.setProperty("--tg-content-safe-area-inset-top", `${inset.top}px`);
  document.documentElement.style.setProperty("--tg-content-safe-area-inset-bottom", `${inset.bottom}px`);
  document.documentElement.style.setProperty("--tg-content-safe-area-inset-left", `${inset.left}px`);
  document.documentElement.style.setProperty("--tg-content-safe-area-inset-right", `${inset.right}px`);
};

const telegramWebApp = (): TelegramWebApp | undefined => {
  const telegram = (window as Window & { Telegram?: TelegramNamespace }).Telegram;
  return telegram?.WebApp;
};

export const readyTelegram = () => {
  const webApp = telegramWebApp();
  if (!webApp) {
    return;
  }

  webApp.ready();
  webApp.setHeaderColor?.(APP_BG);
  webApp.setBackgroundColor?.(APP_BG);
  webApp.expand?.();

  if (webApp.isVersionAtLeast?.("8.0")) {
    webApp.requestFullscreen?.();
  }

  webApp.disableVerticalSwipes?.();

  applySafeAreaInsets(webApp);
  webApp.onEvent?.("contentSafeAreaChanged", () => {
    applySafeAreaInsets(webApp);
  });
  webApp.onEvent?.("safeAreaChanged", () => {
    applySafeAreaInsets(webApp);
  });
  webApp.onEvent?.("viewportChanged", () => {
    applySafeAreaInsets(webApp);
  });
};

export const initData = () => {
  return telegramWebApp()?.initData ?? "";
};

export const hapticImpact = (style: "light" | "medium" | "heavy" = "light") => {
  telegramWebApp()?.HapticFeedback?.impactOccurred(style);
};

export const canScanViaTelegram = () => {
  return telegramWebApp()?.showScanQrPopup !== undefined;
};

export const scanViaTelegramPopup = (hint?: string): Promise<string | undefined> => {
  return new Promise((resolve) => {
    const webApp = telegramWebApp();
    if (webApp?.showScanQrPopup === undefined) {
      resolve(undefined);
      return;
    }

    let settled = false;
    const finish = (value: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      webApp.offEvent?.("scanQrPopupClosed", onClosed);
      resolve(value);
    };

    const onClosed = () => {
      finish(undefined);
    };

    webApp.onEvent?.("scanQrPopupClosed", onClosed);
    webApp.showScanQrPopup({ text: hint ?? "" }, (text) => {
      finish(text);
      return true;
    });
  });
};
