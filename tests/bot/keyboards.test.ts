import { expect, test } from "vitest";
import {
  cancelKeyboard,
  contactOrCancelKeyboard,
  inlineAdminAppKeyboard,
  inlineMiniAppKeyboard,
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

test("reply keyboard uses text buttons for mini app entry", () => {
  const guest = mainKeyboard({ role: "guest" }).keyboard.flat();
  expect(guest.find((button) => "text" in button && button.text === MINI_APP_GUEST_LABEL)).toEqual({
    text: MINI_APP_GUEST_LABEL,
  });
  expect(guest.some((button) => "web_app" in button)).toBe(false);

  const master = mainKeyboard({ role: "master" }).keyboard.flat();
  expect(master.find((button) => "text" in button && button.text === MINI_APP_STAFF_LABEL)).toEqual({
    text: MINI_APP_STAFF_LABEL,
  });

  const admin = mainKeyboard({ role: "admin" }).keyboard.flat();
  expect(admin.find((button) => "text" in button && button.text === BTN_WEB_ADMIN)).toEqual({
    text: BTN_WEB_ADMIN,
  });
});

test("inline keyboard opens mini app with initData-compatible web_app", () => {
  const keyboard = inlineMiniAppKeyboard("https://friends.example", MINI_APP_GUEST_LABEL);
  expect(keyboard.inline_keyboard).toEqual([
    [{ text: MINI_APP_GUEST_LABEL, web_app: { url: miniAppUrl("https://friends.example") } }],
  ]);
});

test("inline keyboard opens admin app", () => {
  const keyboard = inlineAdminAppKeyboard("https://friends.example");
  expect(keyboard.inline_keyboard).toEqual([
    [{ text: "Открыть веб-админ", web_app: { url: adminAppUrl("https://friends.example") } }],
  ]);
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
