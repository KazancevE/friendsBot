import { InlineKeyboard, Keyboard } from "grammy";
import type { Role } from "../domain/types.ts";
import { adminAppUrl, miniAppUrl } from "../web-app-url.ts";

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

export const MINI_APP_GUEST_LABEL = "🎮 Игры";
export const MINI_APP_STAFF_LABEL = "📱 Приложение";

export const BTN_BALANCE = "💰 Баланс";
export const BTN_QR = "📱 QR";
export const BTN_BALANCE_QR_LEGACY = "Баланс и QR";
export const BTN_HISTORY = "История";
export const BTN_PROFILE = "👤 Профиль";
export const BTN_MENU = "📋 Меню";
export const BTN_PROMOS = "🎁 Акции";
export const BTN_DIRECTIONS = "📍 Как доехать";
export const BTN_CONTACTS = "☎️ Контакты";
export const BTN_BOOK = "📅 Забронировать";
export const BTN_REFERRAL = "👥 Пригласить друга";
export const BTN_MORE = "⚙️ Ещё…";
export const BTN_FIND_GUEST = "🔍 Найти гостя";
export const BTN_VENUE_CODE = "🏷️ Код зала";
export const BTN_BOOKINGS_TODAY = "📅 Брони сегодня";
export const BTN_WEB_ADMIN = "🖥 Веб-админ";

export const miniAppButtonLabel = (role: Role) => {
  return role === "guest" ? MINI_APP_GUEST_LABEL : MINI_APP_STAFF_LABEL;
};

/** Reply keyboard: text only — Telegram не передаёт initData с reply web_app. */
export const inlineMiniAppKeyboard = (publicUrl: string, label: string) => {
  return new InlineKeyboard().webApp(label, miniAppUrl(publicUrl));
};

export const inlineAdminAppKeyboard = (publicUrl: string) => {
  return new InlineKeyboard().webApp("Открыть веб-админ", adminAppUrl(publicUrl));
};

type MainKeyboardParameters = {
  readonly role: Role;
};

const guestKeyboard = () => {
  return new Keyboard()
    .text(BTN_BALANCE)
    .text(BTN_QR)
    .row()
    .text(MINI_APP_GUEST_LABEL)
    .row()
    .text(BTN_MENU)
    .text(BTN_PROMOS)
    .row()
    .text(BTN_PROFILE)
    .text(BTN_DIRECTIONS)
    .text(BTN_CONTACTS)
    .row()
    .text(BTN_BOOK)
    .text(BTN_REFERRAL)
    .row()
    .text(BTN_MORE)
    .resized()
    .persistent();
};

const masterKeyboard = () => {
  return new Keyboard()
    .text(BTN_FIND_GUEST)
    .row()
    .text(MINI_APP_STAFF_LABEL)
    .row()
    .text(BTN_VENUE_CODE)
    .text(BTN_BOOKINGS_TODAY)
    .row()
    .text(MINI_APP_GUEST_LABEL)
    .resized()
    .persistent();
};

const adminKeyboard = () => {
  return new Keyboard()
    .text(BTN_FIND_GUEST)
    .row()
    .text(MINI_APP_STAFF_LABEL)
    .row()
    .text(BTN_VENUE_CODE)
    .text(BTN_BOOKINGS_TODAY)
    .row()
    .text(BTN_WEB_ADMIN)
    .resized()
    .persistent();
};

export const mainKeyboard = ({ role }: MainKeyboardParameters) => {
  if (role === "guest") {
    return guestKeyboard();
  }
  if (role === "master") {
    return masterKeyboard();
  }
  return adminKeyboard();
};
