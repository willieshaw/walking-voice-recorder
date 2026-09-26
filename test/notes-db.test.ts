import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dumpNotes, listNotes, renameNote, saveNote, importNotes } from "../app/lib/notesDb.js";
import type { Note } from "../src/core/types.js";

// notesDb's openDb() never closes the IDBDatabase connections it opens (by design — it's a
// per-call helper, not a pooled connection). That's harmless in a real browser, but it means
// indexedDB.deleteDatabase() from a previous test's leaked connection never resolves here:
// per spec it blocks until every open connection closes, so the versionchange request just
// sits there and stalls every open() after it. Swapping in a fresh IDBFactory per test sidesteps
// this — the old connections become orphaned on the discarded factory instead of blocking the
// new one — so each test starts against a genuinely empty, unblocked database.
function wipeDb(): void {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
}

const note = (id: string): Note => ({ id, title: id, audioUrl: "", durationSec: 3 });
const audio = () => new Blob(["riff"], { type: "audio/wav" });

describe("notesDb updatedAt (export-staleness stamp)", () => {
  beforeEach(() => {
    wipeDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("saveNote stamps updatedAt equal to createdAt", async () => {
    await saveNote(note("a"), audio());
    const [stored] = await dumpNotes();
    expect(stored.updatedAt).toBe(stored.createdAt);
    expect(stored.updatedAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
  });

  it("a mutation bumps updatedAt to now", async () => {
    await saveNote(note("a"), audio());
    vi.setSystemTime(new Date("2026-09-26T11:00:00Z"));
    await renameNote("a", "renamed");
    const [stored] = await dumpNotes();
    expect(stored.updatedAt).toBe(Date.parse("2026-09-26T11:00:00Z"));
    expect(stored.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
  });

  it("listNotes exposes updatedAt, falling back to createdAt for legacy records", async () => {
    // A record imported from an archive written before updatedAt existed has no stamp.
    await importNotes([
      {
        id: "legacy",
        title: "legacy",
        durationSec: 1,
        createdAt: 1000,
        data: { id: "legacy", title: "legacy", durationSec: 1 },
        audio: audio(),
      },
    ]);
    const [summary] = await listNotes();
    expect(summary.updatedAt).toBe(1000);
  });

  it("importNotes keeps the archive's updatedAt untouched", async () => {
    await importNotes([
      {
        id: "restored",
        title: "restored",
        durationSec: 1,
        createdAt: 1000,
        updatedAt: 2000,
        data: { id: "restored", title: "restored", durationSec: 1 },
        audio: audio(),
      },
    ]);
    const [stored] = await dumpNotes();
    expect(stored.updatedAt).toBe(2000);
  });
});
