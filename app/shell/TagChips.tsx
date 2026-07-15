// Editable tag chips: remove via ×, add via the dashed "+ Tag" button (Enter/blur commits,
// Esc cancels). Pure label editing — persistence is the caller's onChange.
import { useEffect, useRef, useState } from "react";
import "./tag-chips.css";

export function TagChips({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function commit() {
    const t = draft.trim().toLowerCase();
    setAdding(false);
    setDraft("");
    if (t && !tags.includes(t)) onChange([...tags, t]);
  }

  return (
    <div className="tc-row">
      {tags.map((t) => (
        <span key={t} className="tc-chip">
          {t}
          <button
            className="tc-x"
            title={`Remove "${t}"`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          className="tc-input"
          value={draft}
          placeholder="tag name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
        />
      ) : (
        <button className="tc-add" onClick={() => setAdding(true)}>
          + Tag
        </button>
      )}
    </div>
  );
}
