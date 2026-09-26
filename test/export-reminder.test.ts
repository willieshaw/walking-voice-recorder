import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLastExportAt, reminderState, setLastExportAt } from "../app/lib/exportReminder.js";

const n = (updatedAt: number) => ({ updatedAt });

describe("reminderState (export banner)", () => {
  it("is 'never' when there has been no export, regardless of notes", () => {
    expect(reminderState([n(5)], null)).toEqual({ kind: "never" });
    expect(reminderState([], null)).toEqual({ kind: "never" });
  });

  it("is 'stale' with a count when notes changed after the export", () => {
    expect(reminderState([n(50), n(150), n(200)], 100)).toEqual({
      kind: "stale",
      lastExportAt: 100,
      changed: 2,
    });
  });

  it("is 'current' when nothing changed since the export", () => {
    expect(reminderState([n(50), n(100)], 100)).toEqual({ kind: "current", lastExportAt: 100 });
  });

  it("is 'current' for an empty library that has been exported", () => {
    expect(reminderState([], 100)).toEqual({ kind: "current", lastExportAt: 100 });
  });
});

describe("getLastExportAt / setLastExportAt (localStorage stamp)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is null when unset", () => {
    expect(getLastExportAt()).toBeNull();
  });

  it("is null for a non-numeric string", () => {
    localStorage.setItem("wvr.lastExportAt", "garbage");
    expect(getLastExportAt()).toBeNull();
  });

  it("is null for an empty string", () => {
    localStorage.setItem("wvr.lastExportAt", "");
    expect(getLastExportAt()).toBeNull();
  });

  it("is null for a negative number", () => {
    localStorage.setItem("wvr.lastExportAt", "-5");
    expect(getLastExportAt()).toBeNull();
  });

  it("round-trips a positive timestamp through setLastExportAt", () => {
    setLastExportAt(1234);
    expect(getLastExportAt()).toBe(1234);
  });

  it("round-trips zero through setLastExportAt", () => {
    setLastExportAt(0);
    expect(getLastExportAt()).toBe(0);
  });
});
