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

/** A note as the browser sees it: an id, the audio URL, and whatever artifacts exist. */
export interface Note {
  id: string;
  title: string;
  audioUrl: string;
  durationSec: Seconds;
  createdAt?: number;
  /** The label facet: user-applied organization (no LLM). Search, Folders, and Pinned
   *  are all filtered views over these same fields — not separate subsystems. */
  tags?: string[];
  folder?: string;
  pinned?: boolean;
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
}

/** The manifest written by the CLI so the app knows which artifacts a note has. */
export interface NoteManifest {
  id: string;
  title: string;
  audioFile: string; // filename within the note folder
  durationSec: Seconds;
  artifacts: Partial<Record<ArtifactKind, ArtifactMeta>>;
}
