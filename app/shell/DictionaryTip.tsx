// A floating "Add to dictionary" pill over a text selection inside the container.
// You notice a misheard name while reading the transcript — this catches it right there,
// instead of asking you to retype the term in Settings. Selection-driven: it appears for
// short single-line selections, repositions on scroll, and vanishes when the selection
// collapses. Rendered through a portal so ancestor transforms can't skew its fixed position.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cleanTerm, getDictionary, setDictionary } from "../lib/dictionary";
import "./dictionary-tip.css";

export function DictionaryTip({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; term: string } | null>(null);
  const [added, setAdded] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    function update() {
      // While the "Added ✓" flash is up, its timer owns the pill — don't reposition it.
      if (hideTimer.current !== undefined) return;
      const sel = document.getSelection();
      const box = containerRef.current;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !box) return setTip(null);
      // A selection inside the paragraph-edit textarea is editing, not term-picking.
      const focused = document.activeElement;
      if (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement) {
        return setTip(null);
      }
      const range = sel.getRangeAt(0);
      if (!box.contains(range.commonAncestorContainer)) return setTip(null);
      const term = cleanTerm(sel.toString());
      if (!term) return setTip(null);
      const r = range.getBoundingClientRect();
      setAdded(false);
      setTip({ x: r.left + r.width / 2, y: r.top, term });
    }
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.clearTimeout(hideTimer.current);
    };
  }, [containerRef]);

  if (!tip) return null;
  const inDict = getDictionary().includes(tip.term);

  function add() {
    if (inDict) {
      setTip(null);
      return;
    }
    setDictionary([...getDictionary(), tip!.term]);
    setAdded(true);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined;
      setTip(null);
    }, 1100);
  }

  return createPortal(
    <button
      className={`dt-pill${added ? " dt-added" : ""}`}
      style={{ left: tip.x, top: tip.y }}
      // preventDefault keeps the mousedown from collapsing the selection before the
      // click lands; stopPropagation keeps the click off the paragraph's seek handler.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        add();
      }}
    >
      {added ? (
        "Added ✓"
      ) : inDict ? (
        "In dictionary ✓"
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add to dictionary
        </>
      )}
    </button>,
    document.body,
  );
}
