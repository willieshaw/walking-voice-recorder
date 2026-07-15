// Local-first note storage in the browser (IndexedDB). Each note's audio blob + artifacts
// live here; nothing is sent to a server. A small hand-rolled IDB wrapper (no dependency).
import type { Annotation, Note } from "@core/types";

export interface NoteSummary {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  /** First line of the transcript, for the library feed. */
  snippet: string;
  tags: string[];
  folder?: string;
  pinned: boolean;
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

/** All stored notes, newest first. The shared read behind the feed and search. */
async function allByRecency(): Promise<StoredNote[]> {
  const all = await tx<StoredNote[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listNotes(): Promise<NoteSummary[]> {
  const all = await allByRecency();
  return all.map(({ id, title, durationSec, createdAt, data }) => ({
      id,
      title,
      durationSec,
      createdAt,
      snippet: (data.transcript?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
      tags: data.tags ?? [],
      folder: data.folder,
      pinned: data.pinned ?? false,
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

/** Client-side search over titles, tags, and full transcript text. */
export async function searchNotes(query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await allByRecency();
  return all.flatMap((n) => {
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
  const stored = await tx<StoredNote | undefined>("readonly", (s) => s.get(id));
  if (!stored) return null;
  return {
    ...stored.data,
    createdAt: stored.createdAt,
    audioUrl: URL.createObjectURL(stored.audio),
  };
}

/** Atomic read-modify-write in ONE readwrite transaction. IndexedDB serializes
 *  overlapping readwrite transactions on the store, so two concurrent patches
 *  (e.g. a tag commit racing a pin click) can't clobber each other. */
function mutateNote(id: string, mutate: (stored: StoredNote) => void): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const store = db.transaction(STORE, "readwrite").objectStore(STORE);
        const get = store.get(id);
        get.onerror = () => reject(get.error);
        get.onsuccess = () => {
          const stored = get.result as StoredNote | undefined;
          if (!stored) return resolve();
          mutate(stored);
          const put = store.put(stored);
          put.onsuccess = () => resolve();
          put.onerror = () => reject(put.error);
        };
      }),
  );
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
