import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { createHttpApp } from "../../src/http/app.ts";
import { MemoryStore } from "../../src/store/memory.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const INDEX = join(ROOT, "miniapp/dist/index.html");

test("serves mini app index at /app and /app/", async () => {
  await mkdir(dirname(INDEX), { recursive: true });
  await writeFile(INDEX, "<!doctype html><title>касса</title>", "utf8");
  const app = createHttpApp({ store: new MemoryStore(), botToken: "test-token" });

  const slash = await app.request("/app/");
  expect(slash.status).toBe(200);
  expect(await slash.text()).toContain("касса");

  const bare = await app.request("/app");
  expect(bare.status).toBe(200);
  expect(await bare.text()).toContain("касса");
});
