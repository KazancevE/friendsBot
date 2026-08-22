import {
  fetchLeaderboard,
  fetchMe,
  type Leaderboard,
} from "./api.ts";
import { renderMatch3 } from "./match3.ts";

const NO_VISIT = "Игры доступны во время визита в «Друзьях»";

const formatPlace = (place: number | null) => {
  if (place === null) {
    return "пока нет места";
  }
  return `${place}`;
};

const renderBoard = (root: HTMLElement, board: Leaderboard) => {
  const top =
    board.top.length === 0
      ? "<p class=\"muted\">Пока нет результатов</p>"
      : `<ol class="leaderboard">${board.top
          .map((row) => `<li>${row.place}. ${row.points} очков</li>`)
          .join("")}</ol>`;

  root.innerHTML = `
    <header>
      <h1>Игры</h1>
      <p class="muted">Три в ряд</p>
    </header>
    <section class="panel">
      <p>Ваше место: ${formatPlace(board.me.place)}</p>
      <p>Очки недели: ${board.me.points}</p>
    </section>
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
          void renderHub(root);
        },
      });
    });
  }
};

export const renderHub = async (root: HTMLElement) => {
  root.textContent = "Загрузка…";
  const me = await fetchMe();
  if (me.kind === "error") {
    root.textContent = me.message;
    return;
  }
  if (!me.data.visitActive) {
    root.innerHTML = `<p class="muted">${NO_VISIT}</p>`;
    return;
  }
  const board = await fetchLeaderboard("match3");
  if (board.kind === "error") {
    root.textContent = board.message;
    return;
  }
  renderBoard(root, board.data);
};
