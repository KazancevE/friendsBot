import type { Role } from "./api.ts";
import { renderCashier } from "./cashier.ts";
import { renderHub } from "./hub.ts";

type StaffTab = "cashier" | "games";

type RenderStaffShellParameters = {
  readonly root: HTMLElement;
  readonly role: Role;
  readonly initialTab?: StaffTab;
};

export const renderStaffShell = ({
  root,
  role,
  initialTab = "cashier",
}: RenderStaffShellParameters) => {
  root.innerHTML = `
    <div class="staff-shell">
      <nav class="staff-tabs" role="tablist" aria-label="Персонал">
        <button type="button" class="staff-tab" data-tab="cashier" role="tab">Касса</button>
        <button type="button" class="staff-tab" data-tab="games" role="tab">Игры</button>
      </nav>
      <div class="staff-content"></div>
    </div>
  `;

  const content = root.querySelector(".staff-content");
  if (!(content instanceof HTMLElement)) {
    return;
  }

  const tabs = root.querySelectorAll("[data-tab]");
  const hubOptions = { role, staffMode: true as const };

  const setActiveTab = (tab: StaffTab) => {
    tabs.forEach((element) => {
      if (element instanceof HTMLButtonElement) {
        const active = element.dataset.tab === tab;
        element.classList.toggle("staff-tab--active", active);
        element.setAttribute("aria-selected", active ? "true" : "false");
      }
    });
    if (tab === "cashier") {
      renderCashier(content);
      return;
    }
    void renderHub(content, hubOptions);
  };

  tabs.forEach((element) => {
    if (element instanceof HTMLButtonElement) {
      element.addEventListener("click", () => {
        const tab = element.dataset.tab;
        if (tab === "cashier" || tab === "games") {
          setActiveTab(tab);
        }
      });
    }
  });

  setActiveTab(initialTab);
};
