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
      <div class="gallery-grid">
        ${TILE_LABELS.map((label, index) => {
          const tile = tiles.find((entry) => entry.index === index);
          return `
            <figure class="gallery-item">
              ${
                tile !== undefined
                  ? `<img src="${escapeHtml(tile.imageUrl)}" alt="${escapeHtml(label)}" loading="lazy" />`
                  : `<div class="asset-placeholder">${escapeHtml(label)}</div>`
              }
              <figcaption>${escapeHtml(label)}</figcaption>
              <label class="upload-label compact">
                Загрузить
                <input type="file" accept="image/*" data-tile-index="${index}" />
              </label>
            </figure>
          `;
        }).join("")}
      </div>
      <div class="upload-grid">
        <label class="upload-label">
          Фон поля / обложка
          <input type="file" accept="image/*" data-skin-kind="boardBg" />
        </label>
        <label class="upload-label">
          Фон лотка
          <input type="file" accept="image/*" data-skin-kind="trayBg" />
        </label>
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

  for (const input of section.querySelectorAll("[data-skin-kind]")) {
    input.addEventListener("change", () => {
      if (!(input instanceof HTMLInputElement) || !(input.files?.[0] instanceof File)) {
        return;
      }
      const kind = input.getAttribute("data-skin-kind");
      if (kind !== "boardBg" && kind !== "trayBg") {
        return;
      }
      setStatus("Загрузка…");
      void uploadGameSkinAsset(slug, kind, input.files[0]).then((uploaded) => {
        input.value = "";
        if (uploaded.kind === "error") {
          setStatus(uploaded.message);
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
