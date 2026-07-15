// A derived branch off the transcript: spoken to-dos as Annotation spans. Same one-resolver
// story as key moments — the model cites paragraph ids, `assembleAnnotations` resolves
// timestamps and drops anything uncited. `done` is a user mutation layered on later.
import type { Annotation, Transcript } from "../../core/types.js";
import { assembleAnnotations } from "../../core/annotations.js";
import type { Ctx, Processor } from "../types.js";
import { buildPrompt, directivesSchema, SYSTEM, type DirectivesResult } from "./prompt.js";

export function assembleDirectives(
  transcript: Transcript,
  result: DirectivesResult,
): Annotation[] {
  return assembleAnnotations(
    transcript,
    result.items.map((d) => ({ kind: "todo" as const, label: d.phrase, sourceIds: d.sourceIds })),
    "dir",
  );
}

/** The LLM prompt + schema, exposed so any caller (Node or browser) can run the model
 *  itself and hand the result to `assembleDirectives`. */
export const directivesLlmRequest = {
  system: SYSTEM,
  schema: directivesSchema,
  schemaName: "directives",
  buildPrompt,
};

export const directivesProcessor: Processor<"directives"> = {
  id: "directives",
  reads: ["transcript"],
  version: 1,
  async produce(ctx: Ctx): Promise<Annotation[]> {
    const transcript = await ctx.getArtifact("transcript");
    if (!transcript) throw new Error("directives requires a transcript artifact.");
    const result = await ctx.getLlm().generateJson<DirectivesResult>({
      system: SYSTEM,
      prompt: buildPrompt(transcript.paragraphs),
      schema: directivesSchema,
      schemaName: "directives",
    });
    return assembleDirectives(transcript, result);
  },
};
