import type { FC } from "react";
import type { ArtifactKind, Note } from "@core/types";

/**
 * A "way to show" a note. Self-contained: declares the artifacts it needs and renders
 * its own UI. The shell shows it only when enabled (flags) AND its `requires` are present.
 * Experiences never import one another — they coordinate only through the focus store.
 */
export interface Experience {
  id: string;
  title: string;
  requires: ArtifactKind[];
  Component: FC<{ note: Note }>;
}

/** True when every required artifact (or the source audio) is present on the note. */
export function artifactsPresent(note: Note, requires: ArtifactKind[]): boolean {
  return requires.every((kind) => {
    if (kind === "audio") return Boolean(note.audioUrl);
    return Boolean((note as unknown as Record<string, unknown>)[kind]);
  });
}
