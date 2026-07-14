// Isomorphic (Node 18+ and Cloudflare Workers): ask OpenAI chat completions to structure
// text against a JSON Schema, using the caller's key. No fs, no storage, no logging — a
// pass-through so the browser can call the model despite OpenAI not allowing direct
// browser (CORS) calls to chat completions either.
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

export async function openaiStructure(req: StructureRequest): Promise<Response> {
  const upstream = await fetch(CHAT_URL, {
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
