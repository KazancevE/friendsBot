import {
  fetchGameRules,
  fetchLeaderboard,
  fetchMe,
  type GameRules,
  type Leaderboard,
  type PrizePlace,
  type Role,
} from "./api.ts";
import { renderMatch3 } from "./match3.ts";

import { renderCheckIn } from "./check-in.ts";
const STAFF_ROLES = new Set<Role>(["master", "admin"]);

type RenderHubOptions = {
  readonly role?: Role;
  readonly staffMode?: boolean;
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

const renderBoard = (
  root: HTMLElement,
  board: Leaderboard,
  rules: GameRules,
  hubOptions: RenderHubOptions,
  staffViewer: boolean,
) => {
  const top =
    board.top.length === 0
      ? "<p class=\"muted\">Пока нет результатов</p>"
      : `<ol class="leaderboard">${board.top
          .map((row) => renderLeaderboardItem(row, staffViewer))
          .join("")}</ol>`;

  const staffBanner = staffViewer
    ? `<p class="staff-banner">Режим персонала — очки не участвуют в розыгрыше</p>`
    : "";

  root.innerHTML = `
    <header>
      <h1>Игры</h1>
      <p class="muted">Три в ряд</p>
    </header>
    ${staffBanner}
    <section class="panel">
      <p>Ваше место: ${formatPlace(board.me.place)}</p>
      <p>Очки недели: ${board.me.points}</p>
    </section>
    ${renderRulesSection(rules)}
    <section class="panel">
      <h2>Топ-10</h2>
      ${top}
    </section>
    <button type="button" data-play>Играть</button>
  `;

  const play = root.querySelector("[data-play]");
  if (play instanceof HTMLButtonElement) {
    play.addEventListener("click", () => {
      renderMatch3({
        root,
        onBack: () => {
          void renderHub(root, hubOptions);
        },
      });
    });
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

  const [board, rules] = await Promise.all([fetchLeaderboard("match3"), fetchGameRules()]);
  if (board.kind === "error") {
    root.textContent = board.message;
    return;
  }
  if (rules.kind === "error") {
    root.textContent = rules.message;
    return;
  }
  renderBoard(root, board.data, rules.data, options, staffViewer);
};
