import {
  fetchGameRules,
  fetchGames,
  fetchLeaderboard,
  fetchMe,
  fetchOverallLeaderboard,
  type GameCatalogEntry,
  type GameRules,
  type Leaderboard,
  type Me,
  type PrizePlace,
  type Role,
} from "./api.ts";
import { renderBlockBlast } from "./block-blast.ts";
import { renderFlappy } from "./flappy.ts";
import { renderGame2048 } from "./game2048.ts";
import { formatWeekCountdown } from "./hub-week.ts";
import { renderMatch3 } from "./match3.ts";
import { renderQuiz } from "./quiz.ts";

import { getCachedTheme, fetchGameSkin, gameCoverUrl } from "./theme-client.ts";
import { bindMainButton, hideMainButton } from "./telegram.ts";
import {
  myRowInTop,
  renderLeaderboardItemHtml,
  renderMyStandingHtml,
  type LeaderboardRenderOptions,
} from "./hub-leaderboard.ts";

const STAFF_ROLES = new Set<Role>(["master", "admin"]);

/** Slugs with a matching render* screen in launchGame below. */
const GAME_ICONS: Record<string, string> = {
  match3: "🔥💧",
  blockblast: "🧱",
  game2048: "🪨",
  flappy: "🐦",
  quiz: "❓",
};

type RenderHubOptions = {
  readonly role?: Role;
  readonly staffMode?: boolean;
};

type GameBoard = {
  readonly game: GameCatalogEntry;
  readonly board: Leaderboard;
  readonly coverUrl: string | null;
};

type HubViewModel = {
  readonly me: Me;
  readonly overallBoard: Leaderboard;
  readonly gameBoards: ReadonlyArray<GameBoard>;
  readonly rules: GameRules;
  readonly hubOptions: RenderHubOptions;
  readonly staffViewer: boolean;
  readonly visitLocked: boolean;
  readonly myUserId: string;
};

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const formatPlaceShort = (place: number | null) => {
  if (place === null) {
    return "—";
  }
  return `#${place}`;
};

const formatPrizeRow = (row: PrizePlace) => {
  const coupon = row.couponTitle === null ? "без купона" : row.couponTitle;
  return `${row.place} место: ${row.bonuses} бонусов, ${coupon}`;
};

const gameIcon = (slug: string) => {
  return GAME_ICONS[slug] ?? "🎮";
};

const isStaffViewer = (role: Role, staffMode: boolean) => {
  return staffMode || STAFF_ROLES.has(role);
};

const leaderboardOptions = (
  viewModel: HubViewModel,
): LeaderboardRenderOptions => {
  return {
    staffViewer: viewModel.staffViewer,
    myUserId: viewModel.myUserId,
    winnersCount: viewModel.rules.winnersCount,
  };
};

