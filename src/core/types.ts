// The contract between "slicing" (processors) and "showing" (experiences).
//
// ISOMORPHIC: this file must contain only type declarations and pure constants —
// NO Node imports (fs, path, openai, ...). Both the Node engine and the browser app
// import it, so anything Node-only here would break the browser bundle.

/** Every artifact kind that can live in a note folder. `audio` is the source. */
export type ArtifactKind =
  | "audio"
  | "transcript"
  | "layers"
  | "keymoments"
  | "concepts"
  | "summary"
  | "directives"
  | "embeddings";

/** Seconds into the recording. The universal join key across every experience. */
export type Seconds = number;

/** A timestamped span of transcript text. Every chunk can "click text -> seek audio". */
export interface Chunk {
  id: string;
  text: string;
  tStart: Seconds;
  tEnd: Seconds;
  /** Presentation hint for richer layers (outline). Defaults to "text". */
  kind?: "heading" | "text" | "bullet";
  /** The text as originally produced (transcription/cleaning), stamped by the first user
   *  edit. Presence = "this chunk was edited"; Revert restores it and clears the stamp. */
  originalText?: string;
}

// ── TRUNK ─────────────────────────────────────────────────────────────────────

/** A single recognized word with its timing (the finest-grained timestamp). */
export interface Word {
  word: string;
  tStart: Seconds;
  tEnd: Seconds;
}

/**
 * The canonical transcript. There is exactly one per note; every derived branch
 * references its chunks/timestamps rather than holding its own copy.
 */
export interface Transcript {
  /** Full plain text, paragraph breaks preserved as "\n\n". */
  text: string;
  /** Paragraph-level chunks (what `clean-read` renders). */
  paragraphs: Chunk[];
  /** Word-level timing, when the STT provider supplies it. */
  words: Word[];
  durationSec: Seconds;
  language?: string;
}

// ── DERIVED BRANCHES (each optional) ────────────────────────────────────────────

/** One "clean it up" branch: readings of the same content. Currently Raw + a light-touch
 *  Cleaned; levels 2–3 (Grouped/Outline) are retired but kept in the range for old data. */
export type LayerLevel = 0 | 1 | 2 | 3; // 0 Raw, 1 Cleaned, (2 Grouped, 3 Outline — retired)
export interface FormattingLayers {
  levels: { level: LayerLevel; label: string; chunks: Chunk[] }[];
}

export interface KeyMoment {
  id: string;
  label: string;
  tStart: Seconds;
  tEnd: Seconds;
}

/**
 * The composable span primitive. A labeled span anchored to transcript paragraphs — the
 * shape shared by key moments and extracted to-dos. New span-like features add a `kind`
 * (and render a view), not a new stored structure. `KeyMoment` is the legacy predecessor
 * (kind "moment"); `deriveAnnotations` folds it in for old notes.
 */
export type AnnotationKind = "moment" | "todo";
export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** Short phrase: chapter title / task. */
  label: string;
  /** Transcript paragraph ids this span was resolved from (provenance). */
  sourceIds?: string[];
  tStart: Seconds;
  tEnd: Seconds;
  /** kind "todo": user-toggled done state (persisted, not LLM output). */
  done?: boolean;
}

export interface Concept {
  id: string;
  phrase: string;
  weight: number;
  occurrences: { tStart: Seconds; tEnd: Seconds }[];
}

export interface EmbeddedChunk {
  chunkId: string;
  tStart: Seconds;
  tEnd: Seconds;
  text: string;
  vector: number[];
}
export interface Embeddings {
  model: string;
  dims: number;
  chunks: EmbeddedChunk[];
}

/** Maps each artifact kind to its on-disk payload type. `audio` has no JSON payload. */
export interface ArtifactPayloads {
  audio: never;
  transcript: Transcript;
  layers: FormattingLayers;
  keymoments: KeyMoment[];
  concepts: Concept[];
  summary: string;
  directives: Annotation[];
  embeddings: Embeddings;
}

