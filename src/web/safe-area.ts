export type EdgeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const edges = ["top", "right", "bottom", "left"] as const;

const pixels = (value: number) => {
  const number = Number(value);
  return `${Number.isFinite(number) ? Math.max(0, number) : 0}px`;
};

/** Device inset and Telegram/MAX chrome inset stay separate. Layout adds them. */
export const safeAreaCssVariables = (input: { safeAreaInset?: EdgeInsets; contentSafeAreaInset?: EdgeInsets }) => {
  const vars: Record<string, string> = {};
  if (input.safeAreaInset) {
    for (const edge of edges) {
      vars[`--tg-safe-area-inset-${edge}`] = pixels(input.safeAreaInset[edge]);
    }
  }
  if (input.contentSafeAreaInset) {
    for (const edge of edges) {
      vars[`--tg-content-safe-area-inset-${edge}`] = pixels(input.contentSafeAreaInset[edge]);
    }
  }
  return vars;
};

export const applySafeAreaCssVariables = (
  target: { style: { setProperty: (name: string, value: string) => void } },
  input: { safeAreaInset?: EdgeInsets; contentSafeAreaInset?: EdgeInsets },
) => {
  for (const [name, value] of Object.entries(safeAreaCssVariables(input))) {
    target.style.setProperty(name, value);
  }
};
