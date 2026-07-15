// The "Combine notes" composer. A combination is just an ordered list of note ids stored on
// the host — this modal edits that list. The Timeline is the included notes in play order
// (drag the handle to reorder, × to remove); "Add a note" lists everything else to pull in.
// Nothing is merged or moved: Done saves the id order, the sources stay independent.
import { useMemo, useState } from "react";
import type { NoteSummary } from "../lib/notesDb";
import { formatNoteDate } from "./LibraryFeed";
import { formatTime } from "../components/AudioPlayer";
import "./combine-modal.css";

export function CombineModal({
  hostId,
  summaries,
  initial,
  onClose,
  onDone,
  onRemove,
}: {
  hostId: string;
  summaries: NoteSummary[];
  /** Current combination order (ids). Empty/short = a fresh combination seeded with the host. */
  initial: string[];
  onClose: () => void;
  onDone: (order: string[]) => void;
  onRemove: () => void;
}) {
  const byId = useMemo(() => new Map(summaries.map((s) => [s.id, s])), [summaries]);
  // Seed the timeline with the existing order, or just the host for a brand-new combination.
  const seed = (initial.length ? initial : [hostId]).filter((id) => byId.has(id));
  const [order, setOrder] = useState<string[]>(seed);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const inTimeline = new Set(order);
  const addable = summaries.filter((s) => !inTimeline.has(s.id));
  const totalSec = order.reduce((sum, id) => sum + (byId.get(id)?.durationSec ?? 0), 0);

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = order.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
  }

  const meta = (s: NoteSummary) => `${formatNoteDate(s.createdAt)} · ${formatTime(s.durationSec)}`;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="cm-card" onClick={(e) => e.stopPropagation()}>
        <div className="cm-head">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="cm-title">Combine notes</span>
        </div>
        <p className="cm-sub">
          Drag to set the order. Your original notes stay untouched — this just plays them as one.
        </p>

        <div className="cm-body">
          <div className="cm-label">
            Timeline · {order.length} note{order.length === 1 ? "" : "s"}
          </div>
          <div className="cm-timeline">
            {order.map((id, i) => {
              const s = byId.get(id);
              if (!s) return null;
              return (
                <div
                  key={id}
                  className={`cm-row${overIndex === i && dragIndex !== null ? " cm-row-over" : ""}${
                    dragIndex === i ? " cm-row-dragging" : ""
                  }`}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverIndex(i);
                    if (dragIndex !== null && dragIndex !== i) {
                      move(dragIndex, i);
                      setDragIndex(i);
                    }
                  }}
                >
                  <svg className="cm-grip" width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="9" cy="6" r="0.9" /><circle cx="9" cy="12" r="0.9" /><circle cx="9" cy="18" r="0.9" />
                    <circle cx="15" cy="6" r="0.9" /><circle cx="15" cy="12" r="0.9" /><circle cx="15" cy="18" r="0.9" />
                  </svg>
                  <span className="cm-num">{i + 1}</span>
                  <div className="cm-row-main">
                    <div className="cm-row-title">{s.title}</div>
                    <div className="cm-row-meta">{meta(s)}</div>
                  </div>
                  <button
                    className="cm-remove"
                    title="Remove from timeline"
                    onClick={() => setOrder(order.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {order.length === 0 && (
              <div className="cm-empty">Add a note below to start the timeline.</div>
            )}
          </div>

          {addable.length > 0 && (
            <>
              <div className="cm-label cm-label-add">Add a note</div>
              <div className="cm-addlist">
                {addable.map((s) => (
                  <button key={s.id} className="cm-add" onClick={() => setOrder([...order, s.id])}>
                    <span className="cm-add-plus">+</span>
                    <div className="cm-row-main">
                      <div className="cm-row-title">{s.title}</div>
                      <div className="cm-row-meta">{meta(s)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="cm-foot">
          <button className="cm-remove-combo" onClick={onRemove}>
            Remove combination
          </button>
          <span className="cm-total">≈ {formatTime(totalSec)} total</span>
          <button className="cm-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="cm-done" onClick={() => onDone(order)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
