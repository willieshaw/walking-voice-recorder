import { describe, expect, it } from "vitest";
import type { Note } from "../src/core/types.js";
import { isCombined, resolveCombined } from "../src/core/combine.js";

/** A minimal note with a one-paragraph transcript, a todo, a moment, and a summary. */
function makeNote(id: string, opts: { dur: number; startText: string }): Note {
  return {
    id,
    title: `Note ${id}`,
    audioUrl: `blob:${id}`,
    durationSec: opts.dur,
    transcript: {
      text: opts.startText,
      paragraphs: [{ id: "p0", text: opts.startText, tStart: 0, tEnd: opts.dur }],
      words: [],
      durationSec: opts.dur,
    },
    annotations: [
      { id: "m0", kind: "moment", label: `chapter ${id}`, tStart: 0, tEnd: opts.dur },
      { id: "t0", kind: "todo", label: `todo ${id}`, tStart: 1, tEnd: 2 },
    ],
    summary: `summary of ${id}`,
  };
}

describe("isCombined", () => {
  it("is true only for a reference list of 2+ notes", () => {
    expect(isCombined({})).toBe(false);
    expect(isCombined({ combinedFrom: ["a"] })).toBe(false);
    expect(isCombined({ combinedFrom: ["a", "b"] })).toBe(true);
  });
});

describe("resolveCombined", () => {
  const a = makeNote("a", { dur: 10, startText: "first note text" });
  const b = makeNote("b", { dur: 6, startText: "second note text" });
  const host: Note = { ...a, combinedFrom: ["a", "b"] };
  const { note, segments } = resolveCombined(host, [a, b]);

  it("lays sources on one timeline with a summed duration", () => {
    expect(note.durationSec).toBe(16);
    expect(segments).toEqual([
      { noteId: "a", title: "Note a", offset: 0, duration: 10, audioUrl: "blob:a" },
      { noteId: "b", title: "Note b", offset: 10, duration: 6, audioUrl: "blob:b" },
    ]);
  });

  it("prefixes a section heading per source and shifts paragraph times by the offset", () => {
    const paras = note.transcript!.paragraphs;
    // heading, a's paragraph, heading, b's paragraph (b shifted by 10s).
    expect(paras.map((p) => p.kind)).toEqual(["heading", undefined, "heading", undefined]);
    expect(paras[0]).toMatchObject({ text: "Note a", kind: "heading", tStart: 0 });
    expect(paras[2]).toMatchObject({ text: "Note b", kind: "heading", tStart: 10 });
    expect(paras[3]).toMatchObject({ tStart: 10, tEnd: 16 });
  });

  it("chapters by source and keeps every source's shifted to-dos", () => {
    const moments = note.annotations!.filter((x) => x.kind === "moment");
    const todos = note.annotations!.filter((x) => x.kind === "todo");
    expect(moments.map((m) => [m.label, m.tStart])).toEqual([
      ["Note a", 0],
      ["Note b", 10],
    ]);
    expect(todos.map((t) => [t.label, t.tStart])).toEqual([
      ["todo a", 1],
      ["todo b", 11], // shifted onto the global timeline
    ]);
  });

  it("merges the source summaries and drops variant state", () => {
    expect(note.summary).toBe("summary of a\n\nsummary of b");
    expect(note.summaries).toBeUndefined();
  });
});
