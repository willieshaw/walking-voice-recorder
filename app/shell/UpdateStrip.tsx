// "A new version is ready": one button, progress while it downloads, error inline. Driven
// entirely by the pure updateStripState so the component holds no logic of its own.
import type { StripState } from "../lib/updater";
import "./update-strip.css";

export function UpdateStrip({
  state,
  onInstall,
  onDismiss,
}: {
  state: StripState;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  if (state.kind === "hidden") return null;
  return (
    <div className="update-strip" role="status">
      {state.kind === "available" && (
        <>
          <span>Thoughts {state.version} is ready.</span>
          <button className="ghost-btn" onClick={onInstall}>
            Restart to update
          </button>
          <button className="update-strip-close" onClick={onDismiss} aria-label="Not now">
            ×
          </button>
        </>
      )}
      {state.kind === "downloading" && (
        <span>
          Downloading Thoughts {state.version}
          {state.percent === null ? "…" : ` · ${state.percent}%`}
        </span>
      )}
      {state.kind === "error" && (
        <>
          <span className="error">Update failed: {state.message}</span>
          <button className="ghost-btn" onClick={onInstall}>
            Retry
          </button>
          <button className="update-strip-close" onClick={onDismiss} aria-label="Not now">
            ×
          </button>
        </>
      )}
    </div>
  );
}
