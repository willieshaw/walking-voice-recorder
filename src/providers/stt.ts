// Node-only. Speech-to-text behind a small interface so the processor never knows the
// vendor — and so tests can swap in recorded fixtures instead of hitting a live API.
// Default implementation: OpenAI Whisper (verbose_json -> word + segment timestamps).
//
// We call the REST endpoint directly with native fetch + FormData rather than the SDK
// client: undici sends multipart with a proper Content-Length (no streaming ECONNRESET)
// and real HTTP errors (e.g. a 429 quota error) surface with their status and message
// instead of an opaque "Connection error".
import { promises as fs } from "node:fs";
import path from "node:path";

export interface SttWord {
  word: string;
  start: number;
  end: number;
}
/** A provider-agnostic segment; we use segment boundaries to form paragraph breaks. */
export interface SttSegment {
  text: string;
  start: number;
  end: number;
}
export interface SttResult {
  text: string;
  words: SttWord[];
  segments: SttSegment[];
  durationSec: number;
  language?: string;
}

export interface SttProvider {
  readonly name: string;
  transcribe(audioPath: string): Promise<SttResult>;
}

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export class OpenAiWhisperStt implements SttProvider {
  readonly name = "openai-whisper-1";
  private apiKey: string;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set (needed for Whisper transcription).");
    }
    this.apiKey = apiKey;
  }

  async transcribe(audioPath: string): Promise<SttResult> {
    const buf = await fs.readFile(audioPath);
    const form = new FormData();
    form.append("file", new Blob([buf]), path.basename(audioPath));
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");

    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text();
      const hint =
        res.status === 429
          ? " (this usually means the OpenAI account is out of credit — check Billing)"
          : "";
      throw new Error(`Whisper transcription failed (HTTP ${res.status})${hint}: ${detail}`);
    }

    const r = (await res.json()) as {
      text: string;
      duration?: number;
      language?: string;
      words?: { word: string; start: number; end: number }[];
      segments?: { text: string; start: number; end: number }[];
    };
    return {
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
  }
}

/** The default provider used by the pipeline. Swap here (or in tests) to change vendors. */
export function defaultSttProvider(): SttProvider {
  return new OpenAiWhisperStt();
}
