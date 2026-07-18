// A right-click "Add to dictionary" menu over a text selection inside the container.
// You notice a misheard name while reading the transcript — select it, right-click, and add
// it right there instead of retyping it in Settings. It only hijacks the context menu when
// there's a qualifying selection inside the pane; anywhere else the native menu is untouched.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cleanTerm, getDictionary, setDictionary } from "../lib/dictionary";
import "./dictionary-menu.css";

interface MenuState {
  x: number;
  y: number;
  term: string;
  inDict: boolean;
}

export function DictionaryMenu({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Open on right-click, but only for a short single-line selection inside the pane —
  // otherwise let the browser's own context menu through untouched.
  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      const box = containerRef.current;
      const sel = document.getSelection();
      if (!box || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement) return;
      const range = sel.getRangeAt(0);
      if (!box.contains(range.commonAncestorContainer)) return;
      const term = cleanTerm(sel.toString());
      if (!term) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, term, inDict: getDictionary().includes(term) });
    }
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [containerRef]);

  // Dismiss on any click, scroll, resize, or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Keep the menu on-screen: nudge it back inside the viewport if it would overflow.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu || !el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(menu.x, window.innerWidth - r.width - pad);
    const y = Math.min(menu.y, window.innerHeight - r.height - pad);
    if (x !== menu.x || y !== menu.y) el.style.transform = `translate(${x - menu.x}px, ${y - menu.y}px)`;
  }, [menu]);

  if (!menu) return null;

  function add() {
    if (!menu!.inDict) setDictionary([...getDictionary(), menu!.term]);
    setMenu(null);
  }

  return createPortal(
    <div
      ref={menuRef}
      className="dm-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button className="dm-item" onClick={add} disabled={menu.inDict}>
        {menu.inDict ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="dm-label">In dictionary</span>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="dm-label">Add to dictionary</span>
          </>
        )}
        <span className="dm-term">{menu.term}</span>
      </button>
    </div>,
    document.body,
  );
}
