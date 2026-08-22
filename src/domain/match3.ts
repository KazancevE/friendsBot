const MIN_RUN = 3;
const SCORE_PER_TILE = 10;
const EMPTY = -1;
const DEFAULT_SIZE = 8;

export type Tile = 0 | 1 | 2 | 3;
export type Board = ReadonlyArray<ReadonlyArray<number>>;

type Cell = {
  readonly row: number;
  readonly col: number;
};

type Group = {
  readonly cells: ReadonlyArray<Cell>;
};

type MutableBoard = number[][];

type RandomFn = () => number;

const cloneBoard = (board: Board): MutableBoard => {
  return board.map((row) => [...row]);
};

const TILES: ReadonlyArray<Tile> = [0, 1, 2, 3];

const randomTile = (random: RandomFn): Tile => {
  const index = Math.floor(random() * TILES.length);
  return TILES[index] ?? 0;
};

const findGroups = (board: Board): ReadonlyArray<Group> => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const groups: Group[] = [];

  for (let row = 0; row < rows; row += 1) {
    let run = 1;
    for (let col = 1; col <= cols; col += 1) {
      const same = col < cols && board[row]?.[col] === board[row]?.[col - 1];
      if (same) {
        run += 1;
        continue;
      }
      if (run >= MIN_RUN) {
        const cells: Cell[] = [];
        for (let k = col - run; k < col; k += 1) {
          cells.push({ row, col: k });
        }
        groups.push({ cells });
      }
      run = 1;
    }
  }

  for (let col = 0; col < cols; col += 1) {
    let run = 1;
    for (let row = 1; row <= rows; row += 1) {
      const same = row < rows && board[row]?.[col] === board[row - 1]?.[col];
      if (same) {
        run += 1;
        continue;
      }
      if (run >= MIN_RUN) {
        const cells: Cell[] = [];
        for (let k = row - run; k < row; k += 1) {
          cells.push({ row: k, col });
        }
        groups.push({ cells });
      }
      run = 1;
    }
  }

  return groups;
};

const clearGroups = (board: MutableBoard, groups: ReadonlyArray<Group>) => {
  for (const group of groups) {
    for (const cell of group.cells) {
      const row = board[cell.row];
      if (row !== undefined) {
        row[cell.col] = EMPTY;
      }
    }
  }
};

const applyGravity = (board: MutableBoard) => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let col = 0; col < cols; col += 1) {
    const stacked: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      const tile = board[row]?.[col];
      if (tile !== undefined && tile !== EMPTY) {
        stacked.push(tile);
      }
    }
    for (let row = rows - 1; row >= 0; row -= 1) {
      const next = stacked.pop();
      const line = board[row];
      if (line === undefined) {
        continue;
      }
      line[col] = next === undefined ? EMPTY : next;
    }
  }
};

const refillTop = (board: MutableBoard, random: RandomFn) => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let row = 0; row < rows; row += 1) {
    const line = board[row];
    if (line === undefined) {
      continue;
    }
    for (let col = 0; col < cols; col += 1) {
      if (line[col] === EMPTY) {
        line[col] = randomTile(random);
      }
    }
  }
};

export const resolveMatches = (
  board: Board,
  random: RandomFn = Math.random,
) => {
  const next = cloneBoard(board);
  let score = 0;
  let cascadeIndex = 1;
  for (;;) {
    const groups = findGroups(next);
    if (groups.length === 0) {
      return { next, score };
    }
    for (const group of groups) {
      score += SCORE_PER_TILE * group.cells.length * cascadeIndex;
    }
    clearGroups(next, groups);
    applyGravity(next);
    refillTop(next, random);
    cascadeIndex += 1;
  }
};

type CreateBoardParameters = {
  readonly size?: number;
  readonly random?: RandomFn;
};

export const createBoard = ({
  size = DEFAULT_SIZE,
  random = Math.random,
}: CreateBoardParameters = {}): Board => {
  for (;;) {
    const board: MutableBoard = [];
    for (let row = 0; row < size; row += 1) {
      const line: number[] = [];
      for (let col = 0; col < size; col += 1) {
        line.push(randomTile(random));
      }
      board.push(line);
    }
    if (findGroups(board).length === 0) {
      return board;
    }
  }
};

const areAdjacent = (from: Cell, to: Cell) => {
  return Math.abs(from.row - to.row) + Math.abs(from.col - to.col) === 1;
};

const swapCells = (board: MutableBoard, from: Cell, to: Cell) => {
  const fromRow = board[from.row];
  const toRow = board[to.row];
  if (fromRow === undefined || toRow === undefined) {
    return;
  }
  const fromTile = fromRow[from.col];
  const toTile = toRow[to.col];
  if (fromTile === undefined || toTile === undefined) {
    return;
  }
  fromRow[from.col] = toTile;
  toRow[to.col] = fromTile;
};

type SwapParameters = {
  readonly board: Board;
  readonly from: Cell;
  readonly to: Cell;
};

export const wouldMatch = ({ board, from, to }: SwapParameters) => {
  if (!areAdjacent(from, to)) {
    return false;
  }
  const next = cloneBoard(board);
  swapCells(next, from, to);
  return findGroups(next).length > 0;
};

export const swapAdjacent = ({ board, from, to }: SwapParameters) => {
  if (!areAdjacent(from, to)) {
    return undefined;
  }
  const next = cloneBoard(board);
  swapCells(next, from, to);
  return next;
};
