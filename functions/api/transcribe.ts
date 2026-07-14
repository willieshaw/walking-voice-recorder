// Cloudflare Pages Function: POST /api/transcribe
// Deploys alongside the static site (same URL, free). Stateless pass-through to OpenAI
// Whisper using the tester's own key (sent per-request). Stores nothing, logs nothing.
import { openaiTranscribe } from "../../src/server/openaiTranscribe";

export const onRequestPost: (ctx: { request: Request }) => Promise<Response> = async ({
  request,
}) => {
  const apiKey = request.headers.get("x-openai-key");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing x-openai-key header." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const filename = request.headers.get("x-filename") || "audio.m4a";
  const audio = await request.blob();
  return openaiTranscribe(audio, filename, apiKey);
};
