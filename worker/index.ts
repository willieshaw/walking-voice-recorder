// Cloudflare Worker entry (Workers + Static Assets model). Serves the built SPA from the
// ASSETS binding and routes the two stateless OpenAI pass-throughs. Reuses the exact same
// handlers as the Vite dev middleware, so dev and prod behave identically. Stores/logs
// nothing — each request carries the tester's own key.
import { openaiTranscribe } from "../src/server/openaiTranscribe";
import { openaiStructure } from "../src/server/openaiStructure";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function missingKey(): Response {
  return new Response(JSON.stringify({ error: "Missing x-openai-key header." }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/transcribe") {
      const apiKey = request.headers.get("x-openai-key");
      if (!apiKey) return missingKey();
      const filename = request.headers.get("x-filename") || "audio.m4a";
      // The personal dictionary rides in URI-encoded (headers must be ASCII-safe).
      const rawPrompt = request.headers.get("x-stt-prompt");
      const prompt = rawPrompt ? decodeURIComponent(rawPrompt) : undefined;
      const audio = await request.blob();
      return openaiTranscribe(audio, filename, apiKey, prompt);
    }

    if (request.method === "POST" && url.pathname === "/api/structure") {
      const apiKey = request.headers.get("x-openai-key");
      if (!apiKey) return missingKey();
      const body = (await request.json()) as {
        system: string;
        prompt: string;
        schema: Record<string, unknown>;
        schemaName: string;
      };
      return openaiStructure({ ...body, apiKey });
    }

    // Everything else: serve the static SPA (index.html fallback for client routes).
    return env.ASSETS.fetch(request);
  },
};
