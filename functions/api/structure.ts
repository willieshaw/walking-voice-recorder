// Cloudflare Pages Function: POST /api/structure
// Deploys alongside the static site (same URL, free). Stateless pass-through to OpenAI
// chat completions using the tester's own key. Stores nothing, logs nothing. The request
// body carries { system, prompt, schema, schemaName } — the browser builds these from the
// shared layers prompt/schema so both the Node CLI and the browser produce identical output.
import { openaiStructure } from "../../src/server/openaiStructure";

interface StructureBody {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  schemaName: string;
}

export const onRequestPost: (ctx: { request: Request }) => Promise<Response> = async ({
  request,
}) => {
  const apiKey = request.headers.get("x-openai-key");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing x-openai-key header." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const body = (await request.json()) as StructureBody;
  return openaiStructure({ ...body, apiKey });
};
