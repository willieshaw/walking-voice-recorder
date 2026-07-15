// The collapsible Overview card — a composed VIEW over primitives we already store, not a
// structure of its own: Summary (the `summary` scalar, with a toggle across lazily-built
// prompt variants) + To do (`todo` annotations, done persisted).
import { useEffect, useState } from "react";
import type { Annotation, Note } from "@core/types";
import { deriveAnnotations } from "@core/annotations";
import { DEFAULT_VARIANT, summaryVariants } from "@engine/processors/summary/prompt";
import { copyTodos } from "../lib/clipboard";
import { useCopyFlash } from "../lib/useCopyFlash";
import "./digest-card.css";

export function DigestCard({
  note,
  onToggleTodo,
  onEnsureSummaryVariant,
}: {
  note: Note;
  onToggleTodo: (annotation: Annotation) => void;
  onEnsureSummaryVariant: (variantId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, flashCopied] = useCopyFlash();
  // Which summary variant is showing, and whether we're generating one / hit an error.
  const [vi, setVi] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const todos = deriveAnnotations(note).filter((a) => a.kind === "todo");

  // Reset the toggle when switching notes.
  useEffect(() => {
    setVi(0);
    setBusy(false);
    setErr(false);
  }, [note.id]);

  if (!note.summary && !todos.length) return null;

  const remaining = todos.filter((t) => !t.done).length;
  const teaser =
    note.summary && note.summary.length > 96
      ? `${note.summary.slice(0, 96).trimEnd()}…`
      : note.summary;

  const variant = summaryVariants[vi];
  const variantText =
    variant.id === DEFAULT_VARIANT ? note.summary : note.summaries?.[variant.id];
  // We can offer the toggle only when there's a transcript to build alternates from.
  const canVary = Boolean(note.transcript);

  async function generate(id: string) {
    const cached = id === DEFAULT_VARIANT ? !!note.summary : !!note.summaries?.[id];
    setErr(false);
    if (cached) return;
    setBusy(true);
    try {
      await onEnsureSummaryVariant(id);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  function pick(index: number) {
    if (busy || index === vi) return;
    setVi(index);
    void generate(summaryVariants[index].id);
  }

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
              {canVary && (
                <div className="dg-variants">
                  {summaryVariants.map((v, i) => (
                    <button
                      key={v.id}
                      className={`dg-vpill${i === vi ? " dg-vpill-active" : ""}`}
                      disabled={busy}
                      onClick={() => pick(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
              {busy ? (
                <p className="dg-summary dg-summary-muted">
                  <span className="dg-vspin" /> Thinking…
                </p>
              ) : err ? (
                <p className="dg-summary dg-summary-muted">
                  Couldn’t write this one.{" "}
                  <button className="dg-vretry" onClick={() => void generate(variant.id)}>
                    Retry
                  </button>
                </p>
              ) : (
                <p className="dg-summary">{variantText}</p>
              )}
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
