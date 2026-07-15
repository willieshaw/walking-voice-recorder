// The directives prompt + schema: extracted to-dos the speaker addressed to their future
// self ("note to self, ask Mara…"). Conservative by design: a false positive is an annoying
// card in the reading pane, so only explicit, self-addressed tasks count.
// Bump the directives processor's `version` whenever this changes.
import type { Chunk } from "../../core/types.js";

/** What the model returns: to-dos citing the transcript paragraphs they occur in. */
export interface LlmDirective {
  /** The task itself, as a short imperative phrase in the speaker's words. */
  phrase: string;
  /** Paragraph ids (e.g. "p3") where the task was spoken. */
  sourceIds: string[];
}
export interface DirectivesResult {
  items: LlmDirective[];
}

export const directivesSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          phrase: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["phrase", "sourceIds"],
      },
    },
  },
  required: ["items"],
};

export const SYSTEM = `You spot the moments in a person's spoken brainstorming recording where they give themselves a task to do later. You are conservative: rhetorical or hypothetical phrasing is NOT a to-do. You never invent content; you only extract what was explicitly said.`;

export function buildPrompt(paragraphs: Chunk[]): string {
  const numbered = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");

  return `Here is a transcript of a spoken brainstorming walk, split into timestamped paragraphs. Each is prefixed with its id in brackets.

${numbered}

Extract the speaker's explicit self-directed to-dos — tasks to do later ("note to self…", "remind me to…", "I need to check…"). Return a JSON object { "items": [...] } where each item is { "phrase", "sourceIds" }.

- "phrase": the task as a short imperative phrase (max ~12 words), in the speaker's own vocabulary.
- "sourceIds": the paragraph id(s) where the task was spoken — MUST be ids from the transcript above, usually exactly one.
- Only explicit, self-addressed tasks. Musings, hypotheticals, and rhetorical asides are not to-dos. It is normal to return an empty list.
- Order items chronologically.

Return ONLY the JSON object.`;
}
