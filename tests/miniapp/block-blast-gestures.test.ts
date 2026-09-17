import { expect, test } from "vitest";
import {
  computeDragOffsetY,
  dragPlacementFromFinger,
  resolveDragRelease,
} from "../../miniapp/src/block-blast-gestures.ts";
import { DRAG_GHOST_MAX_PX } from "../../miniapp/src/block-blast-board.ts";
import { BOARD_SIZE, type Board, type Piece } from "../../src/domain/block-blast.ts";

const piece = (cells: Piece["cells"], tile = 0): Piece => {
  return { cells, tile };
};

const BOARD = { left: 0, top: 0, width: 320 } as const;
const CELL = 40;
const EMPTY_OCCUPANCY: Board = Array.from({ length: BOARD_SIZE }, () =>
  Array.from({ length: BOARD_SIZE }, () => -1),
);
const SINGLE = piece([{ dr: 0, dc: 0 }]);
const TALL = piece([
  { dr: 0, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 2, dc: 0 },
]);

test("computeDragOffsetY is at least MIN_FINGER_OFFSET for tiny pieces", () => {
  expect(computeDragOffsetY(SINGLE)).toBeGreaterThanOrEqual(120);
});

test("computeDragOffsetY grows with piece height", () => {
  const small = computeDragOffsetY(SINGLE);
  const tall = computeDragOffsetY(TALL);
  expect(tall).toBeGreaterThan(small);
});

test("drag placement uses the copy above the finger, not the cell under the finger", () => {
  const fingerX = CELL * 3.5;
  const fingerY = CELL * 7.5;
  const placement = dragPlacementFromFinger({
    clientX: fingerX,
    clientY: fingerY,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.origin).toBeDefined();
  expect(placement.origin?.row).toBeLessThan(7);
  expect(placement.origin?.col).toBe(3);
});

test("finger below the board can still place on the last rows", () => {
  const offsetY = computeDragOffsetY(SINGLE);
  const fingerY = BOARD.top + 8 * CELL + offsetY - CELL / 2;
  const placement = dragPlacementFromFinger({
    clientX: CELL * 4.5,
    clientY: fingerY,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.origin).toEqual({ row: 7, col: 4 });
});

test("tall piece with finger below the board occupies the last rows", () => {
  const offsetY = computeDragOffsetY(TALL);
  const fingerY = BOARD.top + 8 * CELL + offsetY - CELL / 2;
  const placement = dragPlacementFromFinger({
    clientX: CELL * 1.5,
    clientY: fingerY,
    piece: TALL,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.origin).toEqual({ row: 5, col: 1 });
});

test("placement origin snaps to whole cells", () => {
  const first = dragPlacementFromFinger({
    clientX: CELL * 2.1,
    clientY: CELL * 6.1,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });
  const second = dragPlacementFromFinger({
    clientX: CELL * 2.4,
    clientY: CELL * 6.4,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(first.origin).toBeDefined();
  expect(first.origin).toEqual(second.origin);
});

test("drag ghost stays visible and snaps to the placement origin over the board", () => {
  const fingerX = CELL * 3.5;
  const fingerY = CELL * 6.5;
  const placement = dragPlacementFromFinger({
    clientX: fingerX,
    clientY: fingerY,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.origin).toBeDefined();
  const origin = placement.origin;
  if (origin === undefined) {
    throw new Error("expected snap origin");
  }
  expect(placement.css.left).toBe(BOARD.left + (origin.col + 0.5) * CELL);
  expect(placement.css.top).toBe(BOARD.top + (origin.row + 1) * CELL);
});

test("over the board the dragged copy matches board cell size and hides the second preview", () => {
  const placement = dragPlacementFromFinger({
    clientX: CELL * 3.5,
    clientY: CELL * 6.5,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.mode).toBe("snap");
  expect(placement.ghostCellSize).toBe(CELL);
  expect(placement.showBoardGhost).toBe(false);
});

test("tall piece over the board still uses board cell size for the dragged copy", () => {
  const offsetY = computeDragOffsetY(TALL);
  const placement = dragPlacementFromFinger({
    clientX: CELL * 1.5,
    clientY: CELL * 6 + offsetY,
    piece: TALL,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.mode).toBe("snap");
  expect(placement.ghostCellSize).toBe(CELL);
  expect(placement.showBoardGhost).toBe(false);
});

test("away from the board the dragged copy stays tray-sized and follows the finger", () => {
  const placement = dragPlacementFromFinger({
    clientX: CELL * 3.5,
    clientY: 900,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.mode).toBe("follow");
  expect(placement.origin).toBeUndefined();
  expect(placement.ghostCellSize).toBe(DRAG_GHOST_MAX_PX);
  expect(placement.showBoardGhost).toBe(false);
  expect(placement.css.left).toBe(CELL * 3.5);
});

test("far below the board does not snap when the copy misses the grid", () => {
  const placement = dragPlacementFromFinger({
    clientX: CELL * 3.5,
    clientY: 900,
    piece: SINGLE,
    board: BOARD,
    occupancy: EMPTY_OCCUPANCY,
  });

  expect(placement.origin).toBeUndefined();
});

test("tap without drag keeps the tray piece selected", () => {
  expect(resolveDragRelease({ dragMoved: false, origin: undefined })).toEqual({
    type: "select",
    ghost: "clear",
  });
});

test("drag release without a snap origin returns the piece to the tray", () => {
  expect(resolveDragRelease({ dragMoved: true, origin: undefined })).toEqual({
    type: "return",
    ghost: "clear",
  });
});

test("drag release places when the copy is still on the board", () => {
  expect(
    resolveDragRelease({
      dragMoved: true,
      origin: { row: 7, col: 4 },
    }),
  ).toEqual({ type: "place", origin: { row: 7, col: 4 }, ghost: "defer" });
});

test("magnet snaps to a nearby valid cell when the rounded origin is blocked", () => {
  const occupancy = EMPTY_OCCUPANCY.map((row) => [...row]);
  const blocked = occupancy[3];
  if (blocked === undefined) {
    throw new Error("expected row");
  }
  blocked[2] = 0;
  const offsetY = computeDragOffsetY(SINGLE);
  const placement = dragPlacementFromFinger({
    clientX: CELL * 2.2,
    clientY: CELL * 4 + offsetY,
    piece: SINGLE,
    board: BOARD,
    occupancy,
  });
  expect(placement.origin).toEqual({ row: 3, col: 1 });
});

test("magnet does not place on an occupied cell", () => {
  const occupancy = EMPTY_OCCUPANCY.map((row) => [...row]);
  const blocked = occupancy[4];
  if (blocked === undefined) {
    throw new Error("expected row");
  }
  blocked[3] = 0;
  const offsetY = computeDragOffsetY(SINGLE);
  const placement = dragPlacementFromFinger({
    clientX: CELL * 3.5,
    clientY: CELL * 4.5 + offsetY,
    piece: SINGLE,
    board: BOARD,
    occupancy,
  });
  expect(placement.origin).not.toEqual({ row: 4, col: 3 });
});
