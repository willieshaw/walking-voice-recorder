// Which experiences are enabled. Toggle these to compare presentations during the lab.
// An experience absent from this map defaults to enabled; set false to hide it.
export const experienceFlags: Record<string, boolean> = {
  "clean-read": true, // "Read Along" — transcript synced to audio
  "plain-text": true, // "Transcript" — plain copyable text
  layers: true, // "Layers" — formatting-level scrubber (Raw → Outline)
  // Milestone 3+: "audio-scrubber", "concept-cloud".
};

export function isEnabled(id: string): boolean {
  return experienceFlags[id] !== false;
}