/** Provenance written alongside every produced artifact, powering cache invalidation. */
export interface ArtifactMeta {
  kind: ArtifactKind;
  /** The producing processor's `version` at write time. */
  version: number;
  producedAt: string; // ISO timestamp
  /** versions of the inputs this artifact was derived from, for staleness checks. */
  inputVersions: Partial<Record<ArtifactKind, number>>;
}

/** Provenance supplied by the standalone recorder. The recording UUID is also the note id,
 *  allowing an iPhone proxy and a later Mac master to converge on the same note. */
export interface DeviceRecordingMetadata {
  recordingId: string;
  deviceId: string;
  startedAtUtc: string;
  endedAtUtc: string;
  timezone: string;
  segments: {
    id: string;
    order: number;
    durationSec: Seconds;
    sha256: string;
  }[];
  master: {
    format: "wav";
    sampleRateHz: 48_000;
    bitDepth: 24;
    channels: 2;
    sha256: string;
    acknowledgedAt?: string;
  };
  proxy: {
    format: "aac-lc";
    sampleRateHz: 24_000;
    bitrateKbps: 32;
    channels: 1;
    sha256: string;
    acknowledgedAt?: string;
  };
  audioProcessingVersion: number;
  firmwareVersion: string;
}

/** A note as the browser sees it: an id, the audio URL, and whatever artifacts exist. */
export interface Note {
  id: string;
  title: string;
  audioUrl: string;
  durationSec: Seconds;
  createdAt?: number;
  /** Present when this note originated on the standalone recorder. */
  deviceRecording?: DeviceRecordingMetadata;
  /** The label facet: user-applied organization (no LLM). Search, Folders, and Pinned
   *  are all filtered views over these same fields — not separate subsystems. */
  tags?: string[];
  folder?: string;
  pinned?: boolean;
  /** Project space ("drive") this note lives in — same label facet as folder, one level
   *  up. Absent = the Default project (so legacy notes need no migration). */
  project?: string;
  /** Soft delete (same label facet): set when the user deletes the note. Trashed notes are
   *  a filtered view in Settings ("Recently deleted") until restored or purged at 30 days. */
  deletedAt?: number;
  /** Combination: an ordered list of note ids (including this host) to play as one. A pure
   *  reference list — the sources stay independent everywhere; the combined note is composed
   *  on read (see core/combine.ts). Absent or <2 ids = a plain, uncombined note. */
  combinedFrom?: string[];
  transcript?: Transcript;
  layers?: FormattingLayers;
  keymoments?: KeyMoment[];
  /** The composable span primitive (moments + to-dos). Read via `deriveAnnotations`. */
  annotations?: Annotation[];
  /** A 2–3 sentence digest of the recording — the default summary variant (shown in the
   *  collapsed teaser and generated on upload). */
  summary?: string;
  /** Lazily-generated alternate summary variants, keyed by variant id. The default variant
   *  lives in `summary`; toggling to another variant in the UI fills a key here on demand. */
  summaries?: Record<string, string>;
  concepts?: Concept[];
  embeddings?: Embeddings;
  /** Processor versions each analysis was built with (browser analog of ArtifactMeta.version).
   *  Compared against the current processor versions to offer prompt upgrades; a missing
   *  entry reads as version 0 (stale). See processors/analysis.ts. */
  artifactVersions?: Partial<Record<ArtifactKind, number>>;
  /** Snapshot of the current processor versions taken when the user closed the upgrade
   *  banner. The banner stays hidden until some version moves past this stamp — a later
   *  prompt bump automatically un-dismisses it. (Re-analyze in the ⋯ menu is always there.) */
  upgradeDismissed?: Partial<Record<ArtifactKind, number>>;
}

/** The manifest written by the CLI so the app knows which artifacts a note has. */
export interface NoteManifest {
  id: string;
  title: string;
  audioFile: string; // filename within the note folder
  durationSec: Seconds;
  artifacts: Partial<Record<ArtifactKind, ArtifactMeta>>;
}
