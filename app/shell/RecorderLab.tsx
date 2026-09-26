import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  LOW_BATTERY_PCT,
  SINGLE_LED_IDLE_SLEEP_MS,
  STOP_HOLD_MS,
  canSyncMaster,
  initialRecorderState,
  isLedDisplay,
  recorderReducer,
  type RecorderControl,
  type RecorderDisplay,
  type TransferState,
} from "@core/recorder";
import "./recorder-lab.css";

export const recorderConfigurations: { display: RecorderDisplay; control: RecorderControl; label: string }[] = [
  { display: "oled", control: "button", label: "OLED + button" },
  { display: "oled", control: "switch", label: "OLED + switch" },
  { display: "led-array", control: "button", label: "5-dot LED array + button" },
  { display: "single-led", control: "button", label: "Single RGB LED + button" },
];

type LedArrayMode = "off" | "wake" | "ready" | "recording" | "paused" | "holding" | "pairing" | "charging" | "transfer" | "queued" | "complete" | "finalized" | "low" | "error";

const ledArrayLabels: Record<LedArrayMode, string> = {
  off: "Status lights asleep",
  wake: "Recorder turning on",
  ready: "Recorder awake and ready",
  recording: "Recording",
  paused: "Recording paused",
  holding: "Keep holding to complete the action",
  pairing: "Pairing recorder",
  charging: "Charging battery",
  transfer: "Transfer active",
  queued: "Transfer queued",
  complete: "Transfer completed",
  finalized: "Recording safely finalized",
  low: "Battery low",
  error: "Recording blocked",
};

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

function formatOledTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function RollingDigit({ value }: { value: string }) {
  const previous = useRef(value);
  const outgoing = previous.current;
  const changed = outgoing !== value;

  useEffect(() => {
    previous.current = value;
  }, [value]);

  return (
    <span className="rl-digit-window">
      {changed && <span key={`out-${outgoing}-${value}`} className="rl-digit rl-digit-out">{outgoing}</span>}
      <span key={`in-${value}`} className={`rl-digit${changed ? " rl-digit-in" : ""}`}>{value}</span>
    </span>
  );
}

function OledTime({ seconds }: { seconds: number }) {
  const time = formatOledTime(seconds);
  return (
    <span className="rl-oled-time" aria-hidden="true">
      {[...time].map((character, index) =>
        character === ":" ? (
          <span className="rl-time-colon" key={`colon-${index}`}>:</span>
        ) : (
          <RollingDigit value={character} key={`digit-${index}`} />
        ),
      )}
    </span>
  );
}

function bytesLabel(bytes: number): string {
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(2)} GB`
    : `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

function statusLabel(status: TransferState): string {
  return { none: "Not created", queued: "Queued", active: "Transferring", complete: "Complete" }[
    status
  ];
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button className={`rl-toggle${on ? " is-on" : ""}`} aria-pressed={on} onClick={onChange}>
      <span className="rl-toggle-track"><span /></span>
      {label}
    </button>
  );
}