const formatVisitEndTime = (iso: string | null) => {
  if (iso === null) {
    return "";
  }
  const date = new Date(iso);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const renderHubSkeleton = () => {
  return `
    <div class="hub hub--loading">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-hero"></div>
      <div class="skeleton skeleton-row"></div>
      <div class="game-grid">
        ${Array.from({ length: 4 }, () => `<div class="skeleton skeleton-card"></div>`).join("")}
      </div>
    </div>
  `;
};

const renderVisitEndedBanner = () => {
  return `
    <section class="hub-visit-ended panel">
      <p class="hub-visit-ended-title">Спасибо за визит!</p>
      <p class="muted">Очки сохранены до конца недели. Следите за общим зачётом ниже.</p>
    </section>
  `;
};

const renderCheckInBanner = () => {
  return `
    <aside class="hub-check-in-banner panel" data-check-in-banner>
      <div>
        <p class="hub-check-in-banner-title">Отметьтесь в зале</p>
        <p class="muted hub-check-in-banner-text">Игры доступны во время визита. Рейтинги и правила — уже здесь.</p>
      </div>
      <button type="button" class="hub-check-in-banner-btn" data-open-check-in>Отметиться</button>
    </aside>
  `;
};
const renderStatusRow = (me: Me, overallBoard: Leaderboard, staffViewer: boolean) => {
  const visitEnd = formatVisitEndTime(me.visitEndsAt);
  const visitLabel = staffViewer
    ? "Режим персонала"
    : me.visitActive
      ? visitEnd.length > 0
        ? `🟢 Вы в зале до ${visitEnd}`
        : "🟢 Вы в зале"
      : me.checkedInToday
        ? "⚪ Визит завершён"
        : "⚪ Не в зале";
  const overallLabel = `Общий зачёт: ${formatPlaceShort(overallBoard.me.place)} · ${overallBoard.me.points} очков`;

  return `
    <section class="hub-status panel">
      <div class="hub-status-row">
        <span>${visitLabel}</span>
        <span class="hub-status-accent">${overallLabel}</span>
      </div>
      ${
        staffViewer
          ? ""
          : `<div class="hub-status-row hub-status-row--secondary">
        <span>Баланс: <strong class="hub-status-accent">${me.balance}</strong> бонусов</span>
      </div>`
      }
    </section>
  `;
};

const renderHero = (rules: GameRules, now: Date) => {
  const theme = getCachedTheme();
  const countdown = formatWeekCountdown(now);
  const bannerStyle =
    theme?.assets.heroBannerUrl !== null && theme?.assets.heroBannerUrl !== undefined
      ? ` style="background-image:url('${escapeHtml(theme.assets.heroBannerUrl)}')"`
      : "";
  const logoHtml =
    theme?.assets.logoUrl !== null && theme?.assets.logoUrl !== undefined
      ? `<img class="hub-hero-logo" src="${escapeHtml(theme.assets.logoUrl)}" alt="" />`
      : "";
  const interiorHtml =
    theme !== null && theme.assets.interiorUrls.length > 0
      ? `<div class="hub-hero-interior">${theme.assets.interiorUrls
          .slice(0, 3)
          .map((url) => `<img src="${escapeHtml(url)}" alt="" loading="lazy" />`)
          .join("")}</div>`
      : "";
  const themeName =
    theme?.name !== null && theme?.name !== undefined && theme.name.length > 0
      ? escapeHtml(theme.name)
      : "🌫️ Неделя в «Друзьях»";
  return `
    <section class="hub-hero panel"${bannerStyle}>
      ${logoHtml}
      <p class="hub-hero-kicker">${themeName}</p>
      <p class="hub-hero-lead">Соревнуйтесь за бонусы и купоны</p>
      ${interiorHtml}
      <div class="hub-hero-meta">
        <span>⏱ До итогов: ${escapeHtml(countdown)}</span>
        <span>🏆 ${rules.winnersCount} призовых мест</span>
      </div>
    </section>
  `;
};

const renderHubLinks = () => {
  return `
    <nav class="hub-links" aria-label="Дополнительно">
      <button type="button" class="hub-link-btn" data-sheet="rules">Правила и призы</button>
      <button type="button" class="hub-link-btn" data-sheet="leaderboards">Все рейтинги</button>
    </nav>
  `;
};

const renderCompactGameCard = ({ game, board, coverUrl }: GameBoard, visitLocked: boolean) => {
  const lockedClass = visitLocked ? " game-card-compact--locked" : "";
  const playedClass = board.me.playedToday === true ? " game-card-compact--played" : "";
  const playLabel = visitLocked ? "🔒 Отметиться" : "Играть";
  const playData = visitLocked ? 'data-open-check-in' : `data-play="${escapeHtml(game.slug)}"`;
  const playedBadge =
    board.me.playedToday === true ? '<span class="game-card-badge">Сегодня ✓</span>' : "";
  const coverHtml =
    coverUrl !== null
      ? `<img class="game-card-cover" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" />`
      : `<span class="game-card-icon" aria-hidden="true">${gameIcon(game.slug)}</span>`;
  return `
    <article class="game-card-compact panel${lockedClass}${playedClass}" data-game-detail="${escapeHtml(game.slug)}">
      ${coverHtml}
      ${playedBadge}
      <h3 class="game-card-title">${escapeHtml(game.title)}</h3>
      <p class="game-card-stats">
        <strong class="game-card-place">${formatPlaceShort(board.me.place)}</strong>
        <span>· ${board.me.points} очков</span>
      </p>
      <button type="button" class="game-card-play" ${playData}>${playLabel}</button>
    </article>
  `;
};

const renderGameGrid = (gameBoards: ReadonlyArray<GameBoard>, visitLocked: boolean) => {
  return `
    <section class="hub-games" aria-label="Игры">
      <h2 class="hub-section-title">Выберите игру</h2>
      <div class="game-grid">
        ${gameBoards.map((entry) => renderCompactGameCard(entry, visitLocked)).join("")}
      </div>
    </section>
  `;
};

const renderRulesSheetContent = (rules: GameRules) => {
  const prizes =
    rules.prizeTable.length === 0
      ? "<p class=\"muted\">Призы не настроены</p>"
      : `<ul class="prize-summary">${rules.prizeTable
          .map((row) => `<li>${escapeHtml(formatPrizeRow(row))}</li>`)
          .join("")}</ul>`;

  return `
    <h2 id="hub-sheet-title">Правила и призы</h2>
    <div class="rules-body">${escapeHtml(rules.body)}</div>
    <p class="muted hub-sheet-note">Победителей: ${rules.winnersCount}</p>
    ${prizes}
  `;
};

const renderLeaderboardSection = (
  board: Leaderboard,
  options: LeaderboardRenderOptions,
) => {
  const inTop = myRowInTop(board.top, options.myUserId);
  const standing = renderMyStandingHtml(board.me.place, board.me.points, inTop);
  const top =
    board.top.length === 0
      ? "<p class=\"muted\">Пока нет результатов</p>"
      : `<ol class="leaderboard">${board.top.map((row) => renderLeaderboardItemHtml(row, options)).join("")}</ol>`;
  return `${standing}${top}`;
};

const renderLeaderboardsSheetContent = (
  overallBoard: Leaderboard,
  gameBoards: ReadonlyArray<GameBoard>,
  viewModel: HubViewModel,
) => {
  const options = leaderboardOptions(viewModel);
  const sections = gameBoards
    .map(({ game, board }) => {
      return `
        <section class="hub-sheet-game">
          <h3>${escapeHtml(game.title)}</h3>
          <p class="hub-sheet-me">Ваше место: ${formatPlaceShort(board.me.place)} · ${board.me.points} очков</p>
          ${renderLeaderboardSection(board, options)}
        </section>
      `;
    })
    .join("");

  return `
    <h2 id="hub-sheet-title">Все рейтинги</h2>
    <section class="hub-sheet-game hub-sheet-game--overall">
      <h3>Общий зачёт</h3>
      <p class="hub-sheet-me">Ваше место: ${formatPlaceShort(overallBoard.me.place)} · ${overallBoard.me.points} очков</p>
      ${renderLeaderboardSection(overallBoard, options)}
    </section>
    ${sections}
  `;
};

const renderSheetMarkup = () => {
  return `
    <div class="hub-sheet-backdrop" data-sheet-backdrop hidden>
      <div class="hub-sheet panel" role="dialog" aria-modal="true" aria-labelledby="hub-sheet-title">
        <button type="button" class="hub-sheet-close" data-sheet-close aria-label="Закрыть">×</button>
        <div class="hub-sheet-body" data-sheet-body></div>
      </div>
    </div>
  `;
};

const renderGameDetail = (
  root: HTMLElement,
  entry: GameBoard,
  viewModel: HubViewModel,
) => {
  const { board, game } = entry;
  const options = leaderboardOptions(viewModel);
  const playAttrs = viewModel.visitLocked
    ? 'data-open-check-in'
    : `data-play="${escapeHtml(game.slug)}"`;
  const playLabel = viewModel.visitLocked ? "🔒 Отметиться" : "Играть";
  const coverHtml =
    entry.coverUrl !== null
      ? `<img class="game-detail-cover" src="${escapeHtml(entry.coverUrl)}" alt="" loading="lazy" />`
      : `<div class="game-detail-cover game-detail-cover--emoji" aria-hidden="true">${gameIcon(game.slug)}</div>`;

  root.innerHTML = `
    <div class="game-detail">
      <header class="game-detail-header">
        <button type="button" class="game-detail-back" data-hub-back aria-label="Назад">←</button>
        <div>
          <h1>${escapeHtml(game.title)}</h1>
          <p class="muted game-detail-sub">Рейтинг недели</p>
        </div>
      </header>
      ${coverHtml}
      <section class="panel game-detail-stats">
        <p>Ваше место: <strong class="hub-status-accent">${formatPlaceShort(board.me.place)}</strong></p>
        <p>Очки недели: <strong class="hub-status-accent">${board.me.points}</strong></p>
        ${board.me.playedToday === true ? '<p class="game-detail-played">✓ Уже играли сегодня</p>' : ""}
      </section>
      <section class="panel">
        <h2>Топ недели</h2>
        ${renderLeaderboardSection(board, options)}
      </section>
      <button type="button" class="game-detail-play" ${playAttrs}>${playLabel}</button>
    </div>
  `;

  bindHubActions(root, viewModel);
  const unbindMain = bindMainButton(playLabel, () => {
    if (viewModel.visitLocked) {
      openCheckInSheet(root, viewModel);
      return;
    }
    launchGame(game.slug, root, viewModel.hubOptions);
  });
  const back = root.querySelector("[data-hub-back]");
  if (back instanceof HTMLButtonElement) {
    back.addEventListener("click", () => {
      unbindMain();
      hideMainButton();
      renderBoard(root, viewModel);
    });
  }
};

const openSheet = (
  root: HTMLElement,
  content: string,
) => {
  const backdrop = root.querySelector("[data-sheet-backdrop]");
  const body = root.querySelector("[data-sheet-body]");
  if (!(backdrop instanceof HTMLElement) || !(body instanceof HTMLElement)) {
    return;
  }
  body.innerHTML = content;
  backdrop.hidden = false;
  document.body.classList.add("hub-sheet-open");
};

const closeSheet = (root: HTMLElement) => {
  const backdrop = root.querySelector("[data-sheet-backdrop]");
  if (!(backdrop instanceof HTMLElement)) {
    return;
  }
  backdrop.hidden = true;
  document.body.classList.remove("hub-sheet-open");
};

const bindSheetControls = (root: HTMLElement, viewModel: HubViewModel) => {
  for (const trigger of root.querySelectorAll("[data-sheet]")) {
    if (!(trigger instanceof HTMLButtonElement)) {
      continue;
    }
    trigger.addEventListener("click", () => {
      const sheet = trigger.dataset.sheet;
      if (sheet === "rules") {
        openSheet(root, renderRulesSheetContent(viewModel.rules));
        return;
      }
      if (sheet === "leaderboards") {
        openSheet(
          root,
          renderLeaderboardsSheetContent(viewModel.overallBoard, viewModel.gameBoards, viewModel),
        );
      }
    });
  }

  const backdrop = root.querySelector("[data-sheet-backdrop]");
  if (backdrop instanceof HTMLElement) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeSheet(root);
      }
    });
  }

  const close = root.querySelector("[data-sheet-close]");
  if (close instanceof HTMLButtonElement) {
    close.addEventListener("click", () => {
      closeSheet(root);
    });
  }
};

