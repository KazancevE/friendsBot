import {
  createBoard,
  resolveMatchStep,
  swapAdjacent,
  wouldMatch,
  type Board,
} from "../../src/domain/match3.ts";
import { submitGameScore } from "./api.ts";
import { createMatch3Board, type Cell } from "./match3-board.ts";
import { bindMatch3Gestures, cellsEqual } from "./match3-gestures.ts";
import "./match3.css";

const MOVES_PER_GAME = 15;
const MATCH3_SLUG = "match3";

type RenderMatch3Parameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

const areAdjacent = (from: Cell, to: Cell) => {
  return Math.abs(from.row - to.row) + Math.abs(from.col - to.col) === 1;
};

const animateCountUp = (
  element: HTMLElement,
  from: number,
  to: number,
  durationMs: number,
) => {
  return new Promise<void>((resolve) => {
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const value = Math.round(from + (to - from) * progress);
      element.textContent = String(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }
      resolve();
    };
    requestAnimationFrame(tick);
  });
};

export const renderMatch3 = ({ root, onBack }: RenderMatch3Parameters) => {
  let board: Board = createBoard();
  let score = 0;
  let moves = MOVES_PER_GAME;
  let selected: Cell | undefined;
  let finished = false;
  let busy = false;

  let scoreElement: HTMLElement | undefined;
  let movesElement: HTMLElement | undefined;
  let statusElement: HTMLElement | undefined;
  let gridElement: HTMLElement | undefined;
  let boardApi = createMatch3Board(document.createElement("div"));
  let unbindGestures = () => {};

  const setStatus = (message: string) => {
    if (statusElement !== undefined) {
      statusElement.textContent = message;
    }
  };

  const updateHud = (scoreBump = false) => {
    if (scoreElement !== undefined) {
      scoreElement.textContent = String(score);
      if (scoreBump) {
        scoreElement.classList.remove("match3-score-bump");
        void scoreElement.offsetWidth;
        scoreElement.classList.add("match3-score-bump");
      }
    }
    if (movesElement !== undefined) {
      movesElement.textContent = String(moves);
    }
  };

  const bindBack = () => {
    const back = root.querySelector("[data-back]");
    if (back instanceof HTMLButtonElement) {
      back.addEventListener("click", onBack);
    }
  };

  const finishGame = async () => {
    finished = true;
    boardApi.setBusy(true);
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

    const done = document.createElement("div");
    done.className = "match3-done";
    const status = document.createElement("p");
    status.className = "status";
    status.textContent = "Отправка очков…";
    const back = document.createElement("button");
    back.type = "button";
    back.dataset.back = "true";
    back.textContent = "Назад";
    back.hidden = true;
    done.append(status, back);
    root.append(done);

    const display = document.createElement("p");
    display.className = "status";
    display.textContent = "0";
    status.replaceWith(display);
    await animateCountUp(display, 0, score, 400);

    const result = await submitGameScore({ slug: MATCH3_SLUG, points: score });
    if (result.kind === "error") {
      display.textContent = result.message;
    } else if (!result.data.counted) {
      display.textContent = "Тренировочная партия — очки не засчитаны";
    } else {
      display.textContent = `Очки отправлены: ${score}`;
    }
    display.classList.toggle("error", result.kind === "error");
    back.hidden = false;
    bindBack();
  };

  const runCascade = async (startBoard: Board) => {
    let current = startBoard;
    let cascadeIndex = 1;
    for (;;) {
      const step = resolveMatchStep(current, cascadeIndex);
      if (step.scoreDelta === 0) {
        board = current;
        boardApi.sync(board);
        return;
      }
      await boardApi.animatePop(step.matchedCells, step.scoreDelta);
      await boardApi.animateGravity(current, step.next, step.matchedCells);
      score += step.scoreDelta;
      updateHud(true);
      current = step.next;
      board = current;
      if (!step.hasMore) {
        return;
      }
      cascadeIndex += 1;
    }
  };

  const attemptSwap = async (from: Cell, to: Cell) => {
    if (finished || busy) {
      return;
    }
    if (!areAdjacent(from, to)) {
      return;
    }

    busy = true;
    boardApi.setBusy(true);
    selected = undefined;
    boardApi.setSelected(undefined);
    setStatus("");

    try {
      if (!wouldMatch({ board, from, to })) {
        await boardApi.animateRevert(from, to);
        setStatus("Свапните фишки, чтобы собрать три в ряд");
        return;
      }

      await boardApi.animateSwap(from, to);
      const swapped = swapAdjacent({ board, from, to });
      if (swapped === undefined) {
        return;
      }

      board = swapped;
      boardApi.sync(board);
      await runCascade(swapped);

      moves -= 1;
      updateHud();
      if (moves <= 0) {
        void finishGame();
      }
    } finally {
      busy = false;
      boardApi.setBusy(false);
    }
  };

  const onTap = (cell: Cell) => {
    if (finished || busy) {
      return;
    }
    if (selected === undefined) {
      selected = cell;
      boardApi.setSelected(cell);
      return;
    }
    if (cellsEqual(selected, cell)) {
      selected = undefined;
      boardApi.setSelected(undefined);
      return;
    }
    const from = selected;
    selected = undefined;
    boardApi.setSelected(undefined);
    void attemptSwap(from, cell);
  };

  const mount = () => {
    root.innerHTML = `
      <header>
        <h1>Три в ряд</h1>
        <p class="muted">Свайпните или нажмите две соседние фишки</p>
      </header>
      <p class="match3-status">
        <span>Очки: <span data-score>0</span></span>
        <span>Ходы: <span data-moves>${MOVES_PER_GAME}</span></span>
      </p>
      <div class="match3-board" data-grid></div>
      <p data-status class="status"></p>
    `;

    scoreElement = root.querySelector("[data-score]") ?? undefined;
    movesElement = root.querySelector("[data-moves]") ?? undefined;
    statusElement = root.querySelector("[data-status]") ?? undefined;
    gridElement = root.querySelector("[data-grid]") ?? undefined;
    if (gridElement === undefined) {
      return;
    }

    gridElement.dataset.rows = String(board.length);
    gridElement.dataset.cols = String(board[0]?.length ?? 0);
    boardApi = createMatch3Board(gridElement);
    boardApi.sync(board);
    updateHud();

    unbindGestures = bindMatch3Gestures({
      grid: gridElement,
      getCellSize: () => boardApi.getCellSize(),
      getBusy: () => busy || finished,
      onTap,
      onFlick: (from, to) => {
        void attemptSwap(from, to);
      },
    });
  };

  mount();
};
