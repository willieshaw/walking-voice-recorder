// The summary prompt + schema: distill the recording into a short digest.
//
// We keep FIVE lean prompt variants behind the numbered toggle. This generation (v2) was
// redesigned from user feedback (2026-07-16): testers preferred Otter's summaries — third
// person, concrete named details, scannable, neutral — over our first-person voice-
// preserving ones. All five are third person; each isolates one hypothesis about what made
// the preferred style work. Variant 0 is the default (generated on upload); the rest are
// generated lazily when a user toggles to them.
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
  /** Stable id used as the storage key for this variant's generated text. The UI shows
   *  variants only as numbers (1–5); the id/comment names are internal. */
  id: string;
  system: string;
  buildPrompt: (paragraphs: Chunk[]) => string;
}

/** The numbered, id-prefixed transcript every variant shares. */
function numbered(paragraphs: Chunk[]): string {
  return paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n\n");
}

/** Rules every variant shares, distilled from the user feedback:
 *  third person without labeling the person; concrete substance; calm framing;
 *  don't duplicate the to-do extractor. */
const SHARED_RULES = `- Third person, but never label the person — no "the speaker", "the user", a name, or any tag. Use bare "they" (the reader knows exactly who recorded this), or lead with the topic itself: "A pitch for a three-part series — they want…" not "The speaker is pitching…".
- Name the concrete things mentioned (titles, people, places, projects) instead of describing the thinking abstractly — the summary should help find this note again months later.
- If they voiced doubts, report them neutrally in at most one clause; don't dwell or dramatize.
- No task lists or next steps — to-dos are extracted separately.
- Only what they actually said; no advice, no invented content. Return ONLY the JSON object.`;

export const summaryVariants: SummaryVariant[] = [
  {
    // Reporter (default) — balanced third-person report: what they're working on, then the substance.
    id: "reporter",
    system: `You summarize one person's spoken brainstorming as a short third-person report — concrete, neutral, and useful for finding the note again later.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming recording, split into paragraphs.

${numbered(paragraphs)}

Write a 2–4 sentence summary. Return a JSON object { "summary": "..." }.

- Lead with what they're working on, then the key specifics and any decisions reached.
${SHARED_RULES}`,
  },
  {
    // Contents — the scannable enumerated middle (a mini table of contents).
    id: "contents",
    system: `You summarize one person's spoken brainstorming as a short third-person report whose core is one scannable enumeration of the main parts.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming recording, split into paragraphs.

${numbered(paragraphs)}

Write a 2–4 sentence summary. Return a JSON object { "summary": "..." }.

- One sentence of setup, then a single enumerating sentence that walks the main parts with a colon and parallel clauses ("…: X does this, Y does that, Z does the other"), then one wrap-up sentence if needed.
${SHARED_RULES}`,
  },
  {
    // Topic-first — subjectless and compact; opens on a noun phrase, not a person.
    id: "topic-first",
    system: `You distill one person's spoken brainstorming into the most compact useful description of its subject matter.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming recording, split into paragraphs.

${numbered(paragraphs)}

Write a 2–3 sentence summary. Return a JSON object { "summary": "..." }.

- Open with a noun phrase naming the subject ("A pitch for…", "Chapter ideas for…"), then compact sentences of specifics.
${SHARED_RULES}`,
  },
  {
    // Arc — stance, substance, resolution: opens on intent, enumerates, closes on where they landed.
    id: "arc",
    system: `You summarize one person's spoken brainstorming as a short third-person report with a clear arc: intent, substance, resolution.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming recording, split into paragraphs.

${numbered(paragraphs)}

Write a 3–5 sentence summary. Return a JSON object { "summary": "..." }.

- Three beats: one sentence on what they're doing and why; one or two enumerating the substance; one closing sentence on where they landed (a decision, an acknowledged risk they're proceeding past, or the open question they ended on).
${SHARED_RULES}`,
  },
  {
    // Their words, third person — observer stance but built from their exact vocabulary.
    id: "their-words-3p",
    system: `You summarize one person's spoken brainstorming in the third person while reusing their OWN words — their nouns and verbs, no fancier synonyms.`,
    buildPrompt: (paragraphs) => `Here is a transcript of a spoken brainstorming recording, split into paragraphs.

${numbered(paragraphs)}

Write a 2–4 sentence summary. Return a JSON object { "summary": "..." }.

- Build the sentences from the speaker's exact phrases and vocabulary wherever possible; do not introduce words they didn't use (beyond connectives).
${SHARED_RULES}`,
  },
];

/** The variant generated on upload and shown by default. */
export const DEFAULT_VARIANT = summaryVariants[0].id;

/** The prompt/schema bundle for one variant, in the shape `callStructure` expects. */
export function summaryRequest(variantId: string = DEFAULT_VARIANT) {
  const v = summaryVariants.find((x) => x.id === variantId) ?? summaryVariants[0];
  return { system: v.system, schema: summarySchema, schemaName: "summary", buildPrompt: v.buildPrompt };
}
