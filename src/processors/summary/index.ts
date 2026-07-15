// A derived branch off the transcript: one short digest string. The whole Overview card
// composes from primitives we already store — this scalar is its only new stored data.
import type { Transcript } from "../../core/types.js";
import type { Ctx, Processor } from "../types.js";
import { buildPrompt, summarySchema, SYSTEM, type SummaryResult } from "./prompt.js";

/** Trim the model's digest; an empty summary is worth nothing, so collapse it to "". */
export function assembleSummary(_transcript: Transcript, result: SummaryResult): string {
  return (result.summary ?? "").trim();
}

/** The LLM prompt + schema, exposed so any caller (Node or browser) can run the model
 *  itself and hand the result to `assembleSummary`. */
export const summaryLlmRequest = {
  system: SYSTEM,
  schema: summarySchema,
  schemaName: "summary",
  buildPrompt,
};

export const summaryProcessor: Processor<"summary"> = {
  id: "summary",
  reads: ["transcript"],
  version: 1,
  async produce(ctx: Ctx): Promise<string> {
    const transcript = await ctx.getArtifact("transcript");
    if (!transcript) throw new Error("summary requires a transcript artifact.");
    const result = await ctx.getLlm().generateJson<SummaryResult>({
      system: SYSTEM,
      prompt: buildPrompt(transcript.paragraphs),
      schema: summarySchema,
      schemaName: "summary",
    });
    return assembleSummary(transcript, result);
  },
};
