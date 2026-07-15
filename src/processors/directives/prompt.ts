// The directives prompt + schema: spoken instructions the speaker addressed to their
// future self — extracted to-dos ("note to self, ask Mara…") and media requests ("add a
// photo of the lighthouse here"). Conservative by design: a false positive is an annoying
// card in the reading pane, so only explicit, self-addressed instructions count.
// Bump the directives processor's `version` whenever this changes.
import type { Chunk } from "../../core/types.js";

/** What the model returns: directives citing the transcript paragraphs they occur in. */
export interface LlmDirective {
  kind: "todo" | "media";
  /** The instruction itself, as a short imperative phrase in the speaker's words. */
  phrase: string;
  /** Paragraph ids (e.g. "p3") where the directive was spoken. */
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
          kind: { type: "string", enum: ["todo", "media"] },
          phrase: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["kind", "phrase", "sourceIds"],
      },
    },
  },
  required: ["items"],
};

export const SYSTEM = `You spot the moments in a person's spoken brainstorming recording where they address an instruction to their future self — a task to do later, or a request to attach media at that spot. You are conservative: rhetorical or hypothetical phrasing is NOT a directive. You never invent content; you only extract what was explicitly said.`;

export function buildPrompt(paragraphs: Chunk[]): string {
  const numbered = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");

  return `Here is a transcript of a spoken brainstorming walk, split into timestamped paragraphs. Each is prefixed with its id in brackets.

${numbered}

Extract the speaker's explicit self-directed instructions. Return a JSON object { "items": [...] } where each item is { "kind", "phrase", "sourceIds" }.

- "kind": "todo" for a task to do later ("note to self…", "remind me to…", "I need to check…"), "media" for a request to attach media at that spot ("add a photo of X here", "drop the map in here").
- "phrase": the instruction as a short imperative phrase (max ~12 words), in the speaker's own vocabulary. For "media", name what to attach.
- "sourceIds": the paragraph id(s) where the directive was spoken — MUST be ids from the transcript above, usually exactly one.
- Only explicit, self-addressed instructions. Musings, hypotheticals, and rhetorical asides are not directives. It is normal to return an empty list.
- Order items chronologically.

Return ONLY the JSON object.`;
}
