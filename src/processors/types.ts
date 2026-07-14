// Node-only. The Processor contract: each processor reads some artifacts and produces
// exactly one. `reads` makes the dependency graph explicit (the runner orders by it);
// `version` powers cache invalidation (bump it when a processor's logic/prompt changes).
import type { ArtifactKind, ArtifactPayloads, NoteManifest } from "../core/types.js";
import type { SttProvider } from "../providers/stt.js";
import type { LlmProvider } from "../providers/llm.js";

export interface Ctx {
  noteId: string;
  /** Absolute path to the source audio file. */
  audioPath: string;
  /** Providers are lazy: constructed on first use, so a processor that doesn't need a
   *  given provider never triggers its key check (e.g. transcribe-only runs need no LLM). */
  getStt(): SttProvider;
  getLlm(): LlmProvider;
  /** Read an already-produced input artifact (null if absent). */
  getArtifact<K extends Exclude<ArtifactKind, "audio">>(
    kind: K,
  ): Promise<ArtifactPayloads[K] | null>;
  /** Patch top-level manifest fields (e.g. durationSec, title). */
  patchManifest(patch: Partial<Pick<NoteManifest, "durationSec" | "title">>): Promise<void>;
}

export interface Processor<K extends Exclude<ArtifactKind, "audio">> {
  id: K;
  reads: ArtifactKind[];
  version: number;
  produce(ctx: Ctx): Promise<ArtifactPayloads[K]>;
}

/** Loosely-typed processor for registry storage (the generic K is erased there). */
export type AnyProcessor = Processor<Exclude<ArtifactKind, "audio">>;
