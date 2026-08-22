import {
  createBoard,
  resolveMatches,
  swapAdjacent,
  wouldMatch,
  type Board,
} from "../../src/domain/match3.ts";
import { submitGameScore } from "./api.ts";
import "./match3.css";

const TILE_EMOJI = ["🔥", "💧", "🫧", "🌿"] as const;
const MOVES_PER_GAME = 15;
const MATCH3_SLUG = "match3";

type Cell = {
  readonly row: number;
  readonly col: number;
};

type RenderMatch3Parameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

const tileEmoji = (tile: number) => {
  return TILE_EMOJI[tile] ?? "·";
};

const cellsEqual = (left: Cell, right: Cell) => {
  return left.row === right.row && left.col === right.col;
};

export const renderMatch3 = ({ root, onBack }: RenderMatch3Parameters) => {
  let board: Board = createBoard();
  let score = 0;
  let moves = MOVES_PER_GAME;
  let selected: Cell | undefined;
  let finished = false;

  const bindBack = () => {
    const back = root.querySelector("[data-back]");
    if (back instanceof HTMLButtonElement) {
      back.addEventListener("click", onBack);
    }
  };

  const finishGame = async () => {
    finished = true;
    if (score < 1) {
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="match3-done">
          <p class="muted">Нет очков для отправки</p>
          <button type="button" data-back>Назад</button>
        </div>`,
      );
      bindBack();
      return;
    }
    const result = await submitGameScore({ slug: MATCH3_SLUG, points: score });
    const message =
      result.kind === "error" ? result.message : `Очки отправлены: ${score}`;
    const statusClass = result.kind === "error" ? "status error" : "status";
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="match3-done">
        <p class="${statusClass}">${message}</p>
        <button type="button" data-back>Назад</button>
      </div>`,
    );
    bindBack();
  };

  const onTileClick = (cell: Cell) => {
    if (finished) {
      return;
    }
    if (selected === undefined) {
      selected = cell;
      paint();
      return;
    }
    if (cellsEqual(selected, cell)) {
      selected = undefined;
      paint();
      return;
    }
    const from = selected;
    selected = undefined;
    if (!wouldMatch({ board, from, to: cell })) {
      paint("Свапните фишки, чтобы собрать три в ряд");
      return;
    }
    const swapped = swapAdjacent({ board, from, to: cell });
    if (swapped === undefined) {
      paint();
      return;
    }
    const resolved = resolveMatches(swapped);
    board = resolved.next;
    score += resolved.score;
    moves -= 1;
    if (moves <= 0) {
      paint();
      void finishGame();
      return;
    }
    paint();
  };

  const paint = (message = "") => {
    const rows = board
      .map((line, row) => {
        return line
          .map((tile, col) => {
            const isSelected =
              selected !== undefined && cellsEqual(selected, { row, col });
            const cls = isSelected ? "match3-tile selected" : "match3-tile";
            return `<button type="button" class="${cls}" data-row="${row}" data-col="${col}">${tileEmoji(tile)}</button>`;
          })
          .join("");
      })
      .join("");

    root.innerHTML = `
      <header>
        <h1>Три в ряд</h1>
        <p class="muted">Меняйте соседние фишки</p>
      </header>
      <p class="match3-status">
        <span>Очки: ${score}</span>
        <span>Ходы: ${moves}</span>
      </p>
      <div class="match3-board">${rows}</div>
      <p data-status class="status">${message}</p>
    `;

    const grid = root.querySelector(".match3-board");
    if (!(grid instanceof HTMLElement)) {
      return;
    }
    grid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest("[data-row][data-col]");
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const row = Number(button.dataset.row);
      const col = Number(button.dataset.col);
      if (!Number.isInteger(row) || !Number.isInteger(col)) {
        return;
      }
      onTileClick({ row, col });
    });
  };

  paint();
};
