// Combined notes, composed on read — NOT a stored structure. A host note carries an ordered
// `combinedFrom` list of note ids; this folds those source notes into ONE synthetic `Note`
// laid out on a single global timeline, so the existing player, reading pane, and digest
// render it unchanged. Nothing is merged or moved on disk: the sources stay independent.
//
// The composition:
//   · transcript.paragraphs — each source's paragraphs, time-shifted by the running offset
//     and preceded by a `heading` chunk (the source title) so the reading pane can show
//     titled source sections.
//   · annotations — one `moment` per source at its offset (→ the player chapters by source)
//     plus every source's `todo`s, shifted (→ the digest's merged to-do list).
//   · summary — the source summaries joined (a merged blurb, no new LLM call).
//   · layers (Clean) — each source's cleaned reading, shifted, when every source has one.
// `segments` drives the chained audio player (one blob per source, played back-to-back).
import type { Annotation, Chunk, FormattingLayers, Note, Transcript } from "./types.js";
import { deriveAnnotations } from "./annotations.js";

export interface CombinedSegment {
  noteId: string;
  title: string;
  /** Global start time of this source on the combined timeline. */
  offset: number;
  duration: number;
  audioUrl: string;
}

export interface Combined {
  /** A synthetic note on one global timeline — fed to the player / reading pane / digest. */
  note: Note;
  /** One entry per source, in play order — drives the chained audio player. */
  segments: CombinedSegment[];
}

/** Is this host note actually combined (a reference list of 2+ notes)? */
export function isCombined(note: Pick<Note, "combinedFrom">): boolean {
  return (note.combinedFrom?.length ?? 0) >= 2;
}

/** Shift a chunk onto the global timeline and namespace its id to its source. */
function shiftChunk(c: Chunk, i: number, offset: number): Chunk {
  return { ...c, id: `s${i}-${c.id}`, tStart: c.tStart + offset, tEnd: c.tEnd + offset };
}

/** The cleaned reading's paragraphs (layers level 1) for one source, or [] if none. */
function cleanedOf(note: Note): Chunk[] {
  return note.layers?.levels.find((l) => l.level === 1)?.chunks ?? [];
}

/**
 * Fold `sources` (already in `host.combinedFrom` order) into one synthetic combined note.
 * `host` supplies the note's identity/labels; the sources supply the timeline content.
 */
export function resolveCombined(host: Note, sources: Note[]): Combined {
  const segments: CombinedSegment[] = [];
  const paragraphs: Chunk[] = [];
  const cleaned: Chunk[] = [];
  const annotations: Annotation[] = [];
  const summaryParts: string[] = [];
  let offset = 0;
  let everyHasClean = true;

  sources.forEach((src, i) => {
    const dur = src.durationSec || src.transcript?.durationSec || 0;
    segments.push({ noteId: src.id, title: src.title, offset, duration: dur, audioUrl: src.audioUrl });

    // A section header, then this source's paragraphs, all on the global timeline.
    const head: Chunk = { id: `sec-${i}`, text: src.title, kind: "heading", tStart: offset, tEnd: offset };
    const srcParas = src.transcript?.paragraphs ?? [];
    paragraphs.push(head, ...srcParas.map((p) => shiftChunk(p, i, offset)));

    const srcClean = cleanedOf(src);
    if (srcClean.length) cleaned.push(head, ...srcClean.map((c) => shiftChunk(c, i, offset)));
    else everyHasClean = false;

    // One chapter per source (its title), plus the source's own to-dos, time-shifted.
    annotations.push({
      id: `combo-moment-${i}`,
      kind: "moment",
      label: src.title,
      tStart: offset,
      tEnd: offset + dur,
    });
    deriveAnnotations(src)
      .filter((a) => a.kind === "todo")
      .forEach((a, j) =>
        annotations.push({
          ...a,
          id: `s${i}-${a.id ?? `todo-${j}`}`,
          tStart: a.tStart + offset,
          tEnd: a.tEnd + offset,
        }),
      );

    if (src.summary) summaryParts.push(src.summary.trim());
    offset += dur;
  });

  const transcript: Transcript = {
    text: paragraphs.map((p) => p.text).join("\n\n"),
    paragraphs,
    words: [],
    durationSec: offset,
  };

  const layers: FormattingLayers | undefined =
    everyHasClean && cleaned.length
      ? { levels: [{ level: 1, label: "Cleaned", chunks: cleaned }] }
      : undefined;

  const note: Note = {
    ...host,
    durationSec: offset,
    transcript,
    layers,
    keymoments: undefined,
    annotations,
    summary: summaryParts.join("\n\n") || undefined,
    summaries: undefined, // variants don't apply to a merged summary
  };

  return { note, segments };
}
