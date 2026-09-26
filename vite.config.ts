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
  // The running version for Settings. npm sets npm_package_version for `npm run` scripts;
  // the fallback keeps a bare `npx vite build` working.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
  },
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
