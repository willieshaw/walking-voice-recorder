// The structuring prompt + the JSON schema Claude must return. This is the most-iterated
// file in the project — the "rambling -> clean notes" magic lives here. Bump the layers
// processor's `version` whenever this changes so cached results are regenerated.
import type { Chunk } from "../../core/types.js";

/** What Claude returns: three derived levels, each a list of chunks that reference the
 *  transcript paragraph ids they came from (so we can resolve timestamps locally). */
export interface LlmChunk {
  text: string;
  kind: "heading" | "text" | "bullet";
  /** Paragraph ids (e.g. "p3") this chunk is derived from — used for audio timestamps. */
  sourceIds: string[];
}
export interface LayersResult {
  cleaned: LlmChunk[];
  grouped: LlmChunk[];
  outline: LlmChunk[];
}

const chunkSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    kind: { type: "string", enum: ["heading", "text", "bullet"] },
    sourceIds: { type: "array", items: { type: "string" } },
  },
  required: ["text", "kind", "sourceIds"],
};

export const layersSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    cleaned: { type: "array", items: chunkSchema },
    grouped: { type: "array", items: chunkSchema },
    outline: { type: "array", items: chunkSchema },
  },
  required: ["cleaned", "grouped", "outline"],
};

export const SYSTEM = `You are an editor who turns a person's rambling, spoken brainstorming walk into clean written notes WITHOUT inventing content or changing their meaning. You never add ideas they didn't express. You preserve their voice. You produce three progressively more structured versions of the same material.`;

export function buildPrompt(paragraphs: Chunk[]): string {
  const numbered = paragraphs
    .map((p) => `[${p.id}] ${p.text}`)
    .join("\n\n");

  return `Here is a transcript of a spoken brainstorming walk, split into timestamped paragraphs. Each is prefixed with its id in brackets.

${numbered}

Produce a JSON object with three arrays — "cleaned", "grouped", "outline". Every item is a chunk: { "text", "kind", "sourceIds" }.

- "sourceIds" MUST list the paragraph id(s) (e.g. "p0", "p3") the chunk is based on. Every chunk needs at least one valid id from the transcript above — this is how each chunk links back to the audio. Keep chunks roughly in chronological order.

- "cleaned" (Level 1): the SAME content, lightly cleaned. Remove filler ("um", "uh", false starts, repetitions), fix grammar and run-ons into readable sentences. Keep ALL ideas and the original order. All chunks here have kind "text". Roughly one cleaned chunk per source paragraph.

- "grouped" (Level 2): the content reorganized into thematic sections. Each section starts with a short chunk of kind "heading" (a few words), followed by one or more "text" chunks of cleaned prose for that theme. Merge related material; you may reorder to group by topic.

- "outline" (Level 3): a tight outline. "heading" chunks for the main themes, each followed by "bullet" chunks capturing the key points and any action items in a few words each. This should be much shorter than the transcript — the gist a reader could scan in seconds.

Return ONLY the JSON object.`;
}
