/** Pure state machine shared by the interactive hardware prototype and its tests. */

export type RecorderDisplay = "oled" | "led-array" | "single-led";
export type RecorderControl = "button" | "switch";
export type TransferState = "none" | "queued" | "active" | "complete";

export interface CapturedRecording {
  id: string;
  startedAt: string;
  durationSec: number;
  proxy: TransferState;
  master: TransferState;
  masterBytes: number;
  verified: boolean;
}

export interface RecorderState {
  display: RecorderDisplay;
  control: RecorderControl;
  paired: boolean;
  recording: boolean;
  paused: boolean;
  sleeping: boolean;
  elapsedSec: number;
  startedAt?: string;
  batteryPct: number;
  charging: boolean;
  bleAvailable: boolean;
  wifiAvailable: boolean;
  macAvailable: boolean;
  storageFreeHours: number;
  recordings: CapturedRecording[];
  notice?: string;
  error?: string;
}

export type RecorderAction =
  | { type: "configure"; display?: RecorderDisplay; control?: RecorderControl }
  | { type: "pair" }
  | { type: "forget" }
  | { type: "sleep" }
  | { type: "idle-timeout" }
  | { type: "press-record"; now?: string; id?: string }
  | { type: "hold-button"; heldMs: number; id?: string }
  | { type: "set-switch"; recording: boolean; now?: string; id?: string }
  | { type: "tick"; seconds?: number }
  | { type: "set-power"; batteryPct?: number; charging?: boolean }
  | { type: "set-connectivity"; bleAvailable?: boolean; wifiAvailable?: boolean; macAvailable?: boolean }
  | { type: "usb-import"; id: string }
  | { type: "factory-reset" }
  | { type: "advance-transfers" };

export const MASTER_BYTES_PER_SECOND = 288_000; // stereo, 24-bit, 48 kHz PCM
export const STOP_HOLD_MS = 1_000;
export const SINGLE_LED_IDLE_SLEEP_MS = 60_000;
export const LOW_BATTERY_PCT = 20;
export const CRITICAL_BATTERY_PCT = 5;

export function isLedDisplay(display: RecorderDisplay): boolean {
  return display === "led-array" || display === "single-led";
}

export function initialRecorderState(): RecorderState {
  return {
    // The single-LED/button concept is the selected production configuration.
    // Legacy display/control values remain available to the portfolio study.
    display: "single-led",
    control: "button",
    paired: true,
    recording: false,
    paused: false,
    sleeping: false,
    elapsedSec: 0,
    batteryPct: 76,
    charging: false,
    bleAvailable: true,
    wifiAvailable: true,
    macAvailable: true,
    storageFreeHours: 49.8,
    recordings: [],
  };
}

export function canSyncMaster(state: RecorderState): boolean {
  return (
    !state.recording &&
    state.paired &&
    state.wifiAvailable &&
    state.macAvailable &&
    (state.charging || state.batteryPct > 30)
  );
}

function start(state: RecorderState, now?: string): RecorderState {
  if (!state.charging && state.batteryPct <= CRITICAL_BATTERY_PCT) {
    return { ...state, error: "Battery critically low — connect power to record." };
  }
  let recordings = state.recordings;
  let storageFreeHours = state.storageFreeHours;
  if (storageFreeHours <= 0.01) {
    // Newest-first list: reclaim the oldest item that is fully acknowledged. Unconfirmed
    // audio is never selected, even if that means capture must be blocked.
    let reclaimAt = -1;
    for (let index = recordings.length - 1; index >= 0; index--) {
      const r = recordings[index];
      if (r.proxy === "complete" && r.master === "complete" && r.verified) {
        reclaimAt = index;
        break;
      }
    }
    if (reclaimAt < 0)
      return { ...state, error: "Storage full — no confirmed recording can be removed." };
    const reclaimed = recordings[reclaimAt];
    recordings = recordings.filter((_, index) => index !== reclaimAt);
    storageFreeHours += reclaimed.durationSec / 3600;
  }
  return {
    ...state,
    recording: true,
    paused: false,
    sleeping: false,
    elapsedSec: 0,
    startedAt: now ?? new Date().toISOString(),
    notice: undefined,
    error: undefined,
    storageFreeHours,
    // Recording always preempts either transport.
    recordings: recordings.map((r) => ({
      ...r,
      proxy: r.proxy === "active" ? "queued" : r.proxy,
      master: r.master === "active" ? "queued" : r.master,
    })),
  };
}

