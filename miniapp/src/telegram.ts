import { applySafeAreaCssVariables, type EdgeInsets } from "../../src/web/safe-area.ts";

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
  readonly MainButton?: TelegramMainButton;
  readonly BackButton?: TelegramBackButton;
  readonly onEvent?: (eventType: string, callback: () => void) => void;
  readonly offEvent?: (eventType: string, callback: () => void) => void;
};

type TelegramMainButton = {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly onClick: (callback: () => void) => void;
  readonly offClick: (callback: () => void) => void;
};

type TelegramBackButton = {
  readonly show: () => void;
  readonly hide: () => void;
  readonly onClick: (callback: () => void) => void;
  readonly offClick: (callback: () => void) => void;
};

type SafeAreaInset = EdgeInsets;

type TelegramNamespace = {
  readonly WebApp: TelegramWebApp;
};

const APP_BG = "#1a1210";
const WEBAPP_BUILD = "20260929";

type InsetHost = {
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  onEvent?: (eventType: string, callback: () => void) => void;
};

const applySafeAreaInsets = (webApp: InsetHost) => {
  applySafeAreaCssVariables(document.documentElement, {
    safeAreaInset: webApp.safeAreaInset,
    contentSafeAreaInset: webApp.contentSafeAreaInset,
  });
};

const watchSafeArea = (webApp: InsetHost) => {
  const apply = () => applySafeAreaInsets(webApp);
  apply();
  webApp.onEvent?.("safeAreaChanged", apply);
  webApp.onEvent?.("contentSafeAreaChanged", apply);
  webApp.onEvent?.("viewportChanged", apply);
};

const telegramWebApp = (): TelegramWebApp | undefined => {
  const telegram = (window as Window & { Telegram?: TelegramNamespace }).Telegram;
  return telegram?.WebApp;
};

type MaxWebApp = InsetHost & {
  initData?: string;
  ready?: () => void;
};

const maxWebApp = (): MaxWebApp | undefined => {
  const host = window as Window & { WebApp?: MaxWebApp };
  return host.WebApp;
};

export const readyTelegram = () => {
  const webApp = telegramWebApp();
  if (webApp) {
    webApp.ready();
    webApp.setHeaderColor?.(APP_BG);
    webApp.setBackgroundColor?.(APP_BG);
    webApp.expand?.();
    if (webApp.isVersionAtLeast?.("8.0")) {
      webApp.requestFullscreen?.();
    }
    webApp.disableVerticalSwipes?.();
    document.documentElement.dataset.build = WEBAPP_BUILD;
    watchSafeArea(webApp);
  }
  const maxApp = maxWebApp();
  if (maxApp) {
    maxApp.ready?.();
    watchSafeArea(maxApp);
  }
};

export type LaunchInit = { channel: "telegram" | "max"; initData: string };

export const readLaunchInitData = (): LaunchInit | null => {
  const telegramData = telegramWebApp()?.initData ?? "";
  if (telegramData) {
    return { channel: "telegram", initData: telegramData };
  }
  const maxData = maxWebApp()?.initData ?? "";
  if (maxData) {
    return { channel: "max", initData: maxData };
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromTelegramHash = hash.get("tgWebAppData");
  if (fromTelegramHash) {
    return { channel: "telegram", initData: fromTelegramHash };
  }
  const fromMaxHash = hash.get("WebAppData");
  if (fromMaxHash) {
    return { channel: "max", initData: fromMaxHash };
  }
  return null;
};

export const initData = () => {
  return telegramWebApp()?.initData ?? "";
};

export const hapticImpact = (style: "light" | "medium" | "heavy" = "light") => {
  telegramWebApp()?.HapticFeedback?.impactOccurred(style);
};

export const canScanViaTelegram = () => {
  const webApp = telegramWebApp();
  if (webApp?.showScanQrPopup === undefined) {
    return false;
  }
  return webApp.isVersionAtLeast?.("6.4") ?? true;
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

export const bindMainButton = (text: string, onClick: () => void) => {
  const mainButton = telegramWebApp()?.MainButton;
  if (mainButton === undefined) {
    return () => {};
  }
  mainButton.setText(text);
  mainButton.onClick(onClick);
  mainButton.show();
  return () => {
    mainButton.offClick(onClick);
    mainButton.hide();
  };
};

export const hideMainButton = () => {
  telegramWebApp()?.MainButton?.hide();
};
