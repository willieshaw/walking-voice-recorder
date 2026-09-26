import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dumpNotes, listNotes, renameNote, saveNote, importNotes } from "../app/lib/notesDb.js";
import type { Note } from "../src/core/types.js";

// deleteDatabase blocks until every open connection to "wvr" closes. notesDb closes each
// connection when its transaction settles, so this resolves promptly and each test starts
// against a genuinely empty database. (The "connection lifetime" tests below pin that.)
function wipeDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("wvr");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

const note = (id: string): Note => ({ id, title: id, audioUrl: "", durationSec: 3 });
const audio = () => new Blob(["riff"], { type: "audio/wav" });

describe("notesDb updatedAt (export-staleness stamp)", () => {
  beforeEach(async () => {
    await wipeDb();
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

describe("notesDb connection lifetime", () => {
  beforeEach(() => wipeDb());

  // If a helper leaked its connection, deleteDatabase would block forever and the test would
  // time out instead of resolving.
  it("closes the connection after a tx() write, so deleteDatabase resolves", async () => {
    await saveNote(note("a"), audio());
    await wipeDb();
  }, 1000);

  it("closes the connection after a mutateNote() write, so deleteDatabase resolves", async () => {
    await saveNote(note("a"), audio());
    await renameNote("a", "renamed");
    await wipeDb();
  }, 1000);
});
