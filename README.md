# Walking Voice Recorder — Lab

A tool for turning a brainstorming-walk recording into clean, structured notes. Drop an
audio file, get a timestamped transcript and a **Layers** view that dials from raw ramble
to tight outline. It runs **entirely in your browser** using **your own OpenAI key** — no
backend, nothing stored on a server.

## How it works (bring-your-own-key)

- You paste your own **OpenAI** key once; it's saved only in your browser (`localStorage`).
- Audio is transcribed and structured with your key; notes are saved locally in your
  browser (**IndexedDB**). Nothing is uploaded to a server we run.
- OpenAI doesn't allow calling its API directly from a browser, so both steps pass through
  tiny **stateless pass-throughs** (`/api/transcribe`, `/api/structure` — Cloudflare Pages
  Functions) that forward each request to OpenAI with your key and store/log nothing.

## Get your key

1. **OpenAI** — https://platform.openai.com/api-keys (add a few dollars of billing).
2. Set a small monthly spend limit on the account so there are no surprises.

## Use it

Open the app, click the ⚙ (or the keys panel), paste your key, then drag a recording onto
the drop zone. After a minute or two you'll see the note. Read it in **Read Along**, copy it
from **Transcript**, or scrub structure in **Layers**. **Export** downloads a note's JSON.

## Local development

```bash
npm install
npm run dev        # opens the app; the dev server also provides /api/transcribe and
                    # /api/structure locally
```

For local dev you can drop `OPENAI_API_KEY` into a `.env` file and the dev proxies will use
it if the browser didn't send one — handy for testing without pasting a key. (In production
the Pages Functions always use the key sent by the browser.)

```bash
npm run build      # static build → dist/  (+ functions/ deploys as Pages Functions)
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
npm test           # engine tests (no API calls)
npm run process -- <audio-file>   # optional Node CLI path (writes to app/public/notes)
```

## Ship it (free) + version control

Deploys to **Cloudflare Workers** (static assets + a tiny Worker for the two `/api/*`
routes), configured by `wrangler.jsonc` + `worker/index.ts`.

1. **Version control:** push to a **private GitHub repo** (`git init`, commit, push).
2. **Host on Cloudflare** (free): Workers & Pages → connect the GitHub repo. Cloudflare
   detects Vite and reads `wrangler.jsonc`:
   - Build command: `npm run build` (outputs `dist/`).
   - Deploy: `npx wrangler deploy` (serves `dist/` via the `ASSETS` binding and routes
     `/api/transcribe` + `/api/structure` through `worker/index.ts`).
   - No environment variables needed on the host — the key is per-user, entered in the app.
3. **Every `git push` auto-deploys** the same URL. Testers just refresh to get updates.
4. **Feedback:** link a free form (Tally/Google Form) and use the in-app **Export** button
   to collect a tester's transcript + layers.

Local deploy (optional): `npx wrangler deploy` after `npm run build` (needs `wrangler login`).

## Architecture

- `src/core/` — isomorphic types + the shared timeline/focus store.
- `src/processors/` — the pipeline as pure/reusable logic: `transcribe` (transcript
  assembly) and `layers` (prompt/schema + `assembleLayers`). Shared by the Node CLI and the
  browser.
- `worker/index.ts` — the Cloudflare Worker: serves the static SPA and routes the two
  stateless OpenAI pass-throughs, sharing `src/server/openai{Transcribe,Structure}.ts` with
  the Vite dev middleware (so dev and prod behave identically).
- `app/lib/providers/` — browser providers: `openaiStt` and `openaiLlm`, both calling the
  proxies above (OpenAI doesn't allow direct browser calls to either endpoint).
  `app/lib/processInBrowser.ts` orchestrates; `app/lib/notesDb.ts` stores notes in
  IndexedDB.
- `app/experiences/` — swappable views (Read Along, Transcript, Layers), toggled in
  `app/config/flags.ts`.

Adding a new **view** = a folder in `app/experiences/` + a registry line. The Node CLI
(`npm run process`) still works against the filesystem for your own use.
