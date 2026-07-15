// The summary prompt + schema: distill the recording into a 2–3 sentence digest.
// Bump the summary processor's `version` whenever this changes.
import type { Chunk } from "../../core/types.js";

export interface SummaryResult {
  summary: string;
}

export const summarySchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
};

export const SYSTEM = `You distill a person's spoken brainstorming recording into a short written digest. You capture what THEY were working through, in a register close to their own — never a generic book-report tone, never content they didn't say.`;

export function buildPrompt(paragraphs: Chunk[]): string {
  const numbered = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");

  return `Here is a transcript of a spoken brainstorming walk, split into paragraphs.

${numbered}

Write a 2–3 sentence summary of the recording. Return a JSON object { "summary": "..." }.

- Lead with what the recording is about, then the key decisions or ideas reached.
- Stay close to the speaker's own vocabulary and intent; do not add advice or content.
- Plain prose, no bullet points, no "The speaker..." framing — write it like a note to themselves.

Return ONLY the JSON object.`;
}
