// The memo view's single reading surface with three formatting levels of the same
// material: Raw (timestamped, seekable transcript), Clean (layers "Cleaned" — filler
// removed, order kept), and Formatted (layers "Grouped" — thematic headings + prose).
// Raw also hosts the spoken directives inline — todo/media annotation cards rendered
// under the paragraph they were spoken in. All modes coordinate through the focus store.
import { useRef, useState } from "react";
import type { Annotation, Chunk, Note } from "@core/types";
import { deriveAnnotations } from "@core/annotations";
import { useFocus } from "@core/focus";
import { formatTime } from "../components/AudioPlayer";
import "../experiences/clean-read/clean-read.css";
import "./reading-pane.css";

type Mode = "raw" | "clean" | "formatted";

export type AnnotationPatch = Partial<Pick<Annotation, "done" | "dismissed" | "media">>;

interface DirectiveProps {
  onPatchAnnotation: (a: Annotation, patch: AnnotationPatch) => void;
}

function TodoCard({ a, onPatchAnnotation }: { a: Annotation } & DirectiveProps) {
  return (
    <label className="dir-todo" onClick={() => onPatchAnnotation(a, { done: !a.done })}>
      <span className={`dir-todo-box${a.done ? " dir-todo-box-done" : ""}`}>
        {a.done ? "✓" : ""}
      </span>
      <span className="dir-todo-body">
        <span className="dir-tag dir-tag-todo">To-do</span>
        <span className={`dir-todo-text${a.done ? " dir-todo-text-done" : ""}`}>{a.label}</span>
      </span>
    </label>
  );
}

function MediaCard({ a, onPatchAnnotation }: { a: Annotation } & DirectiveProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const attached = a.media?.url;

  function pickFile() {
    fileRef.current?.click();
  }
  function onFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      onPatchAnnotation(a, { media: { url: String(reader.result), source: "uploaded" } });
    reader.readAsDataURL(file);
  }

  return (
    <div className="dir-media">
      {attached ? (
        <img className="dir-thumb-img" src={a.media!.url} alt={a.label} />
      ) : (
        <div className="dir-thumb">{a.label}</div>
      )}
      <div className="dir-media-body">
        <span className="dir-tag dir-tag-media">{attached ? "Photo added" : "Media request"}</span>
        <div className="dir-phrase">“{a.label}”</div>
        <div className="dir-btnrow">
          <button className="dir-btn-primary" onClick={pickFile}>
            {attached ? "Replace" : "Upload"}
          </button>
          <button
            className="dir-btn-ghost"
            onClick={() =>
              attached
                ? onPatchAnnotation(a, { media: undefined })
                : onPatchAnnotation(a, { dismissed: true })
            }
          >
            {attached ? "Remove" : "Dismiss"}
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
}

/** The timestamped transcript with directive cards inline. Each todo/media annotation is
 *  rendered under the last paragraph it cites (falling back to the span's start time). */
function RawView({ note, onPatchAnnotation }: { note: Note } & DirectiveProps) {
  const paragraphs = note.transcript?.paragraphs ?? [];
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  const activeId = paragraphs.find((p) => currentTime >= p.tStart && currentTime < p.tEnd)?.id;

  const directives = deriveAnnotations(note).filter(
    (a) => (a.kind === "todo" || a.kind === "media") && !a.dismissed,
  );
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
          {directives
            .filter((a) => anchorOf(a) === p.id)
            .map((a) =>
              a.kind === "todo" ? (
                <TodoCard key={a.id} a={a} onPatchAnnotation={onPatchAnnotation} />
              ) : (
                <MediaCard key={a.id} a={a} onPatchAnnotation={onPatchAnnotation} />
              ),
            )}
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

  const render = (c: Chunk) => {
    const cls = `cc2-chunk${c.id === activeId ? " cc2-active" : ""}`;
    const onClick = () => seek(c.tStart, { activeChunkId: c.id });
    const title = `Jump to ${formatTime(c.tStart)}`;
    const ts = formatTime(c.tStart);
    if (c.kind === "heading")
      return (
        <h2 key={c.id} className={cls} data-ts={ts} onClick={onClick} title={title}>
          {c.text}
        </h2>
      );
    return (
      <p key={c.id} className={cls} data-ts={ts} onClick={onClick} title={title}>
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
  const [copied, setCopied] = useState(false);
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — no-op */
    }
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
        <button className="rp-copy" onClick={handleCopy}>
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
