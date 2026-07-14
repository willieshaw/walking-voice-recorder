// Browser Layers structuring. OpenAI blocks direct browser calls (confirmed by CORS check),
// so this posts to our stateless /api/structure pass-through — reusing the exact same
// prompt, schema, and assembly as the Node pipeline.
import type { FormattingLayers, Transcript } from "@core/types";
import { assembleLayers, layersLlmRequest } from "@engine/processors/layers/index";
import type { LayersResult } from "@engine/processors/layers/prompt";
import { getKeys } from "../keys";

export async function buildLayers(transcript: Transcript): Promise<FormattingLayers> {
  const { openai } = getKeys();
  if (!openai) throw new Error("Add your OpenAI key in Settings.");

  const res = await fetch("/api/structure", {
    method: "POST",
    headers: { "x-openai-key": openai, "content-type": "application/json" },
    body: JSON.stringify({
      system: layersLlmRequest.system,
      prompt: layersLlmRequest.buildPrompt(transcript.paragraphs),
      schema: layersLlmRequest.schema,
      schemaName: layersLlmRequest.schemaName,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
    };
    const msg = typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(msg || `Structuring failed (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no message content to parse.");
  const result = JSON.parse(content) as LayersResult;
  return assembleLayers(transcript, result);
}
