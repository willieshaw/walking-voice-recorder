import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./src/env";
import { openaiTranscribe } from "./src/server/openaiTranscribe";
import { openaiStructure } from "./src/server/openaiStructure";

// The lab shell in app/ is a pure browser app: it processes recordings client-side using
// the tester's own OpenAI key. OpenAI blocks direct browser calls (CORS) for BOTH
// transcription and chat completions, so both steps go through tiny stateless pass-throughs
// at /api/transcribe and /api/structure. In production these are Cloudflare Pages
// Functions (functions/api/*.ts); here in dev we mirror them as Vite middleware.
function openaiApiPlugin(): Plugin {
  return {
    name: "wvr-openai-api",
    async configureServer(server) {
      // Dev convenience: fall back to the local .env OPENAI_API_KEY if the browser didn't
      // send one, so you can test without pasting a key. Prod always uses the sent key.
      await loadEnv();

      server.middlewares.use((req, res, next) => {
        if (req.method !== "POST" || req.url !== "/api/transcribe") return next();
        void (async () => {
          const apiKey =
            (req.headers["x-openai-key"] as string) || process.env.OPENAI_API_KEY || "";
          const filename = (req.headers["x-filename"] as string) || "audio.m4a";
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const upstream = await openaiTranscribe(new Blob([Buffer.concat(chunks)]), filename, apiKey);
          res.statusCode = upstream.status;
          res.setHeader("content-type", "application/json");
          res.end(Buffer.from(await upstream.arrayBuffer()));
        })().catch((err) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        });
      });

      server.middlewares.use((req, res, next) => {
        if (req.method !== "POST" || req.url !== "/api/structure") return next();
        void (async () => {
          const apiKey =
            (req.headers["x-openai-key"] as string) || process.env.OPENAI_API_KEY || "";
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const upstream = await openaiStructure({ ...body, apiKey });
          res.statusCode = upstream.status;
          res.setHeader("content-type", "application/json");
          res.end(Buffer.from(await upstream.arrayBuffer()));
        })().catch((err) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        });
      });
    },
  };
}

export default defineConfig({
  root: "app",
  // Build to a repo-root dist/ (Cloudflare Pages "build output directory").
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [react(), openaiApiPlugin()],
  resolve: {
    alias: {
      // Isomorphic types + focus store.
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      // Shared pure engine logic (transforms, prompt). Import ONLY Node-free modules here.
      "@engine": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    open: true, // launch the browser automatically on `npm run dev`
    // Default to 5173, but honor a PORT env var (e.g. from tooling) so the server can be
    // placed on an assigned free port.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    fs: { allow: [".."] }, // allow importing shared modules that live outside app/
  },
});
