import {
  applyPlacement,
  createGameState,
  isGameOver,
  type GameState,
} from "../../src/domain/block-blast.ts";
import { submitGameScore } from "./api.ts";
import { createBlockBlastBoard } from "./block-blast-board.ts";
import { bindBlockBlastGestures } from "./block-blast-gestures.ts";
import { hapticImpact } from "./telegram.ts";
import "./block-blast.css";

const BLOCK_BLAST_SLUG = "blockblast";

type RenderBlockBlastParameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

const rankForScore = (points: number) => {
  if (points >= 500) {
    return "Отлично!";
  }
  if (points >= 200) {
    return "Неплохо!";
  }
  return "Попробуйте ещё";
};

const animateCountUp = (
  element: HTMLElement,
  from: number,
  to: number,
  durationMs: number,
) => {
  return new Promise<void>((resolve) => {
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const value = Math.round(from + (to - from) * progress);
      element.textContent = String(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }
      resolve();
    };
    requestAnimationFrame(tick);
  });
};

export const renderBlockBlast = ({ root, onBack }: RenderBlockBlastParameters) => {
  let state: GameState = createGameState();
  let score = 0;
  let finished = false;
  let busy = false;

  let scoreElement: HTMLElement | undefined;
  let comboElement: HTMLElement | undefined;
  let statusElement: HTMLElement | undefined;
  let boardHost: HTMLElement | undefined;
  let boardApi = createBlockBlastBoard(document.createElement("div"));
  let unbindGestures = () => {};

  const setStatus = (message: string) => {
    if (statusElement !== undefined) {
      statusElement.textContent = message;
    }
  };

  const showCombo = (linesCleared: number) => {
    if (comboElement === undefined || linesCleared < 2) {
      return;
    }
    comboElement.hidden = false;
    comboElement.textContent = `Комбо x${linesCleared}!`;
    comboElement.classList.remove("bb-combo-pop");
    void comboElement.offsetWidth;
    comboElement.classList.add("bb-combo-pop");
    window.setTimeout(() => {
      if (comboElement !== undefined) {
        comboElement.hidden = true;
      }
    }, 900);
  };

  const updateHud = (scoreBump = false) => {
    if (scoreElement === undefined) {
      return;
    }
    scoreElement.textContent = String(score);
    if (scoreBump) {
      scoreElement.classList.remove("bb-score-bump");
      void scoreElement.offsetWidth;
      scoreElement.classList.add("bb-score-bump");
    }
  };

  const bindBackButtons = (handler: () => void) => {
    for (const back of root.querySelectorAll("[data-back]")) {
      if (back instanceof HTMLButtonElement) {
        back.addEventListener("click", handler);
      }
    }
  };

  const finishGame = async () => {
    finished = true;
    boardApi.setBusy(true);
    const rank = rankForScore(score);

    if (score < 1) {
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="bb-done panel">
          <p class="muted">Нет очков для отправки</p>
          <div class="bb-done-actions">
            <button type="button" data-restart>Играть снова</button>
            <button type="button" class="secondary" data-back>К играм</button>
          </div>
        </div>`,
      );
      bindBackButtons(onBack);
      const restart = root.querySelector("[data-restart]");
      if (restart instanceof HTMLButtonElement) {
        restart.addEventListener("click", () => {
          unbindGestures();
          renderBlockBlast({ root, onBack });
        });
      }
      return;
    }

    const done = document.createElement("div");
    done.className = "bb-done panel";
    const rankLine = document.createElement("p");
    rankLine.className = "bb-rank";
    rankLine.textContent = rank;
    const status = document.createElement("p");
    status.className = "status";
    status.textContent = "Отправка очков…";
    const actions = document.createElement("div");
    actions.className = "bb-done-actions";
    actions.hidden = true;
    const restart = document.createElement("button");
    restart.type = "button";
    restart.dataset.restart = "true";
    restart.textContent = "Играть снова";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "secondary";
    back.dataset.back = "true";
    back.textContent = "К играм";
    actions.append(restart, back);
    done.append(rankLine, status, actions);
    root.append(done);

    const display = document.createElement("p");
    display.className = "bb-final-score";
    display.textContent = "0";
    status.replaceWith(display);
    await animateCountUp(display, 0, score, 400);

    const result = await submitGameScore({ slug: BLOCK_BLAST_SLUG, points: score });
    const resultLine = document.createElement("p");
    resultLine.className = "status";
    if (result.kind === "error") {
      resultLine.textContent = result.message;
      resultLine.classList.add("error");
    } else if (!result.data.counted) {
      resultLine.textContent = "Тренировочная партия — очки не засчитаны";
    } else {
      resultLine.textContent = `Очки отправлены: ${score}`;
    }
    display.insertAdjacentElement("afterend", resultLine);
    actions.hidden = false;

    restart.addEventListener("click", () => {
      unbindGestures();
      renderBlockBlast({ root, onBack });
    });
    bindBackButtons(onBack);
  };

  const attemptPlace = async (pieceIndex: number, row: number, col: number) => {
    if (finished || busy) {
      return;
    }

    busy = true;
    boardApi.setBusy(true);
    boardApi.setSelectedPiece(undefined);
    boardApi.setGhost(undefined, true);
    setStatus("");

    try {
      const piece = state.tray[pieceIndex];
      if (piece === null || piece === undefined) {
        return;
      }

      const result = applyPlacement({ state, pieceIndex, row, col });
      if (result === undefined) {
        boardApi.shakeTrayPiece(pieceIndex);
        hapticImpact("light");
        setStatus("Сюда фигура не помещается");
        return;
      }

      hapticImpact(result.linesCleared >= 2 ? "medium" : "light");
      showCombo(result.linesCleared);

      if (result.clearedCells.length > 0) {
        boardApi.sync({ board: result.placedBoard, tray: state.tray });
        await boardApi.animateLineClear(result.clearedCells);
      }

      state = result.state;
      score += result.scoreDelta;
      boardApi.sync(state);
      updateHud(true);

      if (isGameOver(state)) {
        setStatus("Больше некуда поставить — партия окончена");
        void finishGame();
      }
    } finally {
      busy = false;
      boardApi.setBusy(false);
    }
  };

  const mount = () => {
    root.innerHTML = `
      <header class="bb-header">
        <button type="button" class="bb-back" data-back aria-label="Назад">←</button>
        <div>
          <h1>Блоки</h1>
          <p class="muted bb-hint">Перетащите или выберите фигуру и нажмите на поле</p>
        </div>
      </header>
      <div class="bb-hud panel">
        <div class="bb-stat">
          <span class="bb-stat-label">Очки</span>
          <span class="bb-stat-value" data-score aria-live="polite">0</span>
        </div>
      </div>
      <div class="bb-combo" data-combo hidden></div>
      <div class="bb-board-host" data-board-host></div>
      <p data-status class="status"></p>
    `;

    scoreElement = root.querySelector("[data-score]") ?? undefined;
    comboElement = root.querySelector("[data-combo]") ?? undefined;
    statusElement = root.querySelector("[data-status]") ?? undefined;
    boardHost = root.querySelector("[data-board-host]") ?? undefined;
    if (boardHost === undefined) {
      return;
    }

    bindBackButtons(onBack);
    boardApi = createBlockBlastBoard(boardHost);
    boardApi.sync(state);
    updateHud();

    unbindGestures = bindBlockBlastGestures({
      boardApi,
      getState: () => state,
      getBusy: () => busy || finished,
      onPlace: ({ pieceIndex, row, col }) => {
        void attemptPlace(pieceIndex, row, col);
      },
      onInvalid: () => {
        hapticImpact("light");
      },
    });
  };

  mount();
};
