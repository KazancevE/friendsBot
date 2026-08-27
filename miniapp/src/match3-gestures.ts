import type { Cell } from "./match3-board.ts";

type GesturesParameters = {
  readonly grid: HTMLElement;
  readonly getCellSize: () => number;
  readonly getBusy: () => boolean;
  readonly onTap: (cell: Cell) => void;
  readonly onFlick: (from: Cell, to: Cell) => void;
};

const cellFromTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return undefined;
  }
  const button = target.closest("[data-row][data-col]");
  if (!(button instanceof HTMLElement)) {
    return undefined;
  }
  const row = Number(button.dataset.row);
  const col = Number(button.dataset.col);
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return undefined;
  }
  return { row, col };
};

const neighborFromDelta = (cell: Cell, deltaRow: number, deltaCol: number) => {
  return {
    row: cell.row + deltaRow,
    col: cell.col + deltaCol,
  };
};

export const bindMatch3Gestures = ({
  grid,
  getCellSize,
  getBusy,
  onTap,
  onFlick,
}: GesturesParameters) => {
  let activeCell: Cell | undefined;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onPointerDown = (event: PointerEvent) => {
    if (getBusy()) {
      return;
    }
    const cell = cellFromTarget(event.target);
    if (cell === undefined) {
      return;
    }
    activeCell = cell;
    startX = event.clientX;
    startY = event.clientY;
    tracking = true;
    grid.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!tracking || activeCell === undefined) {
      return;
    }
    tracking = false;
    grid.releasePointerCapture(event.pointerId);

    const cellSize = getCellSize();
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const threshold = cellSize * 0.3;

    if (Math.max(absX, absY) < threshold) {
      onTap(activeCell);
      activeCell = undefined;
      return;
    }

    let target = activeCell;
    if (absX >= absY) {
      target = neighborFromDelta(activeCell, 0, deltaX > 0 ? 1 : -1);
    } else {
      target = neighborFromDelta(activeCell, deltaY > 0 ? 1 : -1, 0);
    }

    const rows = Number(grid.dataset.rows);
    const cols = Number(grid.dataset.cols);
    if (
      target.row < 0 ||
      target.col < 0 ||
      target.row >= rows ||
      target.col >= cols
    ) {
      onTap(activeCell);
      activeCell = undefined;
      return;
    }

    onFlick(activeCell, target);
    activeCell = undefined;
  };

  const onPointerCancel = () => {
    tracking = false;
    activeCell = undefined;
  };

  grid.addEventListener("pointerdown", onPointerDown);
  grid.addEventListener("pointerup", onPointerUp);
  grid.addEventListener("pointercancel", onPointerCancel);

  return () => {
    grid.removeEventListener("pointerdown", onPointerDown);
    grid.removeEventListener("pointerup", onPointerUp);
    grid.removeEventListener("pointercancel", onPointerCancel);
  };
};

export const cellsEqual = (left: Cell, right: Cell) => {
  return left.row === right.row && left.col === right.col;
};
