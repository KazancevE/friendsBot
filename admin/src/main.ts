import { bootSalonAdmin } from "./salon-admin.ts";

const root = document.querySelector("#app");
if (root instanceof HTMLElement) {
  bootSalonAdmin(root);
}
