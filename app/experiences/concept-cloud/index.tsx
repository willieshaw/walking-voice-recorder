// The concept cloud: the walk's recurring ideas, sized by how central they were.
// Click a concept to jump to where it was said; click it again to cycle through its
// other occurrences. Ordered by first mention, so reading order follows the recording.
import { useRef } from "react";
import type { Concept, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../../components/AudioPlayer";
import type { Experience } from "../types";
import "./concept-cloud.css";

function ConceptCloud({ note }: { note: Note }) {
  const concepts = note.concepts ?? [];
  const seek = useFocus((s) => s.seek);
  const activeConceptId = useFocus((s) => s.activeConceptId);
  // Which occurrence a repeated click on the active concept jumps to next.
  const cycleRef = useRef<Record<string, number>>({});

  if (concepts.length === 0) {
    return <p className="hint">No concepts were found in this recording.</p>;
  }

  const weights = concepts.map((c) => c.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const fontSize = (w: number) =>
    max === min ? 1.2 : 0.95 + ((w - min) / (max - min)) * 1.15; // 0.95rem – 2.1rem

  const ordered = [...concepts].sort(
    (a, b) => a.occurrences[0].tStart - b.occurrences[0].tStart,
  );

  function handleClick(c: Concept) {
    const idx =
      c.id === activeConceptId ? (cycleRef.current[c.id] ?? 0) % c.occurrences.length : 0;
    cycleRef.current[c.id] = idx + 1;
    seek(c.occurrences[idx].tStart, { activeConceptId: c.id });
  }

  return (
    <div className="cc-cloud">
      {ordered.map((c) => (
        <button
          key={c.id}
          className={`cc-concept${c.id === activeConceptId ? " cc-active" : ""}`}
          style={{ fontSize: `${fontSize(c.weight)}rem` }}
          onClick={() => handleClick(c)}
          title={`"${c.phrase}" — ${c.occurrences.length} mention${
            c.occurrences.length > 1 ? "s" : ""
          }, first at ${formatTime(c.occurrences[0].tStart)}`}
        >
          {c.phrase}
          {c.occurrences.length > 1 && <sup className="cc-count">×{c.occurrences.length}</sup>}
        </button>
      ))}
    </div>
  );
}

export const conceptCloud: Experience = {
  id: "concept-cloud",
  title: "Concepts",
  requires: ["concepts"],
  Component: ConceptCloud,
};
