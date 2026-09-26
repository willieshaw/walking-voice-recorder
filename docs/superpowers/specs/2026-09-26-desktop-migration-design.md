# Thoughts desktop migration — design

**Date:** 2026-09-26
**Status:** Approved design, awaiting implementation plan

## Problem

Thoughts is a local-first web app. Every note — audio blob, transcript, summaries, annotations —
lives in the browser's IndexedDB (`app/lib/notesDb.ts`); folders, projects, the dictionary and
the OpenAI key live in localStorage. Nothing is stored server-side. A user who clears site data,
or whose browser evicts storage under disk pressure, loses everything. The only safety net is the
manual zip backup in Settings, and the dev-only seed auto-restore does not run in production.

The product spec already names the Mac (and iPhone) as launch platforms, with masters kept
locally on the Mac. A native desktop app that stores notes as ordinary files is the right
long-term home, and it removes browser-storage fragility entirely.

## Decisions taken

| Question | Decision |
|---|---|
| Direction | Wrap the existing React app in a Tauri 2 macOS shell; move note storage to files on disk. |
| Web build | Retired after a transition window. Desktop is the only product target. |
| OpenAI access | Direct from the app via Tauri's HTTP plugin. Every user brings their own key. The Cloudflare worker is retired. |
| On-disk format | One folder per note holding `note.json` plus the audio file. No database. |
| Existing web users | A final web release makes "download everything" prominent before the web deploy goes away; the desktop app imports that archive on first run. |

## Scope

Two deliverables, in this order:

1. **Web transition release** — one last deploy of the web app that protects existing notes and
   pushes users to export them.
2. **Desktop app** — the Tauri shell, file storage, direct OpenAI calls, Keychain key storage,
   and first-run import.

The transition release ships and stays deployed while the desktop app is built. The web deploy
is taken down by hand when you decide; no code enforces a date.

## 1. Web transition release

Changes to the current web app, and nothing else:

### 1.1 Durable storage request
On startup, call `navigator.storage.persist()` once (fire-and-forget, result ignored beyond
logging). This asks the browser to mark the origin's storage as non-evictable. It does not stop
a deliberate "clear site data" but it removes the automatic-eviction risk during the window.

### 1.2 Export banner
A persistent banner at the top of the library view. Three states, driven by two localStorage
values: `wvr.lastExportAt` (ms timestamp, set when an export completes) and the newest
`updatedAt` across all notes.

| State | Condition | Copy | Action |
|---|---|---|---|
| Never exported | `lastExportAt` absent | "Thoughts is moving to a Mac app. Download your notes so nothing is lost." | **Download your notes** |
| Stale | some note changed after `lastExportAt` | "Backed up on {date}. {n} note{s} changed since." | **Download again** |
| Current | no changes since `lastExportAt` | "Backed up on {date}." + link "Get the Mac app" | link only; banner collapses to a single quiet line |

"Download" runs the existing `buildBackup()` from `app/lib/backup.ts`, triggers the file save,
then writes `wvr.lastExportAt = Date.now()`. Recording and editing stay fully functional; the web
app is never made read-only.

To know whether a note changed after the export, `StoredNote` gains an `updatedAt: number`
field, set by `saveNote` and every mutating function in `notesDb.ts`. Notes stored before this
field existed are treated as `updatedAt = createdAt`. The banner's "changed since" count is
`notes.filter(n => (n.updatedAt ?? n.createdAt) > lastExportAt).length`.

The "Get the Mac app" link target is a constant in one place, initially pointing at the repo's
releases page; it is updated when a download URL exists.

### 1.3 Frozen migration contract
The backup archive is the migration path. Its format is frozen as **version 1**:

```
manifest.json      { format: "thoughts-backup", version: 1, exportedAt, notes: ManifestNote[] }
audio/<noteId>     the recording, byte-for-byte
```

`ManifestNote` is `StoredNote` minus `audio`, plus `audioType` (MIME). The desktop app must import
a version-1 archive unchanged, and its own export keeps producing version 1. Adding optional
fields to a manifest note (such as `updatedAt` from §1.2) stays within version 1: readers
ignore unknown fields and treat missing optional fields as absent. Any incompatible change
bumps the version and keeps a version-1 reader.

