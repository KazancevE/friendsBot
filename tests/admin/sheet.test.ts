import { expect, test } from "vitest";
import { renderSheetMarkup } from "../../admin/src/sheet.ts";
import { sectionIntro } from "../../admin/src/ui-helpers.ts";
import { themePreviewMarkup } from "../../admin/src/theme-preview.ts";

test("renderSheetMarkup is a modal dialog with close control", () => {
  const html = renderSheetMarkup();
  expect(html).toContain('role="dialog"');
  expect(html).toContain("aria-modal");
  expect(html).toContain("data-sheet-backdrop");
  expect(html).toContain("data-sheet-close");
  expect(html).toContain("data-sheet-title");
  expect(html).toContain("data-sheet-body");
});

test("sectionIntro renders muted description", () => {
  const html = sectionIntro("Короткое описание раздела");
  expect(html).toContain("section-intro");
  expect(html).toContain("Короткое описание раздела");
});

test("themePreviewMarkup includes hub mock hooks", () => {
  const html = themePreviewMarkup();
  expect(html).toContain("data-theme-preview");
  expect(html).toContain("data-preview-balance");
  expect(html).toContain("data-preview-games");
});
