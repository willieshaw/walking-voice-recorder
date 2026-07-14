// Bring-your-own-key storage. The tester's own OpenAI key lives only in this browser's
// localStorage. It's sent per-request to our stateless /api/transcribe and /api/structure
// pass-throughs (OpenAI doesn't allow direct browser calls to either endpoint) — those
// functions store nothing and log nothing; see functions/.
export interface Keys {
  openai: string;
}

const OPENAI = "wvr.openaiKey";

export function getKeys(): Keys {
  return { openai: localStorage.getItem(OPENAI) ?? "" };
}

export function setKeys(keys: Keys): void {
  localStorage.setItem(OPENAI, keys.openai.trim());
}

export function hasKeys(): boolean {
  return Boolean(getKeys().openai);
}
