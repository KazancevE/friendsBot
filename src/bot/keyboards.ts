import { Keyboard } from "grammy";
import type { Role } from "../domain/types.ts";

export const CANCEL_TEXT = "Отмена";

export function contactKeyboard(): Keyboard {
  return new Keyboard().requestContact("Поделиться контактом").resized().oneTime();
}

export const cancelKeyboard = (): Keyboard => {
  return new Keyboard().text(CANCEL_TEXT).resized().oneTime();
};

export const contactOrCancelKeyboard = (): Keyboard => {
  return new Keyboard()
    .requestContact("Поделиться контактом")
    .text(CANCEL_TEXT)
    .resized()
    .oneTime();
};

export const MINI_APP_GUEST_LABEL = "Игры";
export const MINI_APP_STAFF_LABEL = "Приложение";

export const miniAppButtonLabel = (role: Role) => {
  return role === "guest" ? MINI_APP_GUEST_LABEL : MINI_APP_STAFF_LABEL;
};

type MainKeyboardParameters = {
  readonly role: Role;
  readonly publicUrl: string;
};

export const mainKeyboard = ({ role, publicUrl: _publicUrl }: MainKeyboardParameters) => {
  const keyboard = new Keyboard()
    .text("Баланс и QR")
    .text("История")
    .row()
    .text("Профиль")
    .text("Меню")
    .row()
    .text("Акции")
    .text("Как доехать")
    .row()
    .text("Контакты")
    .text(miniAppButtonLabel(role));

  if (role === "guest") {
    keyboard.row().text("Отключить рассылку").text("Забронировать");
    keyboard.row().text("Пригласить друга");
  }
  if (role === "master" || role === "admin") {
    keyboard.row().text("Найти гостя").text("Код зала");
    keyboard.row().text("Брони сегодня");
  }
  if (role === "admin") {
    keyboard.row().text("Настройки").text("Роли").text("Рассылка");
    keyboard.row().text("Статистика").text("История персонала").text("Экспорт");
    keyboard.row().text("Подозрительные партии").text("Викторина").text("Вопрос викторины");
    keyboard.row().text("Веб-админ");
  }

  return keyboard.resized().persistent();
};
