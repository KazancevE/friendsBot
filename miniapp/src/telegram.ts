type TelegramHapticFeedback = {
  readonly impactOccurred: (style: "light" | "medium" | "heavy") => void;
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
  readonly HapticFeedback?: TelegramHapticFeedback;
};

type TelegramNamespace = {
  readonly WebApp: TelegramWebApp;
};

const APP_BG = "#1a1210";

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
};

export const initData = () => {
  return telegramWebApp()?.initData ?? "";
};

export const hapticImpact = (style: "light" | "medium" | "heavy" = "light") => {
  telegramWebApp()?.HapticFeedback?.impactOccurred(style);
};
