// Recorder → Thoughts ingest executor. Carries the bytes for one arriving transfer, asks
// the pure planner (src/core/ingest) what it means, and performs the note-store writes +
// transcription. The provisional entry point for the device/RecorderLab bridge.
import type { DeviceRecordingMetadata } from "@core/types";
import { planIngest, type IngestPlan, type IngestStream } from "@core/ingest";
import { attachMaster, ingestState, saveNote } from "./notesDb";
import { processInBrowser } from "./processInBrowser";

export interface IngestOutcome {
  action: IngestPlan["action"];
  recordingId: string;
  /** The note the transfer landed on (absent when rejected). */
  noteId?: string;
}

/** SHA-256 of a blob, lowercase hex — matches the recorder's manifest hashes. */
async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "Recording · Sep 26, 2:14 PM" — a stable title from the capture time. */
function titleFromMeta(meta: DeviceRecordingMetadata): string {
  const when = new Date(meta.startedAtUtc).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Recording · ${when}`;
}

/** Stamp the acknowledgement for whichever stream just arrived, onto a copy of the manifest. */
function acknowledged(
  meta: DeviceRecordingMetadata,
  stream: IngestStream,
  at: string,
): DeviceRecordingMetadata {
  return {
    ...meta,
    proxy: stream === "proxy" ? { ...meta.proxy, acknowledgedAt: at } : meta.proxy,
    master: stream === "master" ? { ...meta.master, acknowledgedAt: at } : meta.master,
  };
}

/**
 * Ingest one transfer from the recorder.
 * - proxy (or master-first): creates the note with id = recordingId and transcribes it.
 * - master onto an existing note: swaps in the full-quality audio, keeps the transcript.
 * - a stream already imported: a no-op. Hash mismatch: rejected before any write.
 */
export async function ingestRecording(
  stream: IngestStream,
  meta: DeviceRecordingMetadata,
  audio: Blob,
): Promise<IngestOutcome> {
  const sha256 = await sha256Hex(audio);
  const existing = await ingestState(meta.recordingId);
  const plan = planIngest(existing, { stream, meta, sha256 });
  const at = new Date().toISOString();

  switch (plan.action) {
    case "reject":
      throw new Error(plan.reason);

    case "already-present":
      return { action: plan.action, recordingId: meta.recordingId, noteId: meta.recordingId };

    case "attach-master":
      await attachMaster(meta.recordingId, audio, at);
      return { action: plan.action, recordingId: meta.recordingId, noteId: meta.recordingId };

    case "create": {
      const ext = stream === "proxy" ? "m4a" : "wav";
      const file = new File([audio], `${meta.recordingId}.${ext}`, {
        type: audio.type || (stream === "proxy" ? "audio/mp4" : "audio/wav"),
      });
      const { note } = await processInBrowser(file, {
        id: meta.recordingId,
        title: titleFromMeta(meta),
        deviceRecording: acknowledged(meta, stream, at),
      });
      // Store the blob with the same MIME fallback the File got, so the on-disk audio gets a
      // real extension (audio.m4a / audio.wav) instead of audio.bin when the transfer carried
      // no type.
      await saveNote(note, audio.type ? audio : new Blob([audio], { type: file.type }));
      return { action: plan.action, recordingId: meta.recordingId, noteId: note.id };
    }
  }
}
