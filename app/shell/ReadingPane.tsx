// The memo view's single reading surface with three formatting levels of the same
// material: Raw (timestamped, seekable transcript), Clean (layers "Cleaned" — filler
// removed, order kept), and Formatted (layers "Grouped" — thematic headings + prose).
// All modes coordinate through the focus store.
import { useState } from "react";
import type { Chunk, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../components/AudioPlayer";
import { cleanRead } from "../experiences/clean-read";
import "./reading-pane.css";

type Mode = "raw" | "clean" | "formatted";

/** Render one layers level as seekable serif copy (headings/bullets/prose). */
function LayerView({ note, level }: { note: Note; level: 1 | 2 }) {
  const levels = note.layers?.levels ?? [];
  const active =
    levels.find((l) => l.level === level) ?? levels[Math.min(level, levels.length - 1)];
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  if (!active) return <p className="hint">Nothing here yet for this note.</p>;
  const activeId = active.chunks.find((c) => currentTime >= c.tStart && currentTime < c.tEnd)?.id;

  const render = (c: Chunk) => {
    const cls = `cc2-chunk${c.id === activeId ? " cc2-active" : ""}`;
    const onClick = () => seek(c.tStart, { activeChunkId: c.id });
    const title = `Jump to ${formatTime(c.tStart)}`;
    if (c.kind === "heading")
      return (
        <h2 key={c.id} className={cls} onClick={onClick} title={title}>
          {c.text}
        </h2>
      );
    return (
      <p key={c.id} className={cls} onClick={onClick} title={title}>
        {c.kind === "bullet" ? "• " : ""}
        {c.text}
      </p>
    );
  };

  return <article className="cc2-body">{active.chunks.map(render)}</article>;
}

export function ReadingPane({ note }: { note: Note }) {
  const [mode, setMode] = useState<Mode>("raw");
  const hasLayers = Boolean(note.layers?.levels?.length);

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
      <div className="rp-switch">
        {pill("raw", "Raw")}
        {hasLayers && pill("clean", "Clean")}
        {hasLayers && pill("formatted", "Formatted")}
      </div>
      <div className="rp-pane" key={mode}>
        {mode === "raw" && <cleanRead.Component note={note} />}
        {mode === "clean" && <LayerView note={note} level={1} />}
        {mode === "formatted" && <LayerView note={note} level={2} />}
      </div>
    </div>
  );
}
