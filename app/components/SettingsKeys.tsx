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
      <h2 className="sk-title">Your OpenAI key</h2>
      <p className="sk-intro">
        This app runs in your browser using your own OpenAI key — for both transcribing
        your recording and structuring it into the Layers view. It's stored only on this
        device. (Your recording and its transcript pass through a small stateless relay to
        reach OpenAI, since OpenAI doesn't allow calling its API directly from a browser —
        nothing is ever stored there.)
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
      <p className="sk-note">
        Tip: set a small monthly spend limit on your account so there are no surprises.
      </p>
    </div>
  );
}