export function RecorderLab({
  onBack,
  mode = "production",
  showHeader = true,
}: {
  onBack?: () => void;
  mode?: "production" | "comparison";
  showHeader?: boolean;
}) {
  const [state, dispatch] = useReducer(recorderReducer, {
    ...initialRecorderState(),
    display: mode === "comparison" ? "oled" : "single-led",
    control: "button",
  });
  const [ledArrayMode, setLedArrayMode] = useState<LedArrayMode>("ready");
  const [holdingButton, setHoldingButton] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasUnseenCompletion, setHasUnseenCompletion] = useState(false);
  const [pairing, setPairing] = useState(false);
  const ledModeTimer = useRef<number>();
  const holdTimer = useRef<number>();
  const pairingTimer = useRef<number>();
  const holdInProgress = useRef(false);
  const suppressButtonClick = useRef(false);
  const holdCompleted = useRef(false);
  const holdWasRecording = useRef(false);
  const audioStep = useRef(0);
  const previousSleeping = useRef(state.sleeping);
  const completedTransfers = useRef(new Set<string>());

  const showLedArrayMode = useCallback((mode: LedArrayMode, durationMs: number) => {
    window.clearTimeout(ledModeTimer.current);
    setLedArrayMode(mode);
    if (durationMs > 0) {
      ledModeTimer.current = window.setTimeout(() => setLedArrayMode("ready"), durationMs);
    }
  }, []);

  const showWakeSequence = useCallback((nextMode: LedArrayMode, durationMs: number) => {
    window.clearTimeout(ledModeTimer.current);
    setLedArrayMode("wake");
    ledModeTimer.current = window.setTimeout(() => {
      setLedArrayMode(nextMode);
      if (durationMs > 0) {
        ledModeTimer.current = window.setTimeout(() => setLedArrayMode("ready"), durationMs);
      }
    }, 620);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(ledModeTimer.current);
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(pairingTimer.current);
  }, []);

  useEffect(() => {
    if (!state.recording || state.paused) return;
    const timer = window.setInterval(() => dispatch({ type: "tick" }), 1_000);
    return () => window.clearInterval(timer);
  }, [state.paused, state.recording]);

  useEffect(() => {
    if (!state.recording || state.paused || state.display !== "led-array") {
      setAudioLevel(0);
      return;
    }
    const levels = [0, 1, 3, 2, 4, 2, 1, 3, 0, 2, 4, 1];
    setAudioLevel(levels[audioStep.current % levels.length]);
    const timer = window.setInterval(() => {
      audioStep.current += 1;
      setAudioLevel(levels[audioStep.current % levels.length]);
    }, 140);
    return () => window.clearInterval(timer);
  }, [state.display, state.paused, state.recording]);

  useEffect(() => {
    const timer = window.setInterval(() => dispatch({ type: "advance-transfers" }), 1_800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state.display !== "single-led" || state.sleeping || state.recording || pairing) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "idle-timeout" }),
      SINGLE_LED_IDLE_SLEEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [pairing, state.display, state.recording, state.sleeping]);

  const hasActiveTransfer = state.recordings.some(
    (r) => r.proxy === "active" || r.master === "active",
  );
  const hasQueuedTransfer = state.recordings.some(
    (r) => r.proxy === "queued" || r.master === "queued",
  );

  useEffect(() => {
    const nextCompleted = new Set<string>();
    let foundNewCompletion = false;
    for (const recording of state.recordings) {
      if (recording.proxy === "complete") nextCompleted.add(`${recording.id}:proxy`);
      if (recording.master === "complete") nextCompleted.add(`${recording.id}:master`);
    }
    for (const key of nextCompleted) {
      if (!completedTransfers.current.has(key)) foundNewCompletion = true;
    }
    completedTransfers.current = nextCompleted;
    if (foundNewCompletion) setHasUnseenCompletion(true);
  }, [state.recordings]);

  useEffect(() => {
    const justWoke = previousSleeping.current && !state.sleeping;
    previousSleeping.current = state.sleeping;
    if (!isLedDisplay(state.display)) return;
    if (state.sleeping) {
      window.clearTimeout(ledModeTimer.current);
      setLedArrayMode("off");
      return;
    }
    if (!justWoke) return;

    if (state.display === "single-led") {
      showWakeSequence("ready", 0);
      return;
    }

    if (state.error) showWakeSequence("error", 2_000);
    else if (hasActiveTransfer) showWakeSequence("transfer", 2_000);
    else if (hasQueuedTransfer) showWakeSequence("queued", 2_000);
    else if (hasUnseenCompletion) {
      showWakeSequence("complete", 1_200);
      setHasUnseenCompletion(false);
    } else if (!state.charging && state.batteryPct <= LOW_BATTERY_PCT) {
      showWakeSequence("low", 1_800);
    } else showWakeSequence("ready", 0);
  }, [hasActiveTransfer, hasQueuedTransfer, hasUnseenCompletion, showWakeSequence, state.batteryPct, state.charging, state.display, state.error, state.sleeping]);

  const visibleLedArrayMode: LedArrayMode = state.sleeping
    ? "off"
    : state.error
      ? "error"
      : holdingButton
        ? "holding"
        : state.recording
          ? state.paused ? "paused" : "recording"
          : ledArrayMode === "wake" || ledArrayMode === "finalized"
            ? ledArrayMode
          : state.charging
            ? "charging"
            : state.display === "single-led" && pairing
              ? "pairing"
              : state.display === "single-led" && hasActiveTransfer
                ? "transfer"
          : ledArrayMode;

  const chargeSolidDots = Math.min(5, Math.floor(state.batteryPct / 20));
  const chargeBlinkDot = state.batteryPct < 100 ? 4 - chargeSolidDots : -1;

  function toggleRecording() {
    if (state.control === "button") dispatch({ type: "press-record" });
    else dispatch({ type: "set-switch", recording: !state.recording });
  }

  function beginButtonHold() {
    if (!isLedDisplay(state.display) || state.sleeping || holdTimer.current) return;
    holdInProgress.current = true;
    holdCompleted.current = false;
    holdWasRecording.current = state.recording;
    setHoldingButton(true);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = undefined;
      holdCompleted.current = true;
      setHoldingButton(false);
      dispatch({ type: "hold-button", heldMs: STOP_HOLD_MS });
      if (holdWasRecording.current) showLedArrayMode("finalized", 1_100);
      else showLedArrayMode("off", 0);
    }, STOP_HOLD_MS);
  }

  function cancelButtonHold(expectClick: boolean) {
    if (!holdInProgress.current) {
      // An off-state tap never begins a hold. Clear any suppression left by a
      // previous long press so this tap can always wake the recorder.
      suppressButtonClick.current = false;
      holdCompleted.current = false;
      return false;
    }
    window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    holdInProgress.current = false;
    setHoldingButton(false);
    const completed = holdCompleted.current;
    holdCompleted.current = false;
    suppressButtonClick.current = expectClick && completed;
    return completed;
  }

  function handleButtonClick() {
    if (suppressButtonClick.current) {
      suppressButtonClick.current = false;
      return;
    }
    toggleRecording();
  }

  function handlePairing() {
    if (state.paired) {
      window.clearTimeout(pairingTimer.current);
      pairingTimer.current = undefined;
      setPairing(false);
      dispatch({ type: "forget" });
      return;
    }
    if (pairing) return;
    if (state.display === "single-led" && state.sleeping) {
      dispatch({ type: "press-record" });
    }
    setPairing(true);
    pairingTimer.current = window.setTimeout(() => {
      pairingTimer.current = undefined;
      dispatch({ type: "pair" });
      setPairing(false);
    }, 1_800);
  }

  return (
    <div className="rl-page">
      {showHeader && <header className="rl-header">
        {onBack && <button className="back-btn" onClick={onBack}>← Library</button>}
        <div className="rl-heading-row">
          <div>
            <p className="rl-kicker">Standalone recorder</p>
            <h1>{mode === "production" ? "Single-LED hardware lab" : "Interactive prototype archive"}</h1>
            <p className="rl-intro">
              {mode === "production"
                ? "Exercise the selected one-button recorder, BLE proxy, and Wi-Fi master behavior."
                : "Compare the four interface directions explored during development."}
            </p>
          </div>
          <div className="rl-spec-chip">
            {mode === "production" ? "80 mm × Ø34 mm · 64 GB · 24/48 WAV" : "4 interface studies · shared recorder model"}
          </div>
        </div>
      </header>}

      {mode === "comparison" && <div className="rl-configs" aria-label="Prototype configurations">
        {recorderConfigurations.map((config, index) => {
          const selected = state.display === config.display && state.control === config.control;
          return (
            <button
              key={config.label}
              className={`rl-config${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => dispatch({ type: "configure", ...config })}
            >
              <span>0{index + 1}</span>
              <strong>{config.label}</strong>
              <small>{config.display === "oled" ? "Status display" : config.display === "led-array" ? "Five individually addressable lights" : "One multicolor status light"}</small>
            </button>
          );
        })}
      </div>}

      <section className="rl-workbench">
        <div className="rl-stage">
          <div className="rl-dim rl-dim-top">34 mm</div>
          <div className="rl-dim rl-dim-side">80 mm</div>
          <div className={`rl-device${state.display === "single-led" ? " is-aluminum-cylinder" : ""}${state.recording && !state.paused ? " is-recording" : ""}${state.sleeping ? " is-sleeping" : ""}`}>
            <div className="rl-mics" aria-label="Two top-facing microphones"><i /><i /></div>

            {state.display === "oled" && state.sleeping ? (
              <div className="rl-oled rl-oled-asleep" role="status" aria-label="Display asleep" />
            ) : state.display === "oled" ? (
              <div className="rl-oled" role="timer" aria-label={formatOledTime(state.elapsedSec)}>
                <OledTime seconds={state.elapsedSec} />
              </div>
            ) : state.display === "led-array" ? (
              <div
                className={`rl-led-array rl-led-array-${visibleLedArrayMode}`}
                role="status"
                aria-live="polite"
                aria-label={visibleLedArrayMode === "charging" ? `Charging battery, ${Math.round(state.batteryPct)} percent` : ledArrayLabels[visibleLedArrayMode]}
              >
                {[0, 1, 2, 3, 4].map((dot) => (
                  <span
                    className={[
                      dot === 4 ? "is-status" : "",
                      state.recording && dot < 4 && dot >= 4 - audioLevel ? "is-level-on" : "",
                      visibleLedArrayMode === "charging" && dot >= 5 - chargeSolidDots ? "is-charge-solid" : "",
                      visibleLedArrayMode === "charging" && dot === chargeBlinkDot ? "is-charge-next" : "",
                    ].filter(Boolean).join(" ") || undefined}
                    key={dot}
                  />
                ))}
              </div>
            ) : (
              <div
                className={`rl-single-led rl-single-led-${visibleLedArrayMode}`}
                role="status"
                aria-live="polite"
                aria-label={visibleLedArrayMode === "charging" ? "Charging battery" : ledArrayLabels[visibleLedArrayMode]}
              ><span /></div>
            )}

            {state.display === "oled" && <span className={`rl-privacy-light${state.recording && !state.paused ? " is-on" : ""}`} title="Always-visible recording indicator" />}

            {state.control === "button" ? (
              <button
                className={`rl-record-button${isLedDisplay(state.display) ? " is-led-interface" : ""}${state.display === "oled" && state.recording ? " is-on" : ""}`}
                onClick={handleButtonClick}
                onPointerDown={(event) => {
                  if (!isLedDisplay(state.display)) return;
                  if (state.sleeping) {
                    suppressButtonClick.current = false;
                    holdCompleted.current = false;
                    holdInProgress.current = false;
                    return;
                  }
                  event.currentTarget.setPointerCapture(event.pointerId);
                  beginButtonHold();
                }}
                onPointerUp={() => cancelButtonHold(true)}
                onPointerCancel={() => cancelButtonHold(false)}
                onKeyDown={(event) => {
                  if (!isLedDisplay(state.display) || state.sleeping || event.repeat || (event.key !== " " && event.key !== "Enter")) return;
                  event.preventDefault();
                  beginButtonHold();
                }}
                onKeyUp={(event) => {
                  if (!isLedDisplay(state.display) || (event.key !== " " && event.key !== "Enter")) return;
                  event.preventDefault();
                  cancelButtonHold(false);
                }}
                aria-label={isLedDisplay(state.display) && state.recording ? state.paused ? "Tap to resume recording; hold to stop" : "Tap to pause recording; hold to stop" : isLedDisplay(state.display) && !state.sleeping ? "Press to record; hold to power off" : state.recording ? "Stop recording" : state.sleeping ? "Wake device" : "Start recording"}
              ><span /></button>
            ) : (
              <button
                className={`rl-record-switch${state.recording ? " is-on" : ""}`}
                onClick={toggleRecording}
                aria-pressed={state.recording}
              >
                <span />
                <small>{state.recording ? "REC" : "STANDBY"}</small>
              </button>
            )}
            {state.control === "switch" && <span className="rl-setup" title="Protected pairing/reset control" />}
            <div className="rl-usb" title="USB-C charging, authenticated import, and firmware" />
          </div>
          <p className={`rl-live-status ${state.error ? "is-error" : ""}`}>
            {state.error ?? state.notice ?? (state.recording ? state.paused ? "Recording paused. Tap to resume or hold to stop." : isLedDisplay(state.display) ? "Recording locally. Tap to pause; hold to stop." : "Recording locally." : state.sleeping ? `Powered off · ${state.control === "button" ? "tap once to wake" : "move switch to Record to wake and capture"}` : isLedDisplay(state.display) ? "Ready · press to record or hold to power off." : "Ready to capture.")}
          </p>
        </div>

        <aside className="rl-controls">
          <div className="rl-panel-head">
            <div><span>Prototype setup</span><strong>Companion conditions</strong></div>
            <span className={`rl-pair-state${state.paired ? " is-on" : ""}`}>{state.paired ? "Paired" : "Unpaired"}</span>
          </div>
          <div className="rl-toggle-list">
            <Toggle on={state.bleAvailable} label="iPhone in BLE range" onChange={() => dispatch({ type: "set-connectivity", bleAvailable: !state.bleAvailable })} />
            <Toggle on={state.wifiAvailable} label="Trusted Wi-Fi" onChange={() => dispatch({ type: "set-connectivity", wifiAvailable: !state.wifiAvailable })} />
            <Toggle on={state.macAvailable} label="Mac companion available" onChange={() => dispatch({ type: "set-connectivity", macAvailable: !state.macAvailable })} />
            <Toggle on={state.charging} label="Connected to power" onChange={() => dispatch({ type: "set-power", charging: !state.charging })} />
          </div>
          <label className="rl-battery">
            <span>Battery <strong>{Math.round(state.batteryPct)}%</strong></span>
            <input type="range" min="5" max="100" value={state.batteryPct} onChange={(e) => dispatch({ type: "set-power", batteryPct: Number(e.target.value) })} />
          </label>
          <div className="rl-rule">
            <span className={canSyncMaster(state) ? "is-ok" : ""} />
            Full masters sync when idle, paired, on trusted Wi-Fi with the Mac available,
            and charging or above 30%.
          </div>
          <div className="rl-pair-actions">
            <button onClick={() => dispatch({ type: "sleep" })} disabled={state.recording}>Power off now</button>
            <button onClick={handlePairing} disabled={pairing}>{pairing ? "Pairing…" : state.paired ? "Forget companion" : "Pair recorder"}</button>
            <button className="is-danger" onClick={() => {
              window.clearTimeout(pairingTimer.current);
              pairingTimer.current = undefined;
              setPairing(false);
              dispatch({ type: "factory-reset" });
            }}>Factory reset</button>
          </div>
        </aside>
      </section>

      <section className="rl-transfers">
        <div className="rl-section-title">
          <div><p className="rl-kicker">Companion activity</p><h2>Capture and transfer queue</h2></div>
          <div className="rl-legend"><span className="ble" /> BLE proxy <span className="wifi" /> Wi-Fi master</div>
        </div>
        {state.recordings.length === 0 ? (
          <div className="rl-empty">Start and stop a recording to exercise the resumable transfer flow.</div>
        ) : (
          <div className="rl-recording-list">
            {state.recordings.map((recording) => (
              <article key={recording.id} className="rl-recording-row">
                <div className="rl-rec-main">
                  <strong>{new Date(recording.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
                  <span>{formatTime(recording.durationSec)} · {bytesLabel(recording.masterBytes)}</span>
                </div>
                <div className={`rl-transport is-${recording.proxy}`}><span className="ble" /><div><small>BLE proxy</small><strong>{statusLabel(recording.proxy)}</strong></div></div>
                <div className={`rl-transport is-${recording.master}`}><span className="wifi" /><div><small>WAV master</small><strong>{statusLabel(recording.master)}{recording.verified ? " · verified" : ""}</strong></div></div>
                {recording.master !== "complete" && <button className="rl-usb-action" onClick={() => dispatch({ type: "usb-import", id: recording.id })}>Import via USB</button>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
