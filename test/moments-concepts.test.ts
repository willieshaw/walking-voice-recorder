import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SttProvider, SttResult } from "../src/providers/stt.js";
import type { LlmProvider, LlmJsonRequest } from "../src/providers/llm.js";
import type { Transcript } from "../src/core/types.js";
import type { KeyMomentsResult } from "../src/processors/keymoments/prompt.js";
import type { ConceptsResult } from "../src/processors/concepts/prompt.js";
import { assembleKeyMoments } from "../src/processors/keymoments/index.js";
import { assembleConcepts } from "../src/processors/concepts/index.js";
import { initNote, readArtifact } from "../src/core/store.js";
import { runPipeline } from "../src/processors/runner.js";

/** Two paragraphs: p0 spans [0,4], p1 spans [7,9] — same shape the trunk produces. */
const TRANSCRIPT: Transcript = {
  text: "Hello there, this is a test.\n\nNew idea here.",
  paragraphs: [
    { id: "p0", text: "Hello there, this is a test.", tStart: 0, tEnd: 4 },
    { id: "p1", text: "New idea here.", tStart: 7, tEnd: 9 },
  ],
  words: [],
  durationSec: 9,
};

describe("assembleKeyMoments", () => {
  it("resolves cited paragraphs into a min/max time span", () => {
    const moments = assembleKeyMoments(TRANSCRIPT, {
      moments: [{ label: "The test", sourceIds: ["p0"] }],
    });
    expect(moments).toEqual([{ id: "km-0", label: "The test", tStart: 0, tEnd: 4 }]);
  });

  it("spans multiple cited paragraphs", () => {
    const [m] = assembleKeyMoments(TRANSCRIPT, {
      moments: [{ label: "Whole walk", sourceIds: ["p0", "p1"] }],
    });
    expect(m).toMatchObject({ tStart: 0, tEnd: 9 });
  });

  it("drops moments with no valid citation and sorts the rest by time", () => {
    const moments = assembleKeyMoments(TRANSCRIPT, {
      moments: [
        { label: "Late", sourceIds: ["p1"] },
        { label: "Hallucinated", sourceIds: ["p99"] },
        { label: "Early", sourceIds: ["p0"] },
      ],
    });
    expect(moments.map((m) => m.label)).toEqual(["Early", "Late"]);
    expect(moments.map((m) => m.id)).toEqual(["km-0", "km-1"]); // ids assigned after sort
  });
});

describe("assembleConcepts", () => {
  it("resolves, dedupes, and sorts occurrences from cited paragraphs", () => {
    const [c] = assembleConcepts(TRANSCRIPT, {
      concepts: [{ phrase: "the idea", weight: 3, sourceIds: ["p1", "p0", "p1"] }],
    });
    expect(c).toEqual({
      id: "c-0",
      phrase: "the idea",
      weight: 3,
      occurrences: [
        { tStart: 0, tEnd: 4 },
        { tStart: 7, tEnd: 9 },
      ],
    });
  });

  it("clamps weight to 1–5", () => {
    const concepts = assembleConcepts(TRANSCRIPT, {
      concepts: [
        { phrase: "loud", weight: 12, sourceIds: ["p0"] },
        { phrase: "quiet", weight: 0, sourceIds: ["p1"] },
      ],
    });
    expect(concepts.map((c) => c.weight)).toEqual([5, 1]);
  });

  it("drops concepts with no valid citation", () => {
    const concepts = assembleConcepts(TRANSCRIPT, {
      concepts: [{ phrase: "ghost", weight: 4, sourceIds: ["p42"] }],
    });
    expect(concepts).toEqual([]);
  });
});

// ── Pipeline integration: both processors run off the stored transcript. ────────

function fakeStt(): SttProvider {
  return {
    name: "fake",
    async transcribe(): Promise<SttResult> {
      return {
        text: "Hello there, this is a test. New idea here.",
        words: [],
        segments: [
          { text: "Hello there, this is a test.", start: 0, end: 4 },
          { text: "New idea here.", start: 7, end: 9 },
        ],
        durationSec: 9,
        language: "en",
      };
    },
  };
}

/** A structuring LLM that answers by schemaName, so one fake serves both processors. */
function fakeLlm(): LlmProvider {
  const keymoments: KeyMomentsResult = {
    moments: [{ label: "New idea", sourceIds: ["p1"] }],
  };
  const concepts: ConceptsResult = {
    concepts: [{ phrase: "the test", weight: 5, sourceIds: ["p0"] }],
  };
  return {
    name: "fake-llm",
    async generateJson<T>(req: LlmJsonRequest): Promise<T> {
      if (req.schemaName === "keymoments") return keymoments as unknown as T;
      if (req.schemaName === "concepts") return concepts as unknown as T;
      throw new Error(`unexpected schemaName ${req.schemaName}`);
    },
  };
}

describe("keymoments + concepts pipeline (derived off transcript)", () => {
  let tmp: string;
  const NOTE_ID = "m3-walk";

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wvr-m3-"));
    process.env.WVR_NOTES_DIR = tmp;
    const audio = path.join(tmp, "source.m4a");
    await fs.writeFile(audio, "not really audio");
    await initNote(audio, NOTE_ID);
    await runPipeline(NOTE_ID, { only: "transcript", stt: fakeStt() });
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("produces keymoments with timestamps resolved from cited paragraphs", async () => {
    const res = await runPipeline(NOTE_ID, { only: "keymoments", llm: fakeLlm() });
    expect(res.ran).toContain("keymoments");
    const km = await readArtifact(NOTE_ID, "keymoments");
    expect(km).toEqual([{ id: "km-0", label: "New idea", tStart: 7, tEnd: 9 }]);
  });

  it("produces concepts with resolved occurrences", async () => {
    const res = await runPipeline(NOTE_ID, { only: "concepts", llm: fakeLlm() });
    expect(res.ran).toContain("concepts");
    const c = await readArtifact(NOTE_ID, "concepts");
    expect(c).toEqual([
      { id: "c-0", phrase: "the test", weight: 5, occurrences: [{ tStart: 0, tEnd: 4 }] },
    ]);
  });
});
