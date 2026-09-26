// The zip is the only path notes take from the web app to the desktop app, so this pins
// (1) a full export→import round trip through the file store and (2) that a version-1
// archive in the exact shape the July 2026 web build produced (before updatedAt and
// settings existed) imports. The fixture's note and audio are synthetic (a 2 s tone).
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { setFsPort } from "../app/lib/fsPort.js";
import { buildBackup, restoreBackup } from "../app/lib/backup.js";
import { _resetForTests, dumpNotes, listNotes, saveNote } from "../app/lib/notesDb.js";
import { MemoryFs } from "./helpers/memoryFs.js";
import type { Note } from "../src/core/types.js";

const bytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];

function stubStorage() {
  const store = new Map<string, string>();
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

describe("backup archive round trip (migration contract v1)", () => {
  beforeEach(() => {
    setFsPort(new MemoryFs());
    _resetForTests();
    stubStorage();
  });

  it("export then import into a fresh store reproduces every note byte-for-byte", async () => {
    const n: Note = { id: "a", title: "A", audioUrl: "", durationSec: 2, tags: ["t"] };
    await saveNote(n, new Blob([new Uint8Array([1, 2, 3, 250])], { type: "audio/mp4" }));
    await saveNote({ ...n, id: "b", title: "B", deletedAt: 5 }, new Blob(["wav"], { type: "audio/wav" }));
    const before = await dumpNotes();
    const { blob } = await buildBackup();

    setFsPort(new MemoryFs());
    _resetForTests();
    const res = await restoreBackup(new File([blob], "x.zip"));
    expect(res).toEqual({ added: 2, skipped: 0 });
    const after = await dumpNotes();
    expect(after.length).toBe(before.length);
    for (const b of before) {
      const a = after.find((x) => x.id === b.id)!;
      const { audio: ba, ...bRest } = b;
      const { audio: aa, ...aRest } = a;
      expect(aRest).toEqual(bRest);
      expect(aa.type).toBe(ba.type);
      expect(await bytes(aa)).toEqual(await bytes(ba));
    }
    // Trashed notes come back still trashed.
    expect((await listNotes()).find((s) => s.id === "b")?.deletedAt).toBe(5);
  });

  it("imports the archive the web app produced (frozen v1 fixture)", async () => {
    const zip = await readFile(new URL("./fixtures/thoughts-backup-v1.zip", import.meta.url));
    const res = await restoreBackup(new File([zip], "thoughts-backup-v1.zip"));
    expect(res).toEqual({ added: 1, skipped: 0 });
    const [n] = await dumpNotes();
    expect(n.title).toBe("Synthetic tide note");
    expect(n.data.folder).toBe("Fixtures");
    expect(n.data.transcript?.paragraphs.length).toBe(2);
    expect(n.audio.size).toBe(64_044); // 44-byte WAV header + 2 s of 16 kHz 16-bit mono
    expect(n.audio.type).toBe("audio/wav");
    // Legacy records have no updatedAt; listing falls back to createdAt.
    expect(n.updatedAt).toBeUndefined();
    expect((await listNotes())[0].updatedAt).toBe(n.createdAt);
  });
});
