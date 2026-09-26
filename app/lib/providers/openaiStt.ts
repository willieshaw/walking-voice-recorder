// Desktop transcription: call Whisper directly through Tauri's fetch (the request runs
// from Rust, so OpenAI's browser CORS block doesn't apply), then reuse the shared,
// Node-free transform to build a Transcript.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { Transcript } from "@core/types";
import type { SttResult } from "@engine/providers/stt";
import { openaiTranscribe } from "@engine/server/openaiTranscribe";
import { transcriptFromStt } from "@engine/processors/transcribe/index";
import { buildSttPrompt, getDictionary } from "../dictionary";
import { getKeys } from "../keys";

interface OpenAiVerbose {
  text: string;
  duration?: number;
  language?: string;
  words?: { word: string; start: number; end: number }[];
  segments?: { text: string; start: number; end: number }[];
}

export async function transcribe(file: File): Promise<Transcript> {
  const { openai } = await getKeys();
  if (!openai) throw new Error("Add your OpenAI key in Settings.");

  // The personal dictionary rides along as the transcription prompt, biasing recognition
  // toward the user's names/terms.
  const sttPrompt = buildSttPrompt(getDictionary());
  const res = await openaiTranscribe(
    file,
    file.name,
    openai,
    sttPrompt || undefined,
    tauriFetch,
  );
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
