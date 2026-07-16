// The memo's "…" menu: Move to folder… / Delete note. A folder is just a label, so the
// move picker is a plain list over the same folder set the Folders modal uses; delete is
// the soft kind (sets `deletedAt` — the note moves to Settings › Recently deleted).
import { useEffect, useRef, useState } from "react";
import "./memo-menu.css";

export function MemoMenu({
  folders,
  currentFolder,
  combined = false,
  canReanalyze,
  onReanalyze,
  onCombine,
  onMove,
  onDelete,
}: {
  folders: string[];
  currentFolder?: string;
  /** True when this note already has a combination — flips the label to "Edit combination…". */
  combined?: boolean;
  /** False when the note is already on the latest prompts — Re-analyze stays listed, greyed. */
  canReanalyze: boolean;
  onReanalyze: () => void;
  onCombine: () => void;
  onMove: (folder: string | undefined) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false); // showing the folder list
  const rootRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setPicking(false);
  }

  // Click-outside + Escape close the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mm" ref={rootRef}>
      <button
        className={`mm-btn${open ? " mm-btn-open" : ""}`}
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>

      {open && (
        <div className="mm-pop" role="menu">
          {!picking ? (
            <>
              <button
                className="mm-item"
                role="menuitem"
                onClick={() => {
                  close();
                  onCombine();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {combined ? "Edit combination…" : "Combine notes…"}
              </button>
              <button
                className="mm-item"
                role="menuitem"
                disabled={!canReanalyze}
                title={canReanalyze ? undefined : "Analysis is up to date"}
                onClick={() => {
                  close();
                  onReanalyze();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                Re-analyze
              </button>
              <button className="mm-item" role="menuitem" onClick={() => setPicking(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                Move to folder…
              </button>
              <button
                className="mm-item mm-danger"
                role="menuitem"
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
                Delete note
              </button>
            </>
          ) : (
            <>
              <div className="mm-head">Move to</div>
              {folders.length === 0 && <div className="mm-empty">No folders yet</div>}
              {folders.map((f) => (
                <button
                  key={f}
                  className="mm-item"
                  role="menuitem"
                  onClick={() => {
                    close();
                    if (f !== currentFolder) onMove(f);
                  }}
                >
                  <span className="mm-check">{f === currentFolder ? "✓" : ""}</span>
                  {f}
                </button>
              ))}
              {currentFolder && (
                <button
                  className="mm-item mm-muted"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onMove(undefined);
                  }}
                >
                  <span className="mm-check" />
                  Remove from folder
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
