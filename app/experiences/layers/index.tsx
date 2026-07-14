import { useState } from "react";
import type { Chunk, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../../components/AudioPlayer";
import type { Experience } from "../types";
import "./layers.css";

// The formatting-level scrubber: slide from Raw (0) to Outline (3). Clicking any chunk
// seeks the shared audio player to that moment; the chunk under the playhead highlights.
function Layers({ note }: { note: Note }) {
  const levels = note.layers?.levels ?? [];
  // Default to "Grouped" if present — enough structure to feel useful, not so much it hides nuance.
  const [level, setLevel] = useState(() => Math.min(2, levels.length - 1));
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);

  if (levels.length === 0) {
    return <p className="ly-empty">No layers yet for this note.</p>;
  }

  const active = levels[Math.min(level, levels.length - 1)];
  const activeId = active.chunks.find(
    (c) => currentTime >= c.tStart && currentTime < c.tEnd,
  )?.id;

  return (
    <div className="ly-wrap">
      <div className="ly-control">
        <span className="ly-control-label">Formatting</span>
        <input
          type="range"
          min={0}
          max={levels.length - 1}
          step={1}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
          className="ly-slider"
          aria-label="Formatting level"
        />
        <span className="ly-level-name">{active.label}</span>
      </div>

      <article className="ly-body">
        {active.chunks.map((c) => (
          <ChunkView key={c.id} chunk={c} active={c.id === activeId} onSeek={seek} />
        ))}
      </article>
    </div>
  );
}

function ChunkView({
  chunk,
  active,
  onSeek,
}: {
  chunk: Chunk;
  active: boolean;
  onSeek: (t: number, focus?: { activeChunkId?: string }) => void;
}) {
  const cls = `ly-chunk ly-${chunk.kind ?? "text"}${active ? " ly-active" : ""}`;
  const onClick = () => onSeek(chunk.tStart, { activeChunkId: chunk.id });
  const title = `Jump to ${formatTime(chunk.tStart)}`;

  if (chunk.kind === "heading") {
    return (
      <h3 className={cls} onClick={onClick} title={title}>
        {chunk.text}
      </h3>
    );
  }
  if (chunk.kind === "bullet") {
    return (
      <div className={cls} onClick={onClick} title={title}>
        <span className="ly-dot">•</span>
        {chunk.text}
      </div>
    );
  }
  return (
    <p className={cls} onClick={onClick} title={title}>
      {chunk.text}
    </p>
  );
}

export const layers: Experience = {
  id: "layers",
  title: "Layers",
  requires: ["layers", "audio"],
  Component: Layers,
};
