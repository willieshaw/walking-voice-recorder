// A derived branch off the transcript (the trunk): one way to "clean it up". Claude
// produces a lightly-cleaned reading; we resolve each chunk's audio timestamps locally
// from the transcript paragraph ids it cited, so every chunk can "click text -> seek audio".
import type { Chunk, FormattingLayers, LayerLevel, Transcript } from "../../core/types.js";
import type { Ctx, Processor } from "../types.js";
import { buildPrompt, layersSchema, SYSTEM, type LayersResult, type LlmChunk } from "./prompt.js";

/** Resolve LLM chunks (which cite transcript paragraph ids) into timestamped prose chunks.
 *  Exported so the browser BYOK pipeline can reuse the exact same logic. */
export function resolve(items: LlmChunk[], prefix: string, byId: Map<string, Chunk>): Chunk[] {
  let lastEnd = 0;
  return items.map((it, i) => {
    const sources = it.sourceIds.map((id) => byId.get(id)).filter((c): c is Chunk => !!c);
    let tStart: number;
    let tEnd: number;
    if (sources.length) {
      tStart = Math.min(...sources.map((s) => s.tStart));
      tEnd = Math.max(...sources.map((s) => s.tEnd));
    } else {
      tStart = lastEnd; // no valid citation — fall back to where the last chunk ended
      tEnd = lastEnd;
    }
    lastEnd = tEnd;
    return { id: `${prefix}-${i}`, text: it.text, kind: "text", tStart, tEnd };
  });
}

/** Combine the transcript (L0 Raw) with Claude's cleaned reading (L1) into the two levels,
 *  resolving each chunk's audio timestamps. Shared by the Node processor and the browser
 *  BYOK pipeline so both produce identical output. (Grouped/Outline levels were retired
 *  with the "Formatted" reading mode — see ReadingPane.) */
export function assembleLayers(
  transcript: Transcript,
  result: LayersResult,
): FormattingLayers {
  const byId = new Map(transcript.paragraphs.map((p) => [p.id, p]));
  const raw: Chunk[] = transcript.paragraphs.map((p) => ({ ...p, kind: "text" }));
  const levels: { level: LayerLevel; label: string; chunks: Chunk[] }[] = [
    { level: 0, label: "Raw", chunks: raw },
    { level: 1, label: "Cleaned", chunks: resolve(result.cleaned, "l1", byId) },
  ];
  return { levels };
}

/** The LLM prompt + schema for the layers step, exposed so any caller (Node or browser)
 *  can run the model itself and hand the result to `assembleLayers`. */
export const layersLlmRequest = {
  system: SYSTEM,
  schema: layersSchema,
  schemaName: "layers",
  buildPrompt,
};

export const layersProcessor: Processor<"layers"> = {
  id: "layers",
  reads: ["transcript"],
  version: 2, // v2: cleaned-only, light-touch prompt (grouped/outline retired)
  async produce(ctx: Ctx): Promise<FormattingLayers> {
    const transcript = await ctx.getArtifact("transcript");
    if (!transcript) throw new Error("layers requires a transcript artifact.");
    const result = await ctx.getLlm().generateJson<LayersResult>({
      system: SYSTEM,
      prompt: buildPrompt(transcript.paragraphs),
      schema: layersSchema,
      schemaName: "layers",
    });
    return assembleLayers(transcript, result);
  },
};
