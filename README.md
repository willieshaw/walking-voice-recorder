# Thoughts

Thoughts turns voice recordings into a local, searchable library of structured notes.
Drop in an audio file and it produces a timestamped transcript, a lightly cleaned reading,
a short digest, key moments, and extracted to-dos. Playback stays synchronized with the
text so you can jump to any paragraph or moment in the recording.

The app is browser-first and bring-your-own-key. Notes and audio are stored on the device;
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

- Your OpenAI API key is saved in browser `localStorage`.
- Audio, transcripts, analyses, labels, and other note data are stored in IndexedDB.
- The browser sends transcription and structuring requests to `/api/transcribe` and
  `/api/structure`. A small stateless Cloudflare Worker forwards those requests to OpenAI
  because the OpenAI endpoints cannot be called directly from the browser.
- Each request carries your API key. The application Worker does not persist request bodies
  or keys, and there is no application database on the server.
- The default models are `whisper-1` for transcription and `gpt-4o-mini` for structured
  analyses.

Because the library is local to one browser profile, use the backup feature in Settings if
the notes matter. Sign-in and cloud sync are not implemented.

## Get an OpenAI key

1. Create a key at <https://platform.openai.com/api-keys>.
2. Add billing and set a small monthly usage limit.
3. Open Thoughts, go to Settings, and paste the key.

## Local development

Requirements: a current Node.js installation and npm.

```bash
npm install
npm run dev
```

The selected single-LED hardware prototype is available at
`http://localhost:5173/hardware-lab.html`. The preserved four-configuration portfolio study
is available separately at `http://localhost:5173/hardware-study.html`. Neither page is
linked from or dependent on the Thoughts application, API keys, IndexedDB library, or
processing endpoints.

[`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) is the canonical specification for the recorder hardware,
interface, audio pipeline, transfers, security, and acceptance criteria.

The Vite development server opens the app and provides local versions of both `/api/*`
routes. You can optionally put this in a repo-root `.env` file:

```dotenv
OPENAI_API_KEY=your-key
```

In development, the proxy uses that value when the browser does not send a key. Production
always requires the per-user key sent by the browser.

Other commands:

```bash
npm run build      # production app -> dist/
npm run preview    # preview the production build
npm run typecheck  # TypeScript check without emitting files
npm test           # Vitest engine and browser-logic tests
npm run process -- <audio-file>   # optional Node CLI pipeline
```

The CLI path writes its note and JSON artifacts to `app/public/notes/`. It uses the same
core types, processors, prompts, and assembly functions as the browser where practical,
but it is separate from the IndexedDB library used by the main app.

## Deployment

Production uses Cloudflare Workers with Static Assets, configured by `wrangler.jsonc` and
`worker/index.ts`.

```bash
npm run build
npx wrangler deploy
```

The build produces `dist/`. Cloudflare serves that directory through the `ASSETS` binding,
uses an SPA fallback for client navigation, and sends the two `/api/*` routes through the
Worker. No hosted OpenAI environment variable is required because each user supplies a key.

For continuous deployment, connect the repository to Cloudflare and configure:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

## Architecture

- `app/App.tsx` — application shell and top-level library, memo, settings, organization,
  upgrade, combine, and undo/redo workflows.
- `app/shell/` — the visible library and memo surfaces: feed, reading pane, player, digest,
  search, projects, folders, menus, and settings.
- `app/components/` — smaller reusable UI pieces such as the drop zone, title editor, and
  audio players.
- `app/lib/notesDb.ts` — local IndexedDB storage and note mutations.
- `app/lib/processInBrowser.ts` — browser orchestration from audio file to complete note;
  independent analyses run in parallel after transcription.
- `app/lib/providers/` — browser adapters for the two Worker API routes.
- `src/core/` — isomorphic note types plus timeline, annotation, and combined-note logic.
  It also contains the pure standalone-recorder and transfer state machine used by the lab.
- `src/processors/` — reusable transcript and analysis processors, prompts, schemas,
  versioning, and artifact assembly.
- `src/server/` — isomorphic OpenAI forwarding functions shared by development and
  production.
- `src/cli/` and `src/core/store.ts` — the optional filesystem-based Node pipeline.
- `worker/index.ts` — Cloudflare Worker entry point for static assets and the OpenAI
  pass-through routes.
- `test/` — unit and pipeline tests for shared processing and browser-side utilities.

The shared timeline is the main integration contract: transcript chunks, key moments, and
to-dos carry timestamps, while `src/core/focus.ts` synchronizes playback and reading UI.
Processor versions are recorded on notes so prompt changes can make older analyses eligible
for an in-place upgrade.

The Recorder lab is a functional browser prototype of the product contract. It does not
claim to emulate microphone acoustics, encrypted flash, radio throughput, firmware timing,
IP54 sealing, or drop performance; those requirements need dedicated hardware prototypes.
