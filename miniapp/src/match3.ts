import {
  createBoard,
  resolveMatchStep,
  swapAdjacent,
  wouldMatch,
  type Board,
} from "../../src/domain/match3.ts";
import { showGameOver } from "./game-over.ts";
import { fetchGameSkin } from "./theme-client.ts";
import { createMatch3Board, type Cell } from "./match3-board.ts";
import { bindMatch3Gestures, cellsEqual } from "./match3-gestures.ts";
import { hapticImpact } from "./telegram.ts";
import "./match3.css";

const MOVES_PER_GAME = 15;
const MATCH3_SLUG = "match3";
const POP_TO_FALL_PAUSE_MS = 60;

type RenderMatch3Parameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

const areAdjacent = (from: Cell, to: Cell) => {
  return Math.abs(from.row - to.row) + Math.abs(from.col - to.col) === 1;
};

const rankForScore = (points: number) => {
  if (points >= 500) {
    return "Отлично!";
  }
  if (points >= 200) {
    return "Неплохо!";
  }
  return "Попробуйте ещё";
};

export const renderMatch3 = ({ root, onBack }: RenderMatch3Parameters) => {
  const sessionStartedAt = new Date();
  let board: Board = createBoard();
  let score = 0;
  let moves = MOVES_PER_GAME;
  let selected: Cell | undefined;
  let finished = false;
  let busy = false;

  let scoreElement: HTMLElement | undefined;
  let movesElement: HTMLElement | undefined;
  let movesFillElement: HTMLElement | undefined;
  let comboElement: HTMLElement | undefined;
  let statusElement: HTMLElement | undefined;
  let gridElement: HTMLElement | undefined;
  let boardApi = createMatch3Board(document.createElement("div"));
  let unbindGestures = () => {};

  const setStatus = (message: string) => {
    if (statusElement !== undefined) {
      statusElement.textContent = message;
    }
  };

  const showCombo = (cascadeIndex: number) => {
    if (comboElement === undefined || cascadeIndex < 2) {
      return;
    }
    comboElement.hidden = false;
    comboElement.textContent = `Комбо x${cascadeIndex}!`;
    comboElement.classList.remove("match3-combo-pop");
    void comboElement.offsetWidth;
    comboElement.classList.add("match3-combo-pop");
    window.setTimeout(() => {
      if (comboElement !== undefined) {
        comboElement.hidden = true;
      }
    }, 900);
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
    if (movesFillElement !== undefined) {
      const ratio = Math.max(0, moves / MOVES_PER_GAME);
      movesFillElement.style.width = `${ratio * 100}%`;
    }
  };

  const bindBackButtons = (handler: () => void) => {
    for (const back of root.querySelectorAll("[data-back]")) {
      if (back instanceof HTMLButtonElement) {
        back.addEventListener("click", handler);
      }
    }
  };

  const finishGame = async () => {
    finished = true;
    boardApi.setBusy(true);
    await showGameOver({
      root,
      slug: MATCH3_SLUG,
      score,
      sessionStartedAt,
      headline: rankForScore(score),
      celebrate: score >= 500,
      onRestart: () => {
        unbindGestures();
        renderMatch3({ root, onBack });
      },
      onBack,
    });
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
      hapticImpact(cascadeIndex >= 2 ? "medium" : "light");
      showCombo(cascadeIndex);
      await boardApi.animatePop(step.matchedCells, step.scoreDelta);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, POP_TO_FALL_PAUSE_MS);
      });
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

  const mount = async () => {
    const skin = await fetchGameSkin(MATCH3_SLUG);
    root.innerHTML = `
      <header class="match3-header">
        <button type="button" class="match3-back" data-back aria-label="Назад">←</button>
        <div>
          <h1>Три в ряд</h1>
          <p class="muted match3-hint">Свайпните или нажмите две соседние фишки</p>
        </div>
      </header>
      <div class="match3-hud panel">
        <div class="match3-stat">
          <span class="match3-stat-label">Очки</span>
          <span class="match3-stat-value" data-score aria-live="polite">0</span>
        </div>
        <div class="match3-moves-wrap">
          <div class="match3-moves-bar" aria-hidden="true">
            <div class="match3-moves-fill" data-moves-fill></div>
          </div>
          <span class="match3-stat-label">Ходы <span data-moves>${MOVES_PER_GAME}</span></span>
        </div>
      </div>
      <div class="match3-board-wrap">
        <div class="match3-combo" data-combo hidden></div>
        <div class="match3-board" data-grid></div>
      </div>
      <p data-status class="status"></p>
    `;

    scoreElement = root.querySelector("[data-score]") ?? undefined;
    movesElement = root.querySelector("[data-moves]") ?? undefined;
    movesFillElement = root.querySelector("[data-moves-fill]") ?? undefined;
    comboElement = root.querySelector("[data-combo]") ?? undefined;
    statusElement = root.querySelector("[data-status]") ?? undefined;
    gridElement = root.querySelector("[data-grid]") ?? undefined;
    if (gridElement === undefined) {
      return;
    }

    bindBackButtons(onBack);

    gridElement.dataset.rows = String(board.length);
    gridElement.dataset.cols = String(board[0]?.length ?? 0);
    boardApi = createMatch3Board(gridElement, { skin });
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

  void mount();
};
