// The memo view's reading surface with two readings of the same material: Raw (the
// timestamped transcript) and Clean (the layers "Cleaned" reading — filler removed,
// punctuation and paragraphs fixed, the same words otherwise). Both render through one
// shared paragraph list so their styling stays identical. Extracted to-dos live only in
// the Overview now, not inline here. (A "Formatted" reading was retired — see below.)
//
// Paragraphs are correctable in place (M5.1): a pencil appears at the right of the hovered
// paragraph; clicking it swaps the text for a textarea. Enter/blur commits, Esc cancels.
// Text-only — timestamps and ids never change, so seeking and the gutter survive edits.
import { useRef, useState } from "react";
import type { Chunk, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../components/AudioPlayer";
import { useCopyFlash } from "../lib/useCopyFlash";
import { DictionaryTip } from "./DictionaryTip";
import "../experiences/clean-read/clean-read.css";
import "./reading-pane.css";

type Mode = "raw" | "clean";

/* ══ EXPERIMENT: transcript interaction variants ═══════════════════════════════════════
 * Four ways to split the paragraph between "play from here" and "edit this". Pick one
 * from the dropdown next to Raw/Clean, then delete the rest: this block, the `variant`
 * branches inside ReadingList, the switcher in ReadingPane, and the EXPERIMENT block in
 * reading-pane.css. */
type Variant = "current" | "inverted" | "deliberate" | "toolbar";

const VARIANTS: { id: Variant; label: string }[] = [
  { id: "current", label: "1 · Click plays (current)" },
  { id: "inverted", label: "2 · Click edits, time plays" },
  { id: "deliberate", label: "3 · Double-click edits" },
  { id: "toolbar", label: "4 · Hover toolbar" },
];

const VARIANT_KEY = "wvr.readingVariant";

function storedVariant(): Variant {
  const v = localStorage.getItem(VARIANT_KEY);
  return VARIANTS.some((x) => x.id === v) ? (v as Variant) : "current";
}
/* ══ end EXPERIMENT block ═════════════════════════════════════════════════════════════ */

/** One shared, seekable list of timestamped paragraphs. Raw and Clean both use this, so
 *  the two readings are styled identically by construction. */
function ReadingList({
  items,
  variant,
  onEdit,
}: {
  items: Chunk[];
  variant: Variant;
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
  // Headings are section titles (combined notes), not seekable body — skip them here.
  const activeId = items.find(
    (c) => c.kind !== "heading" && currentTime >= c.tStart && currentTime < c.tEnd,
  )?.id;

  function startEdit(c: Chunk) {
    cancelEdit.current = false;
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

  /* EXPERIMENT: per-variant handlers. A click that ends a text selection is neither a
   * seek nor an edit — the reader is grabbing words (e.g. for the dictionary). */
  function selecting(): boolean {
    return !(document.getSelection()?.isCollapsed ?? true);
  }
  function paraClick(c: Chunk) {
    if (selecting()) return;
    if (variant === "current") seek(c.tStart, { activeChunkId: c.id });
    else if (variant === "inverted" && onEdit) startEdit(c);
  }
  function paraDoubleClick(c: Chunk) {
    if (variant === "deliberate" && onEdit && !selecting()) startEdit(c);
  }
  function paraTitle(c: Chunk): string | undefined {
    if (variant === "current") return `Jump to ${formatTime(c.tStart)}`;
    if (!onEdit) return undefined;
    if (variant === "inverted") return "Click to edit";
    if (variant === "deliberate") return "Double-click to edit";
    return undefined;
  }
  // Which variants keep the hover pencil at the right edge (toolbar has its own ✎;
  // inverted edits on click, so a pencil would be redundant).
  const sidePencil = variant === "current" || variant === "deliberate";
  // A real timestamp button replaces the CSS-generated gutter label where time = play.
  const tsPlays = variant === "inverted" || variant === "deliberate";

  return (
    <article className={`cr-read crv-${variant}`}>
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
          <p key={c.id} className="cr-para cr-editing" data-ts={formatTime(c.tStart)}>
            <textarea
              className="cr-edit-input"
              autoFocus
              value={draft}
              ref={(el) => {
                autosize(el);
                // Put the caret at the end instead of selecting everything.
                if (el && el.selectionStart === 0 && el.selectionEnd === el.value.length) {
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
            className={`cr-para${c.id === activeId ? " cr-active" : ""}`}
            data-ts={tsPlays ? undefined : formatTime(c.tStart)}
            onClick={() => paraClick(c)}
            onDoubleClick={() => paraDoubleClick(c)}
            title={paraTitle(c)}
          >
            {tsPlays && (
              <button
                className="cr-ts"
                title={`Play from ${formatTime(c.tStart)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  seek(c.tStart, { activeChunkId: c.id });
                }}
              >
                {formatTime(c.tStart)}
              </button>
            )}
            {c.text}
            {variant === "toolbar" && (
              <span className="cr-tools">
                <button
                  className="cr-tool"
                  title={`Play from ${formatTime(c.tStart)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    seek(c.tStart, { activeChunkId: c.id });
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 4.5v15l13-7.5z" />
                  </svg>
                </button>
                {onEdit && (
                  <button
                    className="cr-tool"
                    title="Edit paragraph"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(c);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                    </svg>
                  </button>
                )}
              </span>
            )}
            {onEdit && sidePencil && (
              <button
                className="cr-edit-btn"
                title="Edit paragraph"
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(c);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                </svg>
              </button>
            )}
            {onEdit && c.originalText !== undefined && (
              <button
                className={`cr-edit-btn cr-revert-btn${sidePencil ? "" : " cr-revert-solo"}`}
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
  // EXPERIMENT: which interaction paradigm the transcript uses (see VARIANTS above).
  const [variant, setVariant] = useState<Variant>(storedVariant);
  function switchVariant(v: Variant) {
    setVariant(v);
    localStorage.setItem(VARIANT_KEY, v);
  }

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
        {/* EXPERIMENT: interaction-variant switcher — delete with the block above. */}
        <select
          className="rp-variant"
          title="Transcript interaction experiment"
          value={variant}
          onChange={(e) => switchVariant(e.target.value as Variant)}
        >
          {VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
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
          variant={variant}
          onEdit={onEdit ? (chunkId, text) => onEdit(mode, chunkId, text) : undefined}
        />
      </div>
    </div>
  );
}
