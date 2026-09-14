const MIN_RUN = 3;
const SCORE_PER_TILE = 10;
const DEFAULT_SIZE = 8;

export type Tile = 0 | 1 | 2 | 3;
export type Special = "none" | "rocketH" | "rocketV" | "bomb" | "colorBomb";

export type Match3Cell = {
  readonly color: Tile;
  readonly special: Special;
};

export type Board = ReadonlyArray<ReadonlyArray<Match3Cell>>;

type Cell = {
  readonly row: number;
  readonly col: number;
};

type Group = {
  readonly cells: ReadonlyArray<Cell>;
  readonly axis: "row" | "col";
};

type MutableBoard = Array<Array<Match3Cell | null>>;
type RandomFn = () => number;

const TILES: ReadonlyArray<Tile> = [0, 1, 2, 3];

export const makeCell = (color: Tile, special: Special = "none"): Match3Cell => {
  return { color, special };
};

export const boardFromColors = (colors: ReadonlyArray<ReadonlyArray<number>>): Board => {
  return colors.map((row) =>
    row.map((value) => {
      const color = TILES.includes(value as Tile) ? (value as Tile) : 0;
      return makeCell(color);
    }),
  );
};

const cloneBoard = (board: Board): MutableBoard => {
  return board.map((row) => row.map((cell) => ({ ...cell })));
};

const freezeBoard = (board: MutableBoard): Board => {
  return board.map((row) =>
    row.map((cell) => cell ?? makeCell(0)),
  );
};

const randomTile = (random: RandomFn): Match3Cell => {
  const index = Math.floor(random() * TILES.length);
  return makeCell(TILES[index] ?? 0);
};

const cellKey = (cell: Cell) => {
  return `${cell.row},${cell.col}`;
};

const findGroups = (board: Board | MutableBoard): ReadonlyArray<Group> => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const groups: Group[] = [];
  const colorAt = (row: number, col: number) => {
    const cell = board[row]?.[col];
    if (cell === undefined || cell === null || cell.special === "colorBomb") {
      return null;
    }
    return cell.color;
  };

  for (let row = 0; row < rows; row += 1) {
    let run = 1;
    for (let col = 1; col <= cols; col += 1) {
      const same = col < cols && colorAt(row, col) !== null && colorAt(row, col) === colorAt(row, col - 1);
      if (same) {
        run += 1;
        continue;
      }
      if (run >= MIN_RUN) {
        const cells: Cell[] = [];
        for (let k = col - run; k < col; k += 1) {
          cells.push({ row, col: k });
        }
        groups.push({ cells, axis: "row" });
      }
      run = 1;
    }
  }

  for (let col = 0; col < cols; col += 1) {
    let run = 1;
    for (let row = 1; row <= rows; row += 1) {
      const same = row < rows && colorAt(row, col) !== null && colorAt(row, col) === colorAt(row - 1, col);
      if (same) {
        run += 1;
        continue;
      }
      if (run >= MIN_RUN) {
        const cells: Cell[] = [];
        for (let k = row - run; k < row; k += 1) {
          cells.push({ row: k, col });
        }
        groups.push({ cells, axis: "col" });
      }
      run = 1;
    }
  }

  return groups;
};

const specialForGroup = (group: Group): Special => {
  if (group.cells.length >= 6) {
    return "bomb";
  }
  if (group.cells.length === 5) {
    return "colorBomb";
  }
  if (group.cells.length === 4) {
    return group.axis === "row" ? "rocketH" : "rocketV";
  }
  return "none";
};

const spawnCellForGroup = (group: Group, spawnAnchor: Cell | undefined) => {
  if (spawnAnchor !== undefined && group.cells.some((cell) => cell.row === spawnAnchor.row && cell.col === spawnAnchor.col)) {
    return spawnAnchor;
  }
  return group.cells[Math.floor(group.cells.length / 2)] ?? group.cells[0];
};

const expandSpecials = (board: Board | MutableBoard, seeds: ReadonlyArray<Cell>) => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const cleared = new Set(seeds.map(cellKey));
  const queue = [...seeds];
  const add = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= rows || col >= cols) {
      return;
    }
    const key = `${row},${col}`;
    if (cleared.has(key)) {
      return;
    }
    cleared.add(key);
    queue.push({ row, col });
  };

  while (queue.length > 0) {
    const cell = queue.shift();
    if (cell === undefined) {
      break;
    }
    const tile = board[cell.row]?.[cell.col];
    if (tile === undefined || tile === null) {
      continue;
    }
    if (tile.special === "rocketH") {
      for (let col = 0; col < cols; col += 1) {
        add(cell.row, col);
      }
    }
    if (tile.special === "rocketV") {
      for (let row = 0; row < rows; row += 1) {
        add(row, cell.col);
      }
    }
    if (tile.special === "bomb") {
      for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
        for (let col = cell.col - 1; col <= cell.col + 1; col += 1) {
          add(row, col);
        }
      }
    }
  }

  return [...cleared].map((key) => {
    const [rowRaw, colRaw] = key.split(",");
    return { row: Number(rowRaw), col: Number(colRaw) };
  });
};

