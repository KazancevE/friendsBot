import { fetchLeaderboard, fetchOverallLeaderboard, submitGameScore } from "./api.ts";
import { hapticImpact } from "./telegram.ts";

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const animateCountUp = async (element: HTMLElement, from: number, to: number, ms: number) => {
  if (from >= to) {
    element.textContent = String(to);
    return;
  }
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / ms);
      const value = Math.round(from + (to - from) * progress);
      element.textContent = String(value);
      if (progress >= 1) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
};

const spawnConfetti = (root: HTMLElement) => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const layer = document.createElement("div");
  layer.className = "game-over-confetti";
  layer.setAttribute("aria-hidden", "true");
  const colors = ["#d4784a", "#f0a060", "#ffd080", "#68b878", "#5a9ad8", "#a888d8"];
  for (let index = 0; index < 36; index += 1) {
    const piece = document.createElement("span");
    piece.className = "game-over-confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length] ?? colors[0]!;
    piece.style.animationDelay = `${Math.random() * 400}ms`;
    piece.style.animationDuration = `${800 + Math.random() * 600}ms`;
    layer.append(piece);
  }
  root.append(layer);
  window.setTimeout(() => {
    layer.remove();
  }, 2200);
};

const bindActions = (panel: HTMLElement, onRestart: () => void, onBack: () => void) => {
  panel.querySelector("[data-restart]")?.addEventListener("click", onRestart);
  panel.querySelector("[data-back]")?.addEventListener("click", onBack);
};

const formatPlace = (place: number | null) => {
  if (place === null) {
    return "вне таблицы";
  }
  return `#${place}`;
};

export type ShowGameOverParams = {
  readonly root: HTMLElement;
  readonly slug: string;
  readonly score: number;
  readonly sessionStartedAt: Date;
  readonly headline?: string;
  readonly celebrate?: boolean;
  readonly confettiMinScore?: number;
  readonly onRestart: () => void;
  readonly onBack: () => void;
};

export const showGameOver = async ({
  root,
  slug,
  score,
  sessionStartedAt,
  headline,
  celebrate = false,
  confettiMinScore = 800,
  onRestart,
  onBack,
}: ShowGameOverParams) => {
  hapticImpact("medium");

  if (score < 1) {
    const panel = document.createElement("div");
    panel.className = "game-over panel";
    panel.innerHTML = `
      <p class="game-over-headline">Партия окончена</p>
      <p class="muted">Нет очков для отправки</p>
      <div class="game-over-actions">
        <button type="button" data-restart>Ещё раз</button>
        <button type="button" class="secondary" data-back>К хабу</button>
      </div>`;
    root.append(panel);
    bindActions(panel, onRestart, onBack);
    return;
  }

  const [prevGameBoard, prevOverallBoard] = await Promise.all([
    fetchLeaderboard(slug),
    fetchOverallLeaderboard(),
  ]);
  const previousGamePoints = prevGameBoard.kind === "ok" ? prevGameBoard.data.me.points : 0;
  const previousGamePlace = prevGameBoard.kind === "ok" ? prevGameBoard.data.me.place : null;
  const previousOverallPoints = prevOverallBoard.kind === "ok" ? prevOverallBoard.data.me.points : 0;

  const panel = document.createElement("div");
  panel.className = "game-over panel";
  if (celebrate) {
    panel.classList.add("game-over--celebrate");
  }
  panel.innerHTML = `
    ${headline !== undefined ? `<p class="game-over-headline">${escapeHtml(headline)}</p>` : ""}
    <p class="game-over-score" data-score>0</p>
    <p class="status" data-status>Отправка очков…</p>
    <div class="game-over-details" data-details hidden></div>
    <div class="game-over-actions" hidden data-actions>
      <button type="button" data-restart>Ещё раз</button>
      <button type="button" class="secondary" data-back>К хабу</button>
    </div>`;
  root.append(panel);

  const scoreElement = panel.querySelector("[data-score]");
  if (scoreElement instanceof HTMLElement) {
    await animateCountUp(scoreElement, 0, score, 420);
  }

  if (celebrate || score >= confettiMinScore) {
    spawnConfetti(root);
  }

  const result = await submitGameScore({
    slug,
    points: score,
    sessionStartedAt,
    sessionEndedAt: new Date(),
  });

  const [nextGameBoard, nextOverallBoard] = await Promise.all([
    fetchLeaderboard(slug),
    fetchOverallLeaderboard(),
  ]);

  const status = panel.querySelector("[data-status]");
  const details = panel.querySelector("[data-details]");
  const actions = panel.querySelector("[data-actions]");
  const lines: string[] = [];

  if (status instanceof HTMLElement) {
    status.className = "status";
    if (result.kind === "error") {
      status.textContent = result.message;
      status.classList.add("error");
    } else if (!result.data.counted) {
      status.textContent = "Тренировочная партия — очки не засчитаны";
    } else {
      status.textContent = `Очки сессии: ${score}`;
    }
  }

  if (result.kind === "ok" && result.data.counted) {
    const nextOverallPoints = nextOverallBoard.kind === "ok" ? nextOverallBoard.data.me.points : previousOverallPoints;
    const weeklyDelta = nextOverallPoints - previousOverallPoints;
    if (weeklyDelta > 0) {
      lines.push(`+${weeklyDelta} к недельному рейтингу`);
    }

    const nextGamePlace = nextGameBoard.kind === "ok" ? nextGameBoard.data.me.place : null;
    if (
      previousGamePlace !== null &&
      nextGamePlace !== null &&
      previousGamePlace !== nextGamePlace
    ) {
      lines.push(`Место в игре: ${formatPlace(previousGamePlace)} → ${formatPlace(nextGamePlace)}`);
    } else if (nextGameBoard.kind === "ok") {
      lines.push(`Место в игре: ${formatPlace(nextGameBoard.data.me.place)}`);
    }

    if (score > previousGamePoints) {
      lines.push("Новый рекорд недели!");
    }
  } else if (previousGamePoints > 0) {
    lines.push(`Ваш рекорд недели: ${Math.max(previousGamePoints, score)}`);
  }

  if (details instanceof HTMLElement) {
    if (lines.length > 0) {
      details.innerHTML = lines.map((line) => `<p class="game-over-detail">${escapeHtml(line)}</p>`).join("");
      details.hidden = false;
    }
  }

  if (actions instanceof HTMLElement) {
    actions.hidden = false;
  }

  bindActions(panel, onRestart, onBack);
};

export const showQuizComplete = ({
  root,
  points,
  onBack,
}: {
  readonly root: HTMLElement;
  readonly points: number;
  readonly onBack: () => void;
}) => {
  hapticImpact("medium");
  const panel = document.createElement("div");
  panel.className = "game-over panel";
  panel.innerHTML = `
    <p class="game-over-headline">Викторина завершена!</p>
    <p class="game-over-score">${points}</p>
    <p class="status">очков за сессию</p>
    <div class="game-over-actions">
      <button type="button" class="secondary" data-back>К хабу</button>
    </div>`;
  root.append(panel);
  bindActions(panel, onBack, onBack);
};
