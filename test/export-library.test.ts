import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { buildBackupMock } = vi.hoisted(() => ({ buildBackupMock: vi.fn() }));

vi.mock("../app/lib/backup.js", () => ({
  buildBackup: buildBackupMock,
}));

import { exportLibrary } from "../app/lib/exportLibrary.js";
import { getLastExportAt } from "../app/lib/exportReminder.js";

describe("exportLibrary (shared download action)", () => {
  let clickMock: ReturnType<typeof vi.fn>;
  let createdAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });

    clickMock = vi.fn();
    createdAnchor = { href: "", download: "", click: clickMock };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createdAnchor),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });

    buildBackupMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stamps the time the snapshot began, not when the download fired", async () => {
    const T = 1_000_000;
    vi.setSystemTime(T);
    buildBackupMock.mockImplementation(async () => {
      vi.setSystemTime(T + 5000);
      return { blob: new Blob(["x"]), count: 1, filename: "f.zip" };
    });

    await exportLibrary();

    expect(getLastExportAt()).toBe(T);
  });

  it("does not stamp when the build fails", async () => {
    buildBackupMock.mockRejectedValue(new Error("boom"));

    await expect(exportLibrary()).rejects.toThrow();

    expect(getLastExportAt()).toBeNull();
  });

  it("returns count and filename and triggers the anchor click", async () => {
    buildBackupMock.mockResolvedValue({ blob: new Blob(["x"]), count: 2, filename: "f.zip" });

    const result = await exportLibrary();

    expect(result).toEqual({ count: 2, filename: "f.zip" });
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(createdAnchor.download).toBe("f.zip");
  });
});
