// The list of available experiences. A new "way to show" = a new folder + one line here.
import type { Experience } from "./types";
import { cleanRead } from "./clean-read";
import { plainText } from "./plain-text";
import { layers } from "./layers";
import { audioScrubber } from "./audio-scrubber";
import { conceptCloud } from "./concept-cloud";

// Order = tab order; the first enabled+available one is the default view.
export const experiences: Experience[] = [
  plainText, // "Transcript" — default
  cleanRead, // "Listen"
  audioScrubber, // "Scrubber" — waveform + key moments
  conceptCloud, // "Concepts"
  layers, // disabled via flags for now
];
