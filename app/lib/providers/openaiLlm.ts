// Browser structuring calls. OpenAI blocks direct browser calls (confirmed by CORS
// check), so these post to our stateless /api/structure pass-through — reusing the exact
// same prompts, schemas, and assembly as the Node pipeline.
import type { Annotation, Chunk, FormattingLayers, KeyMoment, Transcript } from "@core/types";
import { assembleLayers, layersLlmRequest } from "@engine/processors/layers/index";
import type { LayersResult } from "@engine/processors/layers/prompt";
import { assembleKeyMoments, keyMomentsLlmRequest } from "@engine/processors/keymoments/index";
import type { KeyMomentsResult } from "@engine/processors/keymoments/prompt";
import { assembleSummary } from "@engine/processors/summary/index";
import { summaryRequest, type SummaryResult } from "@engine/processors/summary/prompt";
import { assembleDirectives, directivesLlmRequest } from "@engine/processors/directives/index";
import type { DirectivesResult } from "@engine/processors/directives/prompt";
import { getKeys } from "../keys";

interface LlmRequest {
  system: string;
  schema: Record<string, unknown>;
  schemaName: string;
  buildPrompt: (paragraphs: Chunk[]) => string;
}

/** Run one structured-output call through the pass-through and parse the JSON result. */
async function callStructure<T>(req: LlmRequest, paragraphs: Chunk[]): Promise<T> {
  const { openai } = getKeys();
  if (!openai) throw new Error("Add your OpenAI key in Settings.");

  const res = await fetch("/api/structure", {
    method: "POST",
    headers: { "x-openai-key": openai, "content-type": "application/json" },
    body: JSON.stringify({
      system: req.system,
      prompt: req.buildPrompt(paragraphs),
      schema: req.schema,
      schemaName: req.schemaName,
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
  return JSON.parse(content) as T;
}

export async function buildLayers(transcript: Transcript): Promise<FormattingLayers> {
  const result = await callStructure<LayersResult>(layersLlmRequest, transcript.paragraphs);
  return assembleLayers(transcript, result);
}

export async function buildKeyMoments(transcript: Transcript): Promise<KeyMoment[]> {
  const result = await callStructure<KeyMomentsResult>(
    keyMomentsLlmRequest,
    transcript.paragraphs,
  );
  return assembleKeyMoments(transcript, result);
}

export async function buildSummary(transcript: Transcript, variantId?: string): Promise<string> {
  const result = await callStructure<SummaryResult>(
    summaryRequest(variantId),
    transcript.paragraphs,
  );
  return assembleSummary(transcript, result);
}

export async function buildDirectives(transcript: Transcript): Promise<Annotation[]> {
  const result = await callStructure<DirectivesResult>(
    directivesLlmRequest,
    transcript.paragraphs,
  );
  return assembleDirectives(transcript, result);
}