## 2. Desktop app

### 2.1 Shell
- Tauri 2, one window, app name **Thoughts**. Bundle identifier chosen at scaffold time
  (`com.willieshaw.thoughts` unless told otherwise).
- The frontend is the existing Vite build of `app/` — `index.html` plus the two hardware lab
  pages — served from the bundle. `src/core` and `src/processors` move over untouched.
- Rust side: the Tauri scaffold plus **two commands** (`keychain_get`, `keychain_set`) wrapping
  the `keyring` crate. No other Rust.
- Plugins: `@tauri-apps/plugin-fs` (scoped to `$APPDATA/**`), `@tauri-apps/plugin-http`
  (scoped to `https://api.openai.com/*`), `@tauri-apps/plugin-dialog` (file open/save).
- Dev loop: `npm run dev` becomes `tauri dev`, which runs Vite and opens the app window.
  Browser-only dev is not supported after this change.

### 2.2 File storage
Root: Tauri's app data directory, which on macOS resolves to
`~/Library/Application Support/<bundle id>/`. Layout:

```
notes/
  <noteId>/
    note.json        StoredNote minus the blob, plus audioType (same shape as ManifestNote)
    audio.<ext>      the recording; ext derived from audioType (m4a, wav, webm, mp3, else bin)
```

Rules:
- **Atomic writes.** `note.json` is written to `note.json.tmp` then renamed over the target.
  Audio is written once on `saveNote` / `attachMaster` the same way. A crash never leaves a
  half-written note; a folder with no `note.json` is ignored on listing and cleaned on next
  purge.
- **Same module, same API.** `app/lib/notesDb.ts` keeps every exported function and type
  (`saveNote`, `listNotes`, `searchNotes`, `getNote`, `ingestState`, `attachMaster`,
  `renameNote`, `updateNote`, `addSummaryVariant`, `updateChunkText`, `dumpNotes`,
  `importNotes`, `purgeNote`, `purgeExpired`, `updateAnnotation`, `TRASH_RETENTION_DAYS`,
  `NoteSummary`, `StoredNote`, `SearchHit`). The IndexedDB code inside is replaced. Its eight
  consumers (`App.tsx`, `ingest.ts`, `backup.ts`, and five shell components) do not change.
- **Concurrency.** The IndexedDB read-modify-write transaction becomes a per-note in-process
  mutex: `mutateNote(id, fn)` chains onto a `Map<id, Promise>` so overlapping patches to one
  note serialize. Different notes proceed in parallel.
- **Listing cache.** `allByRecency()` reads every `note.json` on first call and holds the
  parsed records in memory. Every write function updates the cache entry in place, so
  `listNotes` and `searchNotes` never re-read the disk after startup. `getNote` reads the audio
  file on demand and returns a blob object URL exactly as today.
- **Trash.** Unchanged: `deletedAt` in the JSON, 30-day purge on launch. `purgeNote` removes
  the folder.
- **Blob to bytes.** `plugin-fs` writes `Uint8Array`; audio blobs are converted with
  `arrayBuffer()` at the boundary. Reads reconstruct `new Blob([bytes], { type: audioType })`.

localStorage stays where it is for folders, projects, and the dictionary. Inside Tauri's
WKWebView this store is private to the app and is not reachable from any browser. Moving those
to disk is not in scope.

### 2.3 Network
- `app/lib/providers/openaiStt.ts` and `openaiLlm.ts` stop posting to `/api/...` and call the
  isomorphic `openaiTranscribe` / `openaiStructure` in `src/server/` directly. Those two
  functions take a `fetch` parameter (defaulting to global `fetch`) so the app passes Tauri's
  `fetch` from `@tauri-apps/plugin-http`, which runs the request from Rust and is not subject
  to CORS. The Node CLI keeps using them with the default.
