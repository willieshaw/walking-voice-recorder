import { useEffect, useRef, useState } from "react";

// A title that turns into a text input when activated, saving on Enter/blur (Esc cancels).
// The input is rendered *inside* the wrapper tag so it inherits its font — used for both
// the small sidebar titles (activate on double-click; single-click still selects the note)
// and the large note-screen heading (activate on single-click).
export function EditableTitle({
  value,
  onSave,
  activateOn,
  as: Tag = "span",
  className,
}: {
  value: string;
  onSave: (title: string) => void;
  activateOn: "click" | "dblclick";
  as?: "span" | "h2";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  }

  return (
    <Tag
      className={className}
      title={editing ? undefined : "Rename"}
      onClick={activateOn === "click" && !editing ? () => setEditing(true) : undefined}
      onDoubleClick={activateOn === "dblclick" ? () => setEditing(true) : undefined}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      ) : (
        value
      )}
    </Tag>
  );
}
