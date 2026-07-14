// The list of available processors. A new way to "slice" the audio = a new file + one
// line here. The runner orders them by their `reads` dependencies.
import type { AnyProcessor } from "./types.js";
import { transcribeProcessor } from "./transcribe/index.js";
import { layersProcessor } from "./layers/index.js";

export const processors: AnyProcessor[] = [
  transcribeProcessor as AnyProcessor,
  layersProcessor as AnyProcessor,
  // Milestone 3+: keymoments, concepts, embeddings.
];
