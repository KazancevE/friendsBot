# Match-3 Swipe & Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add flick + tap-tap gestures and juicy animated cascades to the match-3 Mini App without new dependencies.

**Architecture:** Domain gains `resolveMatchStep` for one cascade at a time; UI splits into board (FLIP/CSS), gestures (pointer events), and orchestrator. `resolveMatches` becomes a loop over steps to preserve existing behavior.

**Tech Stack:** TypeScript, vanilla DOM, CSS transitions/keyframes, Vitest

**Spec:** `docs/superpowers/specs/2026-08-28-match3-swipe-animations-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `src/domain/match3.ts` | `resolveMatchStep`, refactor `resolveMatches` |
| `tests/domain/match3.test.ts` | Step tests + equivalence with `resolveMatches` |
| `miniapp/src/match3-board.ts` | Create/sync tile DOM, run animations, FLIP |
| `miniapp/src/match3-gestures.ts` | Flick detection, tap-tap, busy lock |
| `miniapp/src/match3.ts` | Game state, move pipeline, finish screen |
| `miniapp/src/match3.css` | Animation classes, reduced-motion, touch-action |

---

### Task 1: `resolveMatchStep` in domain

**Files:**
- Modify: `src/domain/match3.ts`
- Test: `tests/domain/match3.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/domain/match3.test.ts`:

```typescript
test("resolveMatchStep clears one horizontal match", () => {
  const board = [
    [0, 0, 0, 1],
    [2, 3, 1, 1],
    [2, 3, 2, 3],
    [1, 2, 3, 0],
  ];
  const step = resolveMatchStep(board, 1, () => 0);
  expect(step.scoreDelta).toBe(90); // 3 tiles × 10 × cascade 1
  expect(step.matchedCells).toHaveLength(3);
  expect(step.matchedCells).toContainEqual({ row: 0, col: 0 });
  expect(step.hasMore).toBe(false);
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
  })!;
  let current = swapped;
  let total = 0;
  let cascade = 1;
  for (;;) {
    const step = resolveMatchStep(current, cascade, () => 0.5);
    total += step.scoreDelta;
    current = step.next;
    if (!step.hasMore) break;
    cascade += 1;
  }
  const resolved = resolveMatches(swapped, () => 0.5);
  expect(total).toBe(resolved.score);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/domain/match3.test.ts`
Expected: FAIL — `resolveMatchStep` is not defined

- [ ] **Step 3: Implement `resolveMatchStep` and refactor `resolveMatches`**

In `src/domain/match3.ts`, export:

```typescript
export type MatchStep = {
  readonly next: Board;
  readonly scoreDelta: number;
  readonly matchedCells: ReadonlyArray<{ readonly row: number; readonly col: number }>;
  readonly hasMore: boolean;
};

export const resolveMatchStep = (
  board: Board,
  cascadeIndex: number,
  random: RandomFn = Math.random,
): MatchStep => {
  const groups = findGroups(board);
  if (groups.length === 0) {
    return { next: board, scoreDelta: 0, matchedCells: [], hasMore: false };
  }
  const matchedCells = groups.flatMap((g) => [...g.cells]);
  let scoreDelta = 0;
  for (const group of groups) {
    scoreDelta += SCORE_PER_TILE * group.cells.length * cascadeIndex;
  }
  const next = cloneBoard(board);
  clearGroups(next, groups);
  applyGravity(next);
  refillTop(next, random);
  return {
    next,
    scoreDelta,
    matchedCells,
    hasMore: findGroups(next).length > 0,
  };
};
```

Refactor `resolveMatches` to loop `resolveMatchStep` with incrementing `cascadeIndex`.

- [ ] **Step 4: Run tests**

Run: `npm test tests/domain/match3.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/match3.ts tests/domain/match3.test.ts
git commit -m "feat: add resolveMatchStep for animated match-3 cascades"
```

---

### Task 2: Board module — stable DOM + animation helpers

**Files:**
- Create: `miniapp/src/match3-board.ts`
- Modify: `miniapp/src/match3.css`

- [ ] **Step 1: Add CSS animation primitives**

Extend `miniapp/src/match3.css`:

```css
.match3-board {
  touch-action: none;
  user-select: none;
}

.match3-tile {
  transition: transform 180ms ease-out, opacity 220ms ease-out;
  will-change: transform;
}

.match3-tile.selected {
  box-shadow: 0 0 0 2px var(--ember);
}

.match3-tile:active:not(.busy) {
  transform: scale(0.92);
}

.match3-tile.popping {
  transform: scale(1.2);
  opacity: 0;
}

.match3-board.shake {
  animation: match3-shake 120ms ease-in-out;
}

.match3-score-pop {
  position: absolute;
  pointer-events: none;
  color: var(--ember);
  font-weight: 700;
  animation: match3-score-float 600ms ease-out forwards;
}

@keyframes match3-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}

