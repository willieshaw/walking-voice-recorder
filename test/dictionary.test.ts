import { describe, expect, it } from "vitest";
import { buildSttPrompt } from "../app/lib/dictionary.js";

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
