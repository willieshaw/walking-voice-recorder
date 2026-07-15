// The list of available processors. A new way to "slice" the audio = a new file + one
// line here. The runner orders them by their `reads` dependencies.
import type { AnyProcessor } from "./types.js";
import { transcribeProcessor } from "./transcribe/index.js";
import { layersProcessor } from "./layers/index.js";
import { keyMomentsProcessor } from "./keymoments/index.js";
import { conceptsProcessor } from "./concepts/index.js";
import { summaryProcessor } from "./summary/index.js";
import { directivesProcessor } from "./directives/index.js";

export const processors: AnyProcessor[] = [
  transcribeProcessor as AnyProcessor,
  layersProcessor as AnyProcessor,
  keyMomentsProcessor as AnyProcessor,
  conceptsProcessor as AnyProcessor,
  summaryProcessor as AnyProcessor,
  directivesProcessor as AnyProcessor,
  // Later: embeddings.
];
