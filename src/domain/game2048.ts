export type Board = number[][];
export type Direction = "up" | "down" | "left" | "right";

type RandomFn = () => number;

export const createEmptyBoard = (size: number): Board => {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
};

const cloneBoard = (board: Board): Board => {
  return board.map((row) => [...row]);
};

const boardSize = (board: Board) => {
  return board.length;
};

type RandomEmptyCellParameters = {
  readonly board: Board;
};

const randomEmptyCell = ({ board }: RandomEmptyCellParameters) => {
  const size = boardSize(board);
  const cells: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (board[row]?.[col] === 0) {
        cells.push({ row, col });
      }
    }
  }
  if (cells.length === 0) {
    return null;
  }
  return cells;
};

type SpawnTileParameters = {
  readonly board: Board;
  readonly random?: RandomFn;
};

export const spawnTile = ({ board, random = Math.random }: SpawnTileParameters) => {
  const cells = randomEmptyCell({ board });
  if (cells === null) {
    return;
  }
  const index = Math.min(cells.length - 1, Math.floor(random() * cells.length));
  const cell = cells[index];
  if (cell === undefined) {
    return;
  }
  const row = board[cell.row];
  if (row === undefined) {
    return;
  }
  row[cell.col] = random() < 0.9 ? 2 : 4;
};

type LineShift = {
  readonly from: number;
  readonly to: number;
  readonly merged: boolean;
};

const slideLine = (line: number[]) => {
  const occupied: Array<{ value: number; from: number }> = [];
  for (let index = 0; index < line.length; index += 1) {
    const value = line[index];
    if (value !== undefined && value > 0) {
      occupied.push({ value, from: index });
    }
  }
  const merged: number[] = [];
  const shifts: LineShift[] = [];
  let scoreDelta = 0;
  for (let index = 0; index < occupied.length; index += 1) {
    const current = occupied[index];
    const next = occupied[index + 1];
    if (current === undefined) {
      continue;
    }
    if (next !== undefined && current.value === next.value) {
      const mergedValue = current.value * 2;
      const to = merged.length;
      merged.push(mergedValue);
      scoreDelta += mergedValue;
      shifts.push({ from: current.from, to, merged: true });
      shifts.push({ from: next.from, to, merged: true });
      index += 1;
    } else {
      const to = merged.length;
      merged.push(current.value);
      shifts.push({ from: current.from, to, merged: false });
    }
  }
  while (merged.length < line.length) {
    merged.push(0);
  }
  return {
    line: merged,
    scoreDelta,
    changed: merged.some((value, index) => value !== line[index]),
    shifts,
  };
};

export type TileShift = {
  readonly fromRow: number;
  readonly fromCol: number;
  readonly toRow: number;
  readonly toCol: number;
  readonly merged: boolean;
};

type MoveBoardParameters = {
  readonly board: Board;
  readonly direction: Direction;
};

const mapLineShift = (input: {
  readonly size: number;
  readonly index: number;
  readonly direction: Direction;
  readonly shift: LineShift;
}): TileShift => {
  if (input.direction === "left") {
    return {
      fromRow: input.index,
      fromCol: input.shift.from,
      toRow: input.index,
      toCol: input.shift.to,
      merged: input.shift.merged,
    };
  }
  if (input.direction === "right") {
    return {
      fromRow: input.index,
      fromCol: input.size - 1 - input.shift.from,
      toRow: input.index,
      toCol: input.size - 1 - input.shift.to,
      merged: input.shift.merged,
    };
  }
  if (input.direction === "up") {
    return {
      fromRow: input.shift.from,
      fromCol: input.index,
      toRow: input.shift.to,
      toCol: input.index,
      merged: input.shift.merged,
    };
  }
  return {
    fromRow: input.size - 1 - input.shift.from,
    fromCol: input.index,
    toRow: input.size - 1 - input.shift.to,
    toCol: input.index,
    merged: input.shift.merged,
  };
};

export const moveBoard = ({ board, direction }: MoveBoardParameters) => {
  const size = boardSize(board);
  const next = cloneBoard(board);
  let scoreDelta = 0;
  let changed = false;
  const shifts: TileShift[] = [];
  const readLine = (index: number) => {
    if (direction === "left") {
      return next[index] ?? [];
    }
    if (direction === "right") {
      return [...(next[index] ?? [])].reverse();
    }
    if (direction === "up") {
      return next.map((row) => row[index] ?? 0);
    }
    return next.map((row) => row[index] ?? 0).reverse();
  };
  const writeLine = (index: number, line: number[]) => {
    if (direction === "left") {
      next[index] = line;
      return;
    }
    if (direction === "right") {
      next[index] = [...line].reverse();
      return;
    }
    if (direction === "up") {
      for (let row = 0; row < size; row += 1) {
        const target = next[row];
        if (target !== undefined) {
          target[index] = line[row] ?? 0;
        }
      }
      return;
    }
    const reversed = [...line].reverse();
    for (let row = 0; row < size; row += 1) {
      const target = next[row];
      if (target !== undefined) {
        target[index] = reversed[row] ?? 0;
      }
    }
  };
  for (let index = 0; index < size; index += 1) {
    const result = slideLine(readLine(index));
    scoreDelta += result.scoreDelta;
    changed = changed || result.changed;
    writeLine(index, result.line);
    for (const shift of result.shifts) {
      if (shift.from === shift.to && !shift.merged) {
        continue;
      }
      shifts.push(mapLineShift({ size, index, direction, shift }));
    }
  }
  return { board: next, scoreDelta, changed, shifts };
};

export const canMove = (board: Board) => {
  for (const direction of ["up", "down", "left", "right"] as const) {
    if (moveBoard({ board, direction }).changed) {
      return true;
    }
  }
  return false;
};

export const hasWinningTile = (board: Board) => {
  return board.some((row) => row.some((value) => value === 2048));
};
