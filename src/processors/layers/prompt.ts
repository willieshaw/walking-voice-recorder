// The structuring prompt + the JSON schema Claude must return. The "cleaned" reading —
// a light-touch tidy of the SAME words — lives here. It is intentionally conservative:
// remove filler and fix punctuation, nothing else. Bump the layers processor's `version`
// whenever this changes so cached results are regenerated.
import type { Chunk } from "../../core/types.js";

/** What Claude returns: cleaned paragraphs, each referencing the transcript paragraph ids
 *  they came from (so we can resolve timestamps locally). */
export interface LlmChunk {
  text: string;
  /** Paragraph ids (e.g. "p3") this chunk is derived from — used for audio timestamps. */
  sourceIds: string[];
}
export interface LayersResult {
  cleaned: LlmChunk[];
}

const chunkSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } },
  },
  required: ["text", "sourceIds"],
};

export const layersSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    cleaned: { type: "array", items: chunkSchema },
  },
  required: ["cleaned"],
};

export const SYSTEM = `You lightly clean up a transcript of someone thinking out loud, WITHOUT rewriting it. You keep their exact words and sentences; you only drop filler and fix punctuation so it reads. You never rephrase, reorder, summarize, tighten, or add anything.`;

export function buildPrompt(paragraphs: Chunk[]): string {
  const numbered = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");

  return `Here is a transcript of a spoken brainstorming walk, split into timestamped paragraphs. Each is prefixed with its id in brackets.

${numbered}

Return a JSON object { "cleaned": [ { "text", "sourceIds" }, ... ] } — a lightly cleaned version of the SAME words.

- Keep the speaker's own words, phrasing, and sentence order. Do NOT rephrase, polish, summarize, tighten, or reorder.
- The ONLY edits allowed: drop filler and false starts ("um", "uh", "like", "you know", "I mean", stutters, immediately-repeated words), and add sentence punctuation, capitalization, and paragraph breaks so it reads naturally.
- Split into readable paragraphs — one "cleaned" chunk per paragraph, in chronological order.
- "sourceIds" MUST list the transcript paragraph id(s) the chunk came from (e.g. "p0", "p3"), so it links back to the audio.

Return ONLY the JSON object.`;
}
