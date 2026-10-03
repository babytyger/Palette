import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: dir,
  resolve: {
    alias: {
      "@": path.join(dir, "src"),
      "@lib/compiler": path.resolve(dir, "../src/compiler.js")
    }
  },
  build: {
    outDir: path.resolve(dir, "../public"),
    emptyOutDir: true
  }
});
