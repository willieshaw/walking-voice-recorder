// "A new version is ready", in the sidebar just above Settings so it shows on every view:
// one button, progress while it downloads, error inline. The collapsed rail gets a single
// icon instead. Driven entirely by the pure updateStripState / updateRailState so the
// components hold no logic of their own.
import type { RailState, StripState } from "../lib/updater";
import "./update-strip.css";

function ArrowUpIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V8M8.5 11.5L12 8l3.5 3.5" />
    </svg>
  );
}

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
    <div className={`update-strip update-strip-${state.kind}`} role="status">
      <div className="update-strip-head">
        <span className="update-strip-icon">
          <ArrowUpIcon size={15} />
        </span>
        <span className="update-strip-text">
          {state.kind === "available" && <>Thoughts <span className="update-strip-ver">{state.version}</span> is ready.</>}
          {state.kind === "downloading" && (
            <>
              Downloading Thoughts <span className="update-strip-ver">{state.version}</span>
              {state.percent === null ? "…" : ` · ${state.percent}%`}
            </>
          )}
          {state.kind === "error" && <span className="error">Update failed: {state.message}</span>}
        </span>
        {state.kind !== "downloading" && (
          <button className="update-strip-close" onClick={onDismiss} aria-label="Not now" title="Not now">
            ×
          </button>
        )}
      </div>
      {state.kind === "downloading" && state.percent !== null && (
        <div className="update-strip-bar" aria-hidden>
          <span style={{ width: `${state.percent}%` }} />
        </div>
      )}
      {state.kind !== "downloading" && (
        <button className="ghost-btn update-strip-go" onClick={onInstall}>
          {state.kind === "error" ? "Retry" : "Restart to update"}
        </button>
      )}
    </div>
  );
}

/** The collapsed rail's indicator, sitting just above the Settings icon. */
export function UpdateRailButton({
  state,
  tone,
  onInstall,
  onExpand,
}: {
  state: RailState;
  /** The strip's kind, for colour: ready, in progress, or failed. */
  tone: StripState["kind"];
  onInstall: () => void;
  onExpand: () => void;
}) {
  if (state.kind === "hidden") return null;
  return (
    <button
      className={`rail-btn rail-update rail-update-${tone}`}
      title={state.label}
      aria-label={state.label}
      onClick={state.action === "install" ? onInstall : onExpand}
    >
      <ArrowUpIcon size={18} />
      <span className="rail-update-dot" aria-hidden />
    </button>
  );
}
