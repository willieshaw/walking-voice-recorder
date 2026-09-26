import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySettings,
  captureSettings,
  mergeSettings,
  type SettingsSnapshot,
} from "../app/lib/settingsSnapshot.js";
import { getDictionary, setDictionary } from "../app/lib/dictionary.js";
import { pinnedFolders, pinnedOrder, setFolderOrder, setFolderPinsList, setPinnedOrder, storedFolders } from "../app/lib/folders.js";
import { rememberProject, allProjects } from "../app/lib/projects.js";

const empty = (): SettingsSnapshot => ({ dictionary: [], projects: [], folders: {} });

describe("mergeSettings (pure)", () => {
  it("unions lists, keeping the current order first and skipping duplicates", () => {
    const current: SettingsSnapshot = {
      dictionary: ["Mara", "Saltmarsh"],
      projects: ["Essays"],
      folders: { Default: { folders: ["Ideas"], pinned: ["Ideas"], pinnedOrder: ["f:Ideas"] } },
    };
    const incoming: SettingsSnapshot = {
      dictionary: ["Saltmarsh", "tide clocks"],
      projects: ["Essays", "Sea"],
      folders: {
        Default: { folders: ["Drafts", "Ideas"], pinned: ["Drafts"], pinnedOrder: ["f:Drafts", "n:abc"] },
        Sea: { folders: ["Tides"], pinned: [], pinnedOrder: [] },
      },
    };
    expect(mergeSettings(current, incoming)).toEqual({
      dictionary: ["Mara", "Saltmarsh", "tide clocks"],
      projects: ["Essays", "Sea"],
      folders: {
        Default: {
          folders: ["Ideas", "Drafts"],
          pinned: ["Ideas", "Drafts"],
          pinnedOrder: ["f:Ideas", "f:Drafts", "n:abc"],
        },
        Sea: { folders: ["Tides"], pinned: [], pinnedOrder: [] },
      },
    });
  });

  it("merging an empty snapshot changes nothing", () => {
    const current: SettingsSnapshot = {
      dictionary: ["Mara"],
      projects: ["Essays"],
      folders: { Essays: { folders: ["A"], pinned: ["A"], pinnedOrder: ["f:A"] } },
    };
    expect(mergeSettings(current, empty())).toEqual(current);
  });

  it("tolerates a partial or malformed incoming snapshot", () => {
    const partial = { dictionary: "nope", folders: { Default: { folders: ["X"] } } } as unknown as SettingsSnapshot;
    expect(mergeSettings(empty(), partial)).toEqual({
      dictionary: [],
      projects: [],
      folders: { Default: { folders: ["X"], pinned: [], pinnedOrder: [] } },
    });
  });
});

describe("captureSettings / applySettings (localStorage)", () => {
  beforeEach(() => {
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it("captures the dictionary, project registry, and every project's folder registry", () => {
    setDictionary(["Mara"]);
    rememberProject("Sea");
    setFolderOrder(["Ideas"], "Default");
    setFolderPinsList(["Ideas"], "Default");
    setPinnedOrder(["f:Ideas"], "Default");
    setFolderOrder(["Tides"], "Sea");
    expect(captureSettings(["Default", "Sea"])).toEqual({
      dictionary: ["Mara"],
      projects: ["Sea"],
      folders: {
        Default: { folders: ["Ideas"], pinned: ["Ideas"], pinnedOrder: ["f:Ideas"] },
        Sea: { folders: ["Tides"], pinned: [], pinnedOrder: [] },
      },
    });
  });

  it("applySettings merges into what's already here without duplicates", () => {
    setDictionary(["Mara"]);
    setFolderOrder(["Ideas"], "Default");
    applySettings({
      dictionary: ["Mara", "tide clocks"],
      projects: ["Sea"],
      folders: {
        Default: { folders: ["Ideas", "Drafts"], pinned: ["Drafts"], pinnedOrder: ["f:Drafts"] },
        Sea: { folders: ["Tides"], pinned: ["Tides"], pinnedOrder: ["f:Tides"] },
      },
    });
    expect(getDictionary()).toEqual(["Mara", "tide clocks"]);
    expect(allProjects([undefined])).toEqual(["Default", "Sea"]);
    expect(storedFolders("Default")).toEqual(["Ideas", "Drafts"]);
    expect(pinnedFolders("Default")).toEqual(["Drafts"]);
    expect(pinnedOrder("Default")).toEqual(["f:Drafts"]);
    expect(storedFolders("Sea")).toEqual(["Tides"]);
    expect(pinnedFolders("Sea")).toEqual(["Tides"]);
  });
});