- Error surfacing is unchanged: non-OK responses throw with OpenAI's message.
- Deleted: `worker/`, `wrangler.jsonc`, the `openaiApiPlugin` middleware and the dev-seed
  route in `vite.config.ts`, the `VITE_DEV_HAS_KEY` define, `hasDevServerKey()` in `keys.ts`,
  and the "Save as dev seed" button in Settings. `wrangler` leaves `devDependencies`.

### 2.4 Key storage
- `app/lib/keys.ts` keeps `getKeys` / `setKeys` / `hasKeys` but they become async and call
  `invoke("keychain_get")` / `invoke("keychain_set")`. The Keychain item is service `Thoughts`,
  account `openai`.
- `SettingsKeys.tsx` is updated for the async API; its UI is unchanged.
- Callers that read the key synchronously today await it: `openaiStt.ts` and `openaiLlm.ts`
  read it per request (not cached in JS). `App.tsx` uses `hasKeys()` for the initial view
  (library vs settings) and the `keysReady` state; that becomes a startup effect that resolves
  the initial view once the Keychain read returns, with a blank frame (not the settings page)
  shown until then.
- First launch with no key: the existing "Add your OpenAI key in Settings" path.

### 2.5 First run and import
- When `listNotes()` returns zero notes (trash included), the library renders an onboarding
  panel instead of the empty feed:
  - Heading: "Bring your notes from the web version"
  - Body: one sentence pointing at the web app's Download button.
  - Primary: **Import backup…** → `plugin-dialog` open, filtered to `.zip` → `restoreBackup`
    → toast "Imported {added} notes" (and "{skipped} already here" when non-zero) → feed
    refreshes.
  - Secondary: **Start fresh** — dismisses the panel for this launch; it returns on the next
    launch until at least one note exists.
- Settings keeps both **Download backup** (existing `buildBackup`, saved through
  `plugin-dialog` save) and **Restore from backup** (same import as above), so desktop users
  keep a manual off-machine backup path.

### 2.6 Build and distribution
- `tauri build` produces an unsigned `Thoughts.app` in `src-tauri/target/release/bundle/`.
  Opening it requires the usual right-click → Open once on a machine without a signing setup.
- Signing, notarization, DMG packaging, and auto-update are out of scope (see §4).
- Rust toolchain is not installed on the development machine. The implementation plan's first
  task installs it with `rustup` and verifies `cargo --version`.

## 3. Testing

- **Storage unit tests** (Vitest): `notesDb.ts` is tested against an in-memory fake of the
  `plugin-fs` surface it uses (`readDir`, `readFile`, `writeFile`, `rename`, `remove`,
  `exists`, `mkdir`). Cases: save then list ordering; get reconstructs blob type and duration;
  rename and update patch only their fields; trash then purgeExpired removes only expired;
  importNotes skips existing ids; two overlapping `updateAnnotation` calls on one note both
  land; a folder missing `note.json` is skipped by listing.
- **Backup round trip**: export from the fake store, import into a fresh fake, assert every
  note's JSON equal and audio bytes identical. Also: a version-1 archive produced by the
  current web code (a fixture committed under `test/fixtures/`) imports cleanly.
- **Transition banner**: component test for the three states and the export → state change.
- **Providers**: `openaiTranscribe` / `openaiStructure` called with an injected fake `fetch`,
  asserting the request shape is unchanged from today.
- **Manual acceptance**: in the browser, record two notes, download the backup; in the desktop
  build, import it; confirm both notes play, summaries and annotations render, folders/pins
  are intact after re-creating folders; quit and relaunch, notes persist; delete one, empty
  trash, folder is gone from disk.

## 4. Out of scope (later specs)

Code signing and notarization; auto-update; DMG; iCloud or any sync; iPhone; the recorder
hardware bridge; a persisted search index; moving folders/projects/dictionary out of
localStorage; Windows or Linux builds.

## 5. Open items resolved by default

- Bundle id: `com.willieshaw.thoughts`.
- Audio extension map: `audio/mp4`→`m4a`, `audio/x-m4a`→`m4a`, `audio/wav`→`wav`,
  `audio/wave`→`wav`, `audio/webm`→`webm`, `audio/mpeg`→`mp3`, anything else→`bin`.
- "Get the Mac app" link: repo releases page until a real download URL exists.
