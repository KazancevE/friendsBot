import { escapeHtml } from "./ui-helpers.ts";

const cssUrl = (url: string) => {
  const safe = url.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `url("${safe}")`;
};

export const themePreviewMarkup = () => {
  return `
    <aside class="theme-preview" data-theme-preview>
      <div class="theme-preview-hub">
        <header class="theme-preview-header">
          <span class="theme-preview-logo" data-preview-logo>Друзья</span>
          <span class="theme-preview-balance" data-preview-balance>1 240 б.</span>
        </header>
        <div class="theme-preview-games" data-preview-games>
          <div class="theme-preview-game">Три в ряд</div>
          <div class="theme-preview-game">Блоки</div>
          <div class="theme-preview-game">2048</div>
          <div class="theme-preview-game">Flappy</div>
        </div>
      </div>
    </aside>
  `;
};

type ApplyThemePreviewParameters = {
  readonly preview: HTMLElement;
  readonly accent: string;
  readonly bg: string;
  readonly logoUrl?: string | null;
  readonly hubBackgroundUrl?: string | null;
};

export const applyThemePreview = ({
  preview,
  accent,
  bg,
  logoUrl,
  hubBackgroundUrl,
}: ApplyThemePreviewParameters) => {
  preview.style.setProperty("--preview-accent", accent);
  preview.style.setProperty("--preview-bg", bg);
  const hub = preview.querySelector(".theme-preview-hub");
  if (hub instanceof HTMLElement) {
    hub.style.backgroundImage =
      hubBackgroundUrl !== undefined && hubBackgroundUrl !== null && hubBackgroundUrl.length > 0
        ? cssUrl(hubBackgroundUrl)
        : "";
  }
  const logo = preview.querySelector("[data-preview-logo]");
  if (logo instanceof HTMLElement) {
    if (logoUrl !== undefined && logoUrl !== null && logoUrl.length > 0) {
      logo.innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="" />`;
    } else {
      logo.textContent = "Друзья";
    }
  }
};
