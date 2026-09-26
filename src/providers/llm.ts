// Node-only. The structuring LLM behind a small interface so processors don't know the
// vendor and tests can swap in a fake. Default: OpenAI (gpt-4o-mini) with structured
// outputs (strict JSON schema) — reuses the same isomorphic call used by the desktop
// app, which calls it through Tauri's fetch, so Node and the app produce identical requests.
import { openaiStructure } from "../server/openaiStructure.js";

export interface LlmJsonRequest {
  system?: string;
  prompt: string;
  /** JSON Schema the response must conform to (structured outputs). */
  schema: Record<string, unknown>;
  /** Name OpenAI requires for the schema (response_format.json_schema.name). */
  schemaName?: string;
}

export interface LlmProvider {
  readonly name: string;
  generateJson<T>(req: LlmJsonRequest): Promise<T>;
}

export class OpenAiLlm implements LlmProvider {
  readonly name = "gpt-4o-mini";
  private apiKey: string;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set (needed for the layers/structuring step).");
    }
    this.apiKey = apiKey;
  }

  async generateJson<T>(req: LlmJsonRequest): Promise<T> {
    const res = await openaiStructure({
      system: req.system ?? "",
      prompt: req.prompt,
      schema: req.schema,
      schemaName: req.schemaName ?? "response",
      apiKey: this.apiKey,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Structuring failed (HTTP ${res.status}): ${detail}`);
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no message content to parse.");
    return JSON.parse(content) as T;
  }
}

/** The default provider used by the pipeline. Swap here (or in tests) to change vendors. */
export function defaultLlmProvider(): LlmProvider {
  return new OpenAiLlm();
}
