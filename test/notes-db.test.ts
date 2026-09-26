// test/notes-db.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFsPort } from "../app/lib/fsPort.js";
import { MemoryFs } from "./helpers/memoryFs.js";
import {
  attachMaster,
  dumpNotes,
  getNote,
  importNotes,
  listNotes,
  purgeExpired,
  purgeNote,
  renameNote,
  saveNote,
  searchNotes,
  updateAnnotation,
  updateNote,
  _resetForTests,
} from "../app/lib/notesDb.js";
import type { Note } from "../src/core/types.js";

const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  title: id,
  audioUrl: "",
  durationSec: 3,
  ...extra,
});
const wav = (s = "riff") => new Blob([s], { type: "audio/wav" });
const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());

let fs: MemoryFs;

describe("notesDb on files", () => {
  beforeEach(() => {
    fs = new MemoryFs();
    setFsPort(fs);
    _resetForTests();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("saveNote writes note.json and audio.<ext> under notes/<id>", async () => {
    await saveNote(note("a"), new Blob(["m4a"], { type: "audio/mp4" }));
    expect(await fs.exists("notes/a/note.json")).toBe(true);
    expect(await fs.exists("notes/a/audio.m4a")).toBe(true);
    expect(await fs.exists("notes/a/note.json.tmp")).toBe(false);
    expect(await fs.exists("notes/a/audio.m4a.tmp")).toBe(false);
    const rec = JSON.parse(await fs.readTextFile("notes/a/note.json"));
    expect(rec.audioType).toBe("audio/mp4");
    expect(rec.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
    expect(rec.updatedAt).toBe(rec.createdAt);
    expect(rec).not.toHaveProperty("audio");
  });

  it("listNotes is newest first and survives a cold start (re-reads disk)", async () => {
    await saveNote(note("old"), wav());
    vi.setSystemTime(new Date("2026-09-26T11:00:00Z"));
    await saveNote(note("new"), wav());
    expect((await listNotes()).map((s) => s.id)).toEqual(["new", "old"]);
    _resetForTests(); // drop the in-memory cache; same MemoryFs
    expect((await listNotes()).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("getNote reconstructs the blob type, duration and an object URL", async () => {
    await saveNote(note("a", { durationSec: 42 }), wav("hello"));
    const n = await getNote("a");
    expect(n?.durationSec).toBe(42);
    expect(n?.audioUrl).toMatch(/^blob:/); // Node ≥16.7 implements URL.createObjectURL
    expect(n?.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
    const [stored] = await dumpNotes();
    expect(stored.audio.type).toBe("audio/wav");
    expect(await text(stored.audio)).toBe("hello");
  });

  it("renameNote and updateNote patch only their fields and bump updatedAt", async () => {
    await saveNote(note("a", { tags: ["x"] }), wav());
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    await renameNote("a", "Renamed");
    await updateNote("a", { folder: "Essays" });
    const [s] = await listNotes();
    expect(s.title).toBe("Renamed");
    expect(s.folder).toBe("Essays");
    expect(s.tags).toEqual(["x"]);
    expect(s.updatedAt).toBe(Date.parse("2026-09-26T12:00:00Z"));
    expect(s.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
  });

  it("attachMaster swaps the audio file (new extension) and keeps the transcript", async () => {
    await saveNote(
      note("r1", {
        transcript: { text: "hi", paragraphs: [] } as unknown as Note["transcript"],
        deviceRecording: {
          recordingId: "r1",
          startedAtUtc: "2026-09-26T09:00:00Z",
          proxy: { acknowledgedAt: "2026-09-26T09:01:00Z" },
          master: {},
        } as unknown as Note["deviceRecording"],
      }),
      new Blob(["proxy"], { type: "audio/mp4" }),
    );
    await attachMaster("r1", new Blob(["master"], { type: "audio/wav" }), "2026-09-26T10:30:00Z");
    expect(await fs.exists("notes/r1/audio.m4a")).toBe(false);
    expect(await fs.exists("notes/r1/audio.wav")).toBe(true);
    const n = await getNote("r1");
    expect(n?.transcript?.text).toBe("hi");
    expect(n?.deviceRecording?.master.acknowledgedAt).toBe("2026-09-26T10:30:00Z");
    const [stored] = await dumpNotes();
    expect(await text(stored.audio)).toBe("master");
  });

  it("trash: purgeExpired removes only lapsed notes; purgeNote removes the folder", async () => {
    await saveNote(note("keep"), wav());
    await saveNote(note("recent"), wav());
    await saveNote(note("lapsed"), wav());
    const day = 86_400_000;
    await updateNote("recent", { deletedAt: Date.now() - 2 * day });
    await updateNote("lapsed", { deletedAt: Date.now() - 31 * day });
    await purgeExpired();
    expect((await listNotes()).map((s) => s.id).sort()).toEqual(["keep", "recent"]);
    expect(await fs.exists("notes/lapsed")).toBe(false);
    await purgeNote("keep");
    expect(await fs.exists("notes/keep")).toBe(false);
    expect((await listNotes()).map((s) => s.id)).toEqual(["recent"]);
  });

  it("purgeExpired cleans a folder that has no note.json (interrupted write)", async () => {
    await fs.mkdir("notes/half");
    await fs.writeFile("notes/half/audio.wav", new Uint8Array([1]));
    expect(await listNotes()).toEqual([]);
    await purgeExpired();
    expect(await fs.exists("notes/half")).toBe(false);
  });

  it("listing ignores stray files in notes/ (e.g. .DS_Store)", async () => {
    await fs.mkdir("notes");
    await fs.writeFile("notes/.DS_Store", new Uint8Array([0]));
    await saveNote(note("a"), wav());
    expect((await listNotes()).map((s) => s.id)).toEqual(["a"]);
  });

  it("importNotes adds new ids and skips existing ones", async () => {
    await saveNote(note("a"), wav());
    const res = await importNotes([
      { id: "a", title: "dup", durationSec: 1, createdAt: 1, data: { id: "a", title: "dup", durationSec: 1 }, audio: wav() },
      { id: "b", title: "b", durationSec: 1, createdAt: 2, data: { id: "b", title: "b", durationSec: 1 }, audio: wav() },
    ]);
    expect(res).toEqual({ added: 1, skipped: 1 });
    expect((await listNotes()).map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect((await listNotes()).find((s) => s.id === "a")?.title).toBe("a");
    // A legacy record without updatedAt reads as createdAt.
    expect((await listNotes()).find((s) => s.id === "b")?.updatedAt).toBe(2);
  });

  it("importNotes keeps the archive's updatedAt untouched", async () => {
    await importNotes([
      { id: "x", title: "x", durationSec: 1, createdAt: 1000, updatedAt: 2000, data: { id: "x", title: "x", durationSec: 1 }, audio: wav() },
    ]);
    const [stored] = await dumpNotes();
    expect(stored.updatedAt).toBe(2000);
  });

  it("two overlapping updateAnnotation calls on one note both land", async () => {
    await saveNote(
      note("a", {
        annotations: [
          { id: "x", kind: "todo", done: false },
          { id: "y", kind: "todo", done: false },
        ] as unknown as Note["annotations"],
      }),
      wav(),
    );
    await Promise.all([
      updateAnnotation("a", "x", { done: true } as never),
      updateAnnotation("a", "y", { done: true } as never),
    ]);
    const n = await getNote("a");
    expect(n?.annotations?.every((a) => (a as { done?: boolean }).done)).toBe(true);
  });

  it("searchNotes matches title, tags, and transcript text within a project", async () => {
    await saveNote(note("a", { title: "Tide clocks", project: "Sea" }), wav());
    await saveNote(note("b", { title: "Other", tags: ["tide"] }), wav());
    await saveNote(note("c", { title: "Trashed tide", deletedAt: 1 }), wav());
    expect((await searchNotes("tide")).map((h) => h.id).sort()).toEqual(["a", "b"]);
    expect((await searchNotes("tide", "Sea")).map((h) => h.id)).toEqual(["a"]);
  });

  it("a note whose audio file is missing is skipped by dumpNotes, not fatal", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await saveNote(note("a"), wav("a"));
    await saveNote(note("b"), wav("b"));
    await fs.remove("notes/a/audio.wav");
    const dumped = await dumpNotes();
    expect(dumped.map((n) => n.id)).toEqual(["b"]);
    expect(await text(dumped[0].audio)).toBe("b");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("a"));
    await expect(getNote("a")).rejects.toThrow(/no audio/);
    // The record still exists, so the feed still lists it.
    expect((await listNotes()).map((s) => s.id).sort()).toEqual(["a", "b"]);
    warn.mockRestore();
  });

  it("saveNote rejects an id that is not a plain path segment", async () => {
    await expect(saveNote(note("a/b"), wav())).rejects.toThrow(/Invalid note id/);
    await expect(saveNote(note(".."), wav())).rejects.toThrow(/Invalid note id/);
    expect(await fs.exists("notes/a")).toBe(false);
  });

  it("importNotes skips a record with a hostile id and writes nothing outside notes/", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await importNotes([
      { id: "../x", title: "x", durationSec: 1, createdAt: 1, data: { id: "../x", title: "x", durationSec: 1 }, audio: wav() },
      { id: "ok-1", title: "ok", durationSec: 1, createdAt: 2, data: { id: "ok-1", title: "ok", durationSec: 1 }, audio: wav() },
    ]);
    expect(res).toEqual({ added: 1, skipped: 1 });
    expect(await fs.exists("notes/ok-1/note.json")).toBe(true);
    for (const p of [...fs.files.keys(), ...fs.dirs]) {
      expect(p.split("/")).not.toContain("..");
    }
    expect([...fs.files.keys()].every((p) => p.startsWith("notes/"))).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("orphan cleanup takes the note lock, so a save arriving mid-removal survives", async () => {
    // A MemoryFs whose remove of notes/r1 parks until released. That opens the window the
    // real (async IPC) fs has between "this folder is an orphan" and the removal landing.
    let reached!: () => void;
    const removing = new Promise<void>((r) => (reached = r));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    class GatedFs extends MemoryFs {
      override async remove(path: string): Promise<void> {
        if (path === "notes/r1") {
          reached();
          await gate;
        }
        return super.remove(path);
      }
    }
    fs = new GatedFs();
    setFsPort(fs);
    await fs.mkdir("notes/r1");
    await fs.writeFile("notes/r1/audio.wav", new Uint8Array([1])); // orphan: no note.json

    const purging = purgeExpired();
    await removing; // purgeExpired has decided r1 is an orphan and is removing it
    const saving = saveNote(note("r1"), wav());
    // Give an unlocked save every chance to finish before the removal lands. Under the lock
    // it cannot start yet: the removal runs first, then the save rewrites the folder.
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([purging, saving]);

    expect(await fs.exists("notes/r1/note.json")).toBe(true);
    expect(await fs.exists("notes/r1/audio.wav")).toBe(true);
    expect((await listNotes()).map((s) => s.id)).toContain("r1");
  });

  it("importNotes checks for an existing id under the lock (a racing save wins)", async () => {
    // The save starts first, so it holds the lock; the import must see its record and skip.
    const [, res] = await Promise.all([
      saveNote(note("z"), wav("live")),
      importNotes([
        { id: "z", title: "archive", durationSec: 1, createdAt: 1, data: { id: "z", title: "archive", durationSec: 1 }, audio: wav("archive") },
      ]),
    ]);
    expect(res).toEqual({ added: 0, skipped: 1 });
    const dumped = await dumpNotes();
    expect(dumped.filter((n) => n.id === "z")).toHaveLength(1);
    const [z] = dumped;
    const audio = await text(z.audio);
    expect(z.title).toBe(audio === "live" ? "z" : "archive"); // never a mixed record
    expect(audio).toBe("live");
  });

  it("re-saving a note with a new audio type removes the stale audio file", async () => {
    await saveNote(note("a"), new Blob(["1"], { type: "audio/mp4" }));
    await saveNote(note("a"), wav());
    expect(await fs.exists("notes/a/audio.m4a")).toBe(false);
    expect(await fs.exists("notes/a/audio.wav")).toBe(true);
    const dumped = await dumpNotes();
    expect(dumped).toHaveLength(1);
    expect(dumped[0].audio.type).toBe("audio/wav");
  });
});
