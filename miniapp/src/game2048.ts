import { submitGameScore } from "./api.ts";
import "./game2048.css";

const SLUG = "game2048";
const SIZE = 4;

type Board = number[][];

type RenderGame2048Parameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));

const cloneBoard = (board: Board): Board => board.map((row) => [...row]);

const randomEmptyCell = (board: Board) => {
  const cells: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row]![col] === 0) {
        cells.push({ row, col });
      }
    }
  }
  if (cells.length === 0) {
    return null;
  }
  return cells[Math.floor(Math.random() * cells.length)]!;
};

const spawnTile = (board: Board) => {
  const cell = randomEmptyCell(board);
  if (cell === null) {
    return;
  }
  board[cell.row]![cell.col] = Math.random() < 0.9 ? 2 : 4;
};

const slideLine = (line: number[]) => {
  const filtered = line.filter((value) => value > 0);
  const merged: number[] = [];
  let scoreDelta = 0;
  for (let index = 0; index < filtered.length; index += 1) {
    const current = filtered[index]!;
    const next = filtered[index + 1];
    if (next !== undefined && current === next) {
      const mergedValue = current * 2;
      merged.push(mergedValue);
      scoreDelta += mergedValue;
      index += 1;
    } else {
      merged.push(current);
    }
  }
  while (merged.length < SIZE) {
    merged.push(0);
  }
  return { line: merged, scoreDelta, changed: merged.some((value, i) => value !== line[i]) };
};

const moveBoard = (board: Board, direction: "up" | "down" | "left" | "right") => {
  const next = cloneBoard(board);
  let scoreDelta = 0;
  let changed = false;
  const readLine = (index: number) => {
    if (direction === "left") {
      return next[index]!;
    }
    if (direction === "right") {
      return [...next[index]!].reverse();
    }
    if (direction === "up") {
      return next.map((row) => row[index]!);
    }
    return next.map((row) => row[index]!).reverse();
  };
  const writeLine = (index: number, line: number[]) => {
    if (direction === "left") {
      next[index] = line;
      return;
    }
    if (direction === "right") {
      next[index] = [...line].reverse();
      return;
    }
    if (direction === "up") {
      for (let row = 0; row < SIZE; row += 1) {
        next[row]![index] = line[row]!;
      }
      return;
    }
    const reversed = [...line].reverse();
    for (let row = 0; row < SIZE; row += 1) {
      next[row]![index] = reversed[row]!;
    }
  };
  for (let index = 0; index < SIZE; index += 1) {
    const result = slideLine(readLine(index));
    scoreDelta += result.scoreDelta;
    changed ||= result.changed;
    writeLine(index, result.line);
  }
  return { board: next, scoreDelta, changed };
};

const canMove = (board: Board) => {
  for (const direction of ["up", "down", "left", "right"] as const) {
    if (moveBoard(board, direction).changed) {
      return true;
    }
  }
  return false;
};

const tileLabel = (value: number) => {
  if (value <= 64) {
    return String(value);
  }
  if (value <= 512) {
    return "Друзья";
  }
  if (value <= 2048) {
    return "Уголь";
  }
  return String(value);
};

export const renderGame2048 = ({ root, onBack }: RenderGame2048Parameters) => {
  const sessionStartedAt = new Date();
  let board = emptyBoard();
  let score = 0;
  let finished = false;
  spawnTile(board);
  spawnTile(board);

  let scoreElement: HTMLElement | undefined;
  let boardElement: HTMLElement | undefined;

  const syncBoard = () => {
    if (boardElement === undefined) {
      return;
    }
    boardElement.innerHTML = "";
    for (const row of board) {
      for (const value of row) {
        const cell = document.createElement("div");
        cell.className = "game2048-cell";
        if (value > 0) {
          cell.dataset.value = String(value);
          cell.textContent = tileLabel(value);
        }
        boardElement.append(cell);
      }
    }
    if (scoreElement !== undefined) {
      scoreElement.textContent = String(score);
    }
  };

  const finishGame = async (won: boolean) => {
    if (finished) {
      return;
    }
    finished = true;
    const panel = document.createElement("div");
    panel.className = "game2048-done panel";
    panel.innerHTML = `<p>${won ? "2048! Отличная партия" : "Ходы закончились"}</p><p class="status">Отправка очков…</p>`;
    root.append(panel);
    const status = panel.querySelector(".status");
    if (score < 1) {
      panel.querySelector(".status")!.textContent = "Нет очков для отправки";
      return;
    }
    const result = await submitGameScore({
      slug: SLUG,
      points: score,
      sessionStartedAt,
      sessionEndedAt: new Date(),
    });
    if (status instanceof HTMLElement) {
      status.textContent =
        result.kind === "error"
          ? result.message
          : result.data.counted
            ? `Очки отправлены: ${score}`
            : "Тренировочная партия";
      if (result.kind === "error") {
        status.classList.add("error");
      }
    }
    const actions = document.createElement("div");
    actions.className = "game2048-done-actions";
    actions.innerHTML =
      '<button type="button" data-restart>Играть снова</button><button type="button" class="secondary" data-back>К таблице</button>';
    panel.append(actions);
    actions.querySelector("[data-restart]")?.addEventListener("click", () => {
      renderGame2048({ root, onBack });
    });
    actions.querySelector("[data-back]")?.addEventListener("click", onBack);
  };

  const handleMove = (direction: "up" | "down" | "left" | "right") => {
    if (finished) {
      return;
    }
    const moved = moveBoard(board, direction);
    if (!moved.changed) {
      return;
    }
    board = moved.board;
    score += moved.scoreDelta;
    spawnTile(board);
    syncBoard();
    if (board.flat().includes(2048)) {
      void finishGame(true);
      return;
    }
    if (!canMove(board)) {
      void finishGame(false);
    }
  };

  root.innerHTML = `
    <header class="game2048-header">
      <button type="button" class="game2048-back" data-back aria-label="Назад">←</button>
      <div>
        <h1>2048</h1>
        <p class="muted">Соберите «Уголь» — тема «Друзья»</p>
      </div>
    </header>
    <div class="game2048-hud panel">
      <div class="game2048-stat"><span class="muted">Очки</span><div data-score>0</div></div>
      <div class="game2048-stat"><span class="muted">Лучшая плитка</span><div data-best>—</div></div>
    </div>
    <div class="game2048-board" data-board></div>
  `;

  scoreElement = root.querySelector("[data-score]") ?? undefined;
  boardElement = root.querySelector("[data-board]") ?? undefined;
  root.querySelector("[data-back]")?.addEventListener("click", onBack);

  syncBoard();

  let touchStartX = 0;
  let touchStartY = 0;
  boardElement?.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      if (touch === undefined) {
        return;
      }
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true },
  );
  boardElement?.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (touch === undefined) {
      return;
    }
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      handleMove(dx > 0 ? "right" : "left");
      return;
    }
    handleMove(dy > 0 ? "down" : "up");
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") handleMove("up");
    if (event.key === "ArrowDown") handleMove("down");
    if (event.key === "ArrowLeft") handleMove("left");
    if (event.key === "ArrowRight") handleMove("right");
  });
};