const launchGame = (
  slug: string,
  root: HTMLElement,
  hubOptions: RenderHubOptions,
) => {
  const onBack = () => {
    void renderHub(root, hubOptions);
  };
  if (slug === "match3") {
    renderMatch3({ root, onBack });
    return;
  }
  if (slug === "blockblast") {
    renderBlockBlast({ root, onBack });
    return;
  }
  if (slug === "game2048") {
    renderGame2048({ root, onBack });
    return;
  }
  if (slug === "flappy") {
    renderFlappy({ root, onBack });
    return;
  }
  if (slug === "quiz") {
    renderQuiz({ root, onBack });
    return;
  }
  root.innerHTML = `
    <section class="panel">
      <h2>Игра недоступна</h2>
      <p class="muted">Экран для «${escapeHtml(slug)}» ещё не готов.</p>
      <button type="button" data-hub-back>Назад</button>
    </section>
  `;
  const back = root.querySelector("[data-hub-back]");
  if (back instanceof HTMLButtonElement) {
    back.addEventListener("click", () => {
      void renderHub(root, hubOptions);
    });
  }
};

const openCheckInSheet = (root: HTMLElement, viewModel: HubViewModel) => {
  openSheet(root, `<div data-check-in-host></div>`);
  const host = root.querySelector("[data-check-in-host]");
  if (!(host instanceof HTMLElement)) {
    return;
  }
  renderCheckIn({
    root: host,
    compact: true,
    onSuccess: () => {
      closeSheet(root);
      void renderHub(root, viewModel.hubOptions);
    },
  });
};

