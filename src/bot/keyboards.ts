import { Keyboard } from "grammy";
import type { Role } from "../domain/types.ts";

export function contactKeyboard(): Keyboard {
  return new Keyboard().requestContact("Поделиться контактом").resized().oneTime();
}

export function mainKeyboard(role: Role): Keyboard {
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
    keyboard.row().text("Найти гостя");
  }
  if (role === "admin") {
    keyboard.row().text("Настройки").text("Роли").text("Рассылка");
  }

  return keyboard.resized().persistent();
}
