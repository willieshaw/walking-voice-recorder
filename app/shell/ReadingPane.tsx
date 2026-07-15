// The memo view's single reading surface with three formatting levels of the same
// material: Raw (timestamped, seekable transcript), Clean (layers "Cleaned" — filler
// removed, order kept), and Formatted (layers "Grouped" — thematic headings + prose).
// Raw also hosts the extracted to-dos inline — a checkbox card under the paragraph each
// was spoken in. All modes coordinate through the focus store.
import { useState } from "react";
import type { Annotation, Chunk, Note } from "@core/types";
import { deriveAnnotations } from "@core/annotations";
import { useFocus } from "@core/focus";
import { formatTime } from "../components/AudioPlayer";
import { copyTodos } from "../lib/clipboard";
import { useCopyFlash } from "../lib/useCopyFlash";
import "../experiences/clean-read/clean-read.css";
import "./reading-pane.css";

type Mode = "raw" | "clean" | "formatted";

export type AnnotationPatch = Partial<Pick<Annotation, "done">>;

interface DirectiveProps {
  onPatchAnnotation: (a: Annotation, patch: AnnotationPatch) => void;
}

function TodoCard({ a, onPatchAnnotation }: { a: Annotation } & DirectiveProps) {
  const [copied, flashCopied] = useCopyFlash();
  return (
    <label className="dir-todo" onClick={() => onPatchAnnotation(a, { done: !a.done })}>
      <span className={`dir-todo-box${a.done ? " dir-todo-box-done" : ""}`}>
        {a.done ? "✓" : ""}
      </span>
      <span className="dir-todo-body">
        <span className="dir-tag dir-tag-todo">To-do</span>
        <span className={`dir-todo-text${a.done ? " dir-todo-text-done" : ""}`}>{a.label}</span>
      </span>
      <button
        className="dir-todo-copy"
        onClick={(e) => {
          e.stopPropagation();
          flashCopied(() => copyTodos([{ label: a.label, done: a.done }]));
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </label>
  );
}

/** The timestamped transcript with extracted to-dos inline. Each to-do is rendered under
 *  the last paragraph it cites (falling back to the span's start time). */
function RawView({ note, onPatchAnnotation }: { note: Note } & DirectiveProps) {
  const paragraphs = note.transcript?.paragraphs ?? [];
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  const activeId = paragraphs.find((p) => currentTime >= p.tStart && currentTime < p.tEnd)?.id;

  const todos = deriveAnnotations(note).filter((a) => a.kind === "todo");
  const anchorOf = (a: Annotation): string | undefined =>
    a.sourceIds?.[a.sourceIds.length - 1] ??
    paragraphs.find((p) => a.tStart >= p.tStart && a.tStart < p.tEnd)?.id;

  if (paragraphs.length === 0) {
    return <p className="cr-empty">No transcript yet for this note.</p>;
  }

  return (
    <article className="cr-read">
      {paragraphs.map((p) => (
        <div key={p.id}>
          <p
            className={`cr-para${p.id === activeId ? " cr-active" : ""}`}
            data-ts={formatTime(p.tStart)}
            onClick={() => seek(p.tStart, { activeChunkId: p.id })}
            title={`Jump to ${formatTime(p.tStart)}`}
          >
            {p.text}
          </p>
          {todos
            .filter((a) => anchorOf(a) === p.id)
            .map((a) => (
              <TodoCard key={a.id} a={a} onPatchAnnotation={onPatchAnnotation} />
            ))}
        </div>
      ))}
    </article>
  );
}

/** Render one layers level as seekable serif copy (headings/bullets/prose). */
function LayerView({ note, level }: { note: Note; level: 1 | 2 }) {
  const levels = note.layers?.levels ?? [];
  const active =
    levels.find((l) => l.level === level) ?? levels[Math.min(level, levels.length - 1)];
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  if (!active) return <p className="hint">Nothing here yet for this note.</p>;
  const activeId = active.chunks.find((c) => currentTime >= c.tStart && currentTime < c.tEnd)?.id;

  // A chunk is only a seek target the first time a given moment appears. Chunks that
  // resolve to a timestamp already shown (a heading + its prose, split paragraphs — they
  // share the exact resolved tStart) render as plain continuation copy: one timestamp,
  // one clickable region per distinct time. Keyed on the exact time and tracked as a set,
  // so it doesn't depend on chunk order or merge genuinely-distinct nearby times.
  const shownTimes = new Set<number>();
  const render = (c: Chunk) => {
    const isNewTime = !shownTimes.has(c.tStart);
    if (isNewTime) shownTimes.add(c.tStart);
    const cls = `cc2-chunk${c.id === activeId ? " cc2-active" : ""}${
      isNewTime ? "" : " cc2-cont"
    }`;
    const seekProps = isNewTime
      ? {
          onClick: () => seek(c.tStart, { activeChunkId: c.id }),
          title: `Jump to ${formatTime(c.tStart)}`,
          "data-ts": formatTime(c.tStart),
        }
      : {};
    if (c.kind === "heading")
      return (
        <h2 key={c.id} className={cls} {...seekProps}>
          {c.text}
        </h2>
      );
    return (
      <p key={c.id} className={cls} {...seekProps}>
        {c.kind === "bullet" ? "• " : ""}
        {c.text}
      </p>
    );
  };

  return <article className="cc2-body">{active.chunks.map(render)}</article>;
}

export function ReadingPane({
  note,
  onPatchAnnotation,
}: {
  note: Note;
} & DirectiveProps) {
  const [mode, setMode] = useState<Mode>("raw");
  const [copied, flashCopied] = useCopyFlash();
  const hasLayers = Boolean(note.layers?.levels?.length);

  /** The plain text of whichever mode is showing — no timestamps (those are a gutter,
   *  not content), bullets marked with "• " to keep the outline readable. */
  function currentText(): string {
    if (mode === "raw") {
      return (note.transcript?.paragraphs ?? []).map((p) => p.text).join("\n\n");
    }
    const level = mode === "clean" ? 1 : 2;
    const chunks = note.layers?.levels.find((l) => l.level === level)?.chunks ?? [];
    return chunks.map((c) => (c.kind === "bullet" ? `• ${c.text}` : c.text)).join("\n\n");
  }

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
          {hasLayers && pill("clean", "Clean")}
          {hasLayers && pill("formatted", "Formatted")}
        </div>
        <button
          className="rp-copy"
          onClick={() => flashCopied(() => navigator.clipboard.writeText(currentText()))}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="rp-pane" key={mode}>
        {mode === "raw" && <RawView note={note} onPatchAnnotation={onPatchAnnotation} />}
        {mode === "clean" && <LayerView note={note} level={1} />}
        {mode === "formatted" && <LayerView note={note} level={2} />}
      </div>
    </div>
  );
}
