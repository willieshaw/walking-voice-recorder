import { useState } from "react";
import type { Note } from "@core/types";
import type { Experience } from "../types";
import "./plain-text.css";

// The plain, copyable view: just the words, no timestamps, no markdown, not interactive —
// so a writer can grab the text and paste it straight into their manuscript.
function PlainText({ note }: { note: Note }) {
  const text = note.transcript?.text ?? "";
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!text) {
    return <p className="pt-empty">No transcript yet for this note.</p>;
  }

  return (
    <div className="pt-wrap">
      <div className="pt-bar">
        <button className="pt-copy" onClick={copyAll}>
          {copied ? "Copied!" : "Copy all"}
        </button>
      </div>
      <div className="pt-text">{text}</div>
    </div>
  );
}

export const plainText: Experience = {
  id: "plain-text",
  title: "Transcript",
  requires: ["transcript"],
  Component: PlainText,
};
