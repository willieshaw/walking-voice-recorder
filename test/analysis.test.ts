import { describe, expect, it } from "vitest";
import { CURRENT_ANALYSIS, staleAnalyses } from "../src/processors/analysis.js";
import { layersProcessor } from "../src/processors/layers/index.js";

/** A note carrying every analysis, stamped as built with the current prompt versions. */
const fresh = {
  layers: { levels: [] },
  keymoments: [],
  summary: "s",
  annotations: [],
  artifactVersions: { ...CURRENT_ANALYSIS },
};

describe("staleAnalyses (prompt-version upgrade detection)", () => {
  it("mirrors the processors' own version numbers", () => {
    expect(CURRENT_ANALYSIS.layers).toBe(layersProcessor.version);
  });

  it("reports nothing stale for a fully up-to-date note", () => {
    expect(staleAnalyses(fresh)).toEqual([]);
  });

  it("reports a missing analysis even when its version stamp claims current", () => {
    expect(staleAnalyses({ ...fresh, summary: undefined })).toEqual(["summary"]);
  });

  it("treats an unstamped note (pre-versioning) as entirely stale", () => {
    expect(staleAnalyses({ ...fresh, artifactVersions: undefined })).toEqual([
      "layers",
      "keymoments",
      "summary",
      "directives",
    ]);
  });

  it("flags exactly the analyses whose stamped version lags the processor", () => {
    const stamped = {
      ...fresh,
      artifactVersions: { ...CURRENT_ANALYSIS, layers: CURRENT_ANALYSIS.layers - 1 },
    };
    expect(staleAnalyses(stamped)).toEqual(["layers"]);
  });
});
