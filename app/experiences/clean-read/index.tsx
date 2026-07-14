import type { Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../../components/AudioPlayer";
import type { Experience } from "../types";
import "./clean-read.css";

function CleanRead({ note }: { note: Note }) {
  const paragraphs = note.transcript?.paragraphs ?? [];
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);

  // The paragraph currently being spoken (read-only derive from shared currentTime).
  const activeId = paragraphs.find(
    (p) => currentTime >= p.tStart && currentTime < p.tEnd,
  )?.id;

  if (paragraphs.length === 0) {
    return <p className="cr-empty">No transcript yet for this note.</p>;
  }

  return (
    <article className="cr-read">
      {paragraphs.map((p) => (
        <p
          key={p.id}
          className={`cr-para${p.id === activeId ? " cr-active" : ""}`}
          onClick={() => seek(p.tStart, { activeChunkId: p.id })}
          title={`Jump to ${formatTime(p.tStart)}`}
        >
          <span className="cr-time">{formatTime(p.tStart)}</span>
          {p.text}
        </p>
      ))}
    </article>
  );
}

export const cleanRead: Experience = {
  id: "clean-read",
  title: "Listen",
  requires: ["transcript"],
  Component: CleanRead,
};
