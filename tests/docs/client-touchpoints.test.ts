import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CLIENT_TOUCHPOINTS, findTemplateMarkers } from "../../scripts/client-touchpoints.ts";

test("listed client touchpoints exist on the template branch", () => {
  for (const path of CLIENT_TOUCHPOINTS) {
    expect(existsSync(path), path).toBe(true);
  }
  expect(existsSync("src/venue/salon.ts")).toBe(false);
});

test("new-client doc names every listed touchpoint", () => {
  const doc = readFileSync("docs/new-client.md", "utf8");
  for (const path of CLIENT_TOUCHPOINTS) {
    expect(doc.includes(path), path).toBe(true);
  }
});

test("marker scan sees the template seed and skips agent docs", () => {
  const files = findTemplateMarkers(process.cwd()).map((hit) => hit.file);
  expect(files).toContain("prisma/seed-salon.ts");
  expect(files).toContain("site/index.html");
  expect(files).toContain("fixtures/dikidi-clients-sample.csv");
  expect(files.some((file) => file === "AGENTS.md" || file.startsWith("docs/"))).toBe(false);
});
