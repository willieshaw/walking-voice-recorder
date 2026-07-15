// The memo view's reading surface with two readings of the same material: Raw (the
// timestamped transcript) and Clean (the layers "Cleaned" reading — filler removed,
// punctuation and paragraphs fixed, the same words otherwise). Both render through one
// shared paragraph list so their styling stays identical. Extracted to-dos live only in
// the Overview now, not inline here. (A "Formatted" reading was retired — see below.)
import { useState } from "react";
import type { Chunk, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../components/AudioPlayer";
import { useCopyFlash } from "../lib/useCopyFlash";
import "../experiences/clean-read/clean-read.css";
import "./reading-pane.css";

type Mode = "raw" | "clean";

/** One shared, seekable list of timestamped paragraphs. Raw and Clean both use this, so
 *  the two readings are styled identically by construction. */
function ReadingList({ items }: { items: Chunk[] }) {
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  const activeId = items.find((c) => currentTime >= c.tStart && currentTime < c.tEnd)?.id;

  if (items.length === 0) {
    return <p className="cr-empty">Nothing here yet for this note.</p>;
  }

  return (
    <article className="cr-read">
      {items.map((c) => (
        <p
          key={c.id}
          className={`cr-para${c.id === activeId ? " cr-active" : ""}`}
          data-ts={formatTime(c.tStart)}
          onClick={() => seek(c.tStart, { activeChunkId: c.id })}
          title={`Jump to ${formatTime(c.tStart)}`}
        >
          {c.text}
        </p>
      ))}
    </article>
  );
}

/** The cleaned reading's paragraphs (layers level 1), or [] if not built yet. */
function cleanedChunks(note: Note): Chunk[] {
  return note.layers?.levels.find((l) => l.level === 1)?.chunks ?? [];
}

export function ReadingPane({ note }: { note: Note }) {
  const [mode, setMode] = useState<Mode>("raw");
  const [copied, flashCopied] = useCopyFlash();
  const hasClean = cleanedChunks(note).length > 0;

  const items: Chunk[] =
    mode === "clean" ? cleanedChunks(note) : (note.transcript?.paragraphs ?? []);

  /** The plain text of whichever reading is showing — no timestamps (those are a gutter,
   *  not content). */
  const currentText = () => items.map((c) => c.text).join("\n\n");

  const pill = (m: Mode, label: string) => (
    <button
      key={m}
      className={`rp-pill${mode === m ? " rp-pill-active" : ""}`}
      onClick={() => setMode(m)}
    >
      {label}
    </button>
  );

  return (
    <div className="rp">
      <div className="rp-top">
        <div className="rp-switch">
          {pill("raw", "Raw")}
          {hasClean && pill("clean", "Clean")}
          {/* "Formatted" (the layers grouped reading) is deprecated and hidden for now. */}
        </div>
        <button
          className="rp-copy"
          onClick={() => flashCopied(() => navigator.clipboard.writeText(currentText()))}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="rp-pane" key={mode}>
        <ReadingList items={items} />
      </div>
    </div>
  );
}
