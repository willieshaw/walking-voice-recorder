import { useState } from "react";
import { getKeys, setKeys } from "../lib/keys";
import "./settings-keys.css";

// Paste-your-own-key panel. The key lives only in this browser (localStorage) and is used
// for both transcription and structuring — one OpenAI account covers the whole app.
export function SettingsKeys({ onSaved }: { onSaved: () => void }) {
  const [openai, setOpenai] = useState(getKeys().openai);

  function save() {
    setKeys({ openai });
    onSaved();
  }

  return (
    <div className="sk">
      <h2 className="sk-title">OpenAI API key</h2>
      <p className="sk-intro">
        You need your own OpenAI API key to run the app. It's stored only on this device —
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

      <button className="sk-save" onClick={save} disabled={!openai.trim()}>
        Save key
      </button>
    </div>
  );
}
