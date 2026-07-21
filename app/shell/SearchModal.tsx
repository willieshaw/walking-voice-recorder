// ⌘K search: a client-side filter over titles, tags, and full transcript text. Before
// any typing, the modal isn't empty — it offers the most recent notes as launch points.
import { useEffect, useRef, useState } from "react";
import { listNotes, searchNotes, type SearchHit } from "../lib/notesDb";
import { DEFAULT_PROJECT } from "../lib/projects";
import { formatNoteDate } from "./LibraryFeed";
import "./search-modal.css";

export function SearchModal({
  project,
  onClose,
  onOpen,
}: {
  /** Active project space — search stays inside it. */
  project: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  // The empty-query default: latest notes in this project, shaped like search hits.
  const [recent, setRecent] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listNotes().then((all) => {
      if (cancelled) return;
      setRecent(
        all
          .filter((s) => !s.deletedAt && (s.project ?? DEFAULT_PROJECT) === project)
          .slice(0, 6)
          .map((s) => ({
            id: s.id,
            title: s.title,
            createdAt: s.createdAt,
            folder: s.folder,
            snippet: s.snippet,
          })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  // Debounced: each search reads every note, so run it once the typing settles rather
  // than on every keystroke.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      searchNotes(query, project).then((h) => !cancelled && setHits(h));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, project]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="sm-card" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="sm-input"
            value={query}
            placeholder="Search all notes"
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="sm-results">
          {!query.trim() && recent.length > 0 && <div className="sm-label">Recent</div>}
          {(query.trim() ? hits : recent).map((h) => (
            <a
              key={h.id}
              className="sm-hit"
              role="button"
              tabIndex={0}
              onClick={() => {
                onOpen(h.id);
                onClose();
              }}
            >
              <div className="sm-hit-meta">
                {h.folder ? `${h.folder} · ` : ""}
                {formatNoteDate(h.createdAt)}
              </div>
              <div className="sm-hit-title">{h.title}</div>
              <div className="sm-hit-snippet">{h.snippet}</div>
            </a>
          ))}
          {query.trim() && hits.length === 0 && (
            <div className="sm-none">No notes match your search</div>
          )}
        </div>
      </div>
    </div>
  );
}
