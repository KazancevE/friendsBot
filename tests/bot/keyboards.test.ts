import { expect, test } from "vitest";
import {
  cancelKeyboard,
  contactOrCancelKeyboard,
  mainKeyboard,
  MINI_APP_GUEST_LABEL,
  MINI_APP_STAFF_LABEL,
  BTN_WEB_ADMIN,
} from "../../src/bot/keyboards.ts";

const miniAppUrl = (publicUrl: string) => {
  const origin = publicUrl.replace(/\/$/, "");
  return `${origin}/app/?v=20260831`;
};

const adminAppUrl = (publicUrl: string) => {
  const origin = publicUrl.replace(/\/$/, "");
  return `${origin}/admin/?v=20260831`;
};

test("staff keyboard opens Mini App via reply web_app button", () => {
  const keyboard = mainKeyboard({ role: "master", publicUrl: "https://friends.example/" });
  const buttons = keyboard.keyboard.flat();
  const miniApp = buttons.find((button) => "text" in button && button.text === MINI_APP_STAFF_LABEL);
  expect(miniApp).toEqual({
    text: MINI_APP_STAFF_LABEL,
    web_app: { url: miniAppUrl("https://friends.example/") },
  });
});

test("guest keyboard opens Mini App via reply web_app button", () => {
  const keyboard = mainKeyboard({ role: "guest", publicUrl: "https://friends.example" });
  const buttons = keyboard.keyboard.flat();
  const games = buttons.find((button) => "text" in button && button.text === MINI_APP_GUEST_LABEL);
  expect(games).toEqual({
    text: MINI_APP_GUEST_LABEL,
    web_app: { url: miniAppUrl("https://friends.example") },
  });
});

test("admin keyboard exposes web admin web_app button", () => {
  const keyboard = mainKeyboard({ role: "admin", publicUrl: "https://friends.example" });
  const buttons = keyboard.keyboard.flat();
  const webAdmin = buttons.find((button) => "text" in button && button.text === BTN_WEB_ADMIN);
  expect(webAdmin).toEqual({
    text: BTN_WEB_ADMIN,
    web_app: { url: adminAppUrl("https://friends.example") },
  });
});

test("cancel keyboard is a single Отмена button", () => {
  const buttons = cancelKeyboard().keyboard.flat();
  expect(buttons).toEqual([{ text: "Отмена" }]);
});

test("contact or cancel keyboard keeps share-contact and Отмена", () => {
  const buttons = contactOrCancelKeyboard().keyboard.flat();
  expect(buttons).toEqual([
    { text: "Поделиться контактом", request_contact: true },
    { text: "Отмена" },
  ]);
});
