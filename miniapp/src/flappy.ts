import { submitGameScore } from "./api.ts";
import "./flappy.css";

const SLUG = "flappy";
const GRAVITY = 0.35;
const FLAP = -6.5;
const GAP = 110;
const PIPE_WIDTH = 52;
const PIPE_INTERVAL_MS = 1800;

type RenderFlappyParameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

export const renderFlappy = ({ root, onBack }: RenderFlappyParameters) => {
  const sessionStartedAt = new Date();
  root.innerHTML = `
    <div class="flappy-wrap">
      <header class="flappy-header">
        <button type="button" data-back aria-label="Назад">←</button>
        <div>
          <h1>Flappy</h1>
          <p class="muted">Нажмите, чтобы взлететь</p>
        </div>
      </header>
      <div class="flappy-hud panel">
        <span data-score>0</span>
        <span class="muted"> · препятствий</span>
      </div>
      <canvas class="flappy-canvas" width="320" height="480" data-canvas></canvas>
      <p class="muted" data-status>Тап — старт</p>
    </div>
  `;

  const canvas = root.querySelector("[data-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }

  const scoreElement = root.querySelector("[data-score]");
  const statusElement = root.querySelector("[data-status]");
  root.querySelector("[data-back]")?.addEventListener("click", onBack);

  let running = false;
  let finished = false;
  let score = 0;
  let birdY = canvas.height / 2;
  let birdVy = 0;
  let lastPipeAt = 0;
  const pipes: Array<{ x: number; top: number; scored: boolean }> = [];

  const draw = () => {
    ctx.fillStyle = "#1a2633";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#89cff0";
    for (const pipe of pipes) {
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.top);
      ctx.fillRect(pipe.x, pipe.top + GAP, PIPE_WIDTH, canvas.height);
    }
    ctx.fillStyle = "#f0a060";
    ctx.beginPath();
    ctx.arc(70, birdY, 14, 0, Math.PI * 2);
    ctx.fill();
  };

  const spawnPipe = () => {
    const top = 60 + Math.random() * (canvas.height - GAP - 120);
    pipes.push({ x: canvas.width, top, scored: false });
  };

  const finishGame = async () => {
    if (finished) {
      return;
    }
    finished = true;
    running = false;
    if (statusElement instanceof HTMLElement) {
      statusElement.textContent = "Отправка очков…";
    }
    const panel = document.createElement("div");
    panel.className = "panel";
    const result = await submitGameScore({
      slug: SLUG,
      points: score,
      sessionStartedAt,
      sessionEndedAt: new Date(),
    });
    panel.innerHTML = `<p>${
      result.kind === "error"
        ? result.message
        : score > 0 && result.data.counted
          ? `Очки отправлены: ${score}`
          : score > 0
            ? "Тренировочная партия"
            : "Нет очков для отправки"
    }</p>`;
    const actions = document.createElement("div");
    actions.className = "flappy-done-actions";
    actions.innerHTML =
      '<button type="button" data-restart>Снова</button><button type="button" class="secondary" data-back>К таблице</button>';
    panel.append(actions);
    root.append(panel);
    actions.querySelector("[data-restart]")?.addEventListener("click", () => {
      renderFlappy({ root, onBack });
    });
    actions.querySelector("[data-back]")?.addEventListener("click", onBack);
  };

  const tick = (timestamp: number) => {
    if (!running || finished) {
      return;
    }
    if (lastPipeAt === 0) {
      lastPipeAt = timestamp;
    }
    if (timestamp - lastPipeAt >= PIPE_INTERVAL_MS) {
      spawnPipe();
      lastPipeAt = timestamp;
    }
    birdVy += GRAVITY;
    birdY += birdVy;
    for (const pipe of pipes) {
      pipe.x -= 2.5;
    }
    while (pipes.length > 0 && pipes[0]!.x + PIPE_WIDTH < 0) {
      pipes.shift();
    }
    for (const pipe of pipes) {
      const inX = 70 + 14 > pipe.x && 70 - 14 < pipe.x + PIPE_WIDTH;
      const hitTop = birdY - 14 < pipe.top;
      const hitBottom = birdY + 14 > pipe.top + GAP;
      if (inX && (hitTop || hitBottom)) {
        void finishGame();
        return;
      }
      if (!pipe.scored && pipe.x + PIPE_WIDTH < 70) {
        pipe.scored = true;
        score += 1;
        if (scoreElement instanceof HTMLElement) {
          scoreElement.textContent = String(score);
        }
      }
    }
    if (birdY <= 0 || birdY >= canvas.height) {
      void finishGame();
      return;
    }
    draw();
    requestAnimationFrame(tick);
  };

  const flap = () => {
    if (finished) {
      return;
    }
    if (!running) {
      running = true;
      if (statusElement instanceof HTMLElement) {
        statusElement.textContent = "";
      }
      requestAnimationFrame(tick);
    }
    birdVy = FLAP;
  };

  canvas.addEventListener("pointerdown", flap);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      flap();
    }
  });

  draw();
};
