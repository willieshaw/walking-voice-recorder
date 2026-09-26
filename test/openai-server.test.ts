import { describe, expect, it } from "vitest";
import { openaiTranscribe } from "../src/server/openaiTranscribe.js";
import { openaiStructure } from "../src/server/openaiStructure.js";

function fakeFetch(reply: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

describe("openaiTranscribe / openaiStructure accept an injected fetch", () => {
  it("transcribe posts multipart to Whisper with the bearer key and prompt", async () => {
    const { f, calls } = fakeFetch({ text: "hi" });
    const res = await openaiTranscribe(new Blob(["x"]), "a.m4a", "sk-test", "Mara", f);
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = calls[0].init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("prompt")).toBe("Mara");
    expect((form.get("file") as File).name).toBe("a.m4a");
  });

  it("structure posts a strict json_schema chat completion", async () => {
    const { f, calls } = fakeFetch({ choices: [] });
    await openaiStructure(
      { system: "s", prompt: "p", schema: { type: "object" }, schemaName: "r", apiKey: "sk-test" },
      f,
    );
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0]).toEqual({ role: "system", content: "s" });
  });

  it("structure passes an OpenAI error through with its status and body", async () => {
    const f = (async () =>
      new Response('{"error":{"message":"bad key"}}', { status: 401 })) as typeof fetch;
    const res = await openaiStructure(
      { system: "s", prompt: "p", schema: { type: "object" }, schemaName: "r", apiKey: "sk-bad" },
      f,
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toBe("bad key");
  });

  it("transcribe passes a non-OK status and error body straight through", async () => {
    const f = (async () =>
      new Response('{"error":{"message":"bad key"}}', { status: 401 })) as unknown as typeof fetch;
    const res = await openaiTranscribe(new Blob(["x"]), "a.m4a", "sk-bad", undefined, f);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toBe("bad key");
  });
});
