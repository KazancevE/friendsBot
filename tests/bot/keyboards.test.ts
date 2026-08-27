import { expect, test } from "vitest";
import {
  cancelKeyboard,
  contactOrCancelKeyboard,
  mainKeyboard,
} from "../../src/bot/keyboards.ts";

test("staff keyboard includes Касса QR web app at PUBLIC_URL/app/", () => {
  const keyboard = mainKeyboard({ role: "master", publicUrl: "https://friends.example/" });
  const buttons = keyboard.keyboard.flat();
  const webApp = buttons.find((button) => "web_app" in button);
  expect(webApp).toEqual({
    text: "Касса QR",
    web_app: { url: "https://friends.example/app/" },
  });
});

test("guest keyboard uses text Игры so inline Mini App can send initData", () => {
  const keyboard = mainKeyboard({ role: "guest", publicUrl: "https://friends.example" });
  const buttons = keyboard.keyboard.flat();
  const games = buttons.find((button) => "text" in button && button.text === "Игры");
  expect(games).toEqual({ text: "Игры" });
  expect(buttons.some((button) => "web_app" in button)).toBe(false);
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
