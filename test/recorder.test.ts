import { describe, expect, it } from "vitest";
import {
  MASTER_BYTES_PER_SECOND,
  SINGLE_LED_IDLE_SLEEP_MS,
  STOP_HOLD_MS,
  canSyncMaster,
  initialRecorderState,
  recorderReducer,
} from "../src/core/recorder";

describe("recorder state machine", () => {
  it("defaults to the selected single-LED button and finalizes with a hold", () => {
    let state = initialRecorderState();
    expect(state).toMatchObject({ display: "single-led", control: "button" });
    state = recorderReducer(state, { type: "press-record", now: "2026-09-06T12:00:00Z" });
    state = recorderReducer(state, { type: "tick", seconds: 90 });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "recording-1" });
    expect(state.recording).toBe(false);
    expect(state.recordings[0]).toMatchObject({
      id: "recording-1",
      durationSec: 90,
      proxy: "queued",
      master: "queued",
      masterBytes: 90 * MASTER_BYTES_PER_SECOND,
    });
  });

  it("requires a one-second hold to stop the LED-array prototype", () => {
    let state = recorderReducer(initialRecorderState(), {
      type: "configure",
      display: "led-array",
      control: "button",
    });
    state = recorderReducer(state, { type: "press-record", now: "2026-09-06T12:00:00Z" });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS - 1 });
    expect(state.recording).toBe(true);
    expect(state.recordings).toHaveLength(0);

    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "held-stop" });
    expect(state.recording).toBe(false);
    expect(state.recordings[0].id).toBe("held-stop");

    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "duplicate" });
    expect(state.recordings).toHaveLength(1);
  });

  it("pauses and resumes the LED-array prototype with short presses", () => {
    let state = recorderReducer(initialRecorderState(), {
      type: "configure",
      display: "led-array",
      control: "button",
    });
    state = recorderReducer(state, { type: "press-record" });
    state = recorderReducer(state, { type: "tick", seconds: 12 });
    state = recorderReducer(state, { type: "press-record" });
    expect(state).toMatchObject({ recording: true, paused: true, elapsedSec: 12 });
    state = recorderReducer(state, { type: "tick", seconds: 10 });
    expect(state.elapsedSec).toBe(12);
    state = recorderReducer(state, { type: "press-record" });
    expect(state).toMatchObject({ recording: true, paused: false });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "marked" });
    expect(state.recordings[0].durationSec).toBe(12);
  });

  it("uses the shared pause and hold controls for the single-LED prototype", () => {
    let state = recorderReducer(initialRecorderState(), {
      type: "configure",
      display: "single-led",
      control: "button",
    });
    state = recorderReducer(state, { type: "press-record" });
    state = recorderReducer(state, { type: "tick", seconds: 8 });
    state = recorderReducer(state, { type: "press-record" });
    expect(state).toMatchObject({ recording: true, paused: true, elapsedSec: 8 });

    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS - 1 });
    expect(state.recording).toBe(true);
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "single-led" });
    expect(state.recording).toBe(false);
    expect(state.recordings[0]).toMatchObject({ id: "single-led", durationSec: 8 });
  });

  it("powers off and wakes the single-LED prototype without starting a recording", () => {
    let state = recorderReducer(initialRecorderState(), {
      type: "configure",
      display: "single-led",
      control: "button",
    });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS });
    expect(state.sleeping).toBe(true);
    state = recorderReducer(state, { type: "press-record" });
    expect(state).toMatchObject({ sleeping: false, recording: false });
  });

  it("returns only the idle single-LED prototype to sleep after one minute", () => {
    expect(SINGLE_LED_IDLE_SLEEP_MS).toBe(60_000);
    let state = recorderReducer(initialRecorderState(), {
      type: "configure",
      display: "single-led",
      control: "button",
    });
    state = recorderReducer(state, { type: "idle-timeout" });
    expect(state.sleeping).toBe(true);

    let recording = recorderReducer(initialRecorderState(), {
      type: "configure",
      display: "single-led",
      control: "button",
    });
    recording = recorderReducer(recording, { type: "press-record" });
    recording = recorderReducer(recording, { type: "idle-timeout" });
    expect(recording).toMatchObject({ recording: true, sleeping: false });

    const fiveLed = recorderReducer(
      recorderReducer(initialRecorderState(), {
        type: "configure",
        display: "led-array",
        control: "button",
      }),
      { type: "idle-timeout" },
    );
    expect(fiveLed.sleeping).toBe(false);
  });

  it("powers the LED-array prototype off with an idle long hold", () => {
    let state = recorderReducer(initialRecorderState(), {
      type: "configure",
      display: "led-array",
      control: "button",
    });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS });
    expect(state.sleeping).toBe(true);
  });

  it("uses the first button press to wake and a second press to record", () => {
    let state = recorderReducer(initialRecorderState(), { type: "sleep" });
    expect(state.sleeping).toBe(true);
    state = recorderReducer(state, { type: "press-record" });
    expect(state).toMatchObject({ sleeping: false, recording: false });
    state = recorderReducer(state, { type: "press-record" });
    expect(state.recording).toBe(true);
  });

  it("wakes the switch version directly into recording", () => {
    let state = recorderReducer(initialRecorderState(), { type: "configure", control: "switch" });
    state = recorderReducer(state, { type: "sleep" });
    state = recorderReducer(state, { type: "set-switch", recording: true });
    expect(state).toMatchObject({ sleeping: false, recording: true });
  });

  it("wakes from sleep when USB power is connected", () => {
    let state = recorderReducer(initialRecorderState(), { type: "sleep" });
    state = recorderReducer(state, { type: "set-power", charging: true });
    expect(state).toMatchObject({ sleeping: false, charging: true });
  });

  it("continues transfers while the visible interface is asleep", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "press-record" });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "background" });
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("active");
    state = recorderReducer(state, { type: "sleep" });
    expect(state.sleeping).toBe(true);
    expect(state.recordings[0].proxy).toBe("active");
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("complete");
    expect(state.recordings[0].master).toBe("complete");
  });

  it("blocks recording at critical battery unless connected to power", () => {
    let state = { ...initialRecorderState(), batteryPct: 5 };
    state = recorderReducer(state, { type: "press-record" });
    expect(state.recording).toBe(false);
    expect(state.error).toMatch(/Battery critically low/);
    state = recorderReducer(state, { type: "set-power", charging: true });
    state = recorderReducer(state, { type: "press-record" });
    expect(state.recording).toBe(true);
  });

  it("gates Wi-Fi masters on power and connectivity while BLE proxy continues", () => {
    let state = { ...initialRecorderState(), batteryPct: 20, charging: false };
    state = recorderReducer(state, { type: "press-record" });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "low-power" });
    expect(canSyncMaster(state)).toBe(false);
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("active");
    expect(state.recordings[0].master).toBe("queued");

    state = recorderReducer(state, { type: "set-power", charging: true });
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("complete");
    expect(state.recordings[0].master).toBe("active");
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0]).toMatchObject({ master: "complete", verified: true });
  });

  it("queues interrupted BLE proxy transfer and retries when BLE returns", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "press-record" });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "ble-retry" });
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("active");
    state = recorderReducer(state, { type: "set-connectivity", bleAvailable: false });
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("queued");
    state = recorderReducer(state, { type: "set-connectivity", bleAvailable: true });
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("active");
  });

  it("recording preempts active transfers", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "press-record" });
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "queued" });
    state = recorderReducer(state, { type: "advance-transfers" });
    expect(state.recordings[0].proxy).toBe("active");
    expect(state.recordings[0].master).toBe("active");
    state = recorderReducer(state, { type: "press-record" });
    expect(state.recording).toBe(true);
    expect(state.recordings[0].proxy).toBe("queued");
    expect(state.recordings[0].master).toBe("queued");
  });

  it("starts and stops with the physical switch", () => {
    let state = recorderReducer(initialRecorderState(), { type: "configure", control: "switch" });
    state = recorderReducer(state, { type: "set-switch", recording: true });
    expect(state.recording).toBe(true);
    state = recorderReducer(state, { type: "set-switch", recording: false, id: "switch" });
    expect(state.recordings[0].id).toBe("switch");
  });

  it("records while unpaired and only reclaims a fully confirmed oldest item", () => {
    let state = recorderReducer(initialRecorderState(), { type: "forget" });
    state = recorderReducer(state, { type: "press-record" });
    expect(state.recording).toBe(true);
    state = recorderReducer(state, { type: "hold-button", heldMs: STOP_HOLD_MS, id: "unpaired" });

    state = {
      ...state,
      storageFreeHours: 0,
      recordings: [
        state.recordings[0],
        {
          id: "confirmed-oldest",
          startedAt: "2026-09-01T00:00:00Z",
          durationSec: 3600,
          proxy: "complete",
          master: "complete",
          masterBytes: 3600 * MASTER_BYTES_PER_SECOND,
          verified: true,
        },
      ],
    };
    state = recorderReducer(state, { type: "press-record" });
    expect(state.recording).toBe(true);
    expect(state.recordings.map((r) => r.id)).toEqual(["unpaired"]);
    expect(state.storageFreeHours).toBe(1);
  });
});
