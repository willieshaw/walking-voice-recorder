// The personal dictionary: names and terms the transcriber should get right — characters,
// places, jargon. Stored only on this device and passed as the transcription `prompt`
// parameter, which biases Whisper toward these spellings. Non-destructive: it nudges
// recognition at the source, it never rewrites anything after the fact.

const KEY = "wvr.dictionary";

export function getDictionary(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function setDictionary(terms: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(terms));
}

/** The transcription prompt built from the dictionary: a plain comma list is the
 *  documented way to bias Whisper toward specific vocabulary. Capped so we stay inside
 *  Whisper's ~224-token prompt budget — whole terms only, never a truncated one. */
export function buildSttPrompt(terms: string[], maxChars = 600): string {
  let out = "";
  for (const raw of terms) {
    const t = raw.trim();
    if (!t) continue;
    const next = out ? `${out}, ${t}` : t;
    if (next.length > maxChars) break;
    out = next;
  }
  return out;
}