function stop(state: RecorderState, id?: string): RecorderState {
  if (!state.recording) return state;

  const durationSec = Math.max(1, state.elapsedSec);
  const recording: CapturedRecording = {
    id: id ?? `rec-${Date.now().toString(36)}`,
    startedAt: state.startedAt ?? new Date().toISOString(),
    durationSec,
    proxy: "queued",
    master: "queued",
    masterBytes: durationSec * MASTER_BYTES_PER_SECOND,
    verified: false,
  };
  return {
    ...state,
    recording: false,
    paused: false,
    elapsedSec: 0,
    startedAt: undefined,
    storageFreeHours: Math.max(0, state.storageFreeHours - durationSec / 3600),
    recordings: [recording, ...state.recordings],
    notice: "Recording safely finalized. Transfers queued.",
    error: undefined,
  };
}

/** One deterministic transfer step, used by both the UI timer and unit tests. */
function advanceTransfers(state: RecorderState): RecorderState {
  // Display-dark sleep does not disable transfer radios. Capture still preempts transfers.
  if (state.recording || !state.paired) return state;
  const recordings = state.recordings.map((r) => ({ ...r }));

  if (state.bleAvailable) {
    const activeProxy = recordings.find((r) => r.proxy === "active");
    if (activeProxy) activeProxy.proxy = "complete";
    else {
      const queuedProxy = recordings.slice().reverse().find((r) => r.proxy === "queued");
      if (queuedProxy) queuedProxy.proxy = "active";
    }
  } else {
    for (const r of recordings) if (r.proxy === "active") r.proxy = "queued";
  }

  if (canSyncMaster(state)) {
    const activeMaster = recordings.find((r) => r.master === "active");
    if (activeMaster) {
      activeMaster.master = "complete";
      activeMaster.verified = true;
    } else {
      const queuedMaster = recordings.slice().reverse().find((r) => r.master === "queued");
      if (queuedMaster) queuedMaster.master = "active";
    }
  } else {
    for (const r of recordings) if (r.master === "active") r.master = "queued";
  }

  return { ...state, recordings };
}

export function recorderReducer(state: RecorderState, action: RecorderAction): RecorderState {
  switch (action.type) {
    case "configure": {
      return {
        ...state,
        display: action.display ?? state.display,
        control: action.control ?? state.control,
        error: undefined,
      };
    }
    case "pair":
      return { ...state, paired: true, notice: "Paired securely. Wi-Fi credentials provisioned over BLE." };
    case "forget":
      return { ...state, paired: false, notice: "Companion forgotten. Recordings remain encrypted." };
    case "sleep":
      return state.recording
        ? state
        : {
            ...state,
            sleeping: true,
            notice: undefined,
            error: undefined,
          };
    case "idle-timeout":
      if (state.display !== "single-led" || state.recording || state.sleeping) return state;
      return recorderReducer(state, { type: "sleep" });
    case "press-record":
      if (state.control !== "button") return state;
      if (state.sleeping)
        return { ...state, sleeping: false, notice: "Awake. Press Record again to capture." };
      if (state.recording && isLedDisplay(state.display)) {
        return {
          ...state,
          paused: !state.paused,
          notice: state.paused ? "Recording resumed." : "Recording paused.",
        };
      }
      return state.recording ? stop(state, action.id) : start(state, action.now);
    case "hold-button":
      if (
        state.control !== "button" ||
        !isLedDisplay(state.display) ||
        action.heldMs < STOP_HOLD_MS
      ) return state;
      if (state.recording) return stop(state, action.id);
      if (state.sleeping) return state;
      return recorderReducer(state, { type: "sleep" });
    case "set-switch":
      if (state.control !== "switch" || action.recording === state.recording) return state;
      return action.recording ? start(state, action.now) : stop(state, action.id);
    case "tick": {
      if (!state.recording || state.paused) return state;
      const seconds = action.seconds ?? 1;
      return {
        ...state,
        elapsedSec: state.elapsedSec + seconds,
        batteryPct: Math.max(0, state.batteryPct - seconds / 648), // ~18 h from 100%
      };
    }
    case "set-power":
      return {
        ...state,
        batteryPct: action.batteryPct ?? state.batteryPct,
        charging: action.charging ?? state.charging,
        sleeping: action.charging ? false : state.sleeping,
      };
    case "set-connectivity":
      return {
        ...state,
        bleAvailable: action.bleAvailable ?? state.bleAvailable,
        wifiAvailable: action.wifiAvailable ?? state.wifiAvailable,
        macAvailable: action.macAvailable ?? state.macAvailable,
      };
    case "usb-import":
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.id ? { ...r, master: "complete", verified: true } : r,
        ),
        notice: "Master imported and verified over authenticated USB-C.",
      };
    case "factory-reset":
      return { ...initialRecorderState(), paired: false, notice: "Factory reset complete. Local recordings erased." };
    case "advance-transfers":
      return advanceTransfers(state);
  }
}
