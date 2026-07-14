// The concepts prompt + schema: the recurring ideas/terms of the walk, weighted by
// centrality. Bump the concepts processor's `version` whenever this changes.
import type { Chunk } from "../../core/types.js";

/** What the model returns: weighted phrases citing every paragraph they occur in. */
export interface LlmConcept {
  /** A 1–4 word noun phrase in the speaker's own vocabulary. */
  phrase: string;
  /** 1–5 integer; 5 = central theme. (Clamped locally — not enforced by schema.) */
  weight: number;
  /** Every paragraph id (e.g. "p3") where the concept appears. */
  sourceIds: string[];
}
export interface ConceptsResult {
  concepts: LlmConcept[];
}

export const conceptsSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          phrase: { type: "string" },
          weight: { type: "integer" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["phrase", "weight", "sourceIds"],
      },
    },
  },
  required: ["concepts"],
};

export const SYSTEM = `You map the recurring ideas in a person's spoken brainstorming recording. You surface the concepts THEY talked about, in their own words — you never invent themes they didn't express.`;

export function buildPrompt(paragraphs: Chunk[]): string {
  const numbered = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");

  return `Here is a transcript of a spoken brainstorming walk, split into timestamped paragraphs. Each is prefixed with its id in brackets.

${numbered}

Extract the 8–20 recurring ideas and terms. Return a JSON object { "concepts": [...] } where each concept is { "phrase", "weight", "sourceIds" }.

- "phrase": a 1–4 word noun phrase in the speaker's own vocabulary.
- "weight": an integer 1–5 for how central the concept is (5 = a main theme they kept returning to, 1 = mentioned in passing).
- "sourceIds": EVERY paragraph id from the transcript above where the concept appears — this is how each concept links back to the audio.
- No near-duplicates: merge singular/plural and rephrasings into one concept.

Return ONLY the JSON object.`;
}
