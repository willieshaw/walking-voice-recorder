import { describe, expect, it, vi } from "vitest";

// The plugin modules touch Tauri globals; mock them before importing the module under test.
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(async () => undefined),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import { checkForUpdate, installUpdate, updateStripState } from "../app/lib/updater.js";

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
  it("surfaces an error with the message", () => {
    expect(updateStripState({ version: "v" }, { phase: "error", message: "boom" })).toEqual({
      kind: "error",
      version: "v",
      message: "boom",
    });
  });
});

describe("checkForUpdate / installUpdate (plugin wrappers)", () => {
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
    ]);
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });
});
