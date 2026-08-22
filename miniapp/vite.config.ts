import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const miniappRoot = dirname(fileURLToPath(import.meta.url));

const viteConfig = defineConfig({
  root: miniappRoot,
  base: "/app/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

export default viteConfig;
