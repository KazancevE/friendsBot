import type { Board } from "../../src/domain/match3.ts";

const TILE_EMOJI = ["🔥", "💧", "🫧", "🌿"] as const;
const FALL_DURATION_MS = 320;
const STAGGER_MS = 30;

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

const waitTransition = (element: HTMLElement, fallbackMs: number) => {
  return new Promise<void>((resolve) => {
    const finish = () => {
      element.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === element) {
        finish();
      }
    };
    element.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, fallbackMs);
  });
};

const animateFall = async (
  element: HTMLElement,
  fromY: number,
  delayMs = 0,
) => {
  if (delayMs > 0) {
    await wait(delayMs);
  }
  element.classList.add("falling");
  element.style.transform = `translateY(${fromY}px)`;
  void element.offsetHeight;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      element.style.transform = "translateY(0)";
      void waitTransition(element, FALL_DURATION_MS).then(() => {
        element.classList.remove("falling");
        element.style.transform = "";
        resolve();
      });
    });
  });
};

type GravityMove = {
  readonly fromRow: number;
  readonly toRow: number;
  readonly col: number;
};

type GravitySpawn = {
  readonly row: number;
  readonly col: number;
};

const computeGravityMotion = (
  before: Board,
  matchedCells: ReadonlyArray<Cell>,
) => {
  const matched = new Set(matchedCells.map(cellKey));
  const rows = before.length;
  const cols = before[0]?.length ?? 0;
  const moves: GravityMove[] = [];
  const spawns: GravitySpawn[] = [];

  for (let col = 0; col < cols; col += 1) {
    const survivors: { row: number; tile: number }[] = [];
    for (let row = 0; row < rows; row += 1) {
      if (matched.has(`${row},${col}`)) {
        continue;
      }
      const tile = before[row]?.[col];
      if (tile !== undefined && tile >= 0) {
        survivors.push({ row, tile });
      }
    }

    for (let row = rows - 1; row >= 0; row -= 1) {
      const indexFromBottom = rows - 1 - row;
      const survivor = survivors[survivors.length - 1 - indexFromBottom];
      if (survivor !== undefined) {
        if (survivor.row !== row) {
          moves.push({ fromRow: survivor.row, toRow: row, col });
        }
        continue;
      }
      spawns.push({ row, col });
    }
  }

  return { moves, spawns, rows };
};

export type Match3Board = {
  readonly sync: (board: Board) => void;
  readonly getCellSize: () => number;
  readonly animateSwap: (from: Cell, to: Cell) => Promise<void>;
  readonly animateRevert: (from: Cell, to: Cell) => Promise<void>;
  readonly animatePop: (
    cells: ReadonlyArray<Cell>,
    scoreDelta: number,
  ) => Promise<void>;
  readonly animateGravity: (
    before: Board,
    after: Board,
    matchedCells: ReadonlyArray<Cell>,
  ) => Promise<void>;
  readonly setSelected: (cell: Cell | undefined) => void;
  readonly setBusy: (busy: boolean) => void;
};

