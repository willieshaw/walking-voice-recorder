import { useRef, useState } from "react";
import "./drop-zone.css";

type Status = { kind: "idle" } | { kind: "working"; name: string } | { kind: "error"; msg: string };

/** Drop (or pick) an audio file to transcribe it into a new note. */
export function DropZone({
  onUpload,
  disabled = false,
}: {
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file || disabled) return;
    setStatus({ kind: "working", name: file.name });
    try {
      await onUpload(file);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", msg: err instanceof Error ? err.message : String(err) });
    }
  }

  const working = status.kind === "working";
  const blocked = disabled || working;

  if (disabled && status.kind === "idle") {
    return (
      <div className="dz dz-disabled">
        <span className="dz-msg">Add your API keys to record.</span>
      </div>
    );
  }

  return (
    <div
      className={`dz${over ? " dz-over" : ""}${working ? " dz-working" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!blocked) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!blocked) void handle(e.dataTransfer.files[0]);
      }}
      onClick={() => !blocked && inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.mp4"
        hidden
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      {status.kind === "working" && (
        <span className="dz-msg">
          <span className="dz-spinner" /> Transcribing “{status.name}”… this can take a
          minute or two.
        </span>
      )}
      {status.kind === "idle" && (
        <span className="dz-idle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 15V4" />
            <path d="M7.5 8.5L12 4l4.5 4.5" />
            <path d="M4 15v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <strong className="dz-title">Drop audio to transcribe</strong>
          <span className="dz-sub">MP3, WAV, m4a — or click to browse</span>
        </span>
      )}
      {status.kind === "error" && (
        <span className="dz-msg dz-error">
          {status.msg} <span className="dz-retry">— click to try again</span>
        </span>
      )}
    </div>
  );
}
