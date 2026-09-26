import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import path from "node:path";
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

      // Dev-only note seed: the preview browser's storage partition occasionally rotates,
      // wiping IndexedDB. A backup archive kept ON DISK survives that — GET serves it (the
      // app auto-restores on an empty boot), POST overwrites it ("Save as dev seed" in
      // Settings). Never present in production; gitignored.
      const seedPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "dev-fixtures",
        "seed.zip",
      );
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/api/dev-seed") return next();
        if (req.method === "GET") {
          fs.readFile(seedPath)
            .then((buf) => {
              res.setHeader("content-type", "application/zip");
              res.end(buf);
            })
            .catch(() => {
              res.statusCode = 404;
              res.end();
            });
          return;
        }
        if (req.method === "POST") {
          void (async () => {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            await fs.mkdir(path.dirname(seedPath), { recursive: true });
            await fs.writeFile(seedPath, Buffer.concat(chunks));
            res.end("ok");
          })().catch((err) => {
            res.statusCode = 500;
            res.end(String(err));
          });
          return;
        }
        next();
      });

      server.middlewares.use((req, res, next) => {
        if (req.method !== "POST" || req.url !== "/api/transcribe") return next();
        void (async () => {
          const apiKey =
            (req.headers["x-openai-key"] as string) || process.env.OPENAI_API_KEY || "";
          const filename = (req.headers["x-filename"] as string) || "audio.m4a";
          const rawPrompt = req.headers["x-stt-prompt"] as string | undefined;
          const prompt = rawPrompt ? decodeURIComponent(rawPrompt) : undefined;
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const upstream = await openaiTranscribe(
            new Blob([Buffer.concat(chunks)]),
            filename,
            apiKey,
            prompt,
          );
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

export default defineConfig(async ({ command }) => {
  // Dev-only: tell the client whether a local .env OPENAI_API_KEY exists, so it can unlock
  // the UI and let the dev proxy supply the key (the key's VALUE is never sent to the
  // browser). Lets you set the key once in .env and have it survive browser-storage wipes.
  let devHasKey = false;
  if (command === "serve") {
    await loadEnv();
    devHasKey = Boolean(process.env.OPENAI_API_KEY);
  }
  return {
    root: "app",
    // Build to a repo-root dist/ (Cloudflare Pages "build output directory").
    build: { outDir: "../dist", emptyOutDir: true },
    plugins: [react(), openaiApiPlugin()],
    // Only a boolean crosses to the client — never the key itself. False in production.
    define: { "import.meta.env.VITE_DEV_HAS_KEY": JSON.stringify(devHasKey) },
    resolve: {
      alias: {
        // Isomorphic types + focus store.
        "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
        // Shared pure engine logic (transforms, prompt). Import ONLY Node-free modules here.
        "@engine": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      fs: { allow: [".."] }, // allow importing shared modules that live outside app/
    },
  };
});
