// The recorder → Thoughts ingestion contract (isomorphic; pure logic only, no Node/browser
// APIs). Two streams arrive from the standalone recorder, possibly out of order:
//
//   • proxy  — the compact AAC transcription proxy, typically first over BLE.
//   • master — the archival WAV, later over Wi-Fi or USB.
//
// The recording UUID doubles as the note id, so both streams converge on one note:
//   1. Whichever stream arrives first CREATES the note and drives transcription.
//   2. A later master ATTACHES to that note by id — the audio is upgraded to full quality,
//      but the transcript and every analysis are left untouched (never re-transcribed).
//   3. A stream already acknowledged is a no-op (transfers resume/dedupe after interruption).
//   4. Bytes whose hash doesn't match the recorder's manifest are rejected before anything
//      is written (per-file integrity is verified before a master is "safely imported").
//
// This module decides WHAT to do; the app layer (app/lib/ingest.ts) carries the bytes and
// performs the IndexedDB writes + transcription.
import type { DeviceRecordingMetadata } from "./types.js";

export type IngestStream = "proxy" | "master";

/** One arriving transfer: which stream, the recorder's manifest, and the hash of the bytes
 *  actually received (computed by the caller) for verification. */
export interface IngestPayload {
  stream: IngestStream;
  meta: DeviceRecordingMetadata;
  sha256: string;
}

/** The minimal read-model of an existing note the planner needs — kept tiny so it stays a
 *  pure function of already-loaded state. */
export interface IngestNoteState {
  recordingId: string;
  /** The note already holds full-quality master audio (its master transfer is acknowledged). */
  hasMaster: boolean;
}

export type IngestPlan =
  /** No note yet: this stream creates it and drives transcription. */
  | { action: "create"; stream: IngestStream; recordingId: string }
  /** Note exists with only the proxy: swap in the master, keep the transcript. */
  | { action: "attach-master"; recordingId: string }
  /** This stream was already ingested (a resumed/duplicated transfer). */
  | { action: "already-present"; stream: IngestStream; recordingId: string }
  /** The received bytes don't match the manifest hash — reject, don't write. */
  | { action: "reject"; stream: IngestStream; recordingId: string; reason: string };

/** The hash the manifest promises for this stream. */
function manifestHash(meta: DeviceRecordingMetadata, stream: IngestStream): string {
  return stream === "proxy" ? meta.proxy.sha256 : meta.master.sha256;
}

/** Decide what an arriving transfer means, given the note it would land on (or null). */
export function planIngest(existing: IngestNoteState | null, payload: IngestPayload): IngestPlan {
  const { stream, meta, sha256 } = payload;
  const recordingId = meta.recordingId;

  const expected = manifestHash(meta, stream);
  if (expected && sha256 !== expected) {
    return {
      action: "reject",
      stream,
      recordingId,
      reason: `${stream} SHA-256 does not match the recorder's manifest`,
    };
  }

  if (!existing) {
    // First bytes for this recording — either stream can be the origin (proxy over BLE is
    // typical; a USB "first import" can deliver the master first).
    return { action: "create", stream, recordingId };
  }

  if (stream === "master") {
    return existing.hasMaster
      ? { action: "already-present", stream, recordingId }
      : { action: "attach-master", recordingId };
  }

  // A proxy for a note that already exists: the note already has audio (proxy or the better
  // master) and a transcript, so there's nothing to add.
  return { action: "already-present", stream, recordingId };
}
