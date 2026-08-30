import {
  applyPlacement,
  createGameState,
  isGameOver,
  pieceAnchorCells,
  type GameState,
} from "../../src/domain/block-blast.ts";
import { createBlockBlastBoard } from "./block-blast-board.ts";
import { bindBlockBlastGestures } from "./block-blast-gestures.ts";
import { showGameOver } from "./game-over.ts";
import { fetchGameSkin } from "./theme-client.ts";
import { hapticImpact } from "./telegram.ts";
import "./block-blast.css";

const BLOCK_BLAST_SLUG = "blockblast";
const RANK_GOOD = 200;
const RANK_GREAT = 500;
const CONFETTI_MIN_SCORE = 500;

type RenderBlockBlastParameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

const rankForScore = (points: number) => {
  if (points >= RANK_GREAT) {
    return "Отлично!";
  }
  if (points >= RANK_GOOD) {
    return "Неплохо!";
  }
  return "Попробуйте ещё";
};

type RankProgress = {
  readonly label: string;
  readonly percent: number;
};

const rankProgressFor = (points: number): RankProgress => {
  if (points >= RANK_GREAT) {
    return { label: "Максимальный ранг!", percent: 100 };
  }
  if (points >= RANK_GOOD) {
    return {
      label: `До «Отлично!»: ${RANK_GREAT - points}`,
      percent: Math.round(((points - RANK_GOOD) / (RANK_GREAT - RANK_GOOD)) * 100),
    };
  }
  return {
    label: `До «Неплохо!»: ${RANK_GOOD - points}`,
    percent: Math.round((points / RANK_GOOD) * 100),
  };
};

const comboMessage = (linesCleared: number) => {
  if (linesCleared >= 4) {
    return `Невероятно! x${linesCleared}`;
  }
  if (linesCleared >= 3) {
    return `Отлично! x${linesCleared}`;
  }
  return `Комбо x${linesCleared}!`;
};

const comboTierClass = (linesCleared: number) => {
  if (linesCleared >= 4) {
    return "bb-combo--mega";
  }
  if (linesCleared >= 3) {
    return "bb-combo--great";
  }
  return "bb-combo--good";
};

const hapticForClear = (linesCleared: number) => {
  if (linesCleared >= 3) {
    hapticImpact("heavy");
    return;
  }
  if (linesCleared >= 2) {
    hapticImpact("medium");
    return;
  }
  hapticImpact("light");
};

export const renderBlockBlast = ({ root, onBack }: RenderBlockBlastParameters) => {
  const sessionStartedAt = new Date();
  let state: GameState = createGameState();
  let score = 0;
  let finished = false;
  let busy = false;

  let scoreElement: HTMLElement | undefined;
  let rankLabelElement: HTMLElement | undefined;
  let rankFillElement: HTMLElement | undefined;
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
    comboElement.textContent = comboMessage(linesCleared);
    comboElement.classList.remove(
      "bb-combo-pop",
      "bb-combo--good",
      "bb-combo--great",
      "bb-combo--mega",
    );
    comboElement.classList.add(comboTierClass(linesCleared));
    void comboElement.offsetWidth;
    comboElement.classList.add("bb-combo-pop");
    window.setTimeout(() => {
      if (comboElement !== undefined) {
        comboElement.hidden = true;
      }
    }, 900);
  };

  const updateRankProgress = () => {
    const progress = rankProgressFor(score);
    if (rankLabelElement !== undefined) {
      rankLabelElement.textContent = progress.label;
    }
    if (rankFillElement !== undefined) {
      rankFillElement.style.width = `${progress.percent}%`;
    }
  };

  const updateHud = (scoreBump = false) => {
    if (scoreElement === undefined) {
      return;
    }
    scoreElement.textContent = String(score);
    updateRankProgress();
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
    await showGameOver({
      root,
      slug: BLOCK_BLAST_SLUG,
      score,
      sessionStartedAt,
      headline: rankForScore(score),
      celebrate: score >= RANK_GREAT,
      confettiMinScore: CONFETTI_MIN_SCORE,
      onRestart: () => {
        unbindGestures();
        renderBlockBlast({ root, onBack });
      },
      onBack,
    });
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

      hapticForClear(result.linesCleared);
      showCombo(result.linesCleared);

      const placedCells = pieceAnchorCells(piece, row, col);
      boardApi.syncBoard(result.placedBoard);
      await boardApi.animatePlacement(placedCells);

      if (result.clearedCells.length > 0) {
        await boardApi.animateLineClear(
          result.clearedCells,
          result.scoreDelta,
          result.linesCleared,
        );
      }

      state = result.state;
      score += result.scoreDelta;
      boardApi.sync(state);
      updateHud(true);

      if (isGameOver(state)) {
        setStatus("Больше некуда поставить — партия окончена");
        await boardApi.animateGameOver();
        await finishGame();
      }
    } finally {
      busy = false;
      boardApi.setBusy(false);
    }
  };

  const mount = async () => {
    const skin = await fetchGameSkin(BLOCK_BLAST_SLUG);
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
        <div class="bb-rank-progress">
          <span class="bb-rank-progress-label" data-rank-label>До «Неплохо!»: 200</span>
          <div class="bb-rank-progress-track">
            <div class="bb-rank-progress-fill" data-rank-fill></div>
          </div>
        </div>
      </div>
      <div class="bb-combo" data-combo hidden></div>
      <div class="bb-board-host" data-board-host></div>
      <p data-status class="status"></p>
    `;

    scoreElement = root.querySelector("[data-score]") ?? undefined;
    rankLabelElement = root.querySelector("[data-rank-label]") ?? undefined;
    rankFillElement = root.querySelector("[data-rank-fill]") ?? undefined;
    comboElement = root.querySelector("[data-combo]") ?? undefined;
    statusElement = root.querySelector("[data-status]") ?? undefined;
    boardHost = root.querySelector("[data-board-host]") ?? undefined;
    if (boardHost === undefined) {
      return;
    }

    bindBackButtons(onBack);
    boardApi = createBlockBlastBoard(boardHost, { skin });
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

  void mount();
};
