// A derived branch off the transcript: the handful of spans worth jumping to. Timestamps
// are resolved locally from the paragraph ids the model cited; a moment with no valid
// citation is dropped — a marker at a made-up time is worse than no marker.
import type { Chunk, KeyMoment, Transcript } from "../../core/types.js";
import type { Ctx, Processor } from "../types.js";
import { buildPrompt, keyMomentsSchema, SYSTEM, type KeyMomentsResult } from "./prompt.js";

/** Resolve cited paragraph ids into timestamped moments. Shared by Node and browser. */
export function assembleKeyMoments(
  transcript: Transcript,
  result: KeyMomentsResult,
): KeyMoment[] {
  const byId = new Map(transcript.paragraphs.map((p) => [p.id, p]));
  return result.moments
    .flatMap((m) => {
      const sources = m.sourceIds.map((id) => byId.get(id)).filter((c): c is Chunk => !!c);
      if (!sources.length) return []; // no valid citation — drop
      return [
        {
          label: m.label,
          tStart: Math.min(...sources.map((s) => s.tStart)),
          tEnd: Math.max(...sources.map((s) => s.tEnd)),
        },
      ];
    })
    .sort((a, b) => a.tStart - b.tStart)
    .map((m, i) => ({ id: `km-${i}`, ...m }));
}

/** The LLM prompt + schema, exposed so any caller (Node or browser) can run the model
 *  itself and hand the result to `assembleKeyMoments`. */
export const keyMomentsLlmRequest = {
  system: SYSTEM,
  schema: keyMomentsSchema,
  schemaName: "keymoments",
  buildPrompt,
};

export const keyMomentsProcessor: Processor<"keymoments"> = {
  id: "keymoments",
  reads: ["transcript"],
  version: 1,
  async produce(ctx: Ctx): Promise<KeyMoment[]> {
    const transcript = await ctx.getArtifact("transcript");
    if (!transcript) throw new Error("keymoments requires a transcript artifact.");
    const result = await ctx.getLlm().generateJson<KeyMomentsResult>({
      system: SYSTEM,
      prompt: buildPrompt(transcript.paragraphs),
      schema: keyMomentsSchema,
      schemaName: "keymoments",
    });
    return assembleKeyMoments(transcript, result);
  },
};
