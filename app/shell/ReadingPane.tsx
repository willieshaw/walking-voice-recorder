// The memo view's reading surface with two readings of the same material: Raw (the
// timestamped transcript) and Clean (the layers "Cleaned" reading — filler removed,
// punctuation and paragraphs fixed, the same words otherwise). Both render through one
// shared paragraph list so their styling stays identical. Extracted to-dos live only in
// the Overview now, not inline here. (A "Formatted" reading was retired — see below.)
//
// The transcript reads as a document you own: clicking a paragraph opens it for editing
// in place, with the caret landing where you clicked (M5.1). Playing from a paragraph is
// the deliberate action — the gutter timestamp is the play button. Enter/blur commits,
// Esc cancels. Text-only — timestamps and ids never change, so seeking survives edits.
import { useRef, useState } from "react";
import type { Chunk, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../components/AudioPlayer";
import { useCopyFlash } from "../lib/useCopyFlash";
import { DictionaryTip } from "./DictionaryTip";
import "../experiences/clean-read/clean-read.css";
import "./reading-pane.css";

type Mode = "raw" | "clean";

/** The character index inside the paragraph's text where the user clicked, so the edit
 *  caret can land exactly there — or null (caret goes to the end) when the click wasn't
 *  on the text itself (padding, the gutter, an old browser without caret-from-point). */
function caretIndexFromClick(e: React.MouseEvent<HTMLElement>): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
  if (pos) {
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  // Only a hit on the paragraph's own text node maps 1:1 onto the chunk text — a hit on
  // the timestamp button or another child would give an offset into the wrong string.
  return node?.nodeType === Node.TEXT_NODE && node.parentElement === e.currentTarget
    ? offset
    : null;
}

/** One shared, seekable list of timestamped paragraphs. Raw and Clean both use this, so
 *  the two readings are styled identically by construction. */
function ReadingList({
  items,
  onEdit,
}: {
  items: Chunk[];
  /** Commit one paragraph's corrected text. Absent = read-only (e.g. combined view). */
  onEdit?: (chunkId: string, text: string) => void;
}) {
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Set when the user cancels (Escape): the textarea's blur still fires on unmount, and
  // this tells commit() to discard instead of applying the edited value.
  const cancelEdit = useRef(false);
  // Where the caret should land when the editor opens (null = end of text). Consumed by
  // the textarea's ref callback on mount, then cleared so later renders leave it alone.
  const caretAt = useRef<number | null>(null);
  // Headings are section titles (combined notes), not seekable body — skip them here.
  const activeId = items.find(
    (c) => c.kind !== "heading" && currentTime >= c.tStart && currentTime < c.tEnd,
  )?.id;

  function startEdit(c: Chunk, caret: number | null = null) {
    cancelEdit.current = false;
    caretAt.current = caret;
    setDraft(c.text);
    setEditingId(c.id);
  }

  function commit(c: Chunk) {
    setEditingId(null);
    if (cancelEdit.current) {
      cancelEdit.current = false;
      return;
    }
    const text = draft.trim();
    if (text && text !== c.text) onEdit?.(c.id, text);
  }

  /** Keep the textarea exactly as tall as its content. */
  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  if (items.length === 0) {
    return <p className="cr-empty">Nothing here yet for this note.</p>;
  }

  /** A click that ends a text selection is neither an edit nor a seek — the reader is
   *  grabbing words (e.g. for the dictionary). */
  function selecting(): boolean {
    return !(document.getSelection()?.isCollapsed ?? true);
  }

  return (
    <article className="cr-read">
      {items.map((c) =>
        c.kind === "heading" ? (
          <h3
            key={c.id}
            className="cr-section"
            onClick={() => seek(c.tStart)}
            title={`Jump to ${formatTime(c.tStart)}`}
          >
            {c.text}
          </h3>
        ) : c.id === editingId ? (
          <p key={c.id} className="cr-para cr-editing">
            {/* The same .cr-ts button as the reading state — rendering it identically in
             *  both avoids the paragraph's timestamp jumping when the editor opens/closes. */}
            <button
              className="cr-ts"
              title={`Play from ${formatTime(c.tStart)}`}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => seek(c.tStart, { activeChunkId: c.id })}
            >
              <span className="cr-ts-num">{formatTime(c.tStart)}</span>
            </button>
            <textarea
              className="cr-edit-input"
              autoFocus
              value={draft}
              ref={(el) => {
                autosize(el);
                if (!el) return;
                if (caretAt.current !== null) {
                  // Land the caret where the opening click was, not at the start.
                  const i = Math.min(caretAt.current, el.value.length);
                  el.setSelectionRange(i, i);
                  caretAt.current = null;
                } else if (el.selectionStart === 0 && el.selectionEnd === el.value.length) {
                  // No click position (e.g. programmatic open): caret at the end, not
                  // everything selected.
                  el.setSelectionRange(el.value.length, el.value.length);
                }
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                autosize(e.target);
              }}
              onBlur={() => commit(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commit(c);
                } else if (e.key === "Escape") {
                  cancelEdit.current = true;
                  setEditingId(null);
                }
              }}
            />
          </p>
        ) : (
          <p
            key={c.id}
            className={`cr-para${onEdit ? " cr-editable" : ""}${
              c.id === activeId ? " cr-active" : ""
            }`}
            onClick={(e) => {
              if (onEdit && !selecting()) startEdit(c, caretIndexFromClick(e));
            }}
            title={onEdit ? "Click to edit" : undefined}
          >
            <button
              className="cr-ts"
              title={`Play from ${formatTime(c.tStart)}`}
              onClick={(e) => {
                e.stopPropagation();
                seek(c.tStart, { activeChunkId: c.id });
              }}
            >
              <span className="cr-ts-num">{formatTime(c.tStart)}</span>
            </button>
            {c.text}
            {onEdit && c.originalText !== undefined && (
              <button
                className="cr-edit-btn cr-revert-btn"
                title="Undo all edits — revert to the original"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(c.id, c.originalText!);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6" />
                  <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                </svg>
              </button>
            )}
          </p>
        ),
      )}
    </article>
  );
}

/** The cleaned reading's paragraphs (layers level 1), or [] if not built yet. */
function cleanedChunks(note: Note): Chunk[] {
  return note.layers?.levels.find((l) => l.level === 1)?.chunks ?? [];
}

export function ReadingPane({
  note,
  onEdit,
}: {
  note: Note;
  /** Commit a corrected paragraph (mode tells which reading it belongs to). Absent =
   *  read-only, e.g. the combined view — edit the source note instead. */
  onEdit?: (mode: Mode, chunkId: string, text: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("raw");
  const [copied, flashCopied] = useCopyFlash();
  const hasClean = cleanedChunks(note).length > 0;
  // Highlighting a word or short phrase anywhere in the pane offers "Add to dictionary".
  const paneRef = useRef<HTMLDivElement>(null);

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
    <div className="rp" ref={paneRef}>
      <DictionaryTip containerRef={paneRef} />
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
      {/* Keyed by note + mode so switching either one resets any in-progress edit. */}
      <div className="rp-pane" key={`${note.id}-${mode}`}>
        <ReadingList
          items={items}
          onEdit={onEdit ? (chunkId, text) => onEdit(mode, chunkId, text) : undefined}
        />
      </div>
    </div>
  );
}
