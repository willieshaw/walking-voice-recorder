// A popup wrapper around the OpenAI-key panel, opened from the sidebar's "Add your API
// keys" placeholder so someone can get set up without hunting through Settings. Same panel
// the Settings page uses; a "View in settings" link takes them there for the full page.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SettingsKeys } from "../components/SettingsKeys";
import "./keys-modal.css";

export function KeysModal({
  onSaved,
  onViewSettings,
  onClose,
}: {
  /** The key was saved — the caller re-checks readiness and closes. */
  onSaved: () => void;
  onViewSettings: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-scrim km-scrim" onClick={onClose}>
      <div className="km-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <SettingsKeys onSaved={onSaved} />
        <div className="km-foot">
          <button className="km-link" onClick={onViewSettings}>
            View in settings →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
