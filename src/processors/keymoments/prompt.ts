// The key-moments prompt + schema: pick the handful of spans a listener would jump to.
// Bump the keymoments processor's `version` whenever this changes.
import type { Chunk } from "../../core/types.js";

/** What the model returns: labeled moments citing the transcript paragraphs they span. */
export interface LlmKeyMoment {
  /** A short handle, 2–6 words, like a chapter title. */
  label: string;
  /** Paragraph ids (e.g. "p3") the moment spans — used for audio timestamps. */
  sourceIds: string[];
}
export interface KeyMomentsResult {
  moments: LlmKeyMoment[];
}

export const keyMomentsSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    moments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["label", "sourceIds"],
      },
    },
  },
  required: ["moments"],
};

export const SYSTEM = `You mark the key moments in a person's spoken brainstorming recording — the spans a listener would want to jump straight to. You never invent content; you only point at what was actually said.`;

export function buildPrompt(paragraphs: Chunk[]): string {
  const numbered = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");

  return `Here is a transcript of a spoken brainstorming walk, split into timestamped paragraphs. Each is prefixed with its id in brackets.

${numbered}

Pick the 3–8 most important moments. Return a JSON object { "moments": [...] } where each moment is { "label", "sourceIds" }.

- "label": a short handle for the moment, 2–6 words, like a chapter title. Use the speaker's own vocabulary.
- "sourceIds": the paragraph id(s) the moment spans — MUST be ids from the transcript above, usually one, at most two adjacent ids.
- Order moments chronologically.
- Prefer decisions, new ideas, action items, and turning points over filler or repetition.

Return ONLY the JSON object.`;
}
