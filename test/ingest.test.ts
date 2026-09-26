import { describe, expect, it } from "vitest";
import type { DeviceRecordingMetadata } from "../src/core/types.js";
import { planIngest, type IngestNoteState } from "../src/core/ingest.js";

/** A recorder manifest with known per-stream hashes. */
function meta(overrides: Partial<DeviceRecordingMetadata> = {}): DeviceRecordingMetadata {
  return {
    recordingId: "rec-abc",
    deviceId: "dev-1",
    startedAtUtc: "2026-09-26T14:00:00.000Z",
    endedAtUtc: "2026-09-26T14:02:28.000Z",
    timezone: "America/New_York",
    segments: [{ id: "s0", order: 0, durationSec: 148, sha256: "seg0" }],
    master: { format: "wav", sampleRateHz: 48_000, bitDepth: 24, channels: 2, sha256: "MASTER_HASH" },
    proxy: { format: "aac-lc", sampleRateHz: 24_000, bitrateKbps: 32, channels: 1, sha256: "PROXY_HASH" },
    audioProcessingVersion: 1,
    firmwareVersion: "1.0.0",
    ...overrides,
  };
}

const withMaster: IngestNoteState = { recordingId: "rec-abc", hasMaster: true };
const proxyOnly: IngestNoteState = { recordingId: "rec-abc", hasMaster: false };

describe("planIngest — recorder → Thoughts convergence", () => {
  it("a proxy for a new recording creates the note (drives transcription)", () => {
    expect(planIngest(null, { stream: "proxy", meta: meta(), sha256: "PROXY_HASH" })).toEqual({
      action: "create",
      stream: "proxy",
      recordingId: "rec-abc",
    });
  });

  it("a master-first USB import also creates the note", () => {
    expect(planIngest(null, { stream: "master", meta: meta(), sha256: "MASTER_HASH" })).toEqual({
      action: "create",
      stream: "master",
      recordingId: "rec-abc",
    });
  });

  it("a master attaches to a proxy-only note (upgrade audio, keep transcript)", () => {
    expect(planIngest(proxyOnly, { stream: "master", meta: meta(), sha256: "MASTER_HASH" })).toEqual({
      action: "attach-master",
      recordingId: "rec-abc",
    });
  });

  it("a master that's already imported is a no-op (resumed/duplicate transfer)", () => {
    expect(planIngest(withMaster, { stream: "master", meta: meta(), sha256: "MASTER_HASH" })).toEqual({
      action: "already-present",
      stream: "master",
      recordingId: "rec-abc",
    });
  });

  it("a proxy for an existing note is a no-op", () => {
    expect(planIngest(proxyOnly, { stream: "proxy", meta: meta(), sha256: "PROXY_HASH" })).toEqual({
      action: "already-present",
      stream: "proxy",
      recordingId: "rec-abc",
    });
  });

  it("rejects bytes whose hash doesn't match the manifest — before any write", () => {
    const plan = planIngest(null, { stream: "master", meta: meta(), sha256: "TAMPERED" });
    expect(plan.action).toBe("reject");
    if (plan.action === "reject") expect(plan.reason).toMatch(/master SHA-256/);
  });

  it("verifies each stream against its own manifest hash", () => {
    // Proxy bytes that happen to equal the master hash must still be rejected.
    expect(planIngest(null, { stream: "proxy", meta: meta(), sha256: "MASTER_HASH" }).action).toBe(
      "reject",
    );
  });
});
