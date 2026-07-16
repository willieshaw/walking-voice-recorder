// Staleness: which of a note's analyses were built with older prompts (or never built)?
//
// One source of truth — each processor's `version`, which we already bump whenever its
// prompt changes. Notes stamp the versions they were built with (`note.artifactVersions`,
// the browser-side analog of ArtifactMeta.version); comparing against the current processor
// versions tells the app exactly which analyses to offer re-running. Bump a processor's
// version and every previously-processed note grows an "Upgrade" banner automatically.
import type { Note } from "../core/types.js";
import { layersProcessor } from "./layers/index.js";
import { keyMomentsProcessor } from "./keymoments/index.js";
import { summaryProcessor } from "./summary/index.js";
import { directivesProcessor } from "./directives/index.js";

/** The LLM analyses the browser pipeline builds (and can rebuild) from a transcript. */
export type AnalysisKind = "layers" | "keymoments" | "summary" | "directives";

export const CURRENT_ANALYSIS: Record<AnalysisKind, number> = {
  layers: layersProcessor.version,
  keymoments: keyMomentsProcessor.version,
  summary: summaryProcessor.version,
  directives: directivesProcessor.version,
};

/** Does the note carry this analysis at all? (Presence, ignoring versions.) */
function has(note: Pick<Note, "layers" | "keymoments" | "summary" | "annotations">, kind: AnalysisKind): boolean {
  switch (kind) {
    case "layers":
      return !!note.layers;
    case "keymoments":
      return !!note.keymoments;
    case "summary":
      return note.summary !== undefined;
    case "directives":
      return !!note.annotations;
  }
}

/**
 * The analyses that are missing or were built with an older prompt version. A note with no
 * version stamps (processed before stamping existed) counts as version 0 across the board —
 * its analyses genuinely predate the current prompts.
 */
export function staleAnalyses(
  note: Pick<Note, "layers" | "keymoments" | "summary" | "annotations" | "artifactVersions">,
): AnalysisKind[] {
  return (Object.keys(CURRENT_ANALYSIS) as AnalysisKind[]).filter(
    (kind) =>
      !has(note, kind) || (note.artifactVersions?.[kind] ?? 0) < CURRENT_ANALYSIS[kind],
  );
}

/**
 * The stale analyses the user hasn't dismissed the banner for. Closing the banner stamps
 * `upgradeDismissed` with the then-current versions, so those exact stalenesses stay quiet;
 * a later prompt bump moves CURRENT_ANALYSIS past the stamp and the banner returns.
 */
export function unseenStaleAnalyses(
  note: Pick<
    Note,
    "layers" | "keymoments" | "summary" | "annotations" | "artifactVersions" | "upgradeDismissed"
  >,
): AnalysisKind[] {
  return staleAnalyses(note).filter(
    (kind) => (note.upgradeDismissed?.[kind] ?? 0) < CURRENT_ANALYSIS[kind],
  );
}
