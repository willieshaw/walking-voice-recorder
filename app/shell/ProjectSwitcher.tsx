// The project ("drive") switcher at the top of the sidebar: the active project's name with
// an up/down chevron, opening a dropdown — PROJECTS list (✓ on the active one, persistent
// rename/delete buttons on every other project), Create project, and a greyed-out "Manage
// projects" placeholder. A project is one more label facet on notes; switching just
// changes which filtered view the whole app shows.
import { useEffect, useRef, useState } from "react";
import { DEFAULT_PROJECT } from "../lib/projects";
import "./project-switcher.css";

export function ProjectSwitcher({
  projects,
  active,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: {
  projects: string[];
  active: string;
  onSwitch: (p: string) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const cancelRef = useRef(false); // Escape: discard on the unmount blur
  const rootRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setCreating(false);
    setRenaming(null);
    setDraft("");
  }

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

  function commitCreate() {
    const name = draft.trim();
    setCreating(false);
    setDraft("");
    if (!name) return;
    onCreate(name);
    close();
  }

  function commitRename(target: string) {
    const name = renameVal.trim();
    setRenaming(null);
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    if (name && name !== target) onRename(target, name);
  }

  return (
    <div className="ps" ref={rootRef}>
      <button
        className={`ps-chip${open ? " ps-chip-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="ps-name">{active}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 9l5-5 5 5" />
          <path d="M7 15l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="ps-pop" role="menu">
          <div className="ps-label">Projects</div>
          {projects.map((p) =>
            renaming === p ? (
              <input
                key={p}
                className="ps-input"
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => commitRename(p)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename(p);
                  else if (e.key === "Escape") {
                    cancelRef.current = true;
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <div key={p} className="ps-item-row">
                <button
                  className={`ps-item${p === active ? " ps-item-active" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    onSwitch(p);
                    close();
                  }}
                >
                  <span className="ps-check">{p === active ? "✓" : ""}</span>
                  {p}
                </button>
                {p !== DEFAULT_PROJECT && (
                  <>
                    <button
                      className="ps-mini"
                      title="Rename project"
                      onClick={() => {
                        cancelRef.current = false;
                        setRenameVal(p);
                        setRenaming(p);
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                      </svg>
                    </button>
                    <button
                      className="ps-mini ps-mini-danger"
                      title="Delete project (its notes move to Default)"
                      onClick={() => onDelete(p)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                        <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            ),
          )}

          <div className="ps-divider" />

          {creating ? (
            <input
              className="ps-input"
              autoFocus
              placeholder="Project name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitCreate();
                else if (e.key === "Escape") {
                  setDraft("");
                  setCreating(false);
                }
              }}
            />
          ) : (
            <button className="ps-item ps-action" onClick={() => setCreating(true)}>
              <span className="ps-check">+</span>
              Create project
            </button>
          )}
          {/* Placeholder for a fuller management surface. Not a native `disabled` — that
           *  can swallow hover in some engines and the "Coming soon" tooltip must show. */}
          <button
            className="ps-item ps-action ps-item-disabled"
            title="Coming soon"
            aria-disabled="true"
          >
            <span className="ps-check">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            Manage projects
          </button>
        </div>
      )}
    </div>
  );
}