const bindPlayButtons = (root: HTMLElement, viewModel: HubViewModel) => {
  for (const play of root.querySelectorAll("[data-play]")) {
    if (!(play instanceof HTMLButtonElement)) {
      continue;
    }
    play.addEventListener("click", (event) => {
      event.stopPropagation();
      const slug = play.dataset.play;
      if (slug !== undefined && slug.length > 0) {
        launchGame(slug, root, viewModel.hubOptions);
      }
    });
  }
};

const bindCheckInTriggers = (root: HTMLElement, viewModel: HubViewModel) => {
  for (const trigger of root.querySelectorAll("[data-open-check-in]")) {
    if (!(trigger instanceof HTMLButtonElement)) {
      continue;
    }
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      openCheckInSheet(root, viewModel);
    });
  }
};

const bindHubActions = (root: HTMLElement, viewModel: HubViewModel) => {
  bindPlayButtons(root, viewModel);
  bindCheckInTriggers(root, viewModel);
};

const bindGameCards = (root: HTMLElement, viewModel: HubViewModel) => {
  for (const card of root.querySelectorAll("[data-game-detail]")) {
    if (!(card instanceof HTMLElement)) {
      continue;
    }
    card.addEventListener("click", (event) => {
      if (event.target instanceof HTMLButtonElement) {
        if (event.target.dataset.play !== undefined || event.target.dataset.openCheckIn !== undefined) {
          return;
        }
      }
      const slug = card.dataset.gameDetail;
      if (slug === undefined || slug.length === 0) {
        return;
      }
      const entry = viewModel.gameBoards.find((row) => row.game.slug === slug);
      if (entry === undefined) {
        return;
      }
      renderGameDetail(root, entry, viewModel);
    });
  }
};

