// Node-only. Orchestrates processors over one note:
//   • topologically orders them by `reads`
//   • caches & skips an artifact whose version + input versions are unchanged
//   • isolates failures so one dead branch never takes down the trunk or its siblings
import path from "node:path";
import type { ArtifactKind, ArtifactMeta, NoteManifest } from "../core/types.js";
import {
  noteDir,
  readArtifact,
  readManifest,
  writeArtifact,
  writeManifest,
} from "../core/store.js";
import type { SttProvider } from "../providers/stt.js";
import { defaultSttProvider } from "../providers/stt.js";
import type { LlmProvider } from "../providers/llm.js";
import { defaultLlmProvider } from "../providers/llm.js";
import { processors } from "./registry.js";
import type { AnyProcessor, Ctx } from "./types.js";

/** `audio` is the source: present (version 0) whenever the manifest has an audio file. */
const AUDIO_VERSION = 0;

function inputVersion(manifest: NoteManifest, kind: ArtifactKind): number | undefined {
  if (kind === "audio") return manifest.audioFile ? AUDIO_VERSION : undefined;
  return manifest.artifacts[kind]?.version;
}

/** Order processors so every processor runs after the ones producing what it `reads`. */
function topoOrder(list: AnyProcessor[]): AnyProcessor[] {
  const byOutput = new Map<ArtifactKind, AnyProcessor>(list.map((p) => [p.id, p]));
  const ordered: AnyProcessor[] = [];
  const done = new Set<ArtifactKind>();
  const visiting = new Set<ArtifactKind>();

  const visit = (p: AnyProcessor) => {
    if (done.has(p.id)) return;
    if (visiting.has(p.id)) throw new Error(`Processor cycle at "${p.id}"`);
    visiting.add(p.id);
    for (const dep of p.reads) {
      const producer = byOutput.get(dep);
      if (producer) visit(producer); // 'audio' has no producer; that's fine
    }
    visiting.delete(p.id);
    done.add(p.id);
    ordered.push(p);
  };

  for (const p of list) visit(p);
  return ordered;
}

export interface RunOptions {
  /** Run only this processor, bypassing its cache (the tight prompt-iteration loop). */
  only?: ArtifactKind;
  /** Override providers (tests inject fakes; otherwise constructed lazily on first use). */
  stt?: SttProvider;
  llm?: LlmProvider;
}

export interface RunResult {
  ran: ArtifactKind[];
  skipped: ArtifactKind[];
  failed: { kind: ArtifactKind; error: string }[];
}

export async function runPipeline(noteId: string, opts: RunOptions = {}): Promise<RunResult> {
  const manifest = await readManifest(noteId);
  if (!manifest) throw new Error(`No note "${noteId}" (run initNote first).`);

  const audioPath = path.join(noteDir(noteId), manifest.audioFile);
  const result: RunResult = { ran: [], skipped: [], failed: [] };

  // Lazy, memoized providers — a processor's key check fires only when it actually runs.
  let stt: SttProvider | undefined = opts.stt;
  let llm: LlmProvider | undefined = opts.llm;

  const ctx: Ctx = {
    noteId,
    audioPath,
    getStt: () => (stt ??= defaultSttProvider()),
    getLlm: () => (llm ??= defaultLlmProvider()),
    getArtifact: (kind) => readArtifact(noteId, kind),
    async patchManifest(patch) {
      Object.assign(manifest, patch);
      await writeManifest(manifest);
    },
  };

  for (const proc of topoOrder(processors)) {
    if (opts.only && proc.id !== opts.only) continue;

    // Resolve input versions; skip if a required (non-audio) input is missing.
    const inputVersions: Partial<Record<ArtifactKind, number>> = {};
    let missingInput: ArtifactKind | null = null;
    for (const dep of proc.reads) {
      const v = inputVersion(manifest, dep);
      if (v === undefined) missingInput = dep;
      else inputVersions[dep] = v;
    }
    if (missingInput) {
      result.skipped.push(proc.id);
      console.warn(`skip ${proc.id}: input "${missingInput}" not available`);
      continue;
    }

    // Cache check (bypassed when this processor was explicitly requested via --only).
    const prev = manifest.artifacts[proc.id];
    const forced = opts.only === proc.id;
    const fresh =
      !forced &&
      prev &&
      prev.version === proc.version &&
      proc.reads.every((dep) => prev.inputVersions[dep] === inputVersions[dep]);
    if (fresh) {
      result.skipped.push(proc.id);
      console.log(`skip ${proc.id}: up to date`);
      continue;
    }

    try {
      console.log(`run  ${proc.id}...`);
      const payload = await proc.produce(ctx);
      await writeArtifact(noteId, proc.id, payload as never);
      const meta: ArtifactMeta = {
        kind: proc.id,
        version: proc.version,
        producedAt: new Date().toISOString(),
        inputVersions,
      };
      manifest.artifacts[proc.id] = meta;
      await writeManifest(manifest);
      result.ran.push(proc.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ kind: proc.id, error: message });
      console.error(`fail ${proc.id}: ${message}`);
      // Isolation: keep going; the trunk and other branches still produce.
    }
  }

  return result;
}
