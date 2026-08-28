import { expect, test } from "vitest";
import {
  applyPlacement,
  canPlace,
  clearLines,
  createEmptyBoard,
  createGameState,
  createPiece,
  hasValidMove,
  isGameOver,
  nearFullCells,
  scoreMove,
} from "../../src/domain/block-blast.ts";

test("createEmptyBoard is 8x8 with empty cells", () => {
  const board = createEmptyBoard();
  expect(board).toHaveLength(8);
  expect(board.every((row) => row.length === 8)).toBe(true);
  expect(board.flat().every((cell) => cell === -1)).toBe(true);
});

test("canPlace rejects out of bounds and occupied cells", () => {
  const board = createEmptyBoard();
  const piece = createPiece(() => 0);
  expect(canPlace({ board, piece, row: 0, col: 0 })).toBe(true);
  expect(canPlace({ board, piece, row: 7, col: 7 })).toBe(true);
  expect(canPlace({ board, piece, row: 8, col: 0 })).toBe(false);

  const occupied = board.map((row, rowIndex) =>
    row.map((cell, colIndex) => (rowIndex === 0 && colIndex === 0 ? 0 : cell)),
  );
  expect(canPlace({ board: occupied, piece, row: 0, col: 0 })).toBe(false);
});

test("clearLines removes full rows and columns", () => {
  const board = createEmptyBoard().map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (rowIndex === 0 || colIndex === 0) {
        return 0;
      }
      return cell;
    }),
  );
  const { board: next, linesCleared } = clearLines(board);
  expect(linesCleared).toBe(2);
  expect(next[0]?.every((cell) => cell === -1)).toBe(true);
  expect(next.every((row) => row[0] === -1)).toBe(true);
});

test("scoreMove applies combo multiplier for multiple lines", () => {
  expect(scoreMove(4, 0)).toBe(40);
  expect(scoreMove(4, 1)).toBe(140);
  expect(scoreMove(4, 2)).toBe(Math.round(240 * 1.5));
});

test("applyPlacement marks used tray slot null", () => {
  const state = {
    board: createEmptyBoard(),
    tray: [createPiece(() => 0), createPiece(() => 0), null] as const,
  };
  const result = applyPlacement(
    { state, pieceIndex: 0, row: 0, col: 0 },
    () => 0.5,
  );
  expect(result).toBeDefined();
  expect(result!.scoreDelta).toBeGreaterThan(0);
  expect(result!.state.tray[0]).toBeNull();
  expect(result!.state.tray[1]).not.toBeNull();
});

test("applyPlacement refills tray when all pieces used", () => {
  const piece = createPiece(() => 0);
  let state = {
    board: createEmptyBoard(),
    tray: [piece, piece, piece] as const,
  };
  const first = applyPlacement({ state, pieceIndex: 0, row: 0, col: 0 }, () => 0.1);
  expect(first).toBeDefined();
  state = first!.state;
  const second = applyPlacement({ state, pieceIndex: 1, row: 0, col: 1 }, () => 0.2);
  expect(second).toBeDefined();
  state = second!.state;
  const third = applyPlacement({ state, pieceIndex: 2, row: 0, col: 2 }, () => 0.3);
  expect(third).toBeDefined();
  expect(third!.state.tray.every((slot) => slot !== null)).toBe(true);
});

test("isGameOver when no piece fits", () => {
  const piece = {
    cells: [
      { dr: 0, dc: 0 },
      { dr: 0, dc: 1 },
      { dr: 0, dc: 2 },
      { dr: 0, dc: 3 },
      { dr: 0, dc: 4 },
    ] as const,
    tile: 0 as const,
  };
  const board = createEmptyBoard().map((row) => row.map(() => 1));
  const state = { board, tray: [piece] };
  expect(hasValidMove(state)).toBe(false);
  expect(isGameOver(state)).toBe(true);
});

test("createGameState starts with empty board and three pieces", () => {
  const state = createGameState(() => 0);
  expect(state.board.flat().every((cell) => cell === -1)).toBe(true);
  expect(state.tray).toHaveLength(3);
  expect(state.tray.every((piece) => piece !== null)).toBe(true);
});

test("nearFullCells highlights empty cells in rows and columns with 1-2 gaps", () => {
  const board = createEmptyBoard().map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (rowIndex === 0 && colIndex < 7) {
        return 0;
      }
      if (colIndex === 1 && rowIndex < 6) {
        return 1;
      }
      return cell;
    }),
  );

  const cells = nearFullCells(board);
  expect(cells).toContainEqual({ row: 0, col: 7 });
  expect(cells).toContainEqual({ row: 6, col: 1 });
  expect(cells).toContainEqual({ row: 7, col: 1 });
  expect(cells).not.toContainEqual({ row: 3, col: 3 });
});
