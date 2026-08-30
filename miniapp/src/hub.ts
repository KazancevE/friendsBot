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

import { renderCheckIn } from "./check-in.ts";

const STAFF_ROLES = new Set<Role>(["master", "admin"]);

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
};

type HubViewModel = {
  readonly me: Me;
  readonly overallBoard: Leaderboard;
  readonly gameBoards: ReadonlyArray<GameBoard>;
  readonly rules: GameRules;
  readonly hubOptions: RenderHubOptions;
  readonly staffViewer: boolean;
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

const renderStatusRow = (me: Me, overallBoard: Leaderboard, staffViewer: boolean) => {
  const visitLabel = staffViewer
    ? "Режим персонала"
    : me.visitActive
      ? "🟢 Вы в зале"
      : "Визит не активен";
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

const renderLeaderboardItem = (row: Leaderboard["top"][number], staffViewer: boolean) => {
  if (staffViewer) {
    const name = row.displayName ?? "—";
    return `<li>${row.place}. ${escapeHtml(name)} — ${row.points} очков</li>`;
  }
  return `<li>${row.place}. ${row.points} очков</li>`;
};

const renderHero = (rules: GameRules, now: Date) => {
  const countdown = formatWeekCountdown(now);
  return `
    <section class="hub-hero panel">
      <p class="hub-hero-kicker">🌫️ Неделя в «Друзьях»</p>
      <p class="hub-hero-lead">Соревнуйтесь за бонусы и купоны</p>
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

const renderCompactGameCard = ({ game, board }: GameBoard) => {
  return `
    <article class="game-card-compact panel" data-game-detail="${escapeHtml(game.slug)}">
      <span class="game-card-icon" aria-hidden="true">${gameIcon(game.slug)}</span>
      <h3 class="game-card-title">${escapeHtml(game.title)}</h3>
      <p class="game-card-stats">
        <strong class="game-card-place">${formatPlaceShort(board.me.place)}</strong>
        <span>· ${board.me.points} очков</span>
      </p>
      <button type="button" class="game-card-play" data-play="${escapeHtml(game.slug)}">Играть</button>
    </article>
  `;
};

const renderGameGrid = (gameBoards: ReadonlyArray<GameBoard>) => {
  return `
    <section class="hub-games" aria-label="Игры">
      <h2 class="hub-section-title">Выберите игру</h2>
      <div class="game-grid">
        ${gameBoards.map((entry) => renderCompactGameCard(entry)).join("")}
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

const renderLeaderboardsSheetContent = (
  overallBoard: Leaderboard,
  gameBoards: ReadonlyArray<GameBoard>,
  staffViewer: boolean,
) => {
  const overallTop =
    overallBoard.top.length === 0
      ? "<p class=\"muted\">Пока нет результатов</p>"
      : `<ol class="leaderboard">${overallBoard.top.map((row) => renderLeaderboardItem(row, staffViewer)).join("")}</ol>`;

  const sections = gameBoards
    .map(({ game, board }) => {
      const top =
        board.top.length === 0
          ? "<p class=\"muted\">Пока нет результатов</p>"
          : `<ol class="leaderboard">${board.top.map((row) => renderLeaderboardItem(row, staffViewer)).join("")}</ol>`;
      return `
        <section class="hub-sheet-game">
          <h3>${escapeHtml(game.title)}</h3>
          <p class="hub-sheet-me">Ваше место: ${formatPlaceShort(board.me.place)} · ${board.me.points} очков</p>
          ${top}
        </section>
      `;
    })
    .join("");

  return `
    <h2 id="hub-sheet-title">Все рейтинги</h2>
    <section class="hub-sheet-game hub-sheet-game--overall">
      <h3>Общий зачёт</h3>
      <p class="hub-sheet-me">Ваше место: ${formatPlaceShort(overallBoard.me.place)} · ${overallBoard.me.points} очков</p>
      ${overallTop}
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
  const top =
    board.top.length === 0
      ? "<p class=\"muted\">Пока нет результатов</p>"
      : `<ol class="leaderboard">${board.top.map((row) => renderLeaderboardItem(row, viewModel.staffViewer)).join("")}</ol>`;

  root.innerHTML = `
    <div class="game-detail">
      <header class="game-detail-header">
        <button type="button" class="game-detail-back" data-hub-back aria-label="Назад">←</button>
        <div>
          <h1>${escapeHtml(game.title)}</h1>
          <p class="muted game-detail-sub">${gameIcon(game.slug)} Рейтинг недели</p>
        </div>
      </header>
      <section class="panel game-detail-stats">
        <p>Ваше место: <strong class="hub-status-accent">${formatPlaceShort(board.me.place)}</strong></p>
        <p>Очки недели: <strong class="hub-status-accent">${board.me.points}</strong></p>
      </section>
      <section class="panel">
        <h2>Топ недели</h2>
        ${top}
      </section>
      <button type="button" class="game-detail-play" data-play="${escapeHtml(game.slug)}">Играть</button>
    </div>
  `;

  bindPlayButtons(root, viewModel.hubOptions);
  const back = root.querySelector("[data-hub-back]");
  if (back instanceof HTMLButtonElement) {
    back.addEventListener("click", () => {
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
          renderLeaderboardsSheetContent(viewModel.overallBoard, viewModel.gameBoards, viewModel.staffViewer),
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

const bindPlayButtons = (root: HTMLElement, hubOptions: RenderHubOptions) => {
  for (const play of root.querySelectorAll("[data-play]")) {
    if (!(play instanceof HTMLButtonElement)) {
      continue;
    }
    play.addEventListener("click", (event) => {
      event.stopPropagation();
      const slug = play.dataset.play;
      if (slug !== undefined && slug.length > 0) {
        launchGame(slug, root, hubOptions);
      }
    });
  }
};

const bindGameCards = (root: HTMLElement, viewModel: HubViewModel) => {
  for (const card of root.querySelectorAll("[data-game-detail]")) {
    if (!(card instanceof HTMLElement)) {
      continue;
    }
    card.addEventListener("click", (event) => {
      if (event.target instanceof HTMLButtonElement && event.target.dataset.play !== undefined) {
        return;
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
  const { gameBoards, overallBoard, rules, hubOptions, staffViewer, me } = viewModel;
  const now = new Date();
  const staffBanner = staffViewer
    ? `<p class="staff-banner">Режим персонала — очки не участвуют в розыгрыше</p>`
    : "";

  root.innerHTML = `
    <div class="hub">
      <header class="hub-header">
        <h1>Игры</h1>
      </header>
      ${renderHero(rules, now)}
      ${renderStatusRow(me, overallBoard, staffViewer)}
      ${staffBanner}
      ${renderHubLinks()}
      ${renderGameGrid(gameBoards)}
    </div>
    ${renderSheetMarkup()}
  `;

  bindPlayButtons(root, hubOptions);
  bindGameCards(root, viewModel);
  bindSheetControls(root, viewModel);
};

export const renderHub = async (root: HTMLElement, options: RenderHubOptions = {}) => {
  root.textContent = "Загрузка…";
  document.body.classList.remove("hub-sheet-open");

  const me = await fetchMe();
  if (me.kind === "error") {
    root.textContent = me.message;
    return;
  }

  const role = options.role ?? me.data.role;
  const staffViewer = isStaffViewer(role, options.staffMode === true);

  if (!staffViewer && !me.data.visitActive) {
    renderCheckIn({
      root,
      onSuccess: () => {
        void renderHub(root, options);
      },
    });
    return;
  }

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
      const board = await fetchLeaderboard(game.slug);
      return { game, board };
    }),
  );

  const failed = boards.find((entry) => entry.board.kind === "error");
  if (failed !== undefined && failed.board.kind === "error") {
    root.textContent = failed.board.message;
    return;
  }

  const gameBoards = boards.flatMap((entry) => {
    if (entry.board.kind === "ok") {
      return [{ game: entry.game, board: entry.board.data }];
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
  });
};
