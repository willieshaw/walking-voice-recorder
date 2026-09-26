// Local-first note storage on disk. Each note is a folder under the app data directory:
//   notes/<id>/note.json   the note's data (StoredNote minus the blob, plus audioType)
//   notes/<id>/audio.<ext> the recording, byte-for-byte
// Writes are temp-file + rename, so a crash never leaves a half-written note. A cache of
// every note.json (never the audio) is held in memory after the first listing.
import type { Annotation, Chunk, FormattingLayers, Note, Transcript } from "@core/types";
import { getFsPort } from "./fsPort";

export interface NoteSummary {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  /** Last write to this note (any field). Legacy records report createdAt. */
  updatedAt: number;
  /** Feed preview: the AI summary (default variant), falling back to the transcript's
   *  opening for notes that don't have one yet. */
  snippet: string;
  tags: string[];
  folder?: string;
  pinned: boolean;
  /** Project space this note lives in; absent = the Default project. */
  project?: string;
  /** Set when the note is in the trash ("Recently deleted"). Views filter on this. */
  deletedAt?: number;
}

/** Stored shape: the note's data minus the ephemeral object-URL, plus the audio blob.
 *  Exported for the backup archive, which round-trips exactly this shape. */
export interface StoredNote {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  /** Stamped on every write. Optional because archives from before this field lack it. */
  updatedAt?: number;
  data: Omit<Note, "audioUrl">;
  audio: Blob;
}

/** What note.json holds: the stored record minus the blob, plus the blob's MIME type. */
type NoteRecord = Omit<StoredNote, "audio"> & { audioType: string };

const NOTES_DIR = "notes";
const RECORD = "note.json";

const EXT: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
};
/** File extension for a MIME type; parameters (`;codecs=opus`) are ignored. */
const extFor = (mime: string) => EXT[mime.split(";")[0].trim().toLowerCase()] ?? "bin";
const dirOf = (id: string) => `${NOTES_DIR}/${id}`;
const recordPath = (id: string) => `${dirOf(id)}/${RECORD}`;
const audioPath = (id: string, mime: string) => `${dirOf(id)}/audio.${extFor(mime)}`;

/** Records are plain JSON, so a JSON round-trip is a faithful deep copy. Callers get copies
 *  (as IndexedDB's structured clone gave them), so nobody can mutate the cache by accident. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---- cache + locks --------------------------------------------------------------------

let cache: Map<string, NoteRecord> | null = null;
const locks = new Map<string, Promise<unknown>>();

/** Tests: forget the cache so the next call re-reads the (fake) disk. */
export function _resetForTests(): void {
  cache = null;
  locks.clear();
}

/** Serialize work per note id (the file-store stand-in for an IndexedDB readwrite tx). */
function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(id, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (locks.get(id) === next) locks.delete(id);
    });
  return next;
}

/** Read every note.json once. Folders without a readable record are skipped. */
async function records(): Promise<Map<string, NoteRecord>> {
  if (cache) return cache;
  const fs = await getFsPort();
  await fs.mkdir(NOTES_DIR);
  const map = new Map<string, NoteRecord>();
  const entries = await fs.readDir(NOTES_DIR);
  await Promise.all(
    entries
      .filter((e) => e.isDirectory)
      .map(async (e) => {
        try {
          const rec = JSON.parse(await fs.readTextFile(recordPath(e.name))) as NoteRecord;
          if (rec && rec.id === e.name) map.set(rec.id, rec);
        } catch {
          // no note.json or unparsable: an interrupted write — purgeExpired cleans it
        }
      }),
  );
  // Two first calls can race here; the first to finish wins so every caller shares one map.
  cache ??= map;
  return cache;
}

/** Write note.json (temp + rename), then point the cache at exactly what is on disk. */
async function writeRecord(rec: NoteRecord): Promise<void> {
  const fs = await getFsPort();
  await fs.mkdir(dirOf(rec.id));
  const target = recordPath(rec.id);
  const json = JSON.stringify(rec);
  await fs.writeTextFile(`${target}.tmp`, json);
  await fs.rename(`${target}.tmp`, target);
  (await records()).set(rec.id, JSON.parse(json) as NoteRecord);
}

async function writeAudio(id: string, audio: Blob): Promise<void> {
  const fs = await getFsPort();
  await fs.mkdir(dirOf(id));
  const target = audioPath(id, audio.type);
  await fs.writeFile(`${target}.tmp`, new Uint8Array(await audio.arrayBuffer()));
  await fs.rename(`${target}.tmp`, target);
}

async function readAudio(rec: NoteRecord): Promise<Blob> {
  const fs = await getFsPort();
  const bytes = await fs.readFile(audioPath(rec.id, rec.audioType));
  // plugin-fs hands back a fresh, unshared buffer; the cast only narrows ArrayBufferLike.
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: rec.audioType });
}

/** Atomic read-modify-write of one record under the note's lock. The mutation runs on a
 *  copy, so a failed write leaves the cache matching the disk. */
