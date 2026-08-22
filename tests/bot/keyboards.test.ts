import { expect, test } from "vitest";
import { mainKeyboard } from "../../src/bot/keyboards.ts";

test("staff keyboard includes Касса QR web app at PUBLIC_URL/app/", () => {
  const keyboard = mainKeyboard({ role: "master", publicUrl: "https://friends.example/" });
  const buttons = keyboard.keyboard.flat();
  const webApp = buttons.find((button) => "web_app" in button);
  expect(webApp).toEqual({
    text: "Касса QR",
    web_app: { url: "https://friends.example/app/" },
  });
});

test("guest keyboard opens games web app at PUBLIC_URL/app/", () => {
  const keyboard = mainKeyboard({ role: "guest", publicUrl: "https://friends.example" });
  const buttons = keyboard.keyboard.flat();
  const webApp = buttons.find((button) => "web_app" in button);
  expect(webApp).toEqual({
    text: "Игры",
    web_app: { url: "https://friends.example/app/" },
  });
});
