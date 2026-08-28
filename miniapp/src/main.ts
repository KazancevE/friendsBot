import { fetchMe } from "./api.ts";
import { renderHub } from "./hub.ts";
import { renderStaffShell } from "./staff-shell.ts";
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
  if (STAFF_ROLES.has(me.data.role)) {
    renderStaffShell({ root, role: me.data.role });
    return;
  }
  await renderHub(root);
};

void boot();
