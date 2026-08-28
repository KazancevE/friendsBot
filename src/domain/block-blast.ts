const EMPTY = -1;
export const BOARD_SIZE = 8;
const SCORE_PER_CELL = 10;
const SCORE_PER_LINE = 100;
const COMBO_MULTIPLIER = 1.5;
export const TRAY_SIZE = 3;

export type Tile = 0 | 1 | 2 | 3;
export type Board = ReadonlyArray<ReadonlyArray<number>>;

type PieceCell = {
  readonly dr: number;
  readonly dc: number;
};

export type Piece = {
  readonly cells: ReadonlyArray<PieceCell>;
  readonly tile: Tile;
};

export type TraySlot = Piece | null;

export type GameState = {
  readonly board: Board;
  readonly tray: ReadonlyArray<TraySlot>;
};

type RandomFn = () => number;

type Cell = {
  readonly row: number;
  readonly col: number;
};

type PlacementParameters = {
  readonly board: Board;
  readonly piece: Piece;
  readonly row: number;
  readonly col: number;
};

type ApplyPlacementParameters = {
  readonly state: GameState;
  readonly pieceIndex: number;
  readonly row: number;
  readonly col: number;
};

type ApplyPlacementResult = {
  readonly state: GameState;
  readonly scoreDelta: number;
  readonly linesCleared: number;
  readonly clearedCells: ReadonlyArray<Cell>;
  readonly placedBoard: Board;
};

type ClearLinesResult = {
  readonly board: Board;
  readonly linesCleared: number;
};

const TILES: ReadonlyArray<Tile> = [0, 1, 2, 3];

const SHAPES: ReadonlyArray<ReadonlyArray<PieceCell>> = [
  [{ dr: 0, dc: 0 }],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 1, dc: 0 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: 2 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 2, dc: 0 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: 2 },
    { dr: 0, dc: 3 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 2, dc: 0 },
    { dr: 3, dc: 0 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: 2 },
    { dr: 1, dc: 0 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: 2 },
    { dr: 1, dc: 1 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: 2 },
  ],
  [
    { dr: 0, dc: 1 },
    { dr: 0, dc: 2 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: 2 },
    { dr: 0, dc: 3 },
    { dr: 0, dc: 4 },
  ],
  [
    { dr: 0, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: 2 },
    { dr: 1, dc: 0 },
    { dr: 2, dc: 0 },
  ],
];

const cloneBoard = (board: Board): number[][] => {
  return board.map((row) => [...row]);
};

const randomTile = (random: RandomFn): Tile => {
  const index = Math.floor(random() * TILES.length);
  return TILES[index] ?? 0;
};

const randomShape = (random: RandomFn): ReadonlyArray<PieceCell> => {
  const index = Math.floor(random() * SHAPES.length);
  return SHAPES[index] ?? SHAPES[0]!;
};

export const createPiece = (random: RandomFn = Math.random): Piece => {
  return {
    cells: randomShape(random),
    tile: randomTile(random),
  };
};

export const createTray = (random: RandomFn = Math.random): ReadonlyArray<Piece> => {
  return Array.from({ length: TRAY_SIZE }, () => createPiece(random));
};

export const createEmptyBoard = (): Board => {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => EMPTY),
  );
};

export const createGameState = (random: RandomFn = Math.random): GameState => {
  return {
    board: createEmptyBoard(),
    tray: createTray(random),
  };
};

export const canPlace = ({ board, piece, row, col }: PlacementParameters) => {
  for (const cell of piece.cells) {
    const targetRow = row + cell.dr;
    const targetCol = col + cell.dc;
    if (targetRow < 0 || targetRow >= BOARD_SIZE || targetCol < 0 || targetCol >= BOARD_SIZE) {
      return false;
    }
    if (board[targetRow]?.[targetCol] !== EMPTY) {
      return false;
    }
  }
  return true;
};

const placeOnBoard = ({ board, piece, row, col }: PlacementParameters): Board => {
  const next = cloneBoard(board);
  for (const cell of piece.cells) {
    const targetRow = row + cell.dr;
    const targetCol = col + cell.dc;
    next[targetRow]![targetCol] = piece.tile;
  }
  return next;
};

const findFullLines = (board: Board) => {
  const rows: number[] = [];
  const cols: number[] = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (board[row]?.every((cell) => cell !== EMPTY)) {
      rows.push(row);
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let full = true;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      if (board[row]?.[col] === EMPTY) {
        full = false;
        break;
      }
    }
    if (full) {
      cols.push(col);
    }
  }

  return { rows, cols };
};