@keyframes match3-score-float {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-24px); }
}

@media (prefers-reduced-motion: reduce) {
  .match3-tile,
  .match3-board.shake,
  .match3-score-pop {
    transition: none !important;
    animation: none !important;
  }
}
```

- [ ] **Step 2: Create `match3-board.ts`**

Export `createMatch3Board(container: HTMLElement)` returning:

```typescript
type Match3Board = {
  sync(board: Board): void;
  getCellSize(): number;
  animateSwap(from: Cell, to: Cell): Promise<void>;
  animateRevert(from: Cell, to: Cell): Promise<void>;
  animatePop(cells: ReadonlyArray<Cell>, scoreDelta: number): Promise<void>;
  animateGravity(before: Board, after: Board): Promise<void>;
  setSelected(cell: Cell | undefined): void;
  setBusy(busy: boolean): void;
};
```

Implementation notes:
- On first `sync`, create 64 `<button class="match3-tile">` with `data-row`, `data-col`, emoji from tile value.
- On subsequent `sync`, update emoji text only when tile value changes at cell.
- `animateSwap`: translate both tiles by ±cellSize px, await `transitionend` (or timeout fallback 200ms).
- `animateRevert`: swap animation then reverse.
- `animatePop`: add `.popping` to matched cells, append `.match3-score-pop` with `+${scoreDelta}`, await 220ms.
- `animateGravity`: FLIP — for each tile whose `(row,col)` changed between `before` and `after`, measure delta Y, set transform, reflow, animate to 0. New tiles (refill) start with `translateY(-cellSize)` → 0.
- Use `requestAnimationFrame` + `Promise.all` for parallel tile animations.

- [ ] **Step 3: Manual smoke**

Build miniapp: `npm run build`. No automated test for DOM module in this plan.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/match3-board.ts miniapp/src/match3.css
git commit -m "feat: match3 board module with FLIP animation helpers"
```

---

### Task 3: Gestures module — flick + tap-tap

**Files:**
- Create: `miniapp/src/match3-gestures.ts`

- [ ] **Step 1: Create `match3-gestures.ts`**

Export:

```typescript
type GesturesParameters = {
  readonly grid: HTMLElement;
  readonly getBusy: () => boolean;
  readonly onTap: (cell: Cell) => void;
  readonly onFlick: (from: Cell, to: Cell) => void;
};

export const bindMatch3Gestures = (params: GesturesParameters): () => void;
```

Flick logic:
- Track `pointerId`, start cell, start `{x,y}`, start time on `pointerdown` (only if !busy).
- On `pointerup`: `dx = x - startX`, `dy = y - startY`.
- If `max(|dx|,|dy|) < cellSize * 0.3` and pointer didn't move much — treat as tap (delegate to tap handler with cell from target).
- Else snap to dominant axis → neighbor cell.
- Call `onFlick(from, to)`.
- `pointercancel` clears state.
- Return cleanup function removing listeners.

Tap-tap: `onTap` receives cell; orchestrator handles selection logic (not gestures module).

- [ ] **Step 2: Commit**

```bash
git add miniapp/src/match3-gestures.ts
git commit -m "feat: match3 flick and tap gesture handling"
```

---

### Task 4: Wire orchestrator — animated move pipeline

**Files:**
- Modify: `miniapp/src/match3.ts`

- [ ] **Step 1: Refactor `renderMatch3`**

Replace innerHTML-per-frame with:
1. Render static shell once (header, HUD, board container).
2. `const boardApi = createMatch3Board(gridEl)`.
3. `bindMatch3Gestures({ grid, getBusy: () => busy, onTap, onFlick })`.
4. Shared `attemptSwap(from, to)`:
   - if busy || finished → return
   - if !adjacent → return
   - busy = true, boardApi.setBusy(true)
   - if !wouldMatch → animateRevert, shake, busy=false
   - else: animateSwap → swapped board in memory → cascade loop:
     - resolveMatchStep → animatePop → sync + animateGravity
     - repeat while hasMore, cascadeIndex++
   - score += total, moves--, update HUD with bump class
   - busy = false
   - if moves <= 0 → finishGame()

5. Update hint text: «Свайпните или нажмите две соседние фишки».

- [ ] **Step 2: Animated finish screen**

In `finishGame`, animate score count-up (requestAnimationFrame, 400ms) before `submitGameScore`.

- [ ] **Step 3: Run domain tests + build**

Run: `npm test && npm run build`
Expected: all pass, build succeeds

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/match3.ts
git commit -m "feat: animated match-3 with flick gestures and juicy cascades"
```

---

### Task 5: Manual QA checklist

- [ ] Flick right/left/up/down works on mobile Telegram
- [ ] Tap-tap works on desktop
- [ ] Invalid swap reverts with shake, move not consumed
- [ ] Multi-cascade animates sequentially
- [ ] Game ends after 15 moves, score submits
- [ ] Reduced motion disables animations
