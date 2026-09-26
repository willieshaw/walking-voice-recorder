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
});
