# Web Transition Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one last web release that asks the browser for durable storage and nags every user to download their notes as a backup zip before the web app is retired in favor of the Mac app.

**Architecture:** Stored notes gain an `updatedAt` stamp so the app can tell whether anything changed since the last export. A pure function turns (notes, last export time) into one of three banner states. A banner component above the library feed runs the existing zip export and records the export time. Startup calls `navigator.storage.persist()`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (Node environment; `fake-indexeddb` added for the store test). Spec: `docs/superpowers/specs/2026-09-26-desktop-migration-design.md` §1.

**Branching:** This repo integrates on `dev` (3 commits ahead of `main`, including the spec). Branch off `dev`, open the PR against `dev`.

---

## File map

| File | Responsibility |
|---|---|
| `app/lib/notesDb.ts` (modify) | Add `updatedAt` to `StoredNote` and `NoteSummary`; stamp it on every write. |
| `app/lib/exportReminder.ts` (create) | Pure banner-state logic + the `wvr.lastExportAt` localStorage accessors. |
| `app/lib/exportLibrary.ts` (create) | Build the zip, trigger the browser download, stamp `lastExportAt`. Shared by the banner and Settings. |
| `app/lib/links.ts` (create) | `MAC_APP_URL` constant. |
| `app/shell/ExportBanner.tsx` + `export-banner.css` (create) | The three-state banner. |
| `app/shell/LibraryFeed.tsx` (modify) | Accept an optional `banner` node rendered above the heading. |
| `app/shell/SettingsPage.tsx` (modify) | Use `exportLibrary()` instead of its own download code. |
| `app/App.tsx` (modify) | Render the banner in the library view. |
| `app/main.tsx` (modify) | Call `navigator.storage.persist()`. |
| `test/notes-db.test.ts` (create) | `updatedAt` behavior against fake IndexedDB. |
| `test/export-reminder.test.ts` (create) | Banner state logic. |

---

### Task 1: Branch and test dependency

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Branch off dev**

```bash
git checkout dev && git pull --ff-only && git checkout -b web-transition-release
```

- [ ] **Step 2: Install fake-indexeddb (dev only)**

```bash
npm install --save-dev fake-indexeddb
```

Expected: `package.json` `devDependencies` gains `"fake-indexeddb": "^6.x"`.

- [ ] **Step 3: Confirm the existing suite still runs**

Run: `npm test`
Expected: all existing test files pass (10 files). Note the count for the PR body.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Test deps: add fake-indexeddb for note-store tests

The note store has never had a unit test because it needs IndexedDB, which the
Node test environment lacks. fake-indexeddb provides a spec-faithful in-memory
implementation so the upcoming updatedAt change can be pinned by a test.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `updatedAt` on stored notes

**Files:**
- Modify: `app/lib/notesDb.ts` (interfaces at lines 5–30, `saveNote` ~line 58, `listNotes` ~line 77, `mutateNote` ~line 139, `importNotes` ~line 274)
- Test: `test/notes-db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/notes-db.test.ts
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dumpNotes, listNotes, renameNote, saveNote, importNotes } from "../app/lib/notesDb.js";
import type { Note } from "../src/core/types.js";

function wipeDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("wvr");
    req.onsuccess = () => resolve();
    req.onblocked = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

const note = (id: string): Note => ({ id, title: id, audioUrl: "", durationSec: 3 });
const audio = () => new Blob(["riff"], { type: "audio/wav" });

describe("notesDb updatedAt (export-staleness stamp)", () => {
  beforeEach(async () => {
    await wipeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("saveNote stamps updatedAt equal to createdAt", async () => {
    await saveNote(note("a"), audio());
    const [stored] = await dumpNotes();
    expect(stored.updatedAt).toBe(stored.createdAt);
    expect(stored.updatedAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
  });

  it("a mutation bumps updatedAt to now", async () => {
    await saveNote(note("a"), audio());
    vi.setSystemTime(new Date("2026-09-26T11:00:00Z"));
    await renameNote("a", "renamed");
    const [stored] = await dumpNotes();
    expect(stored.updatedAt).toBe(Date.parse("2026-09-26T11:00:00Z"));
    expect(stored.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
  });

  it("listNotes exposes updatedAt, falling back to createdAt for legacy records", async () => {
    // A record imported from an archive written before updatedAt existed has no stamp.
    await importNotes([
      {
        id: "legacy",
        title: "legacy",
        durationSec: 1,
        createdAt: 1000,
        data: { id: "legacy", title: "legacy", durationSec: 1 },
        audio: audio(),
      },
    ]);
    const [summary] = await listNotes();
    expect(summary.updatedAt).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/notes-db.test.ts`
Expected: TypeScript/runtime failures — `updatedAt` does not exist on `StoredNote` / `NoteSummary` (`expect(undefined).toBe(…)`).

