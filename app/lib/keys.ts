// Bring-your-own-key storage. The OpenAI key lives in the macOS Keychain (service
// "Thoughts", account "openai") via two Rust commands; it is read per request and never
// cached in JS or written to web storage.
import { invoke } from "@tauri-apps/api/core";

export interface Keys {
  openai: string;
}

export async function getKeys(): Promise<Keys> {
  const v = await invoke<string | null>("keychain_get", { account: "openai" });
  return { openai: v ?? "" };
}

export async function setKeys(keys: Keys): Promise<void> {
  await invoke("keychain_set", { account: "openai", value: keys.openai.trim() });
}

/** Ready to transcribe: a key is saved. */
export async function hasKeys(): Promise<boolean> {
  return Boolean((await getKeys()).openai);
}