function mutateNote(id: string, mutate: (rec: NoteRecord) => void): Promise<void> {
  return withLock(id, async () => {
    const cached = (await records()).get(id);
    if (!cached) return;
    const rec = copy(cached);
    mutate(rec);
    rec.updatedAt = Date.now();
    await writeRecord(rec);
  });
}

export async function saveNote(note: Note, audio: Blob): Promise<void> {
  const { audioUrl: _drop, ...data } = note;
  const now = Date.now();
  const rec: NoteRecord = {
    id: note.id,
    title: note.title,
    durationSec: note.durationSec,
    createdAt: now,
    updatedAt: now,
    data,
    audioType: audio.type,
  };
  await withLock(note.id, async () => {
    await writeAudio(note.id, audio);
    await writeRecord(rec);
  });
}

/** All stored notes, newest first. The shared read behind the feed and search. */
async function allByRecency(): Promise<NoteRecord[]> {
  return [...(await records()).values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function listNotes(): Promise<NoteSummary[]> {
  const all = await allByRecency();
  return all.map(({ id, title, durationSec, createdAt, updatedAt, data }) => ({
      id,
      title,
      durationSec,
      createdAt,
      updatedAt: updatedAt ?? createdAt,
      snippet: (data.summary ?? data.transcript?.text ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 400),
      tags: data.tags ?? [],
      folder: data.folder,
      pinned: data.pinned ?? false,
      project: data.project,
      deletedAt: data.deletedAt,
    }));
}

export interface SearchHit {
  id: string;
  title: string;
  createdAt: number;
  folder?: string;
  /** A little context around the first match (or the note's opening). */
  snippet: string;
}

/** Client-side search over titles, tags, and full transcript text — within one project. */
export async function searchNotes(query: string, project?: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await allByRecency();
  return all.flatMap((n) => {
    if (n.data.deletedAt) return []; // trashed notes don't surface in search
    if (project !== undefined && (n.data.project ?? "Default") !== project) return [];
    const text = (n.data.transcript?.text ?? "").replace(/\s+/g, " ");
    const inTitle = n.title.toLowerCase().includes(q);
    const inTags = (n.data.tags ?? []).some((t) => t.toLowerCase().includes(q));
    const at = text.toLowerCase().indexOf(q);
    if (!inTitle && !inTags && at < 0) return [];
    const snippet =
      at >= 0
        ? (at > 40 ? "…" : "") + text.slice(Math.max(0, at - 40), at + 100).trim()
        : text.slice(0, 120);
    return [{ id: n.id, title: n.title, createdAt: n.createdAt, folder: n.data.folder, snippet }];
  });
}

export async function getNote(id: string): Promise<Note | null> {
  const rec = (await records()).get(id);
  if (!rec) return null;
  return {
    ...copy(rec.data),
    createdAt: rec.createdAt,
    audioUrl: URL.createObjectURL(await readAudio(rec)),
  };
}

/** The recorder-ingest read model for one recording (null = no note yet). `hasMaster` is
 *  true once the note holds full-quality master audio. Feeds planIngest in app/lib/ingest. */
export async function ingestState(
  recordingId: string,
): Promise<{ recordingId: string; hasMaster: boolean } | null> {
  const rec = (await records()).get(recordingId);
  if (!rec) return null;
  return { recordingId, hasMaster: !!rec.data.deviceRecording?.master.acknowledgedAt };
}

/** Attach a full-quality master to an existing note: swap the stored audio file and stamp
 *  the master acknowledgement, leaving the transcript and every analysis untouched. The new
 *  audio and the record land before the old audio file (other extension) is removed. */
export async function attachMaster(
  recordingId: string,
  master: Blob,
  acknowledgedAt: string,
): Promise<void> {
  await withLock(recordingId, async () => {
    const cached = (await records()).get(recordingId);
    if (!cached) return;
    const fs = await getFsPort();
    const oldPath = audioPath(recordingId, cached.audioType);
    await writeAudio(recordingId, master);
    const rec = copy(cached);
    rec.audioType = master.type;
    const dr = rec.data.deviceRecording;
    if (dr) dr.master = { ...dr.master, acknowledgedAt };
    rec.updatedAt = Date.now();
    await writeRecord(rec);
    if (oldPath !== audioPath(recordingId, master.type)) await fs.remove(oldPath);
  });
}

/** Rename a note in place (updates both the summary title and the stored note data). */
export async function renameNote(id: string, title: string): Promise<void> {
  await mutateNote(id, (stored) => {
    stored.title = title;
    stored.data = { ...stored.data, title };
  });
}

/** Patch stored note data in place (e.g. labels, or adding artifacts to an older note). */
export async function updateNote(
  id: string,
  patch: Partial<Omit<Note, "audioUrl">>,
): Promise<void> {
  await mutateNote(id, (stored) => {
    stored.data = { ...stored.data, ...patch };
    if (patch.title !== undefined) stored.title = patch.title;
    if (patch.durationSec !== undefined) stored.durationSec = patch.durationSec;
  });
}

/** Add one lazily-generated summary variant to the note's cache inside a single
 *  read-modify-write, so filling several variants in quick succession can't clobber the
 *  map with a stale copy. Returns the new cache for the caller to mirror into UI state. */
export async function addSummaryVariant(
  noteId: string,
  variantId: string,
  text: string,
): Promise<Record<string, string>> {
  let next: Record<string, string> = {};
  await mutateNote(noteId, (stored) => {
    next = { ...(stored.data.summaries ?? {}), [variantId]: text };
    stored.data = { ...stored.data, summaries: next };
  });
  return next;
}

/** Overwrite one paragraph's text — a Raw (transcript) or Clean (layers level-1) chunk —
 *  in a single read-modify-write. A text-only change: ids and timestamps are untouched, so
 *  seeking, the gutter, and annotation provenance survive. Raw edits regenerate
 *  `transcript.text` from the paragraphs, so search and feed snippets see the correction.
 *  Returns the updated artifact for the caller to mirror into UI state. */
export async function updateChunkText(
  noteId: string,
  mode: "raw" | "clean",
  chunkId: string,
  text: string,
): Promise<{ transcript?: Transcript; layers?: FormattingLayers }> {
  // The first edit stamps `originalText` (enabling per-paragraph Revert); an edit that lands
  // back on the original clears the stamp — the chunk reads as never-edited again.
  const apply = (c: Chunk): Chunk => {
    if (c.id !== chunkId) return c;
    const original = c.originalText ?? c.text;
    const next: Chunk = { ...c, text, originalText: original };
    if (text === original) delete next.originalText;
    return next;
  };
  let result: { transcript?: Transcript; layers?: FormattingLayers } = {};
  await mutateNote(noteId, (stored) => {
    if (mode === "raw") {
      const t = stored.data.transcript;
      if (!t) return;
      const paragraphs = t.paragraphs.map(apply);
      const transcript: Transcript = {
        ...t,
        paragraphs,
        text: paragraphs.map((p) => p.text).join("\n\n"),
      };
      stored.data = { ...stored.data, transcript };
      result = { transcript };
    } else {
      const l = stored.data.layers;
      if (!l) return;
      const layers: FormattingLayers = {
        levels: l.levels.map((lv) =>
          lv.level === 1 ? { ...lv, chunks: lv.chunks.map(apply) } : lv,
        ),
      };
      stored.data = { ...stored.data, layers };
      result = { layers };
    }
  });
  return result;
}

/** Every stored note, raw — the backup archive's source. Includes trashed notes, so a
 *  restored library is byte-faithful (they come back still in the trash). */
export async function dumpNotes(): Promise<StoredNote[]> {
  const all = await allByRecency();
  return Promise.all(
    all.map(async (rec) => {
      const { audioType: _type, ...rest } = copy(rec);
      return { ...rest, audio: await readAudio(rec) };
    }),
  );
}

/** Merge notes into the store by id. Existing ids are left untouched — restore never
 *  overwrites what's already here, so re-importing an archive is a no-op. */
export async function importNotes(
  notes: StoredNote[],
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const n of notes) {
    if ((await records()).has(n.id)) {
      skipped++;
      continue;
    }
    const { audio, ...rest } = n;
    await withLock(n.id, async () => {
      await writeAudio(n.id, audio);
      await writeRecord({ ...rest, audioType: audio.type });
    });
    added++;
  }
  return { added, skipped };
}

/** How long a soft-deleted note lives in "Recently deleted" before it's purged. */
export const TRASH_RETENTION_DAYS = 30;

/** Permanently remove a note — its whole folder, audio and all artifacts. Only reachable
 *  from the trash view (per-item delete or "Empty now"); everyday delete is the soft
 *  `deletedAt`. */
export async function purgeNote(id: string): Promise<void> {
  await withLock(id, async () => {
    await (await getFsPort()).remove(dirOf(id));
    (await records()).delete(id);
  });
}

/** Drop any trashed note whose retention window has lapsed, and any folder left without a
 *  readable note.json by an interrupted write. Called once on app load. */
export async function purgeExpired(): Promise<void> {
  const fs = await getFsPort();
  const all = await records();
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86_400_000;
  const expired = [...all.values()].filter((n) => n.data.deletedAt && n.data.deletedAt < cutoff);
  await Promise.all(expired.map((n) => purgeNote(n.id)));
  const entries = await fs.readDir(NOTES_DIR);
  await Promise.all(
    entries
      // A folder whose note is mid-write (lock held) is not an orphan yet.
      .filter((e) => e.isDirectory && !all.has(e.name) && !locks.has(e.name))
      .map((e) => fs.remove(dirOf(e.name))),
  );
}

/** Patch one annotation by id inside a single read-modify-write, so concurrent toggles
 *  each mutate the freshly-stored array instead of clobbering it with a stale copy from
 *  React state. Returns the new annotations list for the caller to mirror into UI state. */
export async function updateAnnotation(
  noteId: string,
  annotationId: string,
  patch: Partial<Annotation>,
): Promise<Annotation[]> {
  let next: Annotation[] = [];
  await mutateNote(noteId, (stored) => {
    next = (stored.data.annotations ?? []).map((a) =>
      a.id === annotationId ? { ...a, ...patch } : a,
    );
    stored.data = { ...stored.data, annotations: next };
  });
  return next;
}
