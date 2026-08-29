import type { Board, GameState, Piece } from "../../src/domain/block-blast.ts";
import { BOARD_SIZE, nearFullCells } from "../../src/domain/block-blast.ts";

const EMPTY = -1;
const TILE_EMOJI = ["🔥", "💧", "🫧", "🌿"] as const;
const FLASH_MS = 80;
const POP_MS = 220;
const STAGGER_MS = 35;
const PLACE_MS = 320;
const SHAKE_MS = 350;
const GAME_OVER_MS = 700;

export type Cell = {
  readonly row: number;
  readonly col: number;
};

const tileEmoji = (tile: number) => {
  return TILE_EMOJI[tile] ?? "·";
};

const cellKey = (cell: Cell) => {
  return `${cell.row},${cell.col}`;
};

const wait = (milliseconds: number) => {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
};

const prefersReducedMotion = () => {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const TRAY_PIECE_MAX_PX = 56;
const TRAY_PIECE_GAP_PX = 1;

const pieceBounds = (piece: Piece) => {
  let maxDr = 0;
  let maxDc = 0;
  for (const cell of piece.cells) {
    maxDr = Math.max(maxDr, cell.dr);
    maxDc = Math.max(maxDc, cell.dc);
  }
  return { rows: maxDr + 1, cols: maxDc + 1 };
};

const createBlockElement = (tile: number) => {
  const block = document.createElement("span");
  block.className = "bb-block";
  block.textContent = tileEmoji(tile);
  block.dataset.tile = String(tile);
  return block;
};

export const renderPiecePreview = (piece: Piece, maxPx = TRAY_PIECE_MAX_PX) => {
  const { rows, cols } = pieceBounds(piece);
  const cellSize = Math.max(1, Math.floor(maxPx / Math.max(rows, cols)));
  const gridGap = TRAY_PIECE_GAP_PX;
  const wrap = document.createElement("div");
  wrap.className = "bb-tray-piece-grid";
  wrap.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
  wrap.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  wrap.style.width = `${cols * cellSize + (cols - 1) * gridGap}px`;
  wrap.style.height = `${rows * cellSize + (rows - 1) * gridGap}px`;
  for (let dr = 0; dr < rows; dr += 1) {
    for (let dc = 0; dc < cols; dc += 1) {
      const slot = document.createElement("div");
      slot.className = "bb-tray-piece-cell";
      const match = piece.cells.find((cell) => cell.dr === dr && cell.dc === dc);
      if (match !== undefined) {
        slot.textContent = tileEmoji(piece.tile);
        slot.dataset.tile = String(piece.tile);
      }
      wrap.append(slot);
    }
  }
  return wrap;
};

export const createDragGhostElement = (piece: Piece) => {
  const ghost = document.createElement("div");
  ghost.className = "bb-drag-ghost";
  ghost.append(renderPiecePreview(piece, 72));
  return ghost;
};

export type BlockBlastBoard = {
  readonly sync: (state: GameState) => void;
  readonly syncBoard: (board: Board) => void;
  readonly syncTray: (state: GameState) => void;
  readonly getCellSize: () => number;
  readonly getBoardElement: () => HTMLElement;
  readonly getTrayElement: () => HTMLElement;
  readonly setSelectedPiece: (index: number | undefined) => void;
  readonly setGhost: (
    cells: ReadonlyArray<Cell> | undefined,
    valid: boolean,
    tile?: number,
  ) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly animatePlacement: (cells: ReadonlyArray<Cell>) => Promise<void>;
  readonly animateLineClear: (
    cells: ReadonlyArray<Cell>,
    scoreDelta: number,
    linesCleared: number,
  ) => Promise<void>;
  readonly shakeTrayPiece: (index: number) => void;
  readonly animateGameOver: () => Promise<void>;
  readonly boardCellFromPoint: (clientX: number, clientY: number) => Cell | undefined;
};

export const createBlockBlastBoard = (container: HTMLElement): BlockBlastBoard => {
  container.innerHTML = `
    <div class="bb-board-wrap">
      <div class="bb-board" data-grid></div>
      <div class="bb-ghost" data-ghost hidden></div>
      <div class="bb-fx" data-fx></div>
    </div>
    <div class="bb-tray" data-tray></div>
  `;

  const grid = container.querySelector("[data-grid]");
  const boardWrap = container.querySelector(".bb-board-wrap");
  const ghostLayer = container.querySelector("[data-ghost]");
  const fxLayer = container.querySelector("[data-fx]");
  const tray = container.querySelector("[data-tray]");
  if (
    !(grid instanceof HTMLElement) ||
    !(boardWrap instanceof HTMLElement) ||
    !(ghostLayer instanceof HTMLElement) ||
    !(fxLayer instanceof HTMLElement) ||
    !(tray instanceof HTMLElement)
  ) {
    throw new Error("block blast board mount failed");
  }

  let selectedPiece: number | undefined;
  const tileElements = new Map<string, HTMLElement>();

  const getCellSize = () => {
    const rect = grid.getBoundingClientRect();
    return rect.width / BOARD_SIZE;
  };

  const syncTray = (state: GameState) => {
    tray.replaceChildren();
    state.tray.forEach((piece, index) => {
      const slot = document.createElement("div");
      slot.className = "bb-tray-slot";
      slot.dataset.index = String(index);
      if (piece === null) {
        slot.classList.add("bb-tray-slot--empty");
      } else {
        slot.append(renderPiecePreview(piece));
        if (selectedPiece === index) {
          slot.classList.add("bb-tray-slot--selected");
        }
      }
      tray.append(slot);
    });
  };

  const applyNearFullHints = (board: Board) => {
    const near = new Set(nearFullCells(board).map(cellKey));
    for (const cell of grid.querySelectorAll(".bb-cell")) {
      if (!(cell instanceof HTMLElement)) {
        continue;
      }
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      cell.classList.toggle("bb-cell--near", near.has(cellKey({ row, col })));
    }
  };

  const shakeBoard = async () => {
    if (prefersReducedMotion()) {
      return;
    }
    boardWrap.classList.remove("bb-board-wrap--shake");
    void boardWrap.offsetWidth;
    boardWrap.classList.add("bb-board-wrap--shake");
    await wait(SHAKE_MS);
    boardWrap.classList.remove("bb-board-wrap--shake");
  };

  const syncBoard = (board: Board) => {
    grid.replaceChildren();
    tileElements.clear();
    grid.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${BOARD_SIZE}, 1fr)`;

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const tile = board[row]?.[col] ?? EMPTY;
        const cell = document.createElement("div");
        cell.className = "bb-cell";
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        if (tile !== EMPTY) {
          const block = createBlockElement(tile);
          cell.append(block);
          tileElements.set(cellKey({ row, col }), block);
        }
        grid.append(cell);
      }
    }
    applyNearFullHints(board);
  };

  const setGhost = (
    cells: ReadonlyArray<Cell> | undefined,
    valid: boolean,
    tile?: number,
  ) => {
    ghostLayer.replaceChildren();
    if (cells === undefined || cells.length === 0) {
      ghostLayer.hidden = true;
      return;
    }
    ghostLayer.hidden = false;
    ghostLayer.classList.toggle("bb-ghost--invalid", !valid);
    const cellSize = getCellSize();
    for (const cell of cells) {
      const ghost = document.createElement("div");
      ghost.className = "bb-ghost-cell";
      if (tile !== undefined) {
        ghost.dataset.tile = String(tile);
        ghost.textContent = tileEmoji(tile);
      }
      ghost.style.width = `${cellSize}px`;
      ghost.style.height = `${cellSize}px`;
      ghost.style.transform = `translate(${cell.col * cellSize}px, ${cell.row * cellSize}px)`;
      ghostLayer.append(ghost);
    }
  };

  const showScorePop = (cells: ReadonlyArray<Cell>, scoreDelta: number) => {
    if (scoreDelta <= 0 || cells.length === 0) {
      return;
    }
    const cellSize = getCellSize();
    const avgRow = cells.reduce((sum, cell) => sum + cell.row, 0) / cells.length;
    const avgCol = cells.reduce((sum, cell) => sum + cell.col, 0) / cells.length;
    const pop = document.createElement("span");
    pop.className = "bb-score-pop";
    pop.textContent = `+${scoreDelta}`;
    pop.style.left = `${(avgCol + 0.5) * cellSize}px`;
    pop.style.top = `${avgRow * cellSize}px`;
    fxLayer.append(pop);
    window.setTimeout(() => {
      pop.remove();
    }, 650);
  };

  return {
    sync: (state) => {
      syncBoard(state.board);
      syncTray(state);
    },
    syncBoard,
    syncTray,
    getCellSize,
    getBoardElement: () => grid,
    getTrayElement: () => tray,
    setSelectedPiece: (index) => {
      selectedPiece = index;
      for (const slot of tray.querySelectorAll(".bb-tray-slot")) {
        if (slot instanceof HTMLElement) {
          slot.classList.toggle(
            "bb-tray-slot--selected",
            index !== undefined && slot.dataset.index === String(index),
          );
        }
      }
    },
    setGhost,
    setBusy: (value) => {
      grid.classList.toggle("bb-board--busy", value);
      tray.classList.toggle("bb-tray--busy", value);
    },
    animatePlacement: async (cells) => {
      if (prefersReducedMotion()) {
        return;
      }
      for (const cell of cells) {
        const block = tileElements.get(cellKey(cell));
        block?.classList.add("bb-block--place");
      }
      await wait(PLACE_MS);
      for (const cell of cells) {
        const block = tileElements.get(cellKey(cell));
        block?.classList.remove("bb-block--place");
      }
    },
    animateLineClear: async (cells, scoreDelta, linesCleared) => {
      const targets = cells
        .map((cell) => tileElements.get(cellKey(cell)))
        .filter((element): element is HTMLElement => element !== undefined);

      if (targets.length === 0) {
        return;
      }

      if (prefersReducedMotion()) {
        return;
      }

      for (const element of targets) {
        element.classList.add("bb-block--flash");
      }
      await wait(FLASH_MS);

      showScorePop(cells, scoreDelta);

      if (linesCleared >= 3) {
        void shakeBoard();
      }

      targets.forEach((element, index) => {
        element.classList.remove("bb-block--flash");
        window.setTimeout(() => {
          element.classList.add("bb-block--pop");
        }, index * STAGGER_MS);
      });

      const lastDelay = (targets.length - 1) * STAGGER_MS;
      await wait(lastDelay + POP_MS);
    },
    shakeTrayPiece: (index) => {
      const slot = tray.querySelector(`[data-index="${index}"]`);
      if (slot instanceof HTMLElement) {
        slot.classList.remove("bb-tray-slot--shake");
        void slot.offsetWidth;
        slot.classList.add("bb-tray-slot--shake");
      }
    },
    animateGameOver: async () => {
      container.classList.add("bb-board-root--game-over");
      if (prefersReducedMotion()) {
        return;
      }
      await wait(GAME_OVER_MS);
    },
    boardCellFromPoint: (clientX, clientY) => {
      const rect = grid.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return undefined;
      }
      const cellSize = rect.width / BOARD_SIZE;
      const col = Math.floor((clientX - rect.left) / cellSize);
      const row = Math.floor((clientY - rect.top) / cellSize);
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
        return undefined;
      }
      return { row, col };
    },
  };
};
