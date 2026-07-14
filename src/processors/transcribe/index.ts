// The one foundational processor: audio -> canonical transcript (the trunk).
// Everything else derives from its output.
import type { Chunk, Transcript } from "../../core/types.js";
import type { SttResult } from "../../providers/stt.js";
import type { Ctx, Processor } from "../types.js";

// Group STT segments into readable paragraphs: break on a silent gap or when a
// paragraph grows long. Keeps reading comfortable without an LLM (that's a later branch).
const GAP_BREAK_SEC = 1.5;
const MAX_PARAGRAPH_CHARS = 350;

export function paragraphsFromSegments(segments: SttResult["segments"]): Chunk[] {
  const paragraphs: Chunk[] = [];
  let current: { text: string; tStart: number; tEnd: number } | null = null;
  let prevEnd = 0;

  const flush = () => {
    if (!current) return;
    paragraphs.push({
      id: `p${paragraphs.length}`,
      text: current.text.trim(),
      tStart: current.tStart,
      tEnd: current.tEnd,
    });
    current = null;
  };

  for (const seg of segments) {
    const gap = seg.start - prevEnd;
    if (current && (gap >= GAP_BREAK_SEC || current.text.length >= MAX_PARAGRAPH_CHARS)) {
      flush();
    }
    if (!current) {
      current = { text: seg.text, tStart: seg.start, tEnd: seg.end };
    } else {
      current.text += " " + seg.text;
      current.tEnd = seg.end;
    }
    prevEnd = seg.end;
  }
  flush();
  return paragraphs;
}

export function transcriptFromStt(res: SttResult): Transcript {
  const paragraphs = paragraphsFromSegments(res.segments);
  const lastEnd =
    res.durationSec ||
    res.segments.at(-1)?.end ||
    res.words.at(-1)?.end ||
    0;
  return {
    text: paragraphs.map((p) => p.text).join("\n\n") || res.text,
    paragraphs,
    words: res.words.map((w) => ({ word: w.word, tStart: w.start, tEnd: w.end })),
    durationSec: lastEnd,
    language: res.language,
  };
}

export const transcribeProcessor: Processor<"transcript"> = {
  id: "transcript",
  reads: ["audio"],
  version: 1,
  async produce(ctx: Ctx): Promise<Transcript> {
    const res = await ctx.getStt().transcribe(ctx.audioPath);
    const transcript = transcriptFromStt(res);
    await ctx.patchManifest({ durationSec: transcript.durationSec });
    return transcript;
  },
};
