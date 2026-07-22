// Bring-your-own-key storage. The tester's own OpenAI key lives only in this browser's
// localStorage. It's sent per-request to our stateless /api/transcribe and /api/structure
// pass-throughs (OpenAI doesn't allow direct browser calls to either endpoint) — those
// functions store nothing and log nothing; see functions/.
export interface Keys {
  openai: string;
}

const OPENAI = "wvr.openaiKey";

/** Dev only: is a key available from the local .env on the server? The Vite config sets this
 *  boolean (never the key's value) — so the app can unlock and let the dev proxy fill the key
 *  in, and a browser-storage wipe doesn't force re-entering it. Always false in production. */
export function hasDevServerKey(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_HAS_KEY === true;
}

export function getKeys(): Keys {
  return { openai: localStorage.getItem(OPENAI) ?? "" };
}

export function setKeys(keys: Keys): void {
  localStorage.setItem(OPENAI, keys.openai.trim());
}

/** Ready to transcribe: the browser has a saved key, OR (dev) the server has one in .env.
 *  When only the dev key exists, requests send an empty key header and the proxy fills it. */
export function hasKeys(): boolean {
  return Boolean(getKeys().openai) || hasDevServerKey();
}
