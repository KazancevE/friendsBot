import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const adminRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = dirname(adminRoot);

export default defineConfig({
  root: adminRoot,
  base: "/admin/",
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
