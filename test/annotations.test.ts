import { describe, expect, it } from "vitest";
import type { Transcript } from "../src/core/types.js";
import { assembleAnnotations, deriveAnnotations } from "../src/core/annotations.js";

const TRANSCRIPT: Transcript = {
  text: "Hello there, this is a test.\n\nNew idea here.",
  paragraphs: [
    { id: "p0", text: "Hello there, this is a test.", tStart: 0, tEnd: 4 },
    { id: "p1", text: "New idea here.", tStart: 7, tEnd: 9 },
  ],
  words: [],
  durationSec: 9,
};

describe("assembleAnnotations (the one span resolver)", () => {
  it("resolves cited paragraphs into a min/max span with a kind + prefixed id", () => {
    const [a] = assembleAnnotations(
      TRANSCRIPT,
      [{ kind: "todo", label: "Do the thing", sourceIds: ["p0", "p1"] }],
      "td",
    );
    expect(a).toEqual({
      id: "td-0",
      kind: "todo",
      label: "Do the thing",
      sourceIds: ["p0", "p1"],
      tStart: 0,
      tEnd: 9,
    });
  });

  it("drops items with no valid citation and sorts the rest by time", () => {
    const items = assembleAnnotations(TRANSCRIPT, [
      { kind: "moment", label: "Late", sourceIds: ["p1"] },
      { kind: "moment", label: "Ghost", sourceIds: ["p99"] },
      { kind: "moment", label: "Early", sourceIds: ["p0"] },
    ]);
    expect(items.map((a) => a.label)).toEqual(["Early", "Late"]);
    expect(items.map((a) => a.id)).toEqual(["a-0", "a-1"]);
  });

  it("keeps only the citations that resolved", () => {
    const [a] = assembleAnnotations(TRANSCRIPT, [
      { kind: "todo", label: "photo", sourceIds: ["p0", "p99"] },
    ]);
    expect(a.sourceIds).toEqual(["p0"]);
  });
});

describe("deriveAnnotations (the one read source)", () => {
  it("folds legacy keymoments in as kind 'moment' when no annotations exist", () => {
    const out = deriveAnnotations({
      keymoments: [{ id: "km-0", label: "The knot", tStart: 5, tEnd: 8 }],
    });
    expect(out).toEqual([
      { id: "moment-legacy-0", kind: "moment", label: "The knot", tStart: 5, tEnd: 8 },
    ]);
  });

  it("prefers annotations and ignores legacy keymoments once moments are present", () => {
    const out = deriveAnnotations({
      annotations: [{ id: "a-0", kind: "moment", label: "New", tStart: 1, tEnd: 2 }],
      keymoments: [{ id: "km-0", label: "Old", tStart: 5, tEnd: 8 }],
    });
    expect(out.map((a) => a.label)).toEqual(["New"]);
  });

  it("merges non-moment annotations with legacy keymoment moments, sorted by time", () => {
    const out = deriveAnnotations({
      annotations: [{ id: "a-0", kind: "todo", label: "Task", tStart: 9, tEnd: 9 }],
      keymoments: [{ id: "km-0", label: "Chapter", tStart: 1, tEnd: 3 }],
    });
    expect(out.map((a) => [a.kind, a.label])).toEqual([
      ["moment", "Chapter"],
      ["todo", "Task"],
    ]);
  });
});
