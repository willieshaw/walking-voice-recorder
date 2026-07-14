// The list of available experiences. A new "way to show" = a new folder + one line here.
import type { Experience } from "./types";
import { cleanRead } from "./clean-read";
import { plainText } from "./plain-text";
import { layers } from "./layers";

export const experiences: Experience[] = [
  cleanRead,
  plainText,
  layers,
  // Milestone 3+: audioScrubber, conceptCloud.
];
