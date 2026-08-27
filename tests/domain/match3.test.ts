import { expect, test } from "vitest";
import {
  createBoard,
  resolveMatches,
  resolveMatchStep,
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

test("resolveMatchStep clears one horizontal match", () => {
  const board = [
    [0, 0, 0, 1],
    [2, 3, 1, 1],
    [2, 3, 2, 3],
    [1, 2, 3, 0],
  ];
  const step = resolveMatchStep(board, 1, () => 0);
  expect(step.scoreDelta).toBe(30);
  expect(step.matchedCells).toHaveLength(3);
  expect(step.matchedCells).toContainEqual({ row: 0, col: 0 });
});

test("resolveMatchStep sum equals resolveMatches score", () => {
  const board = [
    [0, 1, 0, 2],
    [0, 1, 0, 2],
    [2, 3, 1, 3],
    [1, 2, 3, 0],
  ];
  const swapped = swapAdjacent({
    board,
    from: { row: 0, col: 1 },
    to: { row: 0, col: 2 },
  });
  if (swapped === undefined) {
    throw new Error("expected swap");
  }
  let current = swapped;
  let total = 0;
  let cascade = 1;
  for (;;) {
    const step = resolveMatchStep(current, cascade, () => 0.5);
    total += step.scoreDelta;
    current = step.next;
    if (!step.hasMore) {
      break;
    }
    cascade += 1;
  }
  const resolved = resolveMatches(swapped, () => 0.5);
  expect(total).toBe(resolved.score);
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
