import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const marker = (parts: readonly string[]) => parts.join("");

/** Маркеры текущего шаблона. Собраны из частей, чтобы этот файл сам не находился поиском. */
export const TEMPLATE_MARKERS = [
  marker(["Daddy", "son"]),
  marker(["daddy", "son-demo"]),
  marker(["Василь", "ева 55"]),
  marker(["Училищ", "ный пер"]),
] as const;

/**
 * Файлы шаблона, которые у ветки bro отличались от daddyson.
 * src/venue/salon.ts здесь нет: на этой ветке его ещё нет, его создают под нового клиента.
 */
export const CLIENT_TOUCHPOINTS = [
  ".env.example",
  "README.md",
  "admin/index.html",
  "admin/src/salon-admin.ts",
  "admin/src/salon.css",
  "docker-compose.prod.yml",
  "docker-compose.yml",
  "fixtures/dikidi-clients-sample.csv",
  "miniapp/index.html",
  "miniapp/src/salon-app.ts",
  "miniapp/src/salon.css",
  "prisma/data/prices_dikidi.csv",
  "prisma/schema.prisma",
  "prisma/seed-salon.ts",
  "scripts/backup.ts",
  "scripts/restore.sh",
  "scripts/watchdog.ts",
  "site/app.js",
  "site/index.html",
  "site/styles.css",
  "src/domain/birthday.ts",
  "src/http/salon.ts",
  "src/index.ts",
  "src/prod/config.ts",
  "src/salon/catalog.ts",
  "src/salon/flow.ts",
  "src/salon/service.ts",
  "tests/domain/onboarding-flow.test.ts",
] as const;

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "uploads", "coverage", ".cursor"]);

const isText = (name: string) =>
  name === ".env.example" || /\.(ts|tsx|js|mjs|cjs|css|html|yml|yaml|md|sh|csv|prisma)$/.test(name);

export const findTemplateMarkers = (root: string) => {
  const hits: { file: string; markers: string[] }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) {
        continue;
      }
      const full = join(dir, name);
      const rel = relative(root, full).split("\\").join("/");
      if (rel === "docs" || rel.startsWith("docs/") || rel === "AGENTS.md") {
        continue;
      }
      const info = statSync(full);
      if (info.isDirectory()) {
        walk(full);
        continue;
      }
      if (!isText(name) || info.size > 1_000_000) {
        continue;
      }
      const text = readFileSync(full, "utf8");
      if (text.includes("\u0000")) {
        continue;
      }
      const markers = TEMPLATE_MARKERS.filter((item) => text.includes(item));
      if (markers.length > 0) {
        hits.push({ file: rel, markers: [...markers] });
      }
    }
  };
  walk(root);
  hits.sort((left, right) => left.file.localeCompare(right.file));
  return hits;
};

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  if (process.argv.includes("--list")) {
    for (const path of CLIENT_TOUCHPOINTS) {
      console.log(path);
    }
  } else {
    for (const hit of findTemplateMarkers(process.cwd())) {
      console.log(`${hit.file}\t${hit.markers.join(",")}`);
    }
  }
}
