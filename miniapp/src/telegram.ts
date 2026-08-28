type TelegramHapticFeedback = {
  readonly impactOccurred: (style: "light" | "medium" | "heavy") => void;
};

type TelegramWebApp = {
  readonly ready: () => void;
  readonly initData: string;
  readonly HapticFeedback?: TelegramHapticFeedback;
};

type TelegramNamespace = {
  readonly WebApp: TelegramWebApp;
};

const telegramWebApp = (): TelegramWebApp | undefined => {
  const telegram = (window as Window & { Telegram?: TelegramNamespace }).Telegram;
  return telegram?.WebApp;
};

export const readyTelegram = () => {
  telegramWebApp()?.ready();
};

export const initData = () => {
  return telegramWebApp()?.initData ?? "";
};

export const hapticImpact = (style: "light" | "medium" | "heavy" = "light") => {
  telegramWebApp()?.HapticFeedback?.impactOccurred(style);
};
