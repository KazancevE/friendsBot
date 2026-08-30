import {
  activateThemePack,
  clearActiveTheme,
  createThemePack,
  deleteThemePack,
  deleteThemeInterior,
  fetchThemePacks,
  updateThemePack,
  uploadThemeAsset,
  type ThemePack,
} from "./api.ts";
import { escapeHtml } from "./ui-helpers.ts";

const assetPreview = (url: string | null, label: string) => {
  if (url === null) {
    return `<p class="muted">${escapeHtml(label)}: не загружено</p>`;
  }
  return `
    <figure class="asset-preview">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" />
      <figcaption>${escapeHtml(label)}</figcaption>
    </figure>
  `;
};

const renderPackEditor = (pack: ThemePack, activeId: string | null) => {
  const isActive = activeId === pack.id;
  return `
    <section class="panel" data-pack-editor="${escapeHtml(pack.id)}">
      <div class="toolbar">
        <h2>${escapeHtml(pack.name)}</h2>
        ${isActive ? '<span class="pill pill--accent">Активна</span>' : ""}
      </div>
      <form data-pack-form class="stack">
        <label>Название<input name="name" value="${escapeHtml(pack.name)}" required /></label>
        <div class="grid">
          <label>Акцент<input name="accent" type="color" value="${escapeHtml(pack.colors.accent ?? "#d4784a")}" /></label>
          <label>Фон<input name="bg" type="color" value="${escapeHtml(pack.colors.bg ?? "#141018")}" /></label>
        </div>
        <div class="grid">
          <label>С даты<input name="activeFrom" type="date" value="${pack.activeFrom ?? ""}" /></label>
          <label>По дату<input name="activeTo" type="date" value="${pack.activeTo ?? ""}" /></label>
        </div>
        <label class="checkbox-row">
          <input name="isManualActive" type="checkbox" ${pack.isManualActive ? "checked" : ""} />
          Приоритет в периоде
        </label>
        <button type="submit" class="action">Сохранить</button>
      </form>
      <div class="gallery-grid" style="margin-top:1rem">
        ${assetPreview(pack.assets.logoUrl, "Логотип")}
        ${assetPreview(pack.assets.heroBannerUrl, "Баннер хаба")}
        ${assetPreview(pack.assets.hubBackgroundUrl, "Фон хаба")}
        ${assetPreview(pack.assets.decorUrl, "Декор")}
      </div>
      ${
        pack.assets.interiorUrls.length > 0
          ? `<div class="gallery-grid">${pack.assets.interiorUrls
              .map(
                (url) => `
                  <figure class="gallery-item">
                    <img src="${escapeHtml(url)}" alt="Интерьер" loading="lazy" />
                    <button type="button" class="danger" data-remove-interior data-url="${escapeHtml(url)}">Удалить</button>
                  </figure>
                `,
              )
              .join("")}</div>`
          : '<p class="muted">Фото интерьера не загружены</p>'
      }
      <div class="upload-grid">
        ${(["logo", "heroBanner", "hubBg", "decor", "interior"] as const)
          .map(
            (kind) => `
              <label class="upload-label">
                ${kind === "logo" ? "Логотип" : kind === "heroBanner" ? "Баннер" : kind === "hubBg" ? "Фон хаба" : kind === "decor" ? "Декор" : "Интерьер +"}
                <input type="file" accept="image/*" data-upload-kind="${kind}" />
              </label>
            `,
          )
          .join("")}
      </div>
      <div class="toolbar" style="margin-top:1rem">
        ${isActive ? "" : `<button type="button" class="action" data-activate>Активировать</button>`}
        <button type="button" class="danger" data-delete-pack>Удалить тему</button>
      </div>
      <p class="muted" data-pack-status></p>
    </section>
  `;
};

