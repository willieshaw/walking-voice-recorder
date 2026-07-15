// The summary prompt + schema: distill the recording into a short digest.
//
// We keep FIVE lean prompt variants, each a different tactic for the same goal — a summary
// that sounds like the speaker and reuses their words, not a generic book report. The app
// exposes them behind a toggle so we can compare with real users. Variant 0 is the default
// (generated on upload); the rest are generated lazily when a user toggles to them.
// Bump the summary processor's `version` whenever a variant changes.
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

export interface SummaryVariant {
  /** Stable id used as the storage key for this variant's generated text. */
  id: string;
  /** Short human label shown in the toggle. */
  label: string;
  system: string;
  buildPrompt: (paragraphs: Chunk[]) => string;
}

/** The numbered, id-prefixed transcript every variant shares. */
function numbered(paragraphs: Chunk[]): string {
  return paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");
}

export const summaryVariants: SummaryVariant[] = [
  {
    id: "baseline",
    label: "Baseline",
    system: `You distill a person's spoken brainstorming recording into a short written digest. You capture what THEY were working through, in a register close to their own — never a generic book-report tone, never content they didn't say.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming walk, split into paragraphs.

${numbered(paragraphs)}

Write a 2–3 sentence summary of the recording. Return a JSON object { "summary": "..." }.

- Lead with what the recording is about, then the key decisions or ideas reached.
- Stay close to the speaker's own vocabulary and intent; do not add advice or content.
- Plain prose, no bullet points, no "The speaker..." framing — write it like a note to themselves.

Return ONLY the JSON object.`,
  },
  {
    id: "their-words",
    label: "Their words",
    system: `You summarize a spoken recording using the speaker's OWN words. You lift their exact phrases and never swap in fancier synonyms.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming walk, split into paragraphs.

${numbered(paragraphs)}

Write a 2–3 sentence summary that reuses the speaker's own words and phrases wherever you can. Return a JSON object { "summary": "..." }.

- Lift the speaker's exact wording rather than paraphrasing; keep their nouns and verbs.
- Do not introduce vocabulary they didn't use. No advice, no added content.
- No "The speaker..." framing.

Return ONLY the JSON object.`,
  },
  {
    id: "first-person",
    label: "First person",
    system: `You rewrite a person's spoken brainstorming into a short note they could have written to themselves — first person, in their own voice.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming walk, split into paragraphs.

${numbered(paragraphs)}

Write a 2–3 sentence summary in the FIRST PERSON, as if the speaker jotted it to themselves ("I keep coming back to…"). Return a JSON object { "summary": "..." }.

- First person throughout; their vocabulary and tone.
- Only what they actually said; no advice, no invented content.

Return ONLY the JSON object.`,
  },
  {
    id: "echo",
    label: "Echo",
    system: `You mirror how a person talks. You capture what they worked through in their own register, rhythm, and idiom — not smoothed into neutral prose.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming walk, split into paragraphs.

${numbered(paragraphs)}

Write a 2–3 sentence summary that SOUNDS LIKE the speaker — match their register, rhythm, and idiom, and keep their characteristic phrases. Return a JSON object { "summary": "..." }.

- Sound like them, not like a report; keep their idioms and asides.
- Only what they said; no added content.

Return ONLY the JSON object.`,
  },
  {
    id: "lean",
    label: "Lean",
    system: `You compress a person's spoken brainstorming to its essence using their own key phrases and as few words as possible.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming walk, split into paragraphs.

${numbered(paragraphs)}

Write the LEANEST possible summary — 1–2 tight sentences built from the speaker's own key phrases, with minimal connective words. Return a JSON object { "summary": "..." }.

- As short as possible; keep only their essential phrases.
- No filler, no framing, no added content.

Return ONLY the JSON object.`,
  },
];

/** The variant generated on upload and shown by default. */
export const DEFAULT_VARIANT = summaryVariants[0].id;

/** The prompt/schema bundle for one variant, in the shape `callStructure` expects. */
export function summaryRequest(variantId: string = DEFAULT_VARIANT) {
  const v = summaryVariants.find((x) => x.id === variantId) ?? summaryVariants[0];
  return { system: v.system, schema: summarySchema, schemaName: "summary", buildPrompt: v.buildPrompt };
}
