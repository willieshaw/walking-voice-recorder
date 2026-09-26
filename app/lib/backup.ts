// Library backup (M5.2): one zip archive of everything, built and restored entirely
// client-side — the local-first insurance policy, no accounts. Layout:
//   manifest.json     the full stored data of every note (transcripts, analyses, labels,
//                     version stamps) minus the audio bytes
//   audio/<noteId>    each note's recording, byte-for-byte
// The manifest also carries the device settings that live only in localStorage (dictionary,
// project and folder registries) under an optional `settings` key — still format v1.
// Restore merges by note id and never overwrites — re-importing an archive is a no-op;
// settings merge the same way (nothing already here is dropped).
import { dumpNotes, importNotes, type StoredNote } from "./notesDb";
import { allProjects } from "./projects";
import { applySettings, captureSettings, type SettingsSnapshot } from "./settingsSnapshot";
import { readZip, writeZip, type ZipEntry } from "./zip";

const MANIFEST = "manifest.json";

/** One note in the manifest: everything stored except the blob, plus its mime type so the
 *  blob can be reconstructed exactly on restore. */
type ManifestNote = Omit<StoredNote, "audio"> & { audioType: string };

interface Manifest {
  format: "thoughts-backup";
  version: 1;
  exportedAt: string;
  notes: ManifestNote[];
  /** Added after the first release; absent in older archives. */
  settings?: SettingsSnapshot;
}

export async function buildBackup(): Promise<{ blob: Blob; count: number; filename: string }> {
  const stored = await dumpNotes();
  const entries: ZipEntry[] = [];
  const notes: ManifestNote[] = [];
  for (const n of stored) {
    const { audio, ...rest } = n;
    notes.push({ ...rest, audioType: audio.type });
    entries.push({ name: `audio/${n.id}`, data: new Uint8Array(await audio.arrayBuffer()) });
  }
  const manifest: Manifest = {
    format: "thoughts-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
    settings: captureSettings(allProjects(stored.map((n) => n.data.project))),
  };
  entries.unshift({ name: MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest)) });
  return {
    blob: new Blob([writeZip(entries)], { type: "application/zip" }),
    count: notes.length,
    filename: `thoughts-backup-${new Date().toISOString().slice(0, 10)}.zip`,
  };
}

export async function restoreBackup(file: File): Promise<{ added: number; skipped: number }> {
  const files = readZip(await file.arrayBuffer());
  const manifestBytes = files.get(MANIFEST);
  if (!manifestBytes) throw new Error("No manifest.json inside — this isn't a Thoughts backup.");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
  if (manifest.format !== "thoughts-backup") {
    throw new Error("This isn't a Thoughts backup archive.");
  }
  const restored: StoredNote[] = [];
  for (const m of manifest.notes) {
    const audioBytes = files.get(`audio/${m.id}`);
    if (!audioBytes) continue; // a manifest entry without audio would restore broken — skip it
    const { audioType, ...rest } = m;
    restored.push({ ...rest, audio: new Blob([audioBytes], { type: audioType }) });
  }
  const result = await importNotes(restored);
  if (manifest.settings) applySettings(manifest.settings);
  return result;
}
