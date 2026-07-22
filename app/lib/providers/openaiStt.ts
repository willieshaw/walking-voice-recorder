// Browser transcription. OpenAI blocks direct browser calls, so we POST the audio to our
// stateless /api/transcribe pass-through (which forwards it to OpenAI using the tester's
// key), then reuse the shared, Node-free transform to build a Transcript.
import type { Transcript } from "@core/types";
import type { SttResult } from "@engine/providers/stt";
import { transcriptFromStt } from "@engine/processors/transcribe/index";
import { buildSttPrompt, getDictionary } from "../dictionary";
import { getKeys, hasDevServerKey } from "../keys";

interface OpenAiVerbose {
  text: string;
  duration?: number;
  language?: string;
  words?: { word: string; start: number; end: number }[];
  segments?: { text: string; start: number; end: number }[];
}

export async function transcribe(file: File): Promise<Transcript> {
  const { openai } = getKeys();
  // In dev the proxy fills the key from .env when the browser has none (see hasKeys); only
  // block when neither exists. The empty header below then triggers that server fallback.
  if (!openai && !hasDevServerKey()) throw new Error("Add your OpenAI key in Settings.");

  // The personal dictionary rides along as the transcription prompt, biasing recognition
  // toward the user's names/terms. URI-encoded: header values must stay ASCII-safe.
  const sttPrompt = buildSttPrompt(getDictionary());
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: {
      "x-openai-key": openai,
      "x-filename": file.name,
      "content-type": file.type || "application/octet-stream",
      ...(sttPrompt ? { "x-stt-prompt": encodeURIComponent(sttPrompt) } : {}),
    },
    body: file,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
    };
    const msg =
      typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(msg || `Transcription failed (HTTP ${res.status}).`);
  }

  const r = (await res.json()) as OpenAiVerbose;
  const stt: SttResult = {
    text: r.text,
    words: (r.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
    segments: (r.segments ?? []).map((s) => ({
      text: s.text.trim(),
      start: s.start,
      end: s.end,
    })),
    durationSec: r.duration ?? 0,
    language: r.language,
  };
  return transcriptFromStt(stt);
}
