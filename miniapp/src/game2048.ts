import {
  canMove,
  createEmptyBoard,
  hasWinningTile,
  moveBoard,
  spawnTile,
} from "../../src/domain/game2048.ts";
import type { Board, Direction, TileShift } from "../../src/domain/game2048.ts";
import { showGameOver } from "./game-over.ts";
import { bindFinishGameButton, gameFinishButtonHtml } from "./game-finish.ts";
import { fetchGameSkin, tileImageUrl, type GameSkin } from "./theme-client.ts";
import "./game2048.css";

const SLUG = "game2048";
const SIZES = [4, 5, 8] as const;

type RenderGame2048Parameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
  readonly size?: number;
};

const tileLabel = (value: number) => {
  if (value <= 64) {
    return String(value);
  }
  if (value <= 512) {
    return "Друзья";
  }
  if (value <= 2048) {
    return "Уголь";
  }
  return String(value);
};

const tileSkinIndex = (value: number) => {
  if (value <= 0) {
    return -1;
  }
  return Math.min(3, Math.round(Math.log2(value)) - 1);
};

const cloneBoard = (board: Board): Board => {
  return board.map((row) => [...row]);
};

export const renderGame2048 = ({ root, onBack, size }: RenderGame2048Parameters) => {
  if (size === undefined) {
    root.innerHTML = `
      <header class="game2048-header">
        <button type="button" class="game2048-back" data-back aria-label="Назад">←</button>
        <div>
          <h1>2048</h1>
          <p class="muted">Выберите размер поля</p>
        </div>
      </header>
      <div class="game2048-modes">
        ${SIZES.map(
          (value) =>
            `<button type="button" class="action" data-size="${value}">${value}×${value}</button>`,
        ).join("")}
      </div>
    `;
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    for (const button of root.querySelectorAll("[data-size]")) {
      button.addEventListener("click", () => {
        const nextSize = Number(button.getAttribute("data-size"));
        renderGame2048({ root, onBack, size: nextSize });
      });
    }
    return;
  }

  const sessionStartedAt = new Date();
  const boardSize = size;
  let board = createEmptyBoard(boardSize);
  let previous = cloneBoard(board);
  let lastShifts: ReadonlyArray<TileShift> = [];
  let score = 0;
  let finished = false;
  let skin: GameSkin | null = null;
  spawnTile({ board });
  spawnTile({ board });

  let scoreElement: HTMLElement | undefined;
  let bestElement: HTMLElement | undefined;
  let boardElement: HTMLElement | undefined;

  const bestTile = () => {
    return Math.max(0, ...board.flat());
  };

  const prefersReducedMotion = () => {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  const applyCellVisual = (cell: HTMLElement, value: number, kind: "idle" | "spawn" | "merged") => {
    cell.className = "game2048-cell";
    if (kind === "spawn") {
      cell.classList.add("game2048-cell--spawn");
    }
    if (kind === "merged") {
      cell.classList.add("game2048-cell--merged");
    }
    cell.style.backgroundImage = "";
    if (value <= 0) {
      cell.textContent = "";
      return;
    }
    cell.dataset.value = String(value);
    const url = tileImageUrl(skin, tileSkinIndex(value));
    if (url === null) {
      cell.textContent = tileLabel(value);
    } else {
      cell.classList.add("game2048-cell--skin");
      cell.style.backgroundImage = `url("${url}")`;
      cell.textContent = "";
    }
  };

  const syncBoard = (animate: boolean) => {
    if (boardElement === undefined) {
      return;
    }
    boardElement.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
    boardElement.classList.toggle("game2048-board--wide", boardSize >= 8);
    boardElement.innerHTML = "";
    const mergedDests = new Set(
      lastShifts.filter((shift) => shift.merged).map((shift) => `${shift.toRow},${shift.toCol}`),
    );
    const movedDests = new Set(lastShifts.map((shift) => `${shift.toRow},${shift.toCol}`));
    const cells: HTMLElement[] = [];
    for (let row = 0; row < boardSize; row += 1) {
      for (let col = 0; col < boardSize; col += 1) {
        const value = board[row]?.[col] ?? 0;
        const prev = previous[row]?.[col] ?? 0;
        const cell = document.createElement("div");
        const key = `${row},${col}`;
        const kind =
          !animate || value === 0
            ? "idle"
            : mergedDests.has(key)
              ? "merged"
              : !movedDests.has(key) && prev === 0 && value > 0
                ? "spawn"
                : "idle";
        applyCellVisual(cell, value, animate && kind === "merged" ? "idle" : kind);
        boardElement.append(cell);
        cells.push(cell);
      }
    }
    if (animate && !prefersReducedMotion()) {
      const cellSize = cells[0]?.getBoundingClientRect().width ?? 0;
      if (cellSize > 0) {
        const firstShiftByDest = new Map<string, TileShift>();
        for (const shift of lastShifts) {
          const key = `${shift.toRow},${shift.toCol}`;
          if (!firstShiftByDest.has(key)) {
            firstShiftByDest.set(key, shift);
          }
        }
        for (const shift of firstShiftByDest.values()) {
          const cell = cells[shift.toRow * boardSize + shift.toCol];
          if (!(cell instanceof HTMLElement)) {
            continue;
          }
          const dx = (shift.fromCol - shift.toCol) * cellSize;
          const dy = (shift.fromRow - shift.toRow) * cellSize;
          if (dx === 0 && dy === 0) {
            continue;
          }
          cell.style.transition = "none";
          cell.style.transform = `translate(${dx}px, ${dy}px)`;
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            for (const cell of cells) {
              cell.style.transition = "transform 160ms ease-out";
              cell.style.transform = "";
            }
            window.setTimeout(() => {
              for (const shift of lastShifts) {
                if (!shift.merged) {
                  continue;
                }
                const cell = cells[shift.toRow * boardSize + shift.toCol];
                cell?.classList.add("game2048-cell--merged");
              }
            }, 160);
          });
        });
      }
    }
    if (scoreElement !== undefined) {
      scoreElement.textContent = String(score);
    }
    if (bestElement !== undefined) {
      const best = bestTile();
      bestElement.textContent = best > 0 ? tileLabel(best) : "—";
    }
  };

  const finishGame = async (won: boolean) => {
    if (finished) {
      return;
    }
    finished = true;
    await showGameOver({
      root,
      slug: SLUG,
      score,
      sessionStartedAt,
      headline: won ? "2048! Отличная партия" : "Ходы закончились",
      celebrate: won,
      onRestart: () => {
        renderGame2048({ root, onBack, size: boardSize });
      },
      onBack,
    });
  };

  const handleMove = (direction: Direction) => {
    if (finished) {
      return;
    }
    previous = cloneBoard(board);
    const moved = moveBoard({ board, direction });
    if (!moved.changed) {
      return;
    }
    board = moved.board;
    lastShifts = moved.shifts;
    score += moved.scoreDelta;
    spawnTile({ board });
    syncBoard(true);
    if (boardSize === 4 && hasWinningTile(board)) {
      void finishGame(true);
      return;
    }
    if (!canMove(board)) {
      void finishGame(false);
    }
  };

  const mount = async () => {
    skin = await fetchGameSkin(SLUG);
    root.innerHTML = `
    <header class="game2048-header">
      <button type="button" class="game2048-back" data-back aria-label="Назад">←</button>
      <div>
        <h1>2048 · ${boardSize}×${boardSize}</h1>
        <p class="muted">${boardSize === 4 ? "Соберите «Уголь»" : "Играйте, пока есть ходы"}</p>
      </div>
    </header>
    <div class="game2048-hud panel">
      <div class="game2048-stat"><span class="muted">Очки</span><div data-score>0</div></div>
      <div class="game2048-stat"><span class="muted">Лучшая плитка</span><div data-best>—</div></div>
    </div>
    <div class="game2048-board" data-board></div>
    ${gameFinishButtonHtml()}
  `;

    scoreElement = root.querySelector("[data-score]") ?? undefined;
    bestElement = root.querySelector("[data-best]") ?? undefined;
    boardElement = root.querySelector("[data-board]") ?? undefined;
    if (
      skin?.boardBackgroundUrl !== null &&
      skin?.boardBackgroundUrl !== undefined &&
      boardElement instanceof HTMLElement
    ) {
      boardElement.style.backgroundImage = `url("${skin.boardBackgroundUrl}")`;
      boardElement.style.backgroundSize = "cover";
    }
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    bindFinishGameButton({
      root,
      onFinish: () => finishGame(false),
      canFinish: () => !finished,
    });

    previous = cloneBoard(board);
    lastShifts = [];
    syncBoard(false);

    let touchStartX = 0;
    let touchStartY = 0;
    boardElement?.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches[0];
        if (touch === undefined) {
          return;
        }
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      },
      { passive: true },
    );
    boardElement?.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      if (touch === undefined) {
        return;
      }
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) {
        handleMove(dx > 0 ? "right" : "left");
        return;
      }
      handleMove(dy > 0 ? "down" : "up");
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        handleMove("up");
      }
      if (event.key === "ArrowDown") {
        handleMove("down");
      }
      if (event.key === "ArrowLeft") {
        handleMove("left");
      }
      if (event.key === "ArrowRight") {
        handleMove("right");
      }
    };
    window.addEventListener("keydown", onKey);
  };

  void mount();
};
