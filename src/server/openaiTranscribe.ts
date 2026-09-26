// Isomorphic (Node CLI and the desktop app): forward an audio Blob to OpenAI Whisper
// using the caller's key and return OpenAI's response verbatim. No fs, no storage, and it
// never logs the key.
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function openaiTranscribe(
  audio: Blob,
  filename: string,
  apiKey: string,
  /** Optional vocabulary-bias prompt (the user's personal dictionary). */
  prompt?: string,
  /** The desktop app passes Tauri's CORS-free fetch; Node uses the global. */
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  if (prompt) form.append("prompt", prompt);

  const upstream = await fetchImpl(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  // Pass OpenAI's status + JSON body straight back to the caller.
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
