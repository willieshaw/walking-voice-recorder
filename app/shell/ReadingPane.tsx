// The memo view's single reading surface: a Transcript ↔ Clean copy switch (plus Concepts
// as a secondary mode when available). Transcript = the timestamped, seekable paragraphs;
// Clean copy = the layers "Grouped" level. All modes coordinate through the focus store.
import { useState } from "react";
import type { Chunk, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../components/AudioPlayer";
import { cleanRead } from "../experiences/clean-read";
import { conceptCloud } from "../experiences/concept-cloud";
import { artifactsPresent } from "../experiences/types";
import { isEnabled } from "../config/flags";
import "./reading-pane.css";

type Mode = "transcript" | "clean" | "concepts";

function CleanCopy({ note }: { note: Note }) {
  const levels = note.layers?.levels ?? [];
  // "Grouped" (headings + prose) reads closest to the design's Clean copy; fall back down.
  const level = levels.find((l) => l.level === 2) ?? levels[levels.length - 1];
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  if (!level) return <p className="hint">No clean copy yet for this note.</p>;
  const activeId = level.chunks.find((c) => currentTime >= c.tStart && currentTime < c.tEnd)?.id;

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

  return <article className="cc2-body">{level.chunks.map(render)}</article>;
}

export function ReadingPane({ note }: { note: Note }) {
  const [mode, setMode] = useState<Mode>("transcript");
  const hasClean = Boolean(note.layers?.levels?.length);
  const hasConcepts =
    isEnabled(conceptCloud.id) && artifactsPresent(note, conceptCloud.requires);

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
        {pill("transcript", "Transcript")}
        {hasClean && pill("clean", "Clean copy")}
        {hasConcepts && pill("concepts", "Concepts")}
      </div>
      <div className="rp-pane" key={mode}>
        {mode === "transcript" && <cleanRead.Component note={note} />}
        {mode === "clean" && <CleanCopy note={note} />}
        {mode === "concepts" && <conceptCloud.Component note={note} />}
      </div>
    </div>
  );
}
