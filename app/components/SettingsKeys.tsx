import { useEffect, useState } from "react";
import { getKeys, setKeys } from "../lib/keys";
import "./settings-keys.css";

// Paste-your-own-key panel. The key lives in the macOS Keychain and is used for both
// transcription and structuring — one OpenAI account covers the whole app.
export function SettingsKeys({ onSaved }: { onSaved: () => void }) {
  const [openai, setOpenai] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getKeys()
      .then((k) => setOpenai((cur) => cur || k.openai)) // don't clobber what the user typed
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setKeys({ openai });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sk">
      <h2 className="sk-title">OpenAI API key</h2>
      <p className="sk-intro">
        You need your own OpenAI API key to run the app. It's stored in your macOS Keychain —
        don't have one yet? Get one below.
      </p>

      <label className="sk-field">
        <span>OpenAI key</span>
        <input
          type="password"
          value={openai}
          onChange={(e) => setOpenai(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
        />
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
          Get an OpenAI key →
        </a>
      </label>

      {error && <p className="error">{error}</p>}
      <button className="sk-save" onClick={() => void save()} disabled={saving || !openai.trim()}>
        {saving ? "Saving…" : "Save key"}
      </button>
    </div>
  );
}
