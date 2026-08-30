type SafeAreaInset = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
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
  readonly onEvent?: (eventType: string, callback: () => void) => void;
};

type TelegramNamespace = {
  readonly WebApp: TelegramWebApp;
};

const APP_BG = "#141018";

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

const webApp = (): TelegramWebApp | undefined => {
  return (window as Window & { Telegram?: TelegramNamespace }).Telegram?.WebApp;
};

export const readyTelegram = () => {
  const app = webApp();
  if (app === undefined) {
    return;
  }

  app.ready();
  app.setHeaderColor?.(APP_BG);
  app.setBackgroundColor?.(APP_BG);
  app.expand?.();

  if (app.isVersionAtLeast?.("8.0")) {
    app.requestFullscreen?.();
  }

  app.disableVerticalSwipes?.();

  applySafeAreaInsets(app);
  app.onEvent?.("contentSafeAreaChanged", () => {
    applySafeAreaInsets(app);
  });
  app.onEvent?.("safeAreaChanged", () => {
    applySafeAreaInsets(app);
  });
  app.onEvent?.("viewportChanged", () => {
    applySafeAreaInsets(app);
  });
};

export const initData = () => webApp()?.initData ?? "";
