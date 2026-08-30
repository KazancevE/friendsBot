import { bootAdmin } from "./app.ts";
import { readyTelegram } from "./telegram.ts";

readyTelegram();

const root = document.querySelector("#app");
if (root instanceof HTMLElement) {
  void bootAdmin(root);
}
