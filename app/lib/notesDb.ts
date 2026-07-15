// Local-first note storage in the browser (IndexedDB). Each note's audio blob + artifacts
// live here; nothing is sent to a server. A small hand-rolled IDB wrapper (no dependency).
import type { Note } from "@core/types";

export interface NoteSummary {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  /** First line of the transcript, for the library feed. */
  snippet: string;
}

/** Stored shape: the note's data minus the ephemeral object-URL, plus the audio blob. */
interface StoredNote {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  data: Omit<Note, "audioUrl">;
  audio: Blob;
}

const DB_NAME = "wvr";
const STORE = "notes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = fn(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function saveNote(note: Note, audio: Blob): Promise<void> {
  const { audioUrl: _drop, ...data } = note;
  const stored: StoredNote = {
    id: note.id,
    title: note.title,
    durationSec: note.durationSec,
    createdAt: Date.now(),
    data,
    audio,
  };
  await tx("readwrite", (s) => s.put(stored));
}

export async function listNotes(): Promise<NoteSummary[]> {
  const all = await tx<StoredNote[]>("readonly", (s) => s.getAll());
  return all
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id, title, durationSec, createdAt, data }) => ({
      id,
      title,
      durationSec,
      createdAt,
      snippet: (data.transcript?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
    }));
}

export async function getNote(id: string): Promise<Note | null> {
  const stored = await tx<StoredNote | undefined>("readonly", (s) => s.get(id));
  if (!stored) return null;
  return { ...stored.data, audioUrl: URL.createObjectURL(stored.audio) };
}

export async function deleteNote(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

/** Rename a note in place (updates both the summary title and the stored note data). */
export async function renameNote(id: string, title: string): Promise<void> {
  const stored = await tx<StoredNote | undefined>("readonly", (s) => s.get(id));
  if (!stored) return;
  stored.title = title;
  stored.data = { ...stored.data, title };
  await tx("readwrite", (s) => s.put(stored));
}

/** Patch stored note data in place (e.g. adding artifacts to an older note). */
export async function updateNote(
  id: string,
  patch: Partial<Omit<Note, "audioUrl">>,
): Promise<void> {
  const stored = await tx<StoredNote | undefined>("readonly", (s) => s.get(id));
  if (!stored) return;
  stored.data = { ...stored.data, ...patch };
  if (patch.title !== undefined) stored.title = patch.title;
  if (patch.durationSec !== undefined) stored.durationSec = patch.durationSec;
  await tx("readwrite", (s) => s.put(stored));
}
