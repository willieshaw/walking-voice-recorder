// Which experiences are enabled. Toggle these to compare presentations during the lab.
// An experience absent from this map defaults to enabled; set false to hide it.
export const experienceFlags: Record<string, boolean> = {
  "plain-text": true, // "Transcript" — plain copyable text (default view)
  "clean-read": true, // "Listen" — transcript synced to audio
  layers: false, // "Layers" — disabled for now; revisit later
  // Milestone 3+: "audio-scrubber", "concept-cloud".
};

export function isEnabled(id: string): boolean {
  return experienceFlags[id] !== false;
}
