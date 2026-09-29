export type MiniAppChannel = "telegram" | "max";

export type MiniAppGate = "ok" | "missing" | "bad_signature" | "stale" | "unregistered" | "needs_consent" | "needs_profile";

export const miniAppGateMessage = (gate: Exclude<MiniAppGate, "ok">, channel: MiniAppChannel) => {
  const chat = channel === "max" ? "чате бота MAX" : "чате Telegram";
  if (gate === "missing") {
    return "Мессенджер не передал данные входа. Откройте карту кнопкой меню бота или inline-кнопкой в чате. Ссылка в браузере и кнопка обычной клавиатуры карту не открывают.";
  }
  if (gate === "bad_signature") {
    return channel === "max"
      ? "Окно открыто ботом MAX, чей токен не совпадает с MAX_BOT_TOKEN на сервере."
      : "Окно открыто ботом, чей токен не совпадает с TELEGRAM_BOT_TOKEN на сервере. Кнопка «Карта» должна быть у того бота, который здесь запущен.";
  }
  if (gate === "stale") {
    return "Сессия окна истекла. Закройте его и откройте карту из бота ещё раз.";
  }
  if (gate === "unregistered") {
    return `Карты ещё нет. В ${chat} нажмите «Старт» и пройдите знакомство: согласие, телефон и имя. Затем откройте «Карту» снова.`;
  }
  if (gate === "needs_consent") {
    return `В ${chat} нажмите «Старт» и подтвердите согласие на обработку персональных данных. Карта откроется после этого.`;
  }
  return `В ${chat} нажмите «Старт» и закончите знакомство. Карта откроется, когда будут согласие, телефон и имя.`;
};
