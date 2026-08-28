import {
  fetchGameRules,
  fetchGames,
  fetchLeaderboard,
  fetchMe,
  type GameCatalogEntry,
  type GameRules,
  type Leaderboard,
  type PrizePlace,
  type Role,
} from "./api.ts";
import { renderBlockBlast } from "./block-blast.ts";
import { renderMatch3 } from "./match3.ts";

import { renderCheckIn } from "./check-in.ts";
const STAFF_ROLES = new Set<Role>(["master", "admin"]);

type RenderHubOptions = {
  readonly role?: Role;
  readonly staffMode?: boolean;
};

type GameBoard = {
  readonly game: GameCatalogEntry;
  readonly board: Leaderboard;
};

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const formatPlace = (place: number | null) => {
  if (place === null) {
    return "пока нет места";
  }
  return `${place}`;
};

const formatPrizeRow = (row: PrizePlace) => {
  const coupon = row.couponTitle === null ? "без купона" : row.couponTitle;
  return `${row.place} место: ${row.bonuses} бонусов, ${coupon}`;
};

const isStaffViewer = (role: Role, staffMode: boolean) => {
  return staffMode || STAFF_ROLES.has(role);
};

const renderLeaderboardItem = (row: Leaderboard["top"][number], staffViewer: boolean) => {
  if (staffViewer) {
    const name = row.displayName ?? "—";
    return `<li>${row.place}. ${escapeHtml(name)} — ${row.points} очков</li>`;
  }
  return `<li>${row.place}. ${row.points} очков</li>`;
};

const renderRulesSection = (rules: GameRules) => {
  const prizes =
    rules.prizeTable.length === 0
      ? "<p class=\"muted\">Призы не настроены</p>"
      : `<ul class="prize-summary">${rules.prizeTable
          .map((row) => `<li>${escapeHtml(formatPrizeRow(row))}</li>`)
          .join("")}</ul>`;

  return `
    <section class="panel rules-block">
      <h2>Правила</h2>
      <div class="rules-body">${escapeHtml(rules.body)}</div>
      <p class="muted">Победителей: ${rules.winnersCount}</p>
      ${prizes}
    </section>
  `;
};

const renderGameCard = (
  { game, board }: GameBoard,
  staffViewer: boolean,
) => {
  const top =
    board.top.length === 0
      ? "<p class=\"muted\">Пока нет результатов</p>"
      : `<ol class="game-card-top">${board.top
          .slice(0, 5)
          .map((row) => renderLeaderboardItem(row, staffViewer))
          .join("")}</ol>`;

  return `
    <section class="panel game-card" data-game-card="${escapeHtml(game.slug)}">
      <h2>${escapeHtml(game.title)}</h2>
      <p>Ваше место: ${formatPlace(board.me.place)}</p>
      <p>Очки недели: ${board.me.points}</p>
      ${top}
      <div class="game-card-actions">
        <button type="button" data-play="${escapeHtml(game.slug)}">Играть</button>
      </div>
    </section>
  `;
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
  }
};

const renderBoard = (
  root: HTMLElement,
  gameBoards: ReadonlyArray<GameBoard>,
  rules: GameRules,
  hubOptions: RenderHubOptions,
  staffViewer: boolean,
) => {
  const staffBanner = staffViewer
    ? `<p class="staff-banner">Режим персонала — очки не участвуют в розыгрыше</p>`
    : "";

  root.innerHTML = `
    <header>
      <h1>Игры</h1>
      <p class="muted">Выберите игру недели</p>
    </header>
    ${staffBanner}
    ${renderRulesSection(rules)}
    ${gameBoards.map((entry) => renderGameCard(entry, staffViewer)).join("")}
  `;

  for (const play of root.querySelectorAll("[data-play]")) {
    if (play instanceof HTMLButtonElement) {
      play.addEventListener("click", () => {
        const slug = play.dataset.play;
        if (slug !== undefined && slug.length > 0) {
          launchGame(slug, root, hubOptions);
        }
      });
    }
  }
};

export const renderHub = async (root: HTMLElement, options: RenderHubOptions = {}) => {
  root.textContent = "Загрузка…";

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

  const [games, rules] = await Promise.all([fetchGames(), fetchGameRules()]);
  if (games.kind === "error") {
    root.textContent = games.message;
    return;
  }
  if (rules.kind === "error") {
    root.textContent = rules.message;
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

  renderBoard(root, gameBoards, rules.data, options, staffViewer);
};