- [ ] **Step 3: Add the field and stamp it**

In `app/lib/notesDb.ts`:

```ts
export interface NoteSummary {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  /** Last write to this note (any field). Legacy records report createdAt. */
  updatedAt: number;
  // …existing fields unchanged…
}

export interface StoredNote {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  /** Stamped on every write. Optional because archives from before this field lack it. */
  updatedAt?: number;
  data: Omit<Note, "audioUrl">;
  audio: Blob;
}
```

`saveNote`:

```ts
  const now = Date.now();
  const stored: StoredNote = {
    id: note.id,
    title: note.title,
    durationSec: note.durationSec,
    createdAt: now,
    updatedAt: now,
    data,
    audio,
  };
```

`listNotes` — add to the mapped object:

```ts
      updatedAt: updatedAt ?? createdAt,
```

and destructure `updatedAt` alongside `createdAt` in the `.map(({ id, title, durationSec, createdAt, updatedAt, data }) => …)`.

`mutateNote` — stamp after the caller's mutation, before `put`:

```ts
          mutate(stored);
          stored.updatedAt = Date.now();
          const put = store.put(stored);
```

`importNotes` is unchanged: imported records keep whatever stamp the archive carried (restore is byte-faithful).

- [ ] **Step 4: Run the test and the whole suite**

Run: `npx vitest run test/notes-db.test.ts` → 3 passed.
Run: `npm test` → all files pass.
Run: `npm run typecheck` → no errors. (Any other code constructing a `NoteSummary` literal must now supply `updatedAt`; grep `NoteSummary` in `app/` and add `updatedAt: createdAt` where a literal is built — `SearchModal.tsx` and `CombineModal.tsx` only consume summaries, so this is expected to be a no-op.)

- [ ] **Step 5: Commit**

```bash
git add app/lib/notesDb.ts test/notes-db.test.ts
git commit -m "Notes: stamp updatedAt on every write

The export reminder needs to know whether any note changed after the last backup.
createdAt can't answer that (edits, tags, and re-analyses don't touch it), so every
write path now records updatedAt; legacy records fall back to createdAt on read.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Banner state logic

**Files:**
- Create: `app/lib/exportReminder.ts`
- Test: `test/export-reminder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/export-reminder.test.ts
import { describe, expect, it } from "vitest";
import { reminderState } from "../app/lib/exportReminder.js";

const n = (updatedAt: number) => ({ updatedAt });

