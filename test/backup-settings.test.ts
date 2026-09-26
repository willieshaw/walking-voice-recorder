import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBackup, restoreBackup } from "../app/lib/backup.js";
import { getDictionary, setDictionary } from "../app/lib/dictionary.js";
import { setFolderOrder, storedFolders } from "../app/lib/folders.js";
import { rememberProject, allProjects } from "../app/lib/projects.js";
import { setFsPort } from "../app/lib/fsPort.js";
import { _resetForTests, saveNote } from "../app/lib/notesDb.js";
import { readZip } from "../app/lib/zip.js";
import type { Note } from "../src/core/types.js";
import { MemoryFs } from "./helpers/memoryFs.js";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
}

describe("backup archive carries the device settings (manifest v1, optional `settings`)", () => {
  beforeEach(() => {
    setFsPort(new MemoryFs());
    _resetForTests();
    stubStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("export writes dictionary, projects, and folder registries into manifest.json", async () => {
    const n: Note = { id: "a", title: "A", audioUrl: "", durationSec: 1, project: "Sea" };
    await saveNote(n, new Blob(["x"], { type: "audio/wav" }));
    setDictionary(["Mara"]);
    rememberProject("Essays"); // an empty project, registry only
    setFolderOrder(["Tides"], "Sea"); // folder registry for a project known only from a note
    const { blob } = await buildBackup();
    const files = readZip(await blob.arrayBuffer());
    const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
    expect(manifest.version).toBe(1);
    expect(manifest.settings).toEqual({
      dictionary: ["Mara"],
      projects: ["Essays"],
      folders: {
        Default: { folders: [], pinned: [], pinnedOrder: [] },
        Essays: { folders: [], pinned: [], pinnedOrder: [] },
        Sea: { folders: ["Tides"], pinned: [], pinnedOrder: [] },
      },
    });
  });

  it("restore merges the archive's settings into this device", async () => {
    setDictionary(["Mara"]);
    await saveNote({ id: "a", title: "A", audioUrl: "", durationSec: 1 }, new Blob(["x"], { type: "audio/wav" }));
    setDictionary(["Mara", "tide clocks"]);
    rememberProject("Sea");
    setFolderOrder(["Tides"], "Sea");
    const { blob } = await buildBackup();

    // A fresh device that already has one term of its own.
    setFsPort(new MemoryFs());
    _resetForTests();
    stubStorage();
    setDictionary(["Saltmarsh"]);
    const res = await restoreBackup(new File([blob], "b.zip"));
    expect(res).toEqual({ added: 1, skipped: 0 });
    expect(getDictionary()).toEqual(["Saltmarsh", "Mara", "tide clocks"]);
    expect(allProjects([undefined])).toEqual(["Default", "Sea"]);
    expect(storedFolders("Sea")).toEqual(["Tides"]);
  });

  it("restore of an archive without `settings` (older export) leaves this device's settings alone", async () => {
    await saveNote({ id: "a", title: "A", audioUrl: "", durationSec: 1 }, new Blob(["x"], { type: "audio/wav" }));
    const { blob } = await buildBackup();
    const files = readZip(await blob.arrayBuffer());
    const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
    delete manifest.settings;
    const { writeZip } = await import("../app/lib/zip.js");
    const entries = [...files].map(([name, data]) => ({ name, data }));
    entries[entries.findIndex((e) => e.name === "manifest.json")] = {
      name: "manifest.json",
      data: new TextEncoder().encode(JSON.stringify(manifest)),
    };
    const older = new Blob([writeZip(entries)]);

    setFsPort(new MemoryFs());
    _resetForTests();
    stubStorage();
    setDictionary(["Saltmarsh"]);
    await restoreBackup(new File([older], "old.zip"));
    expect(getDictionary()).toEqual(["Saltmarsh"]);
  });
});
