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

const miniAppUrl = (publicUrl: string) => {
  const origin = publicUrl.replace(/\/$/, "");
  return `${origin}/app/`;
};

type MainKeyboardParameters = {
  readonly role: Role;
  readonly publicUrl: string;
};

export const mainKeyboard = ({ role, publicUrl }: MainKeyboardParameters) => {
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
    .text("Игры");

  if (role === "guest") {
    keyboard.row().text("Отключить рассылку");
  }
  if (role === "master" || role === "admin") {
    keyboard.row().text("Найти гостя").row().webApp("Касса QR", miniAppUrl(publicUrl));
  }
  if (role === "admin") {
    keyboard.row().text("Настройки").text("Роли").text("Рассылка");
  }

  return keyboard.resized().persistent();
};