describe("reminderState (export banner)", () => {
  it("is 'never' when there has been no export, regardless of notes", () => {
    expect(reminderState([n(5)], null)).toEqual({ kind: "never" });
    expect(reminderState([], null)).toEqual({ kind: "never" });
  });

  it("is 'stale' with a count when notes changed after the export", () => {
    expect(reminderState([n(50), n(150), n(200)], 100)).toEqual({
      kind: "stale",
      lastExportAt: 100,
      changed: 2,
    });
  });

  it("is 'current' when nothing changed since the export", () => {
    expect(reminderState([n(50), n(100)], 100)).toEqual({ kind: "current", lastExportAt: 100 });
  });

  it("is 'current' for an empty library that has been exported", () => {
    expect(reminderState([], 100)).toEqual({ kind: "current", lastExportAt: 100 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/export-reminder.test.ts`
Expected: FAIL — cannot resolve `../app/lib/exportReminder.js`.

- [ ] **Step 3: Implement**

```ts
// app/lib/exportReminder.ts
// Export reminder for the web→Mac transition: has the user downloaded a backup, and has
// anything changed since? Pure state function + the localStorage stamp it reads.

export type ReminderState =
  | { kind: "never" }
  | { kind: "stale"; lastExportAt: number; changed: number }
  | { kind: "current"; lastExportAt: number };

/** `notes` is every note on the device, trash included — a backup contains them all. */
export function reminderState(
  notes: readonly { updatedAt: number }[],
  lastExportAt: number | null,
): ReminderState {
  if (lastExportAt === null) return { kind: "never" };
  const changed = notes.filter((n) => n.updatedAt > lastExportAt).length;
  return changed ? { kind: "stale", lastExportAt, changed } : { kind: "current", lastExportAt };
}

const KEY = "wvr.lastExportAt";

export function getLastExportAt(): number | null {
  const raw = localStorage.getItem(KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setLastExportAt(at: number): void {
  localStorage.setItem(KEY, String(at));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/export-reminder.test.ts` → 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/exportReminder.ts test/export-reminder.test.ts
git commit -m "Export reminder: pure banner-state logic

Turns (all notes, last export time) into never / stale(n changed) / current so the
banner is a dumb view over a tested function.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Shared export action and the Mac app link

**Files:**
- Create: `app/lib/exportLibrary.ts`, `app/lib/links.ts`
- Modify: `app/shell/SettingsPage.tsx:61-77` (`downloadBackup`)

No unit test: this is a thin browser-side action (anchor click) over the already-tested `buildBackup`.

- [ ] **Step 1: Create the link constant**

```ts
// app/lib/links.ts
/** Where "Get the Mac app" points. Repo releases until a real download page exists. */
export const MAC_APP_URL = "https://github.com/willieshaw/walking-voice-recorder/releases";
```

(Confirm the remote's actual owner/repo with `git remote -v` and adjust the URL to match.)

- [ ] **Step 2: Create the shared export action**

```ts
// app/lib/exportLibrary.ts
// One action behind every "download your notes" button: build the archive, hand it to the
// browser as a download, and stamp the export time the reminder banner reads.
import { buildBackup } from "./backup";
import { setLastExportAt } from "./exportReminder";

export async function exportLibrary(): Promise<{ count: number; filename: string }> {
  const { blob, count, filename } = await buildBackup();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  setLastExportAt(Date.now());
  return { count, filename };
}
```

- [ ] **Step 3: Use it in Settings**

In `app/shell/SettingsPage.tsx` keep the existing `import { buildBackup, restoreBackup } from "../lib/backup";` (the dev-seed button still uses `buildBackup`; it is removed in the desktop plan) and add:

```ts
import { exportLibrary } from "../lib/exportLibrary";
```

Then replace the body of `downloadBackup`:

```ts
  async function downloadBackup() {
    setBusy("export");
    setBackupStatus(null);
    try {
      const { count, filename } = await exportLibrary();
      setBackupStatus(`Saved ${count} note${count === 1 ? "" : "s"} to ${filename}.`);
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/exportLibrary.ts app/lib/links.ts app/shell/SettingsPage.tsx
git commit -m "Export: one shared download action that stamps lastExportAt

Settings' Download button and the upcoming reminder banner must agree on what
'exported' means, so both go through exportLibrary(), which records the time.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The banner

**Files:**
- Create: `app/shell/ExportBanner.tsx`, `app/shell/export-banner.css`
- Modify: `app/shell/LibraryFeed.tsx:39-55`, `app/App.tsx:1278-1283`

- [ ] **Step 1: Banner component**

```tsx
// app/shell/ExportBanner.tsx
// The web→Mac transition banner above the library. Three states from reminderState():
// never exported (loud), stale (dated, with a change count), current (one quiet line).
import { useState } from "react";
import { exportLibrary } from "../lib/exportLibrary";
import { getLastExportAt, reminderState } from "../lib/exportReminder";
import { MAC_APP_URL } from "../lib/links";
import type { NoteSummary } from "../lib/notesDb";
import "./export-banner.css";

function fmt(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ExportBanner({ notes }: { notes: NoteSummary[] }) {
  // Re-read the stamp after each export; notes come from the parent and re-render on change.
  const [lastExportAt, setLast] = useState<number | null>(getLastExportAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = reminderState(notes, lastExportAt);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await exportLibrary();
      setLast(getLastExportAt());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "current") {
    return (
      <div className="export-banner export-banner-quiet">
        <span>Backed up on {fmt(state.lastExportAt)}.</span>
        <a href={MAC_APP_URL} target="_blank" rel="noreferrer">
          Get the Mac app →
        </a>
      </div>
    );
  }

  const copy =
    state.kind === "never"
      ? "Thoughts is moving to a Mac app. Download your notes so nothing is lost."
      : `Backed up on ${fmt(state.lastExportAt)}. ${state.changed} note${
          state.changed === 1 ? "" : "s"
        } changed since.`;

  return (
    <div className="export-banner">
      <span>{copy}</span>
      <button className="ghost-btn" onClick={() => void download()} disabled={busy || notes.length === 0}>
        {busy ? "Preparing…" : state.kind === "never" ? "Download your notes" : "Download again"}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Banner styles** (mirrors `.upgrade-banner` in `app/app.css:637`)

```css
/* app/shell/export-banner.css */
.export-banner {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-bottom: 22px;
  padding: 10px 14px;
  background: rgba(37, 99, 235, 0.06);
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 10px;
  font-size: 12.5px;
  color: var(--text-2);
}
.export-banner > span:first-child {
  flex: 1;
  min-width: 200px;
}
.export-banner .ghost-btn {
  background: var(--surface);
}
.export-banner-quiet {
  background: none;
  border-color: var(--border);
  padding: 6px 14px;
  font-size: 12px;
}
.export-banner-quiet a {
  color: var(--accent);
  text-decoration: none;
}
.export-banner-quiet a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: Let LibraryFeed host a banner**

In `app/shell/LibraryFeed.tsx`, add `type ReactNode` to the React import (add `import type { ReactNode } from "react";` at the top), extend the props and render it above the heading:

```tsx
export function LibraryFeed({
  summaries,
  title = "All notes",
  banner,
  onOpen,
}: {
  summaries: NoteSummary[];
  title?: string;
  /** Optional strip rendered above the heading, inside the reading column. */
  banner?: ReactNode;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="lf-page">
      {banner}
      <div className="lf-head">
```

- [ ] **Step 4: Wire it in App**

In `app/App.tsx` add the import next to the other shell imports:

```ts
import { ExportBanner } from "./shell/ExportBanner";
```

and at the library render site (~line 1279) pass every note including trash:

```tsx
          <LibraryFeed
            summaries={filterFolder ? live.filter((s) => s.folder === filterFolder) : live}
            title={filterFolder ?? "All notes"}
            banner={notesLoaded ? <ExportBanner notes={summaries} /> : null}
            onOpen={openMemo}
          />
```

`summaries` is the full list (all projects, trash included) — the same value Settings uses for `noteCount`. Gating on `notesLoaded` avoids flashing "never exported" against an empty list during boot.

- [ ] **Step 5: Typecheck and look at it**

Run: `npm run typecheck` → no errors.
Run the dev server and check, in the browser:
  1. Fresh profile → loud banner with "Download your notes".
  2. Click it → zip downloads, banner collapses to "Backed up on Sep 26. Get the Mac app →".
  3. Rename a note → banner returns as "Backed up on Sep 26. 1 note changed since." with "Download again".
  4. Click again → quiet line.
  5. Settings → Download → back to library → quiet line (Settings stamps too).

- [ ] **Step 6: Commit**

```bash
git add app/shell/ExportBanner.tsx app/shell/export-banner.css app/shell/LibraryFeed.tsx app/App.tsx
git commit -m "Library: export reminder banner for the move to the Mac app

Notes only exist in this browser, and the web app is being retired. The banner
keeps a dated 'backed up' line in front of the user and turns loud whenever a note
changes after the last download.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Ask for durable storage

**Files:** Modify `app/main.tsx`

- [ ] **Step 1: Add the call before render**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Ask the browser to treat this origin's storage as durable (no automatic eviction under
// disk pressure). Best-effort: a deliberate "clear site data" still wipes it.
if (navigator.storage?.persist) {
  void navigator.storage.persist().then((granted) => {
    if (!granted) console.info("Durable storage not granted; notes remain evictable.");
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Verify in the browser**

DevTools console: `await navigator.storage.persisted()` → `true` in Chrome after the page loads (Chrome grants it silently for an origin with engagement; Safari always returns `false`, which is fine).

- [ ] **Step 3: Commit**

```bash
git add app/main.tsx
git commit -m "Startup: request durable storage

Browsers may evict IndexedDB for a low-engagement origin under disk pressure. Asking
for persistence removes that failure mode during the transition window.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Verify, push, PR

- [ ] **Step 1: Full verification**

```bash
npm run typecheck && npm test && npm run build
```

Expected: typecheck clean; all test files pass (12 files: the 10 existing plus `notes-db` and `export-reminder`); `dist/` builds.

- [ ] **Step 2: Push and open the PR against dev**

```bash
git push -u origin web-transition-release
gh pr create --base dev --title "Web transition release: export reminder + durable storage" --body "$(cat <<'BODY'
## Context
Notes live only in the browser's IndexedDB. Before the web app is retired for the Mac app (spec: docs/superpowers/specs/2026-09-26-desktop-migration-design.md §1), every user needs a loud, dated prompt to download their library.

## Change
- `updatedAt` stamped on every note write; legacy records read as `createdAt`.
- Pure `reminderState()` → never / stale (n changed) / current.
- `ExportBanner` above the library feed, sharing `exportLibrary()` with Settings so both stamp the export time.
- `navigator.storage.persist()` at startup.
- Backup archive format is unchanged (version 1) and is the migration contract for the desktop app.

## Tests
- `test/notes-db.test.ts` (3, new, against fake-indexeddb) — failed first on the missing field.
- `test/export-reminder.test.ts` (4, new) — failed first on the missing module.
- Full suite: <N> files pass. `npm run typecheck` and `npm run build` clean.

## How to verify
1. `npm run dev`, fresh browser profile with a couple of notes → loud banner.
2. Download → banner collapses to "Backed up on <date>".
3. Rename a note → "1 note changed since" with Download again.
4. Console: `await navigator.storage.persisted()` → true (Chrome).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Fill `<N>` from the Step 1 output. Then bind the PR to the app's PR bar (ccd_pr `get_status` / `bind_pr`).

- [ ] **Step 3: After merge (when Willie says)**

```bash
gh pr merge --squash --delete-branch && git checkout dev && git pull --ff-only
npm run build && npx wrangler deploy
```

The deploy is the actual "transition release". It stays up until Willie takes it down by hand.
