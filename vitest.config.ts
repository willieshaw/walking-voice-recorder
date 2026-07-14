import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which roots the browser app at app/). Tests exercise the
// Node engine in src/ with fixture providers — no browser, no app root.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
