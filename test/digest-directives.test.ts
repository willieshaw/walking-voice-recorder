import { describe, expect, it } from "vitest";
import type { Transcript } from "../src/core/types.js";
import { assembleDirectives } from "../src/processors/directives/index.js";
import { assembleSummary } from "../src/processors/summary/index.js";
import {
  DEFAULT_VARIANT,
  summaryRequest,
  summaryVariants,
} from "../src/processors/summary/prompt.js";

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
  it("maps to-do items onto Annotation spans, sorted chronologically", () => {
    const out = assembleDirectives(TRANSCRIPT, {
      items: [
        { phrase: "Frame the lighthouse shot", sourceIds: ["p2"] },
        { phrase: "Ask Mara", sourceIds: ["p1"] },
      ],
    });
    expect(out).toHaveLength(2);
    // Sorted chronologically regardless of the model's ordering; every directive is a to-do.
    expect(out[0]).toMatchObject({ kind: "todo", label: "Ask Mara", tStart: 7, tEnd: 9 });
    expect(out[1]).toMatchObject({ kind: "todo", tStart: 12, tEnd: 15 });
    expect(out.map((a) => a.id)).toEqual(["dir-0", "dir-1"]);
  });

  it("drops items whose citations don't resolve", () => {
    const out = assembleDirectives(TRANSCRIPT, {
      items: [{ phrase: "Phantom", sourceIds: ["p99"] }],
    });
    expect(out).toEqual([]);
  });

  it("leaves the user-mutation field (done) unset at assembly", () => {
    const [todo] = assembleDirectives(TRANSCRIPT, {
      items: [{ phrase: "Ask Mara", sourceIds: ["p1"] }],
    });
    expect(todo.done).toBeUndefined();
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

describe("summary variants", () => {
  it("exposes five variants with unique ids and distinct prompts", () => {
    expect(summaryVariants).toHaveLength(5);
    const ids = summaryVariants.map((v) => v.id);
    expect(new Set(ids).size).toBe(5);
    const prompts = summaryVariants.map((v) => v.buildPrompt(TRANSCRIPT.paragraphs));
    expect(new Set(prompts).size).toBe(5);
  });

  it("DEFAULT_VARIANT is the first variant", () => {
    expect(DEFAULT_VARIANT).toBe(summaryVariants[0].id);
  });

  it("summaryRequest resolves by id and falls back to the default for unknown ids", () => {
    const v = summaryVariants[2];
    expect(summaryRequest(v.id).system).toBe(v.system);
    expect(summaryRequest("nope").system).toBe(summaryVariants[0].system);
    expect(summaryRequest().system).toBe(summaryVariants[0].system);
  });
});
