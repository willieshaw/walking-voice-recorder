// The one resolver + one read helper behind the Annotation primitive. Isomorphic (pure) —
// imported by processors (Node + browser) and by the UI. Every annotation-producing
// processor cites transcript paragraph ids; this resolves them to timestamped spans.
import type { Annotation, AnnotationKind, Chunk, KeyMoment, Note, Transcript } from "./types.js";

/** One LLM-cited item before its span is resolved. */
export interface AnnotationItem {
  kind: AnnotationKind;
  label: string;
  sourceIds: string[];
}

/**
 * Resolve cited paragraph ids into timestamped annotations. Drops any item whose citations
 * don't match a real paragraph (a marker at a made-up time is worse than none), sorts by
 * start, and mints stable ids. Shared by every annotation-producing processor.
 */
export function assembleAnnotations(
  transcript: Transcript,
  items: AnnotationItem[],
  idPrefix = "a",
): Annotation[] {
  const byId = new Map(transcript.paragraphs.map((p) => [p.id, p]));
  return items
    .flatMap((it) => {
      const sources = it.sourceIds.map((id) => byId.get(id)).filter((c): c is Chunk => !!c);
      if (!sources.length) return [];
      return [
        {
          kind: it.kind,
          label: it.label,
          sourceIds: it.sourceIds.filter((id) => byId.has(id)),
          tStart: Math.min(...sources.map((s) => s.tStart)),
          tEnd: Math.max(...sources.map((s) => s.tEnd)),
        },
      ];
    })
    .sort((a, b) => a.tStart - b.tStart)
    .map((a, i) => ({ id: `${idPrefix}-${i}`, ...a }));
}

/**
 * The note's annotations as one list for the UI. Prefers `note.annotations`; if it carries
 * no moments, folds in any legacy `note.keymoments` as kind "moment" so pre-Annotation notes
 * keep working with no migration. Always sorted by start time.
 */
export function deriveAnnotations(note: Pick<Note, "annotations" | "keymoments">): Annotation[] {
  const existing = note.annotations ?? [];
  const hasMoments = existing.some((a) => a.kind === "moment");
  const legacy: Annotation[] =
    !hasMoments && note.keymoments
      ? note.keymoments.map((k: KeyMoment, i) => ({
          id: `moment-legacy-${i}`,
          kind: "moment" as const,
          label: k.label,
          tStart: k.tStart,
          tEnd: k.tEnd,
        }))
      : [];
  return [...existing, ...legacy].sort((a, b) => a.tStart - b.tStart);
}
