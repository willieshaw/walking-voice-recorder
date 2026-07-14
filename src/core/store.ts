// Node-only. Reads/writes a note folder under app/public/notes/<id>/ so the Vite app
// can fetch artifacts as ordinary static assets. Provenance for every artifact lives in
// the note's manifest.json, which the runner consults for cache decisions.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtifactKind, ArtifactPayloads, NoteManifest } from "./types.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Where notes live. Overridable via WVR_NOTES_DIR (used by tests). Read lazily so a
 *  test can set the env var before the first call. */
export function notesRoot(): string {
  return process.env.WVR_NOTES_DIR ?? path.join(repoRoot, "app", "public", "notes");
}

export function noteDir(id: string): string {
  return path.join(notesRoot(), id);
}
function manifestPath(id: string): string {
  return path.join(noteDir(id), "manifest.json");
}
function artifactPath(id: string, kind: ArtifactKind): string {
  return path.join(noteDir(id), `${kind}.json`);
}

/** Turn an audio filename + date into a stable, human-readable note id. */
export function makeNoteId(audioPath: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const base = path
    .basename(audioPath, path.extname(audioPath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${date}-${base || "walk"}`;
}

/** Create the note folder, copy the audio in, and write an initial manifest. */
export async function initNote(audioPath: string, id: string): Promise<NoteManifest> {
  await fs.mkdir(noteDir(id), { recursive: true });
  const ext = path.extname(audioPath) || ".m4a";
  const audioFile = `source${ext}`;
  await fs.copyFile(audioPath, path.join(noteDir(id), audioFile));

  const existing = await readManifest(id);
  const manifest: NoteManifest = existing ?? {
    id,
    title: id,
    audioFile,
    durationSec: 0,
    artifacts: {},
  };
  manifest.audioFile = audioFile;
  await writeManifest(manifest);
  return manifest;
}

/** Delete a note folder entirely (used when its essential transcript failed). */
export async function removeNote(id: string): Promise<void> {
  await fs.rm(noteDir(id), { recursive: true, force: true });
}

export async function readManifest(id: string): Promise<NoteManifest | null> {
  try {
    return JSON.parse(await fs.readFile(manifestPath(id), "utf8")) as NoteManifest;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
}

export async function writeManifest(manifest: NoteManifest): Promise<void> {
  await fs.writeFile(manifestPath(manifest.id), JSON.stringify(manifest, null, 2));
}

/**
 * Write an artifact payload file. Provenance (manifest.artifacts[kind]) is recorded
 * separately by the runner, which is the single owner of manifest writes.
 */
export async function writeArtifact<K extends Exclude<ArtifactKind, "audio">>(
  id: string,
  kind: K,
  payload: ArtifactPayloads[K],
): Promise<void> {
  await fs.writeFile(artifactPath(id, kind), JSON.stringify(payload, null, 2));
}

export async function readArtifact<K extends Exclude<ArtifactKind, "audio">>(
  id: string,
  kind: K,
): Promise<ArtifactPayloads[K] | null> {
  try {
    return JSON.parse(
      await fs.readFile(artifactPath(id, kind), "utf8"),
    ) as ArtifactPayloads[K];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** List every note id that has a manifest, for the app's note picker. */
export async function listNoteIds(): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(notesRoot(), { withFileTypes: true });
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries) {
    // Only real note folders — skip files like .gitkeep and index.json.
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (await readManifest(entry.name)) ids.push(entry.name);
  }
  return ids.sort().reverse();
}

/**
 * Write app/public/notes/index.json listing every note (newest first). The browser
 * fetches this to populate the note picker, then fetches each note's manifest.json.
 */
export async function writeNotesIndex(): Promise<void> {
  const ids = await listNoteIds();
  const notes = [];
  for (const id of ids) {
    const m = await readManifest(id);
    if (m) notes.push({ id: m.id, title: m.title, durationSec: m.durationSec });
  }
  await fs.writeFile(
    path.join(notesRoot(), "index.json"),
    JSON.stringify({ notes }, null, 2),
  );
}
