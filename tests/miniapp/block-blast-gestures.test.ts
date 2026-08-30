import { expect, test } from "vitest";
import { compensatedLookupY, computeDragOffsetY } from "../../miniapp/src/block-blast-gestures.ts";
import type { Piece } from "../../src/domain/block-blast.ts";

const piece = (cells: Piece["cells"], tile = 0): Piece => {
  return { cells, tile };
};

test("computeDragOffsetY is at least MIN_FINGER_OFFSET for tiny pieces", () => {
  expect(computeDragOffsetY(piece([{ dr: 0, dc: 0 }]))).toBeGreaterThanOrEqual(120);
});

test("computeDragOffsetY grows with piece height", () => {
  const small = computeDragOffsetY(piece([{ dr: 0, dc: 0 }]));
  const tall = computeDragOffsetY(
    piece([
      { dr: 0, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 2, dc: 0 },
    ]),
  );
  expect(tall).toBeGreaterThan(small);
});

test("compensatedLookupY shifts finger up during drag", () => {
  const single = piece([{ dr: 0, dc: 0 }]);
  const fingerY = 400;
  expect(compensatedLookupY(fingerY, single, true)).toBeLessThan(fingerY);
  expect(compensatedLookupY(fingerY, single, false)).toBe(fingerY);
});
