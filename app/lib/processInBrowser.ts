// The whole processing pipeline, client-side: audio File -> transcript -> branches -> Note.
// Replaces the old server round-trip. Runs with the tester's own keys.
import type { Note } from "@core/types";
import { CURRENT_ANALYSIS } from "@engine/processors/analysis";
import { transcribe } from "./providers/openaiStt";
import {
  buildDirectives,
  buildKeyMoments,
  buildLayers,
  buildSummary,
} from "./providers/openaiLlm";

export interface ProcessedNote {
  note: Note;
  audioBlob: Blob;
}

function makeId(filename: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const base = filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${date}-${base || "walk"}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function processInBrowser(
  file: File,
  // Recorder ingest overrides: pin the note id to the recording UUID, its title, and the
  // device provenance so a proxy and a later master converge on the same note.
  overrides: Partial<Pick<Note, "id" | "title" | "deviceRecording">> = {},
): Promise<ProcessedNote> {
  const transcript = await transcribe(file);
  // The derived branches are independent of each other — run them in parallel.
  const [layers, keymoments, summary, annotations] = await Promise.all([
    buildLayers(transcript),
    buildKeyMoments(transcript),
    buildSummary(transcript),
    buildDirectives(transcript),
  ]);
  const note: Note = {
    id: overrides.id ?? makeId(file.name),
    title: overrides.title ?? file.name.replace(/\.[^.]+$/, ""),
    audioUrl: "", // set from the stored blob's object URL at load time
    durationSec: transcript.durationSec,
    transcript,
    layers,
    keymoments,
    summary,
    annotations,
    ...(overrides.deviceRecording ? { deviceRecording: overrides.deviceRecording } : {}),
    // Stamp the prompt versions these analyses were built with, so a future prompt bump
    // can offer this note an upgrade (see processors/analysis.ts).
    artifactVersions: { ...CURRENT_ANALYSIS },
  };
  return { note, audioBlob: file };
}