export const renderBrandPanel = async (host: HTMLElement) => {
  host.innerHTML = `<section class="panel"><p class="muted">Загрузка…</p></section>`;
  const result = await fetchThemePacks();
  if (result.kind === "error") {
    host.innerHTML = `<section class="panel"><p class="muted">${escapeHtml(result.message)}</p></section>`;
    return;
  }

  const { packs, activeId } = result.data;
  let selectedId = activeId ?? packs[0]?.id ?? null;

  const reload = async () => {
    const next = await fetchThemePacks();
    if (next.kind === "error") {
      host.innerHTML = `<section class="panel"><p class="muted">${escapeHtml(next.message)}</p></section>`;
      return;
    }
    render(next.data.packs, next.data.activeId);
  };

  const render = (packList: ThemePack[], currentActiveId: string | null) => {
    if (selectedId === null && packList.length > 0) {
      selectedId = packList[0]!.id;
    }
    const selected = packList.find((pack) => pack.id === selectedId) ?? null;
    host.innerHTML = `
      <section class="panel">
        <div class="toolbar">
          <h2>Бренд / Тема</h2>
          ${currentActiveId === null ? '<span class="pill">Дефолтная тема</span>' : ""}
        </div>
        <p class="muted">Логотип, фото интерьера, сезонные цвета и фоны для mini app и бота.</p>
        <form data-create-pack class="stack" style="margin-top:0.75rem">
          <label>Новая тема<input name="name" placeholder="Например: Новый год" required /></label>
          <button type="submit" class="action">Создать</button>
        </form>
        ${
          currentActiveId !== null
            ? `<button type="button" class="ghost-btn" data-clear-active style="margin-top:0.5rem">Сбросить активную тему</button>`
            : ""
        }
      </section>
      ${
        packList.length === 0
          ? `<section class="panel"><p class="muted">Пока нет тем — создайте первую.</p></section>`
          : `
            <section class="panel">
              <label>Редактировать
                <select data-pack-select>
                  ${packList
                    .map(
                      (pack) =>
                        `<option value="${escapeHtml(pack.id)}" ${pack.id === selectedId ? "selected" : ""}>${escapeHtml(pack.name)}</option>`,
                    )
                    .join("")}
                </select>
              </label>
            </section>
            ${selected === null ? "" : renderPackEditor(selected, currentActiveId)}
          `
      }
      <p class="muted" data-global-status></p>
    `;

    host.querySelector("[data-create-pack]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      const data = new FormData(form);
      const name = String(data.get("name") ?? "").trim();
      if (name.length === 0) {
        return;
      }
      void createThemePack({ name }).then((created) => {
        if (created.kind === "error") {
          const status = host.querySelector("[data-global-status]");
          if (status instanceof HTMLElement) {
            status.textContent = created.message;
          }
          return;
        }
        selectedId = created.data.id;
        void reload();
      });
    });

    host.querySelector("[data-clear-active]")?.addEventListener("click", () => {
      void clearActiveTheme().then(() => void reload());
    });

    const select = host.querySelector("[data-pack-select]");
    if (select instanceof HTMLSelectElement) {
      select.addEventListener("change", () => {
        selectedId = select.value;
        render(packList, currentActiveId);
      });
    }

    if (selected === null) {
      return;
    }

    const editor = host.querySelector(`[data-pack-editor="${selected.id}"]`);
    if (!(editor instanceof HTMLElement)) {
      return;
    }

    const setStatus = (message: string) => {
      const status = editor.querySelector("[data-pack-status]");
      if (status instanceof HTMLElement) {
        status.textContent = message;
      }
    };

    editor.querySelector("[data-pack-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      const data = new FormData(form);
      void updateThemePack({
        id: selected.id,
        name: String(data.get("name") ?? ""),
        activeFrom: String(data.get("activeFrom") ?? "") || null,
        activeTo: String(data.get("activeTo") ?? "") || null,
        isManualActive: data.get("isManualActive") === "on",
        accent: String(data.get("accent") ?? ""),
        bg: String(data.get("bg") ?? ""),
      }).then((saved) => {
        if (saved.kind === "error") {
          setStatus(saved.message);
          return;
        }
        setStatus("Сохранено");
        void reload();
      });
    });

    for (const input of editor.querySelectorAll("[data-upload-kind]")) {
      input.addEventListener("change", () => {
        if (!(input instanceof HTMLInputElement) || !(input.files?.[0] instanceof File)) {
          return;
        }
        const kind = input.getAttribute("data-upload-kind");
        if (kind === null) {
          return;
        }
        setStatus("Загрузка…");
        void uploadThemeAsset(selected.id, kind, input.files[0]).then((uploaded) => {
          input.value = "";
          if (uploaded.kind === "error") {
            setStatus(uploaded.message);
            return;
          }
          setStatus("Файл загружен");
          void reload();
        });
      });
    }

    for (const button of editor.querySelectorAll("[data-remove-interior]")) {
      button.addEventListener("click", () => {
        const url = button.getAttribute("data-url");
        if (url === null) {
          return;
        }
        void deleteThemeInterior(selected.id, url).then(() => void reload());
      });
    }

    editor.querySelector("[data-activate]")?.addEventListener("click", () => {
      void activateThemePack(selected.id).then(() => void reload());
    });

    editor.querySelector("[data-delete-pack]")?.addEventListener("click", () => {
      if (!window.confirm(`Удалить тему «${selected.name}»?`)) {
        return;
      }
      void deleteThemePack(selected.id).then(() => {
        selectedId = null;
        void reload();
      });
    });
  };

  render(packs, activeId);
};
