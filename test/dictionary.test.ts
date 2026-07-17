import { describe, expect, it } from "vitest";
import { buildSttPrompt, cleanTerm } from "../app/lib/dictionary.js";

describe("buildSttPrompt (personal dictionary → Whisper vocabulary bias)", () => {
  it("joins terms as a plain comma list, skipping empties", () => {
    expect(buildSttPrompt(["Mara", " Saltmarsh ", "", "tide clocks"])).toBe(
      "Mara, Saltmarsh, tide clocks",
    );
  });

  it("returns an empty string for an empty dictionary", () => {
    expect(buildSttPrompt([])).toBe("");
  });

  it("caps at the budget without ever truncating a term mid-word", () => {
    const out = buildSttPrompt(["alpha", "beta", "gamma"], 12);
    expect(out).toBe("alpha, beta"); // "alpha, beta, gamma" would blow the cap
  });
});

describe("cleanTerm (transcript selection → dictionary term)", () => {
  it("strips whitespace and wrapping quotes/punctuation, keeping the term's case", () => {
    expect(cleanTerm(' "Saltmarsh," ')).toBe("Saltmarsh");
    expect(cleanTerm("Mara's tide clocks.")).toBe("Mara's tide clocks");
  });

  it("rejects selections that aren't a term: multi-line, empty, or too long", () => {
    expect(cleanTerm("one line\nanother")).toBe("");
    expect(cleanTerm('  "…"  ')).toBe("");
    expect(cleanTerm("x".repeat(61))).toBe("");
  });
});
