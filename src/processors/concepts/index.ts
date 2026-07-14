// A derived branch off the transcript: the recurring ideas of the walk, each linked to
// every place it was spoken. Occurrence timestamps are resolved locally from the cited
// paragraph ids; a concept with no valid citation is dropped.
import type { Chunk, Concept, Transcript } from "../../core/types.js";
import type { Ctx, Processor } from "../types.js";
import { buildPrompt, conceptsSchema, SYSTEM, type ConceptsResult } from "./prompt.js";

/** Resolve cited paragraph ids into timestamped occurrences. Shared by Node and browser. */
export function assembleConcepts(transcript: Transcript, result: ConceptsResult): Concept[] {
  const byId = new Map(transcript.paragraphs.map((p) => [p.id, p]));
  return result.concepts
    .flatMap((c) => {
      const occurrences = [...new Set(c.sourceIds)]
        .map((id) => byId.get(id))
        .filter((p): p is Chunk => !!p)
        .sort((a, b) => a.tStart - b.tStart)
        .map((p) => ({ tStart: p.tStart, tEnd: p.tEnd }));
      if (!occurrences.length) return []; // no valid citation — drop
      return [
        {
          phrase: c.phrase,
          weight: Math.min(5, Math.max(1, Math.round(c.weight))),
          occurrences,
        },
      ];
    })
    .map((c, i) => ({ id: `c-${i}`, ...c }));
}

/** The LLM prompt + schema, exposed so any caller (Node or browser) can run the model
 *  itself and hand the result to `assembleConcepts`. */
export const conceptsLlmRequest = {
  system: SYSTEM,
  schema: conceptsSchema,
  schemaName: "concepts",
  buildPrompt,
};

export const conceptsProcessor: Processor<"concepts"> = {
  id: "concepts",
  reads: ["transcript"],
  version: 1,
  async produce(ctx: Ctx): Promise<Concept[]> {
    const transcript = await ctx.getArtifact("transcript");
    if (!transcript) throw new Error("concepts requires a transcript artifact.");
    const result = await ctx.getLlm().generateJson<ConceptsResult>({
      system: SYSTEM,
      prompt: buildPrompt(transcript.paragraphs),
      schema: conceptsSchema,
      schemaName: "concepts",
    });
    return assembleConcepts(transcript, result);
  },
};
