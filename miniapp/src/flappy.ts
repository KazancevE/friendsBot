import { showGameOver } from "./game-over.ts";
import { bindFinishGameButton, gameFinishButtonHtml } from "./game-finish.ts";
import { fetchGameSkin, tileImageUrl } from "./theme-client.ts";
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

const loadImage = (url: string | null) => {
  if (url === null) {
    return Promise.resolve(null);
  }
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      resolve(null);
    };
    image.src = url;
  });
};

export const renderFlappy = ({ root, onBack }: RenderFlappyParameters) => {
  const sessionStartedAt = new Date();
  root.innerHTML = `<p class="muted">Загрузка…</p>`;

  void (async () => {
    const skin = await fetchGameSkin(SLUG);
    const [birdImage, pipeImage, backgroundImage] = await Promise.all([
      loadImage(tileImageUrl(skin, 0)),
      loadImage(tileImageUrl(skin, 1)),
      loadImage(skin?.boardBackgroundUrl ?? null),
    ]);

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
        ${gameFinishButtonHtml()}
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
    bindFinishGameButton({
      root,
      onFinish: finishGame,
      canFinish: () => !finished,
    });

    let running = false;
    let finished = false;
    let score = 0;
    let birdY = canvas.height / 2;
    let birdVy = 0;
    let lastPipeAt = 0;
    const pipes: Array<{ x: number; top: number; scored: boolean }> = [];

    const drawBackground = () => {
      if (backgroundImage !== null) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.fillStyle = "#1a2633";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const drawPipeSegment = (x: number, y: number, width: number, height: number) => {
      if (pipeImage !== null && height > 0) {
        ctx.drawImage(pipeImage, x, y, width, height);
        return;
      }
      ctx.fillStyle = "#89cff0";
      ctx.fillRect(x, y, width, height);
    };

    const drawBird = () => {
      if (birdImage !== null) {
        ctx.drawImage(birdImage, 70 - 16, birdY - 16, 32, 32);
        return;
      }
      ctx.fillStyle = "#f0a060";
      ctx.beginPath();
      ctx.arc(70, birdY, 14, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      drawBackground();
      for (const pipe of pipes) {
        drawPipeSegment(pipe.x, 0, PIPE_WIDTH, pipe.top);
        drawPipeSegment(pipe.x, pipe.top + GAP, PIPE_WIDTH, canvas.height - pipe.top - GAP);
      }
      drawBird();
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
      await showGameOver({
        root,
        slug: SLUG,
        score,
        sessionStartedAt,
        headline: score >= 10 ? "Отличный полёт!" : "Партия окончена",
        celebrate: score >= 20,
        confettiMinScore: 20,
        onRestart: () => {
          renderFlappy({ root, onBack });
        },
        onBack,
      });
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
    draw();
  })();
};
