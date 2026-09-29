import { expect, test } from "vitest";
import { safeAreaCssVariables } from "../../src/web/safe-area.ts";

test("device and messenger insets stay on their own CSS variables", () => {
  const vars = safeAreaCssVariables({
    safeAreaInset: { top: 47, right: 0, bottom: 34, left: 0 },
    contentSafeAreaInset: { top: 56, right: 0, bottom: 0, left: 0 },
  });
  expect(vars["--tg-safe-area-inset-top"]).toBe("47px");
  expect(vars["--tg-content-safe-area-inset-top"]).toBe("56px");
  expect(vars["--tg-safe-area-inset-bottom"]).toBe("34px");
  expect(vars["--tg-content-safe-area-inset-bottom"]).toBe("0px");
  expect(vars["--tg-content-safe-area-inset-top"]).not.toBe(vars["--tg-safe-area-inset-top"]);
});
