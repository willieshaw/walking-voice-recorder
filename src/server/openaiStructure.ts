// Isomorphic (Node CLI and the desktop app): ask OpenAI chat completions to structure
// text against a JSON Schema, using the caller's key. No fs, no storage, no logging.
const CHAT_URL = "https://api.openai.com/v1/chat/completions";

export interface StructureRequest {
  system: string;
  prompt: string;
  /** JSON Schema the response must conform to (OpenAI structured outputs, strict mode). */
  schema: Record<string, unknown>;
  /** Schema name required by OpenAI's response_format.json_schema.name. */
  schemaName: string;
  apiKey: string;
  model?: string;
}

export async function openaiStructure(
  req: StructureRequest,
  /** The desktop app passes Tauri's CORS-free fetch; Node uses the global. */
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const upstream = await fetchImpl(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: req.schemaName, schema: req.schema, strict: true },
      },
    }),
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
