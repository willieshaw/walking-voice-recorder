// The collapsible Overview card — a composed VIEW over primitives we already store, not a
// structure of its own: Summary (the `summary` scalar) + To do (`todo` annotations, done
// persisted).
import { useState } from "react";
import type { Annotation, Note } from "@core/types";
import { deriveAnnotations } from "@core/annotations";
import { copyTodos } from "../lib/clipboard";
import { useCopyFlash } from "../lib/useCopyFlash";
import "./digest-card.css";

export function DigestCard({
  note,
  onToggleTodo,
}: {
  note: Note;
  onToggleTodo: (annotation: Annotation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, flashCopied] = useCopyFlash();
  const todos = deriveAnnotations(note).filter((a) => a.kind === "todo");

  if (!note.summary && !todos.length) return null;

  const remaining = todos.filter((t) => !t.done).length;
  const teaser =
    note.summary && note.summary.length > 96
      ? `${note.summary.slice(0, 96).trimEnd()}…`
      : note.summary;

  return (
    <div className="dg-card">
      <button className="dg-head" onClick={() => setOpen((v) => !v)}>
        <span className="dg-eyebrow">Overview</span>
        {!open && (
          <>
            <span className="dg-teaser">{teaser}</span>
            {todos.length > 0 && (
              <span className="dg-count">
                <span className="dg-count-box" />
                {remaining ? `${remaining} to do` : "All done"}
              </span>
            )}
          </>
        )}
        <span className={`dg-caret${open ? " dg-caret-open" : ""}`}>›</span>
      </button>

      {open && (
        <div className="dg-body">
          {note.summary && (
            <section className="dg-section">
              <div className="dg-label">Summary</div>
              <p className="dg-summary">{note.summary}</p>
            </section>
          )}
          {todos.length > 0 && (
            <section className="dg-section">
              <div className="dg-section-head">
                <div className="dg-label">To do</div>
                <button className="dg-copy" onClick={() => flashCopied(() => copyTodos(todos))}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="dg-todos">
                {todos.map((t) => (
                  <label key={t.id} className="dg-todo" onClick={() => onToggleTodo(t)}>
                    <span className={`dg-box${t.done ? " dg-box-done" : ""}`}>
                      {t.done ? "✓" : ""}
                    </span>
                    <span className={`dg-todo-text${t.done ? " dg-todo-done" : ""}`}>
                      {t.label}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
