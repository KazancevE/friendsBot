type TelegramWebApp = {
  readonly ready: () => void;
  readonly expand?: () => void;
  readonly initData: string;
};

const webApp = (): TelegramWebApp | undefined => {
  return (window as Window & { Telegram?: { WebApp: TelegramWebApp } }).Telegram?.WebApp;
};

export const readyTelegram = () => {
  const app = webApp();
  app?.ready();
  app?.expand?.();
};

export const initData = () => webApp()?.initData ?? "";
