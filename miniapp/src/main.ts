import { fetchMe } from "./api.ts";
import { renderCashier } from "./cashier.ts";
import "./style.css";
import { readyTelegram } from "./telegram.ts";

const STAFF_ROLES = new Set(["master", "admin"]);

const boot = async () => {
  readyTelegram();
  const root = document.querySelector("#app");
  if (!(root instanceof HTMLElement)) {
    return;
  }
  const me = await fetchMe();
  if (me.kind === "error") {
    root.textContent = me.message;
    return;
  }
  if (!STAFF_ROLES.has(me.data.role)) {
    root.textContent = "Касса только для персонала";
    return;
  }
  renderCashier(root);
};

void boot();