export const createMatch3Board = (container: HTMLElement): Match3Board => {
  const tiles: HTMLButtonElement[][] = [];
  let selected: Cell | undefined;
  let busy = false;

  const ensureGrid = (board: Board) => {
    if (tiles.length > 0) {
      return;
    }
    container.replaceChildren();
    container.style.position = "relative";
    for (let row = 0; row < board.length; row += 1) {
      const line = board[row] ?? [];
      const rowTiles: HTMLButtonElement[] = [];
      for (let col = 0; col < line.length; col += 1) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "match3-tile";
        tile.dataset.row = String(row);
        tile.dataset.col = String(col);
        container.append(tile);
        rowTiles.push(tile);
      }
      tiles.push(rowTiles);
    }
  };

  const tileAt = (cell: Cell) => {
    return tiles[cell.row]?.[cell.col];
  };

  const applyTile = (element: HTMLButtonElement, tile: number) => {
    element.textContent = tileEmoji(tile);
    element.dataset.tile = String(tile);
    element.style.transform = "";
    element.style.opacity = "";
    element.classList.remove("popping", "flashing", "falling");
  };

  const sync = (board: Board) => {
    ensureGrid(board);
    for (let row = 0; row < board.length; row += 1) {
      const line = board[row] ?? [];
      for (let col = 0; col < line.length; col += 1) {
        const tile = line[col] ?? 0;
        const element = tiles[row]?.[col];
        if (element !== undefined) {
          applyTile(element, tile);
        }
      }
    }
    setSelected(selected);
    setBusy(busy);
  };

  const getCellSize = () => {
    const first = tiles[0]?.[0];
    if (first === undefined) {
      return 0;
    }
    return first.offsetWidth + 4;
  };

  const setSelected = (cell: Cell | undefined) => {
    selected = cell;
    for (const row of tiles) {
      for (const tile of row) {
        tile.classList.remove("selected");
      }
    }
    if (cell !== undefined) {
      tileAt(cell)?.classList.add("selected");
    }
  };

  const setBusy = (nextBusy: boolean) => {
    busy = nextBusy;
    container.classList.toggle("busy", nextBusy);
    for (const row of tiles) {
      for (const tile of row) {
        tile.classList.toggle("busy", nextBusy);
      }
    }
  };

  const translateTile = async (
    from: Cell,
    to: Cell,
    reverse: boolean,
  ) => {
    const size = getCellSize();
    const deltaRow = to.row - from.row;
    const deltaCol = to.col - from.col;
    const fromTile = tileAt(from);
    const toTile = tileAt(to);
    if (fromTile === undefined || toTile === undefined || size === 0) {
      return;
    }
    const forward = `translate(${deltaCol * size}px, ${deltaRow * size}px)`;
    const backward = `translate(${-deltaCol * size}px, ${-deltaRow * size}px)`;
    fromTile.style.transform = forward;
    toTile.style.transform = backward;
    await Promise.all([
      waitTransition(fromTile, 200),
      waitTransition(toTile, 200),
    ]);
    if (reverse) {
      fromTile.style.transform = backward;
      toTile.style.transform = forward;
      await Promise.all([
        waitTransition(fromTile, 180),
        waitTransition(toTile, 180),
      ]);
    }
    fromTile.style.transform = "";
    toTile.style.transform = "";
  };

  const animateSwap = async (from: Cell, to: Cell) => {
    await translateTile(from, to, false);
  };

  const animateRevert = async (from: Cell, to: Cell) => {
    await translateTile(from, to, true);
    container.classList.add("shake");
    await wait(120);
    container.classList.remove("shake");
  };

  const animatePop = async (
    cells: ReadonlyArray<Cell>,
    scoreDelta: number,
  ) => {
    if (cells.length === 0) {
      return;
    }
    const first = cells[0];
    const anchor = first === undefined ? undefined : tileAt(first);
    for (const cell of cells) {
      tileAt(cell)?.classList.add("flashing");
    }
    await wait(80);
    for (const cell of cells) {
      const tile = tileAt(cell);
      tile?.classList.remove("flashing");
      tile?.classList.add("popping");
    }
    if (anchor !== undefined && scoreDelta > 0) {
      const pop = document.createElement("span");
      pop.className = "match3-score-pop";
      pop.textContent = `+${scoreDelta}`;
      const rect = anchor.getBoundingClientRect();
      const parentRect = container.getBoundingClientRect();
      pop.style.left = `${rect.left - parentRect.left + rect.width / 2}px`;
      pop.style.top = `${rect.top - parentRect.top}px`;
      container.append(pop);
      window.setTimeout(() => {
        pop.remove();
      }, 650);
    }
    await wait(220);
    for (const cell of cells) {
      const tile = tileAt(cell);
      if (tile !== undefined) {
        tile.classList.remove("popping");
        tile.style.opacity = "0";
      }
    }
  };

  const animateGravity = async (
    before: Board,
    after: Board,
    matchedCells: ReadonlyArray<Cell>,
  ) => {
    const size = getCellSize();
    if (size === 0) {
      sync(after);
      return;
    }
    const { moves, spawns, rows } = computeGravityMotion(before, matchedCells);
    const animations: Promise<void>[] = [];

    for (const move of moves) {
      const from: Cell = { row: move.fromRow, col: move.col };
      const to: Cell = { row: move.toRow, col: move.col };
      const element = tileAt(from);
      const target = tileAt(to);
      if (element === undefined || target === undefined) {
        continue;
      }
      target.textContent = element.textContent;
      const tileType = element.dataset.tile;
      if (tileType !== undefined) {
        target.dataset.tile = tileType;
      }
      target.style.opacity = "1";
      element.style.opacity = "0";
      const fromY = (move.fromRow - move.toRow) * size;
      animations.push(animateFall(target, fromY, move.col * STAGGER_MS));
    }

    for (const spawn of spawns) {
      const element = tileAt(spawn);
      if (element === undefined) {
        continue;
      }
      const tile = after[spawn.row]?.[spawn.col] ?? 0;
      element.textContent = tileEmoji(tile);
      element.dataset.tile = String(tile);
      element.style.opacity = "1";
      const fromY = -(rows - spawn.row) * size;
      animations.push(animateFall(element, fromY, spawn.col * STAGGER_MS));
    }

    await Promise.all(animations);
    sync(after);
  };

  return {
    sync,
    getCellSize,
    animateSwap,
    animateRevert,
    animatePop,
    animateGravity,
    setSelected,
    setBusy,
  };
};
