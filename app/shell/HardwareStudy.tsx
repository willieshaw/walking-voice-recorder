import { RecorderLab, recorderConfigurations } from "./RecorderLab";
import "./hardware-study.css";

const trials = [
  {
    number: "01",
    name: "OLED + button",
    question: "Would exact elapsed time increase confidence without turning the recorder into a tiny computer?",
    learned: "High information density, but the screen and separate recording light added visual and power complexity.",
  },
  {
    number: "02",
    name: "OLED + switch",
    question: "Would a physical position make recording state unmistakable and resist accidental stops?",
    learned: "The switch made state tangible, but complicated pairing and made pause behavior less natural.",
  },
  {
    number: "03",
    name: "Five LEDs + button",
    question: "Could spatial light patterns replace text while preserving rich status feedback?",
    learned: "The array communicated more states, but encouraged level-meter behavior and increased the visual footprint.",
  },
  {
    number: "04",
    name: "Single RGB LED + button",
    question: "What is the minimum interface that still makes capture, pause, transfer, charging, and failure legible?",
    learned: "One light and one button produced the quietest interface while retaining distinct, learnable states.",
  },
];

export function HardwareStudy() {
  return (
    <main className="hs-page">
      <header className="hs-hero">
        <p className="hs-eyebrow">Hardware interface study · 2026</p>
        <h1>How little interface<br />does a recorder need?</h1>
        <p className="hs-deck">
          Four functional prototypes explored the tradeoff between explicit information and
          instant, eyes-free capture. Each used the same recording and transfer model so the
          physical interface—not the underlying capability—was the variable.
        </p>
        <dl className="hs-facts">
          <div><dt>Constants</dt><dd>80 mm body, two microphones, one capture model</dd></div>
          <div><dt>Variables</dt><dd>Display language and record control</dd></div>
          <div><dt>Decision</dt><dd>Single RGB LED + button</dd></div>
        </dl>
      </header>

      <section className="hs-trials" aria-labelledby="trials-title">
        <div className="hs-section-head">
          <p className="hs-eyebrow">The configurations</p>
          <h2 id="trials-title">One recording system, four interfaces</h2>
        </div>
        <div className="hs-trial-grid">
          {trials.map((trial, index) => (
            <article className={`hs-trial${index === trials.length - 1 ? " is-winner" : ""}`} key={trial.name}>
              <div className="hs-trial-top">
                <span>{trial.number}</span>
                {index === trials.length - 1 && <strong>Selected</strong>}
              </div>
              <h3>{trial.name}</h3>
              <p>{trial.question}</p>
              <small>{trial.learned}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="hs-winner" aria-labelledby="winner-title">
        <p className="hs-eyebrow">Selected direction</p>
        <h2 id="winner-title">Single RGB LED + button</h2>
        <p>
          The chosen concept concentrates the interaction into a centered status light and an
          unlit bottom button on an aluminum cylinder. White means ready, pulsing red means
          recording, pulsing blue means paused, and a deliberate yellow hold stops or powers
          down. It communicates the essential state without a screen or a second control.
        </p>
        <div className="hs-led-language" aria-label="Selected LED language">
          <span className="is-white">Ready</span>
          <span className="is-red">Recording</span>
          <span className="is-blue">Paused</span>
          <span className="is-yellow">Hold</span>
          <span className="is-green">Charging</span>
        </div>
      </section>

      <section className="hs-live" aria-labelledby="live-title">
        <div className="hs-section-head">
          <p className="hs-eyebrow">Saved prototype setup</p>
          <h2 id="live-title">Try each configuration</h2>
          <p>
            Select any of the {recorderConfigurations.length} prototypes, operate its physical
            control, and change companion conditions to exercise capture and transfer states.
          </p>
        </div>
        <RecorderLab mode="comparison" showHeader={false} />
      </section>
    </main>
  );
}
