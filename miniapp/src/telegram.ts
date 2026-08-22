type TelegramWebApp = {
  readonly ready: () => void;
  readonly initData: string;
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
