import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const miniappRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = dirname(miniappRoot);

const viteConfig = defineConfig({
  root: miniappRoot,
  base: "/app/",
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

export default viteConfig;
