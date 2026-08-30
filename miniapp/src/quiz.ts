import { fetchLiveQuiz, submitQuizAnswer, type LiveQuiz } from "./api.ts";
import { showQuizComplete } from "./game-over.ts";
import { hapticImpact } from "./telegram.ts";

type RenderQuizParameters = {
  readonly root: HTMLElement;
  readonly onBack: () => void;
};

const QUESTION_TIME_MS = 15_000;

export const renderQuiz = async ({ root, onBack }: RenderQuizParameters) => {
  root.innerHTML = `<p class="muted">Загрузка викторины…</p>`;
  const loaded = await fetchLiveQuiz();
  if (loaded.kind === "error") {
    root.innerHTML = `
      <section class="panel">
        <h2>Викторина</h2>
        <p class="error">${loaded.message}</p>
        <button type="button" data-back>Назад</button>
      </section>
    `;
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    return;
  }
  if (loaded.data === null) {
    root.innerHTML = `
      <section class="panel">
        <h2>Викторина</h2>
        <p class="muted">Сейчас нет активной викторины</p>
        <button type="button" data-back>Назад</button>
      </section>
    `;
    root.querySelector("[data-back]")?.addEventListener("click", onBack);
    return;
  }

  await runQuiz({ root, onBack, quiz: loaded.data });
};

const runQuiz = async ({
  root,
  onBack,
  quiz,
}: RenderQuizParameters & { quiz: LiveQuiz }) => {
  let questionIndex = 0;
  let totalPoints = 0;

  const renderQuestion = () => {
    const question = quiz.questions[questionIndex];
    if (question === undefined) {
      hapticImpact("medium");
      showQuizComplete({ root, points: totalPoints, onBack });
      return;
    }

    const startedAt = performance.now();
    root.innerHTML = `
      <section class="panel quiz-screen">
        <p class="muted">Вопрос ${questionIndex + 1} / ${quiz.questions.length}</p>
        <h2>${escapeHtml(question.text)}</h2>
        <div class="quiz-options" data-options></div>
        <p class="muted" data-timer>15 сек</p>
        <p class="status" data-status hidden></p>
      </section>
    `;

    const optionsHost = root.querySelector("[data-options]");
    const timerElement = root.querySelector("[data-timer]");
    const statusElement = root.querySelector("[data-status]");
    if (!(optionsHost instanceof HTMLElement)) {
      return;
    }

    for (const [index, option] of question.options.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.addEventListener("click", () => {
        void submit(index);
      });
      optionsHost.append(button);
    }

    const deadline = window.setTimeout(() => {
      void submit(-1);
    }, QUESTION_TIME_MS);

    const tick = window.setInterval(() => {
      if (!(timerElement instanceof HTMLElement)) {
        return;
      }
      const elapsed = performance.now() - startedAt;
      const left = Math.max(0, Math.ceil((QUESTION_TIME_MS - elapsed) / 1000));
      timerElement.textContent = `${left} сек`;
    }, 250);

    const submit = async (optionIndex: number) => {
      window.clearTimeout(deadline);
      window.clearInterval(tick);
      for (const button of optionsHost.querySelectorAll("button")) {
        button.disabled = true;
      }
      if (optionIndex < 0) {
        questionIndex += 1;
        renderQuestion();
        return;
      }
      const elapsedMs = Math.round(performance.now() - startedAt);
      const result = await submitQuizAnswer({
        sessionId: quiz.sessionId,
        questionId: question.id,
        optionIndex,
        elapsedMs,
      });
      if (statusElement instanceof HTMLElement) {
        statusElement.hidden = false;
        if (result.kind === "error") {
          statusElement.textContent = result.message;
          statusElement.classList.add("error");
        } else {
          totalPoints = result.data.sessionTotal;
          statusElement.textContent = result.data.correct
            ? `Верно! +${result.data.points}`
            : "Неверно";
        }
      }
      window.setTimeout(() => {
        questionIndex += 1;
        renderQuestion();
      }, 900);
    };
  };

  renderQuestion();
};

const escapeHtml = (text: string) => {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};
