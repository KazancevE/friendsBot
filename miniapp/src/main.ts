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
    root.innerHTML =
      me.code === "bad_init_data"
        ? `<section class="panel"><h1>Не удалось войти</h1><p>Откройте приложение кнопкой «Игры» внизу чата с ботом.</p><p class="muted">Если не помогает — обновите Telegram и попробуйте снова.</p></section>`
        : `<section class="panel"><p class="error">${me.message}</p></section>`;
    return;
  }
  if (STAFF_ROLES.has(me.data.role)) {
    renderStaffShell({ root, role: me.data.role });
    return;
  }
  await renderHub(root);
};

void boot();
