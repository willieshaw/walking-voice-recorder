import { beforeEach, describe, expect, it, vi } from "vitest";

// The plugin modules touch Tauri globals; mock them before importing the module under test.
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(async () => undefined),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import { checkForUpdate, installUpdate, updateRailState, updateStripState } from "../app/lib/updater.js";

describe("updateStripState (pure)", () => {
  it("is hidden when there is no update or it was dismissed", () => {
    expect(updateStripState(null, { phase: "idle" })).toEqual({ kind: "hidden" });
    expect(updateStripState({ version: "0.2.0-beta.2" }, { phase: "dismissed" })).toEqual({ kind: "hidden" });
  });
  it("offers the update when idle", () => {
    expect(updateStripState({ version: "0.2.0-beta.2" }, { phase: "idle" })).toEqual({
      kind: "available",
      version: "0.2.0-beta.2",
    });
  });
  it("reports progress while downloading, as a whole percent or null when size is unknown", () => {
    expect(updateStripState({ version: "v" }, { phase: "downloading", received: 50, total: 200 })).toEqual({
      kind: "downloading",
      version: "v",
      percent: 25,
    });
    expect(updateStripState({ version: "v" }, { phase: "downloading", received: 50, total: null })).toEqual({
      kind: "downloading",
      version: "v",
      percent: null,
    });
  });
  it("clamps percent to 100 when received exceeds total", () => {
    expect(updateStripState({ version: "v" }, { phase: "downloading", received: 300, total: 200 })).toEqual({
      kind: "downloading",
      version: "v",
      percent: 100,
    });
  });
  it("surfaces an error with the message", () => {
    expect(updateStripState({ version: "v" }, { phase: "error", message: "boom" })).toEqual({
      kind: "error",
      version: "v",
      message: "boom",
    });
  });
});

describe("updateRailState (pure): the collapsed rail's one-icon indicator", () => {
  it("is hidden whenever the strip is", () => {
    expect(updateRailState({ kind: "hidden" })).toEqual({ kind: "hidden" });
  });
  it("installs straight from the rail when an update is ready, and says so", () => {
    expect(updateRailState({ kind: "available", version: "0.2.0-beta.4" })).toEqual({
      kind: "shown",
      action: "install",
      label: "Restart to update to Thoughts 0.2.0-beta.4",
    });
  });
  it("expands the sidebar while downloading so the progress is readable", () => {
    expect(updateRailState({ kind: "downloading", version: "v", percent: 40 })).toEqual({
      kind: "shown",
      action: "expand",
      label: "Downloading Thoughts v · 40%",
    });
    expect(updateRailState({ kind: "downloading", version: "v", percent: null })).toEqual({
      kind: "shown",
      action: "expand",
      label: "Downloading Thoughts v…",
    });
  });
  it("expands the sidebar on error so the message and Retry are visible", () => {
    expect(updateRailState({ kind: "error", version: "v", message: "boom" })).toEqual({
      kind: "shown",
      action: "expand",
      label: "Update failed: boom",
    });
  });
});

describe("checkForUpdate / installUpdate (plugin wrappers)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the plugin reports no update", async () => {
    mocks.check.mockResolvedValueOnce(null);
    expect(await checkForUpdate()).toBeNull();
  });
  it("returns the version and keeps the plugin handle", async () => {
    const handle = { version: "0.2.0-beta.2", downloadAndInstall: vi.fn() };
    mocks.check.mockResolvedValueOnce(handle);
    const u = await checkForUpdate();
    expect(u).toEqual({ version: "0.2.0-beta.2", handle });
  });
  it("rejects when the check itself fails (caller shows the error)", async () => {
    mocks.check.mockRejectedValueOnce(new Error("offline"));
    await expect(checkForUpdate()).rejects.toThrow("offline");
  });
  it("installUpdate streams progress, then relaunches", async () => {
    const events: unknown[] = [];
    const handle = {
      version: "v",
      downloadAndInstall: vi.fn(async (cb: (e: unknown) => void) => {
        cb({ event: "Started", data: { contentLength: 100 } });
        cb({ event: "Progress", data: { chunkLength: 40 } });
        cb({ event: "Progress", data: { chunkLength: 60 } });
        cb({ event: "Finished" });
      }),
    };
    await installUpdate({ version: "v", handle }, (p) => events.push(p));
    expect(events).toEqual([
      { received: 0, total: 100 },
      { received: 40, total: 100 },
      { received: 100, total: 100 },
      { received: 100, total: 100 },
    ]);
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });
  it("does not relaunch when the download fails", async () => {
    const handle = {
      version: "v",
      downloadAndInstall: vi.fn(async () => {
        throw new Error("bad signature");
      }),
    };
    await expect(installUpdate({ version: "v", handle }, () => undefined)).rejects.toThrow("bad signature");
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});
