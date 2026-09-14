export const renderSheetMarkup = () => {
  return `
    <div class="admin-sheet-backdrop" data-sheet-backdrop hidden>
      <div class="admin-sheet panel" role="dialog" aria-modal="true" aria-labelledby="admin-sheet-title">
        <button type="button" class="admin-sheet-close" data-sheet-close aria-label="Закрыть">×</button>
        <h2 id="admin-sheet-title" data-sheet-title></h2>
        <div class="admin-sheet-body" data-sheet-body></div>
      </div>
    </div>
  `;
};

type OpenAdminSheetParameters = {
  readonly host?: HTMLElement;
  readonly title: string;
  readonly body: string;
  readonly onBind?: (body: HTMLElement) => void;
};

const sheetRoot = () => document.body;

const sheetParts = () => {
  const root = sheetRoot();
  const backdrop = root.querySelector("[data-sheet-backdrop]");
  const title = root.querySelector("[data-sheet-title]");
  const body = root.querySelector("[data-sheet-body]");
  if (!(backdrop instanceof HTMLElement) || !(title instanceof HTMLElement) || !(body instanceof HTMLElement)) {
    return null;
  }
  return { backdrop, title, body };
};

export const ensureAdminSheet = (_host?: HTMLElement) => {
  if (sheetRoot().querySelector("[data-sheet-backdrop]") instanceof HTMLElement) {
    return;
  }
  sheetRoot().insertAdjacentHTML("beforeend", renderSheetMarkup());
  const parts = sheetParts();
  if (parts === null) {
    return;
  }
  parts.backdrop.addEventListener("click", (event) => {
    if (event.target === parts.backdrop) {
      closeAdminSheet();
    }
  });
  const close = sheetRoot().querySelector("[data-sheet-close]");
  if (close instanceof HTMLButtonElement) {
    close.addEventListener("click", () => {
      closeAdminSheet();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    closeAdminSheet();
  });
};

export const openAdminSheet = ({ title, body, onBind }: OpenAdminSheetParameters) => {
  ensureAdminSheet();
  const parts = sheetParts();
  if (parts === null) {
    return;
  }
  parts.title.textContent = title;
  parts.body.innerHTML = body;
  parts.backdrop.hidden = false;
  document.body.classList.add("admin-sheet-open");
  onBind?.(parts.body);
  return parts.body;
};

export const closeAdminSheet = (_host?: HTMLElement) => {
  const backdrop = sheetRoot().querySelector("[data-sheet-backdrop]");
  if (!(backdrop instanceof HTMLElement)) {
    return;
  }
  backdrop.hidden = true;
  document.body.classList.remove("admin-sheet-open");
};
