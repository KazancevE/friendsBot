export type AdminTab =
  | "dashboard"
  | "guests"
  | "bookings"
  | "broadcasts"
  | "settings"
  | "menu"
  | "staff"
  | "content"
  | "export"
  | "games"
  | "brand"
  | "game-skins";

export type AdminSection = "overview" | "guests" | "operations" | "content";

const SECTIONS: AdminSection[] = ["overview", "guests", "operations", "content"];

const SECTION_LABELS: Record<AdminSection, string> = {
  overview: "Обзор",
  guests: "Гости",
  operations: "Операции",
  content: "Контент",
};

const SECTION_TABS: Record<AdminSection, AdminTab[]> = {
  overview: ["dashboard"],
  guests: ["guests"],
  operations: ["bookings", "staff", "broadcasts"],
  content: ["menu", "content", "settings", "brand", "game-skins", "games", "export"],
};

const lastTabBySection: Partial<Record<AdminSection, AdminTab>> = {};

export const tabLabel = (tab: AdminTab) => {
  switch (tab) {
    case "dashboard":
      return "Дашборд";
    case "guests":
      return "Гости";
    case "bookings":
      return "Брони";
    case "broadcasts":
      return "Рассылки";
    case "settings":
      return "Настройки";
    case "menu":
      return "Меню";
    case "staff":
      return "Персонал";
    case "content":
      return "Контент";
    case "export":
      return "Экспорт";
    case "games":
      return "Игры";
    case "brand":
      return "Бренд / Тема";
    case "game-skins":
      return "Скины игр";
  }
};

export const sectionForTab = (tab: AdminTab): AdminSection => {
  for (const section of SECTIONS) {
    if (SECTION_TABS[section].includes(tab)) {
      return section;
    }
  }
  return "overview";
};

export const tabsForSection = (section: AdminSection) => SECTION_TABS[section];

export type AdminNavHandlers = {
  readonly onTab: (tab: AdminTab) => void;
};

const renderSubnav = (section: AdminSection, active: AdminTab) => {
  return tabsForSection(section)
    .map(
      (tab) =>
        `<button type="button" data-tab="${tab}" class="${tab === active ? "active" : ""}">${tabLabel(tab)}</button>`,
    )
    .join("");
};

const renderSectionButtons = (section: AdminSection, attr: "data-section" | "data-bottom-section") => {
  return SECTIONS.map(
    (item) =>
      `<button type="button" ${attr}="${item}" class="${item === section ? "active" : ""}" aria-label="${SECTION_LABELS[item]}">${SECTION_LABELS[item]}</button>`,
  ).join("");
};

export const renderAdminShell = (root: HTMLElement, active: AdminTab, handlers: AdminNavHandlers) => {
  const section = sectionForTab(active);
  lastTabBySection[section] = active;

  if (!(root.querySelector("[data-admin-layout]") instanceof HTMLElement)) {
    root.innerHTML = `
      <header>
        <div>
          <h1>Друзья — админ</h1>
          <p class="muted">Веб-панель</p>
        </div>
      </header>
      <div class="admin-layout" data-admin-layout>
        <aside class="admin-sidebar" aria-label="Разделы">
          ${renderSectionButtons(section, "data-section")}
        </aside>
        <div class="admin-body">
          <nav class="admin-subnav" aria-label="Вкладки" data-subnav>
            ${renderSubnav(section, active)}
          </nav>
          <main data-view></main>
        </div>
      </div>
      <nav class="admin-bottom-nav" aria-label="Разделы">
        ${renderSectionButtons(section, "data-bottom-section")}
      </nav>
    `;

    for (const button of root.querySelectorAll("[data-section]")) {
      button.addEventListener("click", () => {
        const nextSection = button.getAttribute("data-section") as AdminSection;
        const fallback = tabsForSection(nextSection)[0];
        const nextTab = lastTabBySection[nextSection] ?? fallback;
        if (nextTab !== undefined) {
          handlers.onTab(nextTab);
        }
      });
    }

    for (const button of root.querySelectorAll("[data-bottom-section]")) {
      button.addEventListener("click", () => {
        const nextSection = button.getAttribute("data-bottom-section") as AdminSection;
        const fallback = tabsForSection(nextSection)[0];
        const nextTab = lastTabBySection[nextSection] ?? fallback;
        if (nextTab !== undefined) {
          handlers.onTab(nextTab);
        }
      });
    }

    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const tabButton = target.closest("[data-tab]");
      if (!(tabButton instanceof HTMLElement)) {
        return;
      }
      const tab = tabButton.getAttribute("data-tab") as AdminTab;
      handlers.onTab(tab);
    });
  } else {
    setActiveAdminTab(root, active);
  }
};

export const setActiveAdminTab = (root: HTMLElement, active: AdminTab) => {
  const section = sectionForTab(active);
  lastTabBySection[section] = active;

  for (const button of root.querySelectorAll("[data-section], [data-bottom-section]")) {
    const itemSection = button.getAttribute("data-section") ?? button.getAttribute("data-bottom-section");
    button.classList.toggle("active", itemSection === section);
  }

  const subnav = root.querySelector("[data-subnav]");
  if (subnav instanceof HTMLElement) {
    subnav.innerHTML = renderSubnav(section, active);
  }

  for (const button of root.querySelectorAll("[data-tab]")) {
    const tab = button.getAttribute("data-tab");
    const isActive = tab === active;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }
};
