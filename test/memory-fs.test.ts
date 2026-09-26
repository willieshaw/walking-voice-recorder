import { describe, expect, it } from "vitest";
import { MemoryFs } from "./helpers/memoryFs.js";

const enc = (s: string) => new TextEncoder().encode(s);

describe("MemoryFs (in-memory FsPort for tests)", () => {
  it("mkdir is recursive and idempotent; exists sees dirs and files", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.mkdir("notes/a");
    expect(await fs.exists("notes")).toBe(true);
    expect(await fs.exists("notes/a")).toBe(true);
    expect(await fs.exists("notes/b")).toBe(false);
  });

  it("writes and reads text and bytes", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.writeTextFile("notes/a/note.json", "{}");
    await fs.writeFile("notes/a/audio.wav", enc("riff"));
    expect(await fs.readTextFile("notes/a/note.json")).toBe("{}");
    expect(new TextDecoder().decode(await fs.readFile("notes/a/audio.wav"))).toBe("riff");
  });

  it("readDir lists direct children only, flagging directories", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.mkdir("notes/b");
    await fs.writeTextFile("notes/a/note.json", "{}");
    await fs.writeTextFile("notes/stray.txt", "x");
    const names = (await fs.readDir("notes")).map((e) => `${e.name}:${e.isDirectory}`).sort();
    expect(names).toEqual(["a:true", "b:true", "stray.txt:false"]);
  });

  it("rename replaces the target atomically", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.writeTextFile("notes/a/note.json", "old");
    await fs.writeTextFile("notes/a/note.json.tmp", "new");
    await fs.rename("notes/a/note.json.tmp", "notes/a/note.json");
    expect(await fs.readTextFile("notes/a/note.json")).toBe("new");
    expect(await fs.exists("notes/a/note.json.tmp")).toBe(false);
  });

  it("remove deletes a directory and everything under it, and tolerates missing paths", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.writeTextFile("notes/a/note.json", "{}");
    await fs.remove("notes/a");
    expect(await fs.exists("notes/a")).toBe(false);
    expect(await fs.exists("notes/a/note.json")).toBe(false);
    await expect(fs.remove("notes/nope")).resolves.toBeUndefined();
  });

  it("readFile on a missing path rejects", async () => {
    const fs = new MemoryFs();
    await expect(fs.readTextFile("missing")).rejects.toThrow(/missing/);
  });
});

describe("MemoryFs is as strict as the real plugin", () => {
  it("writeFile rejects when the parent directory is missing", async () => {
    const fs = new MemoryFs();
    await expect(fs.writeTextFile("notes/a/note.json", "{}")).rejects.toThrow(/parent/);
  });

  it("readFile returns a copy, so callers cannot corrupt stored bytes", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes");
    await fs.writeFile("notes/x", new Uint8Array([1, 2]));
    (await fs.readFile("notes/x"))[0] = 9;
    expect([...(await fs.readFile("notes/x"))]).toEqual([1, 2]);
  });
});
