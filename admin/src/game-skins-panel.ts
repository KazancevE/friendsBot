import { deleteGameSkin, fetchGameSkins, uploadGameSkinAsset, type GameSkin } from "./api.ts";
import { escapeHtml } from "./ui-helpers.ts";

const TILE_LABELS = ["🔥 / 1", "💧 / 2", "🫧 / 3", "🌿 / 4"];

const GAME_SECTIONS = [
  { slug: "blockblast", title: "Block Blast — Блоки", hint: "Плитки и фоны для «Блоки»." },
  { slug: "match3", title: "Match3 — Три в ряд", hint: "Плитки и фон поля для match-3." },
  { slug: "game2048", title: "2048", hint: "Плитки и фон для «2048»." },
  { slug: "flappy", title: "Flappy", hint: "Спрайты птицы/труб (плитки 0–1) и фон." },
] as const;

const assetPreview = (url: string, label: string) => {
  return `
    <figure class="asset-preview">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" />
      <figcaption>${escapeHtml(label)}</figcaption>
    </figure>
  `;
};

const renderGameSkinSection = (slug: string, title: string, hint: string, skin: GameSkin | null) => {
  const tiles = skin?.tiles ?? [];
  return `
    <section class="panel" data-game-skin="${escapeHtml(slug)}">
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">${escapeHtml(hint)}</p>
      <div class="tile-upload-grid">
        ${TILE_LABELS.map((label, index) => {
          const tile = tiles.find((entry) => entry.index === index);
          return `
            <div class="tile-upload-card">
              <div class="tile-preview">
                ${
                  tile !== undefined
                    ? `<img src="${escapeHtml(tile.imageUrl)}" alt="${escapeHtml(label)}" loading="lazy" />`
                    : `<span class="tile-preview-placeholder">${escapeHtml(label)}</span>`
                }
              </div>
              <span class="tile-upload-label">${escapeHtml(label)}</span>
              <button type="button" class="action action--compact" data-pick-tile="${index}">Загрузить</button>
              <input type="file" accept="image/*" hidden data-tile-index="${index}" />
            </div>
          `;
        }).join("")}
      </div>
      <div class="upload-grid skin-bg-uploads">
        <div class="skin-bg-upload">
          <span class="tile-upload-label">Фон поля / обложка</span>
          <button type="button" class="action action--compact" data-pick-bg="boardBg">Выбрать файл</button>
          <span class="muted skin-file-name" data-file-name="boardBg">Файл не выбран</span>
          <input type="file" accept="image/*" hidden data-skin-kind="boardBg" />
        </div>
        <div class="skin-bg-upload">
          <span class="tile-upload-label">Фон лотка</span>
          <button type="button" class="action action--compact" data-pick-bg="trayBg">Выбрать файл</button>
          <span class="muted skin-file-name" data-file-name="trayBg">Файл не выбран</span>
          <input type="file" accept="image/*" hidden data-skin-kind="trayBg" />
        </div>
      </div>
      ${
        skin?.boardBackgroundUrl !== null && skin?.boardBackgroundUrl !== undefined
          ? assetPreview(skin.boardBackgroundUrl, "Фон поля")
          : ""
      }
      ${
        skin?.trayBackgroundUrl !== null && skin?.trayBackgroundUrl !== undefined
          ? assetPreview(skin.trayBackgroundUrl, "Фон лотка")
          : ""
      }
      <div class="toolbar" style="margin-top:0.75rem">
        <button type="button" class="danger" data-reset-skin ${skin === null ? "disabled" : ""}>Сбросить скин</button>
      </div>
      <p class="muted" data-skin-status></p>
    </section>
  `;
};

const bindGameSkinSection = (host: HTMLElement, slug: string, reload: () => Promise<void>) => {
  const section = host.querySelector(`[data-game-skin="${slug}"]`);
  if (!(section instanceof HTMLElement)) {
    return;
  }

  const setStatus = (message: string) => {
    const status = section.querySelector("[data-skin-status]");
    if (status instanceof HTMLElement) {
      status.textContent = message;
    }
  };

  for (const button of section.querySelectorAll("[data-pick-tile]")) {
    button.addEventListener("click", () => {
      const index = button.getAttribute("data-pick-tile");
      const input = section.querySelector(`[data-tile-index="${index}"]`);
      if (input instanceof HTMLInputElement) {
        input.click();
      }
    });
  }

  for (const input of section.querySelectorAll("[data-tile-index]")) {
    input.addEventListener("change", () => {
      if (!(input instanceof HTMLInputElement) || !(input.files?.[0] instanceof File)) {
        return;
      }
      const index = Number(input.getAttribute("data-tile-index"));
      setStatus("Загрузка…");
      void uploadGameSkinAsset(slug, "tile", input.files[0], index).then((uploaded) => {
        input.value = "";
        if (uploaded.kind === "error") {
          setStatus(uploaded.message);
          return;
        }
        setStatus("Плитка обновлена");
        void reload();
      });
    });
  }

  for (const button of section.querySelectorAll("[data-pick-bg]")) {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-pick-bg");
      const input = section.querySelector(`[data-skin-kind="${kind}"]`);
      if (input instanceof HTMLInputElement) {
        input.click();
      }
    });
  }

  for (const input of section.querySelectorAll("[data-skin-kind]")) {
    input.addEventListener("change", () => {
      if (!(input instanceof HTMLInputElement) || !(input.files?.[0] instanceof File)) {
        return;
      }
      const kind = input.getAttribute("data-skin-kind");
      if (kind !== "boardBg" && kind !== "trayBg") {
        return;
      }
      const fileName = section.querySelector(`[data-file-name="${kind}"]`);
      if (fileName instanceof HTMLElement && input.files[0] !== undefined) {
        fileName.textContent = input.files[0].name;
      }
      setStatus("Загрузка…");
      void uploadGameSkinAsset(slug, kind, input.files[0]).then((uploaded) => {
        input.value = "";
        if (uploaded.kind === "error") {
          setStatus(uploaded.message);
          if (fileName instanceof HTMLElement) {
            fileName.textContent = "Файл не выбран";
          }
          return;
        }
        setStatus("Фон обновлён");
        void reload();
      });
    });
  }

  section.querySelector("[data-reset-skin]")?.addEventListener("click", () => {
    if (!window.confirm(`Сбросить скин ${slug}?`)) {
      return;
    }
    void deleteGameSkin(slug).then(() => void reload());
  });
};

export const renderGameSkinsPanel = async (host: HTMLElement) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const result = await fetchGameSkins();
  if (result.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="muted">${escapeHtml(result.message)}</p></section>`;
    return;
  }

  const reload = async () => {
    const next = await fetchGameSkins();
    if (next.kind === "error") {
      host.innerHTML = `<section class="panel"><p class="muted">${escapeHtml(next.message)}</p></section>`;
      return;
    }
    render(next.data);
  };

  const render = (skins: GameSkin[]) => {
    host.innerHTML = `
      <section class="panel">
        <h2>Скины игр</h2>
        <p class="muted">Внешний вид блоков и фонов в mini app играх. Обложка карточки берётся из фона поля.</p>
      </section>
      ${GAME_SECTIONS.map((entry) =>
        renderGameSkinSection(
          entry.slug,
          entry.title,
          entry.hint,
          skins.find((skin) => skin.gameSlug === entry.slug) ?? null,
        ),
      ).join("")}
    `;

    for (const entry of GAME_SECTIONS) {
      bindGameSkinSection(host, entry.slug, reload);
    }
  };

  render(result.data);
};
