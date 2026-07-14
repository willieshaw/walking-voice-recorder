// The list of available experiences. A new "way to show" = a new folder + one line here.
import type { Experience } from "./types";
import { cleanRead } from "./clean-read";
import { plainText } from "./plain-text";
import { layers } from "./layers";

// Order = tab order; the first enabled+available one is the default view.
export const experiences: Experience[] = [
  plainText, // "Transcript" — default
  cleanRead, // "Listen"
  layers, // disabled via flags for now
  // Milestone 3+: audioScrubber, conceptCloud.
];
