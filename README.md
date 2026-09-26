# Thoughts

Thoughts turns voice recordings into a local, searchable library of structured notes.
Drop in an audio file and it produces a timestamped transcript, a lightly cleaned reading,
a short digest, key moments, and extracted to-dos. Playback stays synchronized with the
text so you can jump to any paragraph or moment in the recording.

Thoughts is a Mac app and bring-your-own-key. Notes and audio are stored on your Mac;
there is no account or hosted note database.

## What you can do

- Record elsewhere and import an audio file through the drop zone.
- Switch between the raw transcript and a lightly cleaned reading.
- Play a recording while following the active paragraph, or seek from timestamps and key
  moments.
- Edit transcript and cleaned paragraphs in place, with undo/redo and per-paragraph revert.
- Review the generated digest and mark extracted to-dos complete.
- Search full transcripts and organize notes with projects, folders, tags, and pins.
- Combine several notes into one continuous reading and playback timeline without changing
  the source notes.
- Re-run analyses when processor prompts are updated, without transcribing the audio again.
- Soft-delete notes to a 30-day trash and back up or restore the complete local library as
  a ZIP archive.
- Maintain a personal dictionary that biases future transcriptions toward names and terms
  you use often.

## How processing and storage work

- Each note is a folder under
  `~/Library/Application Support/com.willieshaw.thoughts/notes/`, holding `note.json`
  (transcript, analyses, labels, and other note data) and the audio file.
- Your OpenAI API key is stored in the macOS Keychain.
- The app calls OpenAI directly through Tauri's HTTP plugin. Requests go from your Mac to
  OpenAI with your key; there is no intermediate server.
- The default models are `whisper-1` for transcription and `gpt-4o-mini` for structured
  analyses.

Use Settings to back up the whole library as a ZIP archive (a save dialog) or restore one
(an open dialog). Sign-in and cloud sync are not implemented.

## Get an OpenAI key

1. Create a key at <https://platform.openai.com/api-keys>.
2. Add billing and set a small monthly usage limit.
3. Open Thoughts, go to Settings, and paste the key.

## Local development

Requirements: a current Node.js installation, npm, and a Rust toolchain (for Tauri).

```bash
npm install
npm run dev
```

With `npm run dev:web` running, the selected single-LED hardware prototype is available at
`http://localhost:5173/hardware-lab.html`. The preserved four-configuration portfolio study
is available separately at `http://localhost:5173/hardware-study.html`. Neither page is
linked from or dependent on the Thoughts application, API keys, note library, or OpenAI
calls.

[`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) is the canonical specification for the recorder hardware,
interface, audio pipeline, transfers, security, and acceptance criteria.

Other commands:

```bash
npm run dev:web    # Vite dev server only, in a browser (no Tauri APIs)
npm run build:web  # frontend only -> dist/
npm run typecheck  # TypeScript check without emitting files
npm test           # Vitest engine and app-logic tests
npm run process -- <audio-file>   # optional Node CLI pipeline
```

The CLI path writes its note and JSON artifacts to `app/public/notes/`. It uses the same
core types, processors, prompts, and assembly functions as the app where practical, but it
is separate from the note library used by the Mac app. The CLI reads `OPENAI_API_KEY` from
the environment or a repo-root `.env` file.

## Building the Mac app

```bash
npm run dev      # Tauri window + Vite dev server
npm run build    # unsigned Thoughts.app in src-tauri/target/release/bundle/macos/
```

The build is unsigned: right-click → Open the first time on a new machine. Signing and
notarization are tracked separately.

## Architecture

- `app/App.tsx` — application shell and top-level library, memo, settings, organization,
  upgrade, combine, and undo/redo workflows.
- `app/shell/` — the visible library and memo surfaces: feed, reading pane, player, digest,
  search, projects, folders, menus, and settings.
- `app/components/` — smaller reusable UI pieces such as the drop zone, title editor, and
  audio players.
- `app/lib/notesDb.ts` — on-disk note storage and note mutations.
- `app/lib/processInBrowser.ts` — in-app orchestration from audio file to complete note;
  independent analyses run in parallel after transcription.
- `app/lib/providers/` — app adapters that call OpenAI through Tauri's fetch.
- `src/core/` — isomorphic note types plus timeline, annotation, and combined-note logic.
  It also contains the pure standalone-recorder and transfer state machine used by the lab.
- `src/processors/` — reusable transcript and analysis processors, prompts, schemas,
  versioning, and artifact assembly.
- `src/server/` — isomorphic OpenAI request functions shared by the app and the Node CLI.
- `src/cli/` and `src/core/store.ts` — the optional filesystem-based Node pipeline.
- `src-tauri/` — the Tauri shell: window, Keychain commands, and plugin permissions.
- `test/` — unit and pipeline tests for shared processing and app-side utilities.

The shared timeline is the main integration contract: transcript chunks, key moments, and
to-dos carry timestamps, while `src/core/focus.ts` synchronizes playback and reading UI.
Processor versions are recorded on notes so prompt changes can make older analyses eligible
for an in-place upgrade.

The Recorder lab is a functional browser prototype of the product contract. It does not
claim to emulate microphone acoustics, encrypted flash, radio throughput, firmware timing,
IP54 sealing, or drop performance; those requirements need dedicated hardware prototypes.