const renderBoard = (root: HTMLElement, viewModel: HubViewModel) => {
  hideMainButton();
  const { gameBoards, overallBoard, rules, staffViewer, me, visitLocked } = viewModel;
  const now = new Date();
  const staffBanner = staffViewer
    ? `<p class="staff-banner">Режим персонала — очки не участвуют в розыгрыше</p>`
    : "";
  const checkInBanner = visitLocked ? renderCheckInBanner() : "";
  const visitEndedBanner =
    !staffViewer && !visitLocked && me.checkedInToday && !me.visitActive ? renderVisitEndedBanner() : "";

  root.innerHTML = `
    <div class="hub">
      <header class="hub-header">
        <h1>Игры</h1>
      </header>
      ${checkInBanner}
      ${visitEndedBanner}
      ${renderHero(rules, now)}
      ${renderStatusRow(me, overallBoard, staffViewer)}
      ${staffBanner}
      ${renderHubLinks()}
      ${renderGameGrid(gameBoards, visitLocked)}
    </div>
    ${renderSheetMarkup()}
  `;

  bindHubActions(root, viewModel);
  bindGameCards(root, viewModel);
  bindSheetControls(root, viewModel);
};

export const renderHub = async (root: HTMLElement, options: RenderHubOptions = {}) => {
  root.innerHTML = renderHubSkeleton();
  document.body.classList.remove("hub-sheet-open");

  const me = await fetchMe();
  if (me.kind === "error") {
    root.textContent = me.message;
    return;
  }

  const role = options.role ?? me.data.role;
  const staffViewer = isStaffViewer(role, options.staffMode === true);
  const visitLocked = !staffViewer && !me.data.visitActive;

  const [games, rules, overallBoard] = await Promise.all([
    fetchGames(),
    fetchGameRules(),
    fetchOverallLeaderboard(),
  ]);
  if (games.kind === "error") {
    root.textContent = games.message;
    return;
  }
  if (rules.kind === "error") {
    root.textContent = rules.message;
    return;
  }
  if (overallBoard.kind === "error") {
    root.textContent = overallBoard.message;
    return;
  }

  const boards = await Promise.all(
    games.data.map(async (game) => {
      const [board, skin] = await Promise.all([fetchLeaderboard(game.slug), fetchGameSkin(game.slug)]);
      return { game, board, skin };
    }),
  );

  const failed = boards.find((entry) => entry.board.kind === "error");
  if (failed !== undefined && failed.board.kind === "error") {
    root.textContent = failed.board.message;
    return;
  }

  const gameBoards = boards.flatMap((entry) => {
    if (entry.board.kind === "ok") {
      return [
        {
          game: entry.game,
          board: entry.board.data,
          coverUrl: gameCoverUrl(entry.skin),
        },
      ];
    }
    return [];
  });

  renderBoard(root, {
    me: me.data,
    overallBoard: overallBoard.data,
    gameBoards,
    rules: rules.data,
    hubOptions: options,
    staffViewer,
    visitLocked,
    myUserId: me.data.id,
  });
};
