type BindFinishGameButtonParameters = {
  readonly root: HTMLElement;
  readonly onFinish: () => void | Promise<void>;
  readonly canFinish?: () => boolean;
};

export const gameFinishButtonHtml = () => {
  return `<button type="button" class="game-finish secondary" data-finish>Завершить игру</button>`;
};

export const bindFinishGameButton = ({
  root,
  onFinish,
  canFinish,
}: BindFinishGameButtonParameters) => {
  const button = root.querySelector("[data-finish]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  button.addEventListener("click", () => {
    if (canFinish !== undefined && !canFinish()) {
      return;
    }
    void onFinish();
  });
};
