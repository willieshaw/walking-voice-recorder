// A derived branch off the transcript: the handful of spans worth jumping to. Timestamps
// are resolved locally from the paragraph ids the model cited; a moment with no valid
// citation is dropped — a marker at a made-up time is worse than no marker.
import type { KeyMoment, Transcript } from "../../core/types.js";
import { assembleAnnotations } from "../../core/annotations.js";
import type { Ctx, Processor } from "../types.js";
import { buildPrompt, keyMomentsSchema, SYSTEM, type KeyMomentsResult } from "./prompt.js";

/** Resolve cited paragraph ids into timestamped moments. Shares the one span resolver
 *  (`assembleAnnotations`) with every other annotation kind, then narrows to the legacy
 *  `KeyMoment` shape the stored `keymoments` artifact still uses. */
export function assembleKeyMoments(
  transcript: Transcript,
  result: KeyMomentsResult,
): KeyMoment[] {
  const annotations = assembleAnnotations(
    transcript,
    result.moments.map((m) => ({ kind: "moment" as const, label: m.label, sourceIds: m.sourceIds })),
    "km",
  );
  return annotations.map(({ id, label, tStart, tEnd }) => ({ id, label, tStart, tEnd }));
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
