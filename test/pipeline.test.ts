import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SttProvider, SttResult } from "../src/providers/stt.js";
import type { LlmProvider } from "../src/providers/llm.js";
import type { LayersResult } from "../src/processors/layers/prompt.js";
import {
  initNote,
  listNoteIds,
  readArtifact,
  readManifest,
  writeNotesIndex,
} from "../src/core/store.js";
import { runPipeline } from "../src/processors/runner.js";

/** A fake STT provider so tests are fast, offline, and free. */
function fakeStt(text: string, calls = { n: 0 }): SttProvider {
  return {
    name: "fake",
    async transcribe(): Promise<SttResult> {
      calls.n++;
      return {
        text,
        words: [
          { word: "Hello", start: 0, end: 0.5 },
          { word: "idea", start: 7, end: 7.4 },
        ],
        segments: [
          { text: "Hello there", start: 0, end: 2 },
          { text: "this is a test", start: 2.2, end: 4 },
          { text: "new idea here", start: 7, end: 9 }, // 3s gap -> new paragraph
        ],
        durationSec: 9,
        language: "en",
      };
    },
  };
}

let tmp: string;
const NOTE_ID = "test-walk";

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wvr-"));
  process.env.WVR_NOTES_DIR = tmp;
  const audio = path.join(tmp, "source.m4a");
  await fs.writeFile(audio, "not really audio"); // content irrelevant; STT is faked
  await initNote(audio, NOTE_ID);
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("transcribe pipeline (trunk)", () => {
  it("produces a transcript with timestamped paragraphs and records provenance", async () => {
    const res = await runPipeline(NOTE_ID, { stt: fakeStt("hello") });
    expect(res.ran).toContain("transcript");

    const t = await readArtifact(NOTE_ID, "transcript");
    expect(t).not.toBeNull();
    expect(t!.paragraphs).toHaveLength(2);
    expect(t!.paragraphs[0]).toMatchObject({ id: "p0", tStart: 0, tEnd: 4 });
    expect(t!.paragraphs[1].tStart).toBe(7);
    expect(t!.words.length).toBeGreaterThan(0);

    const manifest = await readManifest(NOTE_ID);
    expect(manifest!.durationSec).toBe(9);
    expect(manifest!.artifacts.transcript).toMatchObject({ version: 1 });
  });

  it("skips an up-to-date artifact on re-run (caching)", async () => {
    const calls = { n: 0 };
    const res = await runPipeline(NOTE_ID, { stt: fakeStt("hello", calls) });
    expect(res.skipped).toContain("transcript");
    expect(res.ran).not.toContain("transcript");
    expect(calls.n).toBe(0); // produce was never invoked
  });

  it("re-runs a single processor when forced with --only", async () => {
    const res = await runPipeline(NOTE_ID, {
      only: "transcript",
      stt: fakeStt("changed"),
    });
    expect(res.ran).toContain("transcript");
  });

  it("ignores non-note entries (.gitkeep, index.json) when listing", async () => {
    await fs.writeFile(path.join(tmp, ".gitkeep"), "");
    await writeNotesIndex(); // writes index.json into the notes dir
    const ids = await listNoteIds(); // must not choke on the file entries
    expect(ids).toEqual([NOTE_ID]);
  });
});

/** A fake structuring LLM so the layers branch is tested offline. */
function fakeLlm(): LlmProvider {
  const result: LayersResult = {
    cleaned: [
      { text: "Hello there, this is a test.", sourceIds: ["p0"] },
      { text: "New idea here.", sourceIds: ["p1"] },
    ],
  };
  return {
    name: "fake-llm",
    async generateJson<T>(): Promise<T> {
      return result as unknown as T;
    },
  };
}

describe("layers branch (derived off transcript)", () => {
  it("produces Raw + Cleaned with timestamps resolved from cited paragraphs", async () => {
    const res = await runPipeline(NOTE_ID, { only: "layers", llm: fakeLlm() });
    expect(res.ran).toContain("layers");

    const layers = await readArtifact(NOTE_ID, "layers");
    expect(layers).not.toBeNull();
    expect(layers!.levels.map((l) => l.label)).toEqual(["Raw", "Cleaned"]);

    // L0 Raw mirrors the transcript paragraphs (p0 [0,4], p1 [7,9]).
    expect(layers!.levels[0].chunks).toHaveLength(2);

    // L1 Cleaned chunks inherit timestamps from their cited paragraph, all kind "text".
    const cleaned = layers!.levels[1].chunks;
    expect(cleaned[0]).toMatchObject({ kind: "text", tStart: 0, tEnd: 4 });
    expect(cleaned[1]).toMatchObject({ kind: "text", tStart: 7, tEnd: 9 });
  });
});
