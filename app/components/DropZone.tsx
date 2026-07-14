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
        <span className="dz-msg">
          <strong>Drop a recording here</strong> — or click to choose a file.
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
