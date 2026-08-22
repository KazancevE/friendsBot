import { expect, test } from "vitest";
import {
  createBoard,
  resolveMatches,
  swapAdjacent,
  wouldMatch,
} from "../../src/domain/match3.ts";

test("clears three in a row and scores", () => {
  const board = [
    [0, 0, 0, 1],
    [2, 3, 1, 1],
    [2, 3, 2, 3],
    [1, 2, 3, 0],
  ];
  const { next, score } = resolveMatches(board);
  expect(score).toBeGreaterThan(0);
  expect(next).toHaveLength(4);
});

test("createBoard is 8x8 with tiles 0..3 and no opening matches", () => {
  const board = createBoard();
  expect(board).toHaveLength(8);
  expect(board.every((row) => row.length === 8)).toBe(true);
  expect(board.flat().every((tile) => tile >= 0 && tile <= 3)).toBe(true);
  expect(resolveMatches(board, () => 0).score).toBe(0);
});

test("wouldMatch is true for an adjacent swap that makes three in a row", () => {
  const board = [
    [0, 1, 0, 0],
    [2, 3, 1, 1],
    [2, 3, 2, 3],
    [1, 2, 3, 0],
  ];
  expect(
    wouldMatch({
      board,
      from: { row: 0, col: 0 },
      to: { row: 0, col: 1 },
    }),
  ).toBe(true);
  expect(
    wouldMatch({
      board,
      from: { row: 0, col: 0 },
      to: { row: 1, col: 1 },
    }),
  ).toBe(false);
});

test("swapAdjacent swaps neighbors and ignores diagonals", () => {
  const board = [
    [0, 1],
    [2, 3],
  ];
  expect(
    swapAdjacent({
      board,
      from: { row: 0, col: 0 },
      to: { row: 0, col: 1 },
    }),
  ).toEqual([
    [1, 0],
    [2, 3],
  ]);
  expect(
    swapAdjacent({
      board,
      from: { row: 0, col: 0 },
      to: { row: 1, col: 1 },
    }),
  ).toBeUndefined();
});
