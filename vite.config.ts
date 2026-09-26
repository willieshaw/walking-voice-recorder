import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The Thoughts frontend, served to the Tauri window in dev and built to dist/ for the
// app bundle. No server-side code: OpenAI is called from the app through Tauri's fetch.
export default defineConfig({
  root: "app",
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      // Isomorphic types + focus store.
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      // Shared pure engine logic (transforms, prompts, OpenAI calls). Node-free modules only.
      "@engine": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [".."] }, // allow importing shared modules that live outside app/
  },
});