export const clearLines = (board: Board): ClearLinesResult => {
  const { rows, cols } = findFullLines(board);
  if (rows.length === 0 && cols.length === 0) {
    return { board, linesCleared: 0 };
  }

  const next = cloneBoard(board);
  for (const row of rows) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      next[row]![col] = EMPTY;
    }
  }
  for (const col of cols) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      next[row]![col] = EMPTY;
    }
  }

  return { board: next, linesCleared: rows.length + cols.length };
};

export const scoreMove = (cellsPlaced: number, linesCleared: number) => {
  let score = cellsPlaced * SCORE_PER_CELL + linesCleared * SCORE_PER_LINE;
  if (linesCleared >= 2) {
    score = Math.round(score * COMBO_MULTIPLIER);
  }
  return score;
};

const refillTrayIfNeeded = (
  tray: ReadonlyArray<TraySlot>,
  random: RandomFn,
): ReadonlyArray<TraySlot> => {
  if (tray.some((slot) => slot !== null)) {
    return tray;
  }
  return createTray(random);
};

const findClearedCells = (before: Board, after: Board): ReadonlyArray<Cell> => {
  const cleared: Cell[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (before[row]?.[col] !== EMPTY && after[row]?.[col] === EMPTY) {
        cleared.push({ row, col });
      }
    }
  }
  return cleared;
};

export const applyPlacement = (
  { state, pieceIndex, row, col }: ApplyPlacementParameters,
  random: RandomFn = Math.random,
): ApplyPlacementResult | undefined => {
  const piece = state.tray[pieceIndex];
  if (piece === undefined || piece === null) {
    return undefined;
  }
  if (!canPlace({ board: state.board, piece, row, col })) {
    return undefined;
  }

  const placed = placeOnBoard({ board: state.board, piece, row, col });
  const cleared = clearLines(placed);
  const scoreDelta = scoreMove(piece.cells.length, cleared.linesCleared);
  const clearedCells = findClearedCells(placed, cleared.board);

  const nextTray = state.tray.map((slot, index) => (index === pieceIndex ? null : slot));
  const tray = refillTrayIfNeeded(nextTray, random);

  return {
    state: {
      board: cleared.board,
      tray,
    },
    scoreDelta,
    linesCleared: cleared.linesCleared,
    clearedCells,
    placedBoard: placed,
  };
};

export const hasValidMove = (state: GameState) => {
  for (const piece of state.tray) {
    if (piece === null) {
      continue;
    }
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (canPlace({ board: state.board, piece, row, col })) {
          return true;
        }
      }
    }
  }
  return false;
};

export const isGameOver = (state: GameState) => {
  return !hasValidMove(state);
};

const countEmptyInRow = (board: Board, row: number) => {
  let emptyCount = 0;
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    if (board[row]?.[col] === EMPTY) {
      emptyCount += 1;
    }
  }
  return emptyCount;
};

const countEmptyInCol = (board: Board, col: number) => {
  let emptyCount = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (board[row]?.[col] === EMPTY) {
      emptyCount += 1;
    }
  }
  return emptyCount;
};

export const nearFullCells = (board: Board): ReadonlyArray<Cell> => {
  const highlighted = new Set<string>();

  const markEmptyInRow = (row: number) => {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row]?.[col] === EMPTY) {
        highlighted.add(`${row},${col}`);
      }
    }
  };

  const markEmptyInCol = (col: number) => {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      if (board[row]?.[col] === EMPTY) {
        highlighted.add(`${row},${col}`);
      }
    }
  };

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const emptyCount = countEmptyInRow(board, row);
    if (emptyCount >= 1 && emptyCount <= 2) {
      markEmptyInRow(row);
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const emptyCount = countEmptyInCol(board, col);
    if (emptyCount >= 1 && emptyCount <= 2) {
      markEmptyInCol(col);
    }
  }

  return Array.from(highlighted).map((key) => {
    const [rowText, colText] = key.split(",");
    return { row: Number(rowText), col: Number(colText) };
  });
};

export const pieceAnchorCells = (piece: Piece, row: number, col: number): ReadonlyArray<Cell> => {
  return piece.cells.map((cell) => ({
    row: row + cell.dr,
    col: col + cell.dc,
  }));
};
