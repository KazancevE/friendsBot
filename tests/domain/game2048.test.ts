import { expect, test } from "vitest";
import {
  canMove,
  createEmptyBoard,
  hasWinningTile,
  moveBoard,
  spawnTile,
} from "../../src/domain/game2048.ts";

test("createEmptyBoard uses the requested size", () => {
  expect(createEmptyBoard(5)).toHaveLength(5);
  expect(createEmptyBoard(5).every((row) => row.length === 5)).toBe(true);
  expect(createEmptyBoard(8)).toHaveLength(8);
});

test("moveBoard slides and merges on a 5x5 field", () => {
  const board = createEmptyBoard(5);
  const row = board[0];
  if (row === undefined) {
    throw new Error("expected first row");
  }
  row[0] = 2;
  row[1] = 2;
  const moved = moveBoard({ board, direction: "left" });
  expect(moved.changed).toBe(true);
  expect(moved.scoreDelta).toBe(4);
  expect(moved.board[0]?.[0]).toBe(4);
});

test("hasWinningTile is true only for 2048", () => {
  const board = createEmptyBoard(4);
  expect(hasWinningTile(board)).toBe(false);
  const row = board[0];
  if (row === undefined) {
    throw new Error("expected first row");
  }
  row[0] = 2048;
  expect(hasWinningTile(board)).toBe(true);
});

test("canMove is false on a locked board", () => {
  const board = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  expect(canMove(board)).toBe(false);
});

test("moveBoard reports slide origins for animation", () => {
  const board = createEmptyBoard(4);
  const row = board[0];
  if (row === undefined) {
    throw new Error("expected first row");
  }
  row[3] = 2;
  const moved = moveBoard({ board, direction: "left" });
  expect(moved.shifts).toContainEqual({
    fromRow: 0,
    fromCol: 3,
    toRow: 0,
    toCol: 0,
    merged: false,
  });
});

test("spawnTile fills an empty cell with 2 or 4", () => {
  const board = createEmptyBoard(4);
  spawnTile({ board, random: () => 0 });
  const filled = board.flat().filter((value) => value > 0);
  expect(filled).toEqual([2]);
});
