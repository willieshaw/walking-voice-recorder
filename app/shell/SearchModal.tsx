// ⌘K search: a client-side filter over titles, tags, and full transcript text.
import { useEffect, useRef, useState } from "react";
import { searchNotes, type SearchHit } from "../lib/notesDb";
import { formatNoteDate } from "./LibraryFeed";
import "./search-modal.css";

export function SearchModal({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced: each search reads every note, so run it once the typing settles rather
  // than on every keystroke.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      searchNotes(query).then((h) => !cancelled && setHits(h));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

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
          {hits.map((h) => (
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
