import { describe, expect, it } from "vitest";
import type { Transcript } from "../src/core/types.js";
import { assembleDirectives } from "../src/processors/directives/index.js";
import { assembleSummary } from "../src/processors/summary/index.js";

const TRANSCRIPT: Transcript = {
  text: "Hello there, this is a test.\n\nNote to self, ask Mara.\n\nAdd a photo of the lighthouse here.",
  paragraphs: [
    { id: "p0", text: "Hello there, this is a test.", tStart: 0, tEnd: 4 },
    { id: "p1", text: "Note to self, ask Mara.", tStart: 7, tEnd: 9 },
    { id: "p2", text: "Add a photo of the lighthouse here.", tStart: 12, tEnd: 15 },
  ],
  words: [],
  durationSec: 15,
};

describe("assembleDirectives", () => {
  it("maps todo and media items onto Annotation spans with their kinds preserved", () => {
    const out = assembleDirectives(TRANSCRIPT, {
      items: [
        { kind: "media", phrase: "add a photo of the lighthouse", sourceIds: ["p2"] },
        { kind: "todo", phrase: "Ask Mara", sourceIds: ["p1"] },
      ],
    });
    expect(out).toHaveLength(2);
    // Sorted chronologically regardless of the model's ordering.
    expect(out[0]).toMatchObject({ kind: "todo", label: "Ask Mara", tStart: 7, tEnd: 9 });
    expect(out[1]).toMatchObject({ kind: "media", tStart: 12, tEnd: 15 });
    expect(out.map((a) => a.id)).toEqual(["dir-0", "dir-1"]);
  });

  it("drops items whose citations don't resolve", () => {
    const out = assembleDirectives(TRANSCRIPT, {
      items: [{ kind: "todo", phrase: "Phantom", sourceIds: ["p99"] }],
    });
    expect(out).toEqual([]);
  });

  it("leaves user-mutation fields (done/media/dismissed) unset at assembly", () => {
    const [todo] = assembleDirectives(TRANSCRIPT, {
      items: [{ kind: "todo", phrase: "Ask Mara", sourceIds: ["p1"] }],
    });
    expect(todo.done).toBeUndefined();
    expect(todo.media).toBeUndefined();
    expect(todo.dismissed).toBeUndefined();
  });
});

describe("assembleSummary", () => {
  it("trims the model's digest", () => {
    expect(assembleSummary(TRANSCRIPT, { summary: "  A short digest. " })).toBe(
      "A short digest.",
    );
  });

  it("collapses a missing summary to the empty string", () => {
    expect(assembleSummary(TRANSCRIPT, { summary: undefined as unknown as string })).toBe("");
  });
});