const colorBombClears = (
  board: Board,
  swap: { readonly from: Cell; readonly to: Cell } | undefined,
) => {
  if (swap === undefined) {
    return [] as Cell[];
  }
  const fromCell = board[swap.from.row]?.[swap.from.col];
  const toCell = board[swap.to.row]?.[swap.to.col];
  if (fromCell === undefined || toCell === undefined) {
    return [];
  }
  let targetColor: Tile | null = null;
  const bombs: Cell[] = [];
  if (fromCell.special === "colorBomb") {
    targetColor = toCell.color;
    bombs.push(swap.from);
  }
  if (toCell.special === "colorBomb") {
    targetColor = fromCell.color;
    bombs.push(swap.to);
  }
  if (targetColor === null) {
    return [];
  }
  const cells: Cell[] = [...bombs];
  for (let row = 0; row < board.length; row += 1) {
    const line = board[row];
    if (line === undefined) {
      continue;
    }
    for (let col = 0; col < line.length; col += 1) {
      if (line[col]?.color === targetColor) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
};

const applyGravity = (board: MutableBoard) => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let col = 0; col < cols; col += 1) {
    const stacked: Match3Cell[] = [];
    for (let row = 0; row < rows; row += 1) {
      const tile = board[row]?.[col];
      if (tile !== undefined && tile !== null) {
        stacked.push(tile);
      }
    }
    for (let row = rows - 1; row >= 0; row -= 1) {
      const next = stacked.pop();
      const line = board[row];
      if (line === undefined) {
        continue;
      }
      line[col] = next ?? null;
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
      if (line[col] === null) {
        line[col] = randomTile(random);
      }
    }
  }
};

export type SpawnedSpecial = {
  readonly row: number;
  readonly col: number;
  readonly special: Special;
};

export type MatchStep = {
  readonly next: Board;
  readonly scoreDelta: number;
  readonly matchedCells: ReadonlyArray<{ readonly row: number; readonly col: number }>;
  readonly hasMore: boolean;
  readonly spawnedSpecials: ReadonlyArray<SpawnedSpecial>;
};

export const resolveMatchStep = (
  board: Board,
  cascadeIndex: number,
  random: RandomFn = Math.random,
  spawnAnchor?: Cell,
  swap?: { readonly from: Cell; readonly to: Cell },
): MatchStep => {
  const bombCells = colorBombClears(board, swap);
  const groups = findGroups(board);
  if (groups.length === 0 && bombCells.length === 0) {
    return { next: board, scoreDelta: 0, matchedCells: [], hasMore: false, spawnedSpecials: [] };
  }

  const rowKeys = new Set(
    groups.filter((group) => group.axis === "row").flatMap((group) => group.cells.map(cellKey)),
  );
  const corners = groups
    .filter((group) => group.axis === "col")
    .flatMap((group) => group.cells)
    .filter((cell) => rowKeys.has(cellKey(cell)));

  const usedGroups = new Set<Group>();
  const spawnedSpecials: SpawnedSpecial[] = [];
  for (const corner of corners) {
    spawnedSpecials.push({ ...corner, special: "bomb" });
    for (const group of groups) {
      if (group.cells.some((cell) => cell.row === corner.row && cell.col === corner.col)) {
        usedGroups.add(group);
      }
    }
  }
  for (const group of groups) {
    if (usedGroups.has(group)) {
      continue;
    }
    const special = specialForGroup(group);
    if (special === "none") {
      continue;
    }
    const at = spawnCellForGroup(group, spawnAnchor);
    if (at !== undefined) {
      spawnedSpecials.push({ ...at, special });
    }
  }

  const groupCells = groups.flatMap((group) => [...group.cells]);
  const expanded = expandSpecials(board, [...groupCells, ...bombCells]);
  const matchedCells = expanded;

  const next = cloneBoard(board);
  for (const cell of matchedCells) {
    const line = next[cell.row];
    if (line !== undefined) {
      line[cell.col] = null;
    }
  }
  for (const spawn of spawnedSpecials) {
    const line = next[spawn.row];
    if (line === undefined) {
      continue;
    }
    const color = board[spawn.row]?.[spawn.col]?.color ?? 0;
    line[spawn.col] = makeCell(color, spawn.special);
  }
  applyGravity(next);
  refillTop(next, random);
  const frozen = freezeBoard(next);
  return {
    next: frozen,
    scoreDelta: SCORE_PER_TILE * matchedCells.length * cascadeIndex,
    matchedCells,
    hasMore: findGroups(frozen).length > 0,
    spawnedSpecials,
  };
};

export const resolveMatches = (
  board: Board,
  random: RandomFn = Math.random,
) => {
  let next = board;
  let score = 0;
  let cascadeIndex = 1;
  for (;;) {
    const step = resolveMatchStep(next, cascadeIndex, random);
    if (step.scoreDelta === 0) {
      return { next: step.next, score };
    }
    score += step.scoreDelta;
    next = step.next;
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
    const board: Match3Cell[][] = [];
    for (let row = 0; row < size; row += 1) {
      const line: Match3Cell[] = [];
      for (let col = 0; col < size; col += 1) {
        line.push(randomTile(random));
      }
      board.push(line);
    }
    if (findGroups(board).length === 0 && hasAnyMove(board)) {
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
  const fromCell = board[from.row]?.[from.col];
  const toCell = board[to.row]?.[to.col];
  if (fromCell?.special === "colorBomb" || toCell?.special === "colorBomb") {
    return true;
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
  return freezeBoard(next);
};

export const hasAnyMove = (board: Board) => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const neighbors = [
        { row, col: col + 1 },
        { row: row + 1, col },
      ];
      for (const to of neighbors) {
        if (to.row >= rows || to.col >= cols) {
          continue;
        }
        if (wouldMatch({ board, from: { row, col }, to })) {
          return true;
        }
      }
    }
  }
  return false;
};
