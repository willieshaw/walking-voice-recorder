# Thoughts Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Thoughts as a macOS app (Tauri 2) that stores every note as plain files on disk, calls OpenAI directly with a key kept in the macOS Keychain, and imports the web app's backup archive on first run.

**Architecture:** The existing React app is wrapped unchanged by a Tauri shell. `app/lib/notesDb.ts` keeps its public API but its IndexedDB internals are replaced by per-note folders (`notes/<id>/note.json` + `audio.<ext>`) written through a small filesystem port, which tests replace with an in-memory fake. The two OpenAI provider files call the isomorphic functions in `src/server/` with Tauri's CORS-free `fetch` injected. Two Rust commands wrap the `keyring` crate. The Cloudflare worker, dev proxy, dev seed, and the web transition banner are deleted.

**Tech Stack:** Tauri 2 (`@tauri-apps/cli`, `@tauri-apps/api`, plugins `fs`, `http`, `dialog`), Rust stable via rustup, `keyring` 3 (`apple-native`), React 18, Vite 6, Vitest. Spec: `docs/superpowers/specs/2026-09-26-desktop-migration-design.md` §2–§3.

**Prerequisite:** The web transition release plan (`2026-09-26-web-transition-release.md`) is merged into `dev` and deployed. This plan removes the banner it added, so it must land after it.

**Branching:** Branch `desktop-app` off `dev`; PR against `dev`.

---

## File map

| Path | Responsibility |
|---|---|
| `src-tauri/` (create, scaffolded) | Rust shell: `Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `src/lib.rs` (plugins + 2 keychain commands), `src/main.rs`, `icons/`. |
| `app/lib/fsPort.ts` (create) | `FsPort` interface (paths relative to app data), `setFsPort` for tests, lazy default = Tauri implementation. |
| `app/lib/tauriFs.ts` (create) | `FsPort` over `@tauri-apps/plugin-fs` with `BaseDirectory.AppData`; plus `readAbsolute` / `writeAbsolute` for dialog-picked paths. |
| `test/helpers/memoryFs.ts` (create) | In-memory `FsPort` for tests. |
| `app/lib/notesDb.ts` (rewrite internals) | Same exports; file storage, in-memory record cache, per-note lock. |
| `src/server/openaiTranscribe.ts`, `src/server/openaiStructure.ts` (modify) | Accept an injected `fetch`. |
| `app/lib/providers/openaiStt.ts`, `openaiLlm.ts` (modify) | Call the server functions directly with Tauri fetch and the Keychain key. |
| `app/lib/keys.ts` (rewrite) | Async Keychain-backed `getKeys` / `setKeys` / `hasKeys`. |
| `app/components/SettingsKeys.tsx`, `app/App.tsx` (modify) | Async key readiness; boot gate; onboarding panel. |
| `app/lib/exportLibrary.ts` (rewrite), `app/lib/importArchive.ts` (create) | Save/open dialogs + fs for the backup zip. |
| `app/shell/OnboardingPanel.tsx` + `onboarding-panel.css` (create) | First-run import panel. |
| `app/shell/SettingsPage.tsx` (modify) | Use dialog-based export/import; drop dev seed. |
| Deleted | `worker/`, `wrangler.jsonc`, `app/shell/ExportBanner.tsx` + css, `app/lib/exportReminder.ts`, `app/lib/links.ts`, `test/export-reminder.test.ts`, the Vite API plugin, `VITE_DEV_HAS_KEY`. |
| Tests | `test/memory-fs.test.ts`, `test/notes-db.test.ts` (rewritten), `test/backup-roundtrip.test.ts`, `test/openai-server.test.ts`. |

---

### Task 1: Toolchain, branch, Tauri scaffold

**Files:** `package.json`, `.gitignore`, `vite.config.ts` (server block only), `src-tauri/*` (generated)

- [ ] **Step 1: Branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b desktop-app
```

- [ ] **Step 2: Install Rust (no sudo needed)**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
source "$HOME/.cargo/env"
cargo --version && rustc --version
```

Expected: `cargo 1.8x.x`, `rustc 1.8x.x`. Every later `cargo`/`tauri` command in this plan assumes `source "$HOME/.cargo/env"` has run in that shell.

- [ ] **Step 3: Tauri CLI + JS packages**

```bash
npm install --save-dev @tauri-apps/cli@^2
npm install @tauri-apps/api@^2 @tauri-apps/plugin-fs@^2 @tauri-apps/plugin-http@^2 @tauri-apps/plugin-dialog@^2
```

- [ ] **Step 4: Scaffold `src-tauri`**

```bash
npx tauri init --ci \
  --app-name Thoughts \
  --window-title Thoughts \
  --frontend-dist ../dist \
  --dev-url http://localhost:5173 \
  --before-dev-command "npm run dev:web" \
  --before-build-command "npm run build:web"
```

Expected: `src-tauri/` with `Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `icons/`, `src/main.rs`, `src/lib.rs`.

- [ ] **Step 5: Set identity and window in `src-tauri/tauri.conf.json`**

Edit the generated file so these keys read exactly:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Thoughts",
  "version": "0.1.0",
  "identifier": "com.willieshaw.thoughts",
  "build": {
    "beforeDevCommand": "npm run dev:web",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build:web",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "title": "Thoughts", "width": 1200, "height": 820, "minWidth": 900, "minHeight": 600 }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["app"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

(`tauri build` refuses the generated `com.tauri.dev` identifier; the default icons are fine for now.)

- [ ] **Step 6: npm scripts**

In `package.json` replace the `scripts` block:

```json
  "scripts": {
    "process": "tsx src/cli/process.ts",
    "dev": "tauri dev",
    "dev:web": "vite",
    "build": "tauri build",
    "build:web": "vite build",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
```

- [ ] **Step 7: Vite server settings for Tauri**

In `vite.config.ts` change the `server` block to (leave the rest of the file alone for now — the API plugin is removed in Task 9):

```ts
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      fs: { allow: [".."] },
    },
```

(`open: true` is removed: the Tauri window is the browser now.)

- [ ] **Step 8: gitignore**

Append to `.gitignore`:

```
# Tauri
src-tauri/target/
src-tauri/gen/
```

- [ ] **Step 9: Smoke run**

```bash
npm run dev
```

Expected: first Rust compile takes a few minutes; then a window titled "Thoughts" opens showing the current app (still IndexedDB-backed at this point; transcription will fail — that is expected until Task 6). Quit with ⌘Q.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore vite.config.ts src-tauri
git commit -m "Desktop: Tauri 2 shell around the existing web app

Scaffolds src-tauri with the Thoughts identity and window, points it at the Vite
dev server / dist build, and makes npm run dev open the app window instead of a
browser. Storage and networking are unchanged in this commit.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Rust plugins, Keychain commands, capabilities

**Files:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

- [ ] **Step 1: Dependencies**

In `src-tauri/Cargo.toml` `[dependencies]` add (keep the generated `tauri`, `serde`, `serde_json` lines):

```toml
tauri-plugin-fs = "2"
tauri-plugin-http = "2"
tauri-plugin-dialog = "2"
keyring = { version = "3", features = ["apple-native"] }
```

- [ ] **Step 2: `src-tauri/src/lib.rs`**

Replace the file with:

```rust
// The Rust side of Thoughts is deliberately tiny: the three official plugins the
// frontend uses (fs, http, dialog) and two commands that keep the OpenAI key in the
// macOS Keychain instead of web storage.

const KEYCHAIN_SERVICE: &str = "Thoughts";

/// Read a secret. `Ok(None)` when no item exists yet.
#[tauri::command]
fn keychain_get(account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Write a secret; an empty value deletes the item.
#[tauri::command]
fn keychain_set(account: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
    if value.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![keychain_get, keychain_set])
        .run(tauri::generate_context!())
        .expect("error while running Thoughts");
}
```

Leave the generated `src/main.rs` (it calls `thoughts_lib::run()` or similar — keep whatever name `tauri init` produced).

- [ ] **Step 3: Capabilities — `src-tauri/capabilities/default.json`**

Replace with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Thoughts main window: app-data files, the backup zip the user picks, OpenAI.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    {
      "identifier": "http:default",
      "allow": [{ "url": "https://api.openai.com/*" }]
    },
    "fs:default",
    "fs:allow-read-dir",
    "fs:allow-read-file",
    "fs:allow-read-text-file",
    "fs:allow-write-file",
    "fs:allow-write-text-file",
    "fs:allow-mkdir",
    "fs:allow-rename",
    "fs:allow-remove",
    "fs:allow-exists",
    {
      "identifier": "fs:scope",
      "allow": [
        { "path": "$APPDATA" },
        { "path": "$APPDATA/**" },
        { "path": "$HOME/**" }
      ]
    }
  ]
}
```

`$HOME/**` is what lets the app read a backup zip the user picks anywhere and write one where they choose. Everything else lives under `$APPDATA`.

- [ ] **Step 4: Compile**

```bash
cd src-tauri && cargo check && cd ..
```

Expected: `Finished` with no errors (warnings about unused code are fine).

- [ ] **Step 5: Manual check of the commands**

Verify from inside the app only (the app created the Keychain item, so it can read it back
without a prompt; do NOT use the `security` CLI, which triggers a login-keychain password
prompt). Temporarily add to the top of `app/main.tsx`:

```ts
// TEMP keychain smoke — remove before commit
void (async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  const fs = await import("@tauri-apps/plugin-fs");
  const lines: string[] = [];
  const note = (m: string) => lines.push(m);
  note(`set -> ${JSON.stringify(await invoke("keychain_set", { account: "openai", value: "test-123" }))}`);
  note(`get -> ${JSON.stringify(await invoke("keychain_get", { account: "openai" }))}`);
  note(`delete -> ${JSON.stringify(await invoke("keychain_set", { account: "openai", value: "" }))}`);
  note(`get after delete -> ${JSON.stringify(await invoke("keychain_get", { account: "openai" }))}`);
  await fs.writeTextFile("keychain-smoke.txt", lines.join("\n"), { baseDir: fs.BaseDirectory.AppData });
})();
```

Run `npm run dev`, wait for the window, then read
`~/Library/Application Support/com.willieshaw.thoughts/keychain-smoke.txt`. Expected lines:
`set -> null`, `get -> "test-123"`, `delete -> null`, `get after delete -> null`. macOS may
show a Keychain prompt for the app itself the first time ("Thoughts wants to use…"); Always
Allow is fine. An unsigned dev build changes identity on every rebuild, so it can recur —
expected until signing. Then remove the temp block (`git diff app/main.tsx` must be empty),
delete the smoke file, and quit the app.

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "Desktop: fs/http/dialog plugins and Keychain commands

Registers the three official plugins the frontend will use and adds keychain_get /
keychain_set over the keyring crate so the OpenAI key never lives in web storage.
The capability file scopes files to app data plus the user's home (for the backup
zip) and HTTP to api.openai.com.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Filesystem port and in-memory fake

**Files:**
- Create: `app/lib/fsPort.ts`, `app/lib/tauriFs.ts`, `test/helpers/memoryFs.ts`
- Test: `test/memory-fs.test.ts`

- [ ] **Step 1: Write the failing test for the fake**

```ts
// test/memory-fs.test.ts
import { describe, expect, it } from "vitest";
import { MemoryFs } from "./helpers/memoryFs.js";

const enc = (s: string) => new TextEncoder().encode(s);

describe("MemoryFs (in-memory FsPort for tests)", () => {
  it("mkdir is recursive and idempotent; exists sees dirs and files", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.mkdir("notes/a");
    expect(await fs.exists("notes")).toBe(true);
    expect(await fs.exists("notes/a")).toBe(true);
    expect(await fs.exists("notes/b")).toBe(false);
  });

  it("writes and reads text and bytes", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.writeTextFile("notes/a/note.json", "{}");
    await fs.writeFile("notes/a/audio.wav", enc("riff"));
    expect(await fs.readTextFile("notes/a/note.json")).toBe("{}");
    expect(new TextDecoder().decode(await fs.readFile("notes/a/audio.wav"))).toBe("riff");
  });

  it("readDir lists direct children only, flagging directories", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.mkdir("notes/b");
    await fs.writeTextFile("notes/a/note.json", "{}");
    await fs.writeTextFile("notes/stray.txt", "x");
    const names = (await fs.readDir("notes")).map((e) => `${e.name}:${e.isDirectory}`).sort();
    expect(names).toEqual(["a:true", "b:true", "stray.txt:false"]);
  });

  it("rename replaces the target atomically", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.writeTextFile("notes/a/note.json", "old");
    await fs.writeTextFile("notes/a/note.json.tmp", "new");
    await fs.rename("notes/a/note.json.tmp", "notes/a/note.json");
    expect(await fs.readTextFile("notes/a/note.json")).toBe("new");
    expect(await fs.exists("notes/a/note.json.tmp")).toBe(false);
  });

  it("remove deletes a directory and everything under it, and tolerates missing paths", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("notes/a");
    await fs.writeTextFile("notes/a/note.json", "{}");
    await fs.remove("notes/a");
    expect(await fs.exists("notes/a")).toBe(false);
    expect(await fs.exists("notes/a/note.json")).toBe(false);
    await expect(fs.remove("notes/nope")).resolves.toBeUndefined();
  });

  it("readFile on a missing path rejects", async () => {
    const fs = new MemoryFs();
    await expect(fs.readTextFile("missing")).rejects.toThrow(/missing/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/memory-fs.test.ts`
Expected: FAIL — cannot resolve `./helpers/memoryFs.js`.

- [ ] **Step 3: The port**

```ts
// app/lib/fsPort.ts
// The tiny filesystem surface the note store needs. Paths are relative to the app data
// directory (~/Library/Application Support/<bundle id>/). Production binds this to the
// Tauri fs plugin; tests bind an in-memory fake.

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface FsPort {
  readDir(path: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  writeTextFile(path: string, text: string): Promise<void>;
  /** Recursive and idempotent. */
  mkdir(path: string): Promise<void>;
  /** Atomic replace of `to` if it exists. */
  rename(from: string, to: string): Promise<void>;
  /** Recursive; resolves even when the path is missing. */
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

let port: FsPort | null = null;

/** Tests inject the fake here before touching the store. */
export function setFsPort(p: FsPort): void {
  port = p;
}

/** Lazily binds the Tauri implementation so importing the store never touches Tauri
 *  globals in Node. */
export async function getFsPort(): Promise<FsPort> {
  if (!port) port = (await import("./tauriFs")).tauriFs;
  return port;
}
```

- [ ] **Step 4: The Tauri implementation**

```ts
// app/lib/tauriFs.ts
// FsPort over @tauri-apps/plugin-fs, rooted at the app data directory. Also the two
// absolute-path helpers used for the backup zip the user picks in a dialog.
import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  rename,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { FsPort } from "./fsPort";

const base = { baseDir: BaseDirectory.AppData };

export const tauriFs: FsPort = {
  async readDir(path) {
    const entries = await readDir(path, base);
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
  },
  readFile: (path) => readFile(path, base),
  readTextFile: (path) => readTextFile(path, base),
  writeFile: (path, data) => writeFile(path, data, base),
  writeTextFile: (path, text) => writeTextFile(path, text, base),
  mkdir: (path) => mkdir(path, { ...base, recursive: true }),
  rename: (from, to) =>
    rename(from, to, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData }),
  async remove(path) {
    if (await exists(path, base)) await remove(path, { ...base, recursive: true });
  },
  exists: (path) => exists(path, base),
};

/** Read a file at an absolute path the user chose in an open dialog. */
export function readAbsolute(path: string): Promise<Uint8Array> {
  return readFile(path);
}

/** Write a file at an absolute path the user chose in a save dialog. */
export function writeAbsolute(path: string, data: Uint8Array): Promise<void> {
  return writeFile(path, data);
}
```

- [ ] **Step 5: The fake**

```ts
// test/helpers/memoryFs.ts
// In-memory FsPort with the same semantics the store relies on: recursive mkdir,
// atomic rename-over, recursive remove, direct-children readDir.
import type { DirEntry, FsPort } from "../../app/lib/fsPort.js";

const norm = (p: string) => p.replace(/\/+$/, "");
const parent = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

export class MemoryFs implements FsPort {
  files = new Map<string, Uint8Array>();
  dirs = new Set<string>([""]);

  private ensureParents(p: string) {
    let d = parent(p);
    while (d && !this.dirs.has(d)) {
      this.dirs.add(d);
      d = parent(d);
    }
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const dir = norm(path);
    if (!this.dirs.has(dir)) throw new Error(`readDir: ${dir} is missing`);
    const prefix = dir ? `${dir}/` : "";
    const out = new Map<string, boolean>();
    for (const d of this.dirs) {
      if (d.startsWith(prefix) && d !== dir) out.set(d.slice(prefix.length).split("/")[0], true);
    }
    for (const f of this.files.keys()) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length);
        if (!rest.includes("/")) out.set(rest, false);
      }
    }
    return [...out].map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const f = this.files.get(norm(path));
    if (!f) throw new Error(`readFile: ${path} is missing`);
    return f;
  }

  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path));
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const p = norm(path);
    this.ensureParents(p);
    this.files.set(p, data.slice());
  }

  async writeTextFile(path: string, text: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(text));
  }

  async mkdir(path: string): Promise<void> {
    const p = norm(path);
    this.ensureParents(p);
    this.dirs.add(p);
  }

  async rename(from: string, to: string): Promise<void> {
    const f = norm(from);
    const t = norm(to);
    if (this.files.has(f)) {
      this.files.set(t, this.files.get(f)!);
      this.files.delete(f);
      return;
    }
    if (this.dirs.has(f)) {
      for (const d of [...this.dirs]) {
        if (d === f || d.startsWith(`${f}/`)) {
          this.dirs.delete(d);
          this.dirs.add(t + d.slice(f.length));
        }
      }
      for (const [k, v] of [...this.files]) {
        if (k.startsWith(`${f}/`)) {
          this.files.delete(k);
          this.files.set(t + k.slice(f.length), v);
        }
      }
      return;
    }
    throw new Error(`rename: ${from} is missing`);
  }

  async remove(path: string): Promise<void> {
    const p = norm(path);
    this.files.delete(p);
    for (const k of [...this.files.keys()]) if (k.startsWith(`${p}/`)) this.files.delete(k);
    for (const d of [...this.dirs]) if (d === p || d.startsWith(`${p}/`)) this.dirs.delete(d);
  }

  async exists(path: string): Promise<boolean> {
    const p = norm(path);
    return this.files.has(p) || this.dirs.has(p);
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/memory-fs.test.ts` → 6 passed.
Run: `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add app/lib/fsPort.ts app/lib/tauriFs.ts test/helpers/memoryFs.ts test/memory-fs.test.ts
git commit -m "Storage: filesystem port with Tauri and in-memory implementations

The note store will talk to disk through a nine-method port so it can be tested in
Node against a fake with the same rename/remove/readDir semantics the Tauri fs
plugin provides.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Note store on files

**Files:**
- Rewrite internals: `app/lib/notesDb.ts`
- Rewrite test: `test/notes-db.test.ts`
- Remove dev dep: `fake-indexeddb`

- [ ] **Step 1: Replace the test file**

```ts
// test/notes-db.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFsPort } from "../app/lib/fsPort.js";
import { MemoryFs } from "./helpers/memoryFs.js";
import {
  attachMaster,
  dumpNotes,
  getNote,
  importNotes,
  listNotes,
  purgeExpired,
  purgeNote,
  renameNote,
  saveNote,
  searchNotes,
  updateAnnotation,
  updateNote,
  _resetForTests,
} from "../app/lib/notesDb.js";
import type { Note } from "../src/core/types.js";

const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  title: id,
  audioUrl: "",
  durationSec: 3,
  ...extra,
});
const wav = (s = "riff") => new Blob([s], { type: "audio/wav" });
const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());

let fs: MemoryFs;

describe("notesDb on files", () => {
  beforeEach(() => {
    fs = new MemoryFs();
    setFsPort(fs);
    _resetForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("saveNote writes note.json and audio.<ext> under notes/<id>", async () => {
    await saveNote(note("a"), new Blob(["m4a"], { type: "audio/mp4" }));
    expect(await fs.exists("notes/a/note.json")).toBe(true);
    expect(await fs.exists("notes/a/audio.m4a")).toBe(true);
    expect(await fs.exists("notes/a/note.json.tmp")).toBe(false);
    const rec = JSON.parse(await fs.readTextFile("notes/a/note.json"));
    expect(rec.audioType).toBe("audio/mp4");
    expect(rec.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
    expect(rec.updatedAt).toBe(rec.createdAt);
    expect(rec).not.toHaveProperty("audio");
  });

  it("listNotes is newest first and survives a cold start (re-reads disk)", async () => {
    await saveNote(note("old"), wav());
    vi.setSystemTime(new Date("2026-09-26T11:00:00Z"));
    await saveNote(note("new"), wav());
    expect((await listNotes()).map((s) => s.id)).toEqual(["new", "old"]);
    _resetForTests(); // drop the in-memory cache; same MemoryFs
    expect((await listNotes()).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("getNote reconstructs the blob type, duration and an object URL", async () => {
    await saveNote(note("a", { durationSec: 42 }), wav("hello"));
    const n = await getNote("a");
    expect(n?.durationSec).toBe(42);
    expect(n?.audioUrl).toMatch(/^blob:/); // Node ≥16.7 implements URL.createObjectURL
    expect(n?.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
    const [stored] = await dumpNotes();
    expect(stored.audio.type).toBe("audio/wav");
    expect(await text(stored.audio)).toBe("hello");
  });

  it("renameNote and updateNote patch only their fields and bump updatedAt", async () => {
    await saveNote(note("a", { tags: ["x"] }), wav());
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    await renameNote("a", "Renamed");
    await updateNote("a", { folder: "Essays" });
    const [s] = await listNotes();
    expect(s.title).toBe("Renamed");
    expect(s.folder).toBe("Essays");
    expect(s.tags).toEqual(["x"]);
    expect(s.updatedAt).toBe(Date.parse("2026-09-26T12:00:00Z"));
    expect(s.createdAt).toBe(Date.parse("2026-09-26T10:00:00Z"));
  });

  it("attachMaster swaps the audio file (new extension) and keeps the transcript", async () => {
    await saveNote(
      note("r1", {
        transcript: { text: "hi", paragraphs: [] } as unknown as Note["transcript"],
        deviceRecording: {
          recordingId: "r1",
          startedAtUtc: "2026-09-26T09:00:00Z",
          proxy: { acknowledgedAt: "2026-09-26T09:01:00Z" },
          master: {},
        } as unknown as Note["deviceRecording"],
      }),
      new Blob(["proxy"], { type: "audio/mp4" }),
    );
    await attachMaster("r1", new Blob(["master"], { type: "audio/wav" }), "2026-09-26T10:30:00Z");
    expect(await fs.exists("notes/r1/audio.m4a")).toBe(false);
    expect(await fs.exists("notes/r1/audio.wav")).toBe(true);
    const n = await getNote("r1");
    expect(n?.transcript?.text).toBe("hi");
    expect(n?.deviceRecording?.master.acknowledgedAt).toBe("2026-09-26T10:30:00Z");
  });

  it("trash: purgeExpired removes only lapsed notes; purgeNote removes the folder", async () => {
    await saveNote(note("keep"), wav());
    await saveNote(note("recent"), wav());
    await saveNote(note("lapsed"), wav());
    const day = 86_400_000;
    await updateNote("recent", { deletedAt: Date.now() - 2 * day });
    await updateNote("lapsed", { deletedAt: Date.now() - 31 * day });
    await purgeExpired();
    expect((await listNotes()).map((s) => s.id).sort()).toEqual(["keep", "recent"]);
    expect(await fs.exists("notes/lapsed")).toBe(false);
    await purgeNote("keep");
    expect(await fs.exists("notes/keep")).toBe(false);
    expect((await listNotes()).map((s) => s.id)).toEqual(["recent"]);
  });

  it("purgeExpired cleans a folder that has no note.json (interrupted write)", async () => {
    await fs.mkdir("notes/half");
    await fs.writeFile("notes/half/audio.wav", new Uint8Array([1]));
    expect(await listNotes()).toEqual([]);
    await purgeExpired();
    expect(await fs.exists("notes/half")).toBe(false);
  });

  it("importNotes adds new ids and skips existing ones", async () => {
    await saveNote(note("a"), wav());
    const res = await importNotes([
      { id: "a", title: "dup", durationSec: 1, createdAt: 1, data: { id: "a", title: "dup", durationSec: 1 }, audio: wav() },
      { id: "b", title: "b", durationSec: 1, createdAt: 2, data: { id: "b", title: "b", durationSec: 1 }, audio: wav() },
    ]);
    expect(res).toEqual({ added: 1, skipped: 1 });
    expect((await listNotes()).map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect((await listNotes()).find((s) => s.id === "a")?.title).toBe("a");
    // A legacy record without updatedAt reads as createdAt.
    expect((await listNotes()).find((s) => s.id === "b")?.updatedAt).toBe(2);
  });

  it("two overlapping updateAnnotation calls on one note both land", async () => {
    await saveNote(
      note("a", {
        annotations: [
          { id: "x", kind: "todo", done: false },
          { id: "y", kind: "todo", done: false },
        ] as unknown as Note["annotations"],
      }),
      wav(),
    );
    await Promise.all([
      updateAnnotation("a", "x", { done: true } as never),
      updateAnnotation("a", "y", { done: true } as never),
    ]);
    const n = await getNote("a");
    expect(n?.annotations?.every((a) => (a as { done?: boolean }).done)).toBe(true);
  });

  it("searchNotes matches title, tags, and transcript text within a project", async () => {
    await saveNote(note("a", { title: "Tide clocks", project: "Sea" }), wav());
    await saveNote(note("b", { title: "Other", tags: ["tide"] }), wav());
    await saveNote(note("c", { title: "Trashed tide", deletedAt: 1 }), wav());
    expect((await searchNotes("tide")).map((h) => h.id).sort()).toEqual(["a", "b"]);
    expect((await searchNotes("tide", "Sea")).map((h) => h.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/notes-db.test.ts`
Expected: FAIL — `setFsPort`/`_resetForTests` not exported; the module still opens IndexedDB.

- [ ] **Step 3: Rewrite `app/lib/notesDb.ts`**

Keep the header types (`NoteSummary`, `StoredNote` with `updatedAt?`) and every exported function name. Replace everything from `const DB_NAME` down through `mutateNote`, and the storage calls inside each exported function, with the file implementation below. The exported bodies of `listNotes`, `searchNotes`, `renameNote`, `updateNote`, `addSummaryVariant`, `updateChunkText`, `updateAnnotation` keep their current logic; they simply operate on a `NoteRecord` instead of a `StoredNote` (the record has no `audio`, and none of those functions touch it).

```ts
// Local-first note storage on disk. Each note is a folder under the app data directory:
//   notes/<id>/note.json   the note's data (StoredNote minus the blob, plus audioType)
//   notes/<id>/audio.<ext> the recording, byte-for-byte
// Writes are temp-file + rename, so a crash never leaves a half-written note. A cache of
// every note.json (never the audio) is held in memory after the first listing.
import type { Annotation, Chunk, FormattingLayers, Note, Transcript } from "@core/types";
import { getFsPort } from "./fsPort";

// … NoteSummary and StoredNote interfaces exactly as before …

/** What note.json holds: the stored record minus the blob, plus the blob's MIME type. */
type NoteRecord = Omit<StoredNote, "audio"> & { audioType: string };

const NOTES_DIR = "notes";
const RECORD = "note.json";

const EXT: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
};
const extFor = (mime: string) => EXT[mime] ?? "bin";
const dirOf = (id: string) => `${NOTES_DIR}/${id}`;
const recordPath = (id: string) => `${dirOf(id)}/${RECORD}`;
const audioPath = (id: string, mime: string) => `${dirOf(id)}/audio.${extFor(mime)}`;

// ---- cache + locks --------------------------------------------------------------------

let cache: Map<string, NoteRecord> | null = null;
const locks = new Map<string, Promise<unknown>>();

/** Tests: forget the cache so the next call re-reads the (fake) disk. */
export function _resetForTests(): void {
  cache = null;
  locks.clear();
}

/** Serialize work per note id (the file-store stand-in for an IndexedDB readwrite tx). */
function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(id, next);
  void next.finally(() => {
    if (locks.get(id) === next) locks.delete(id);
  });
  return next;
}

/** Read every note.json once. Folders without a readable record are skipped. */
async function records(): Promise<Map<string, NoteRecord>> {
  if (cache) return cache;
  const fs = await getFsPort();
  await fs.mkdir(NOTES_DIR);
  const map = new Map<string, NoteRecord>();
  const entries = await fs.readDir(NOTES_DIR);
  await Promise.all(
    entries
      .filter((e) => e.isDirectory)
      .map(async (e) => {
        try {
          const rec = JSON.parse(await fs.readTextFile(recordPath(e.name))) as NoteRecord;
          if (rec && rec.id === e.name) map.set(rec.id, rec);
        } catch {
          // no note.json or unparsable: an interrupted write — purgeExpired cleans it
        }
      }),
  );
  cache = map;
  return map;
}

async function writeRecord(rec: NoteRecord): Promise<void> {
  const fs = await getFsPort();
  await fs.mkdir(dirOf(rec.id));
  const target = recordPath(rec.id);
  await fs.writeTextFile(`${target}.tmp`, JSON.stringify(rec));
  await fs.rename(`${target}.tmp`, target);
  (await records()).set(rec.id, rec);
}

async function writeAudio(id: string, audio: Blob): Promise<void> {
  const fs = await getFsPort();
  await fs.mkdir(dirOf(id));
  const target = audioPath(id, audio.type);
  await fs.writeFile(`${target}.tmp`, new Uint8Array(await audio.arrayBuffer()));
  await fs.rename(`${target}.tmp`, target);
}

async function readAudio(rec: NoteRecord): Promise<Blob> {
  const fs = await getFsPort();
  const bytes = await fs.readFile(audioPath(rec.id, rec.audioType));
  return new Blob([bytes], { type: rec.audioType });
}

/** Atomic read-modify-write of one record under the note's lock. */
function mutateNote(id: string, mutate: (rec: NoteRecord) => void): Promise<void> {
  return withLock(id, async () => {
    const rec = (await records()).get(id);
    if (!rec) return;
    mutate(rec);
    rec.updatedAt = Date.now();
    await writeRecord(rec);
  });
}

// ---- public API -----------------------------------------------------------------------

export async function saveNote(note: Note, audio: Blob): Promise<void> {
  const { audioUrl: _drop, ...data } = note;
  const now = Date.now();
  const rec: NoteRecord = {
    id: note.id,
    title: note.title,
    durationSec: note.durationSec,
    createdAt: now,
    updatedAt: now,
    data,
    audioType: audio.type,
  };
  await withLock(note.id, async () => {
    await writeAudio(note.id, audio);
    await writeRecord(rec);
  });
}

/** All records, newest first. The shared read behind the feed and search. */
async function allByRecency(): Promise<NoteRecord[]> {
  return [...(await records()).values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function listNotes(): Promise<NoteSummary[]> {
  const all = await allByRecency();
  return all.map(({ id, title, durationSec, createdAt, updatedAt, data }) => ({
    id,
    title,
    durationSec,
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    snippet: (data.summary ?? data.transcript?.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400),
    tags: data.tags ?? [],
    folder: data.folder,
    pinned: data.pinned ?? false,
    project: data.project,
    deletedAt: data.deletedAt,
  }));
}

export async function searchNotes(query: string, project?: string): Promise<SearchHit[]> {
  // Body unchanged from today: it reads n.title, n.data.tags, n.data.transcript?.text,
  // n.data.deletedAt and n.data.project — all present on NoteRecord.
}

export async function getNote(id: string): Promise<Note | null> {
  const rec = (await records()).get(id);
  if (!rec) return null;
  return {
    ...rec.data,
    createdAt: rec.createdAt,
    audioUrl: URL.createObjectURL(await readAudio(rec)),
  };
}

export async function ingestState(recordingId: string) {
  const rec = (await records()).get(recordingId);
  if (!rec) return null;
  return { recordingId, hasMaster: !!rec.data.deviceRecording?.master.acknowledgedAt };
}

export async function attachMaster(recordingId: string, master: Blob, acknowledgedAt: string): Promise<void> {
  await withLock(recordingId, async () => {
    const rec = (await records()).get(recordingId);
    if (!rec) return;
    const fs = await getFsPort();
    const oldPath = audioPath(recordingId, rec.audioType);
    await writeAudio(recordingId, master);
    if (oldPath !== audioPath(recordingId, master.type)) await fs.remove(oldPath);
    rec.audioType = master.type;
    const dr = rec.data.deviceRecording;
    if (dr) dr.master = { ...dr.master, acknowledgedAt };
    rec.updatedAt = Date.now();
    await writeRecord(rec);
  });
}

// renameNote, updateNote, addSummaryVariant, updateChunkText, updateAnnotation: unchanged
// bodies, now typed against NoteRecord via mutateNote.

export async function dumpNotes(): Promise<StoredNote[]> {
  const all = await allByRecency();
  return Promise.all(
    all.map(async (rec) => {
      const { audioType: _t, ...rest } = rec;
      return { ...rest, audio: await readAudio(rec) };
    }),
  );
}

export async function importNotes(notes: StoredNote[]): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const n of notes) {
    if ((await records()).has(n.id)) {
      skipped++;
      continue;
    }
    const { audio, ...rest } = n;
    await withLock(n.id, async () => {
      await writeAudio(n.id, audio);
      await writeRecord({ ...rest, audioType: audio.type });
    });
    added++;
  }
  return { added, skipped };
}

export const TRASH_RETENTION_DAYS = 30;

export async function purgeNote(id: string): Promise<void> {
  await withLock(id, async () => {
    await (await getFsPort()).remove(dirOf(id));
    (await records()).delete(id);
  });
}

export async function purgeExpired(): Promise<void> {
  const fs = await getFsPort();
  const all = await records();
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86_400_000;
  const expired = [...all.values()].filter((n) => n.data.deletedAt && n.data.deletedAt < cutoff);
  await Promise.all(expired.map((n) => purgeNote(n.id)));
  // Folders with no readable note.json are interrupted writes: drop them.
  const entries = await fs.readDir(NOTES_DIR);
  await Promise.all(
    entries
      .filter((e) => e.isDirectory && !all.has(e.name))
      .map((e) => fs.remove(dirOf(e.name))),
  );
}
```

`dumpNotes` reads every audio file, which is the backup's job; nothing else touches audio in bulk.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/notes-db.test.ts` → 10 passed.
Run: `npm run typecheck` → clean. If `attachMaster`'s test fixture types fight you, loosen the fixture with `as unknown as …` (already done) rather than weakening the store's types.

- [ ] **Step 5: Drop fake-indexeddb**

```bash
npm uninstall fake-indexeddb
```

- [ ] **Step 6: Full suite + commit**

Run: `npm test` → all pass (the ingest tests exercise `src/core/ingest`, not the store, so they are unaffected).

```bash
git add app/lib/notesDb.ts test/notes-db.test.ts package.json package-lock.json
git commit -m "Storage: notes live as files on disk instead of IndexedDB

Each note is notes/<id>/note.json plus its audio file, written temp-then-rename.
The module keeps its exported API so no caller changes; a per-note lock replaces
the IndexedDB transaction, and an in-memory cache of the records (never the audio)
backs listing and search after the first read.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Backup round trip and the frozen version-1 archive

**Files:**
- Test: `test/backup-roundtrip.test.ts`
- Fixture: `test/fixtures/thoughts-backup-v1.zip` (exported from the deployed web app)

- [ ] **Step 1: Produce the fixture**

In the deployed web app (or `git stash`-free: check out `dev` in a second worktree and run `npm run dev:web` there), record or upload two short notes (one with a tag, one moved to the trash), open Settings → Download. Copy the zip to `test/fixtures/thoughts-backup-v1.zip`. Keep it small (two notes of a few seconds each; well under 2 MB).

- [ ] **Step 2: Write the failing test**

```ts
// test/backup-roundtrip.test.ts
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { setFsPort } from "../app/lib/fsPort.js";
import { buildBackup, restoreBackup } from "../app/lib/backup.js";
import { _resetForTests, dumpNotes, listNotes, saveNote } from "../app/lib/notesDb.js";
import { MemoryFs } from "./helpers/memoryFs.js";
import type { Note } from "../src/core/types.js";

const bytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];

describe("backup archive round trip (migration contract v1)", () => {
  beforeEach(() => {
    setFsPort(new MemoryFs());
    _resetForTests();
  });

  it("export then import into a fresh store reproduces every note byte-for-byte", async () => {
    const n: Note = { id: "a", title: "A", audioUrl: "", durationSec: 2, tags: ["t"] };
    await saveNote(n, new Blob([new Uint8Array([1, 2, 3, 250])], { type: "audio/mp4" }));
    await saveNote({ ...n, id: "b", title: "B", deletedAt: 5 }, new Blob(["wav"], { type: "audio/wav" }));
    const before = await dumpNotes();
    const { blob } = await buildBackup();

    setFsPort(new MemoryFs());
    _resetForTests();
    const res = await restoreBackup(new File([blob], "x.zip"));
    expect(res).toEqual({ added: 2, skipped: 0 });
    const after = await dumpNotes();
    for (const b of before) {
      const a = after.find((x) => x.id === b.id)!;
      const { audio: ba, ...bRest } = b;
      const { audio: aa, ...aRest } = a;
      expect(aRest).toEqual(bRest);
      expect(aa.type).toBe(ba.type);
      expect(await bytes(aa)).toEqual(await bytes(ba));
    }
    // Trashed notes come back still trashed.
    expect((await listNotes()).find((s) => s.id === "b")?.deletedAt).toBe(5);
  });

  it("imports the archive the web app produced (frozen v1 fixture)", async () => {
    const zip = await readFile(new URL("./fixtures/thoughts-backup-v1.zip", import.meta.url));
    const res = await restoreBackup(new File([zip], "thoughts-backup-v1.zip"));
    expect(res.added).toBeGreaterThanOrEqual(1);
    expect(res.skipped).toBe(0);
    for (const n of await dumpNotes()) {
      expect(n.audio.size).toBeGreaterThan(0);
      expect(n.data.transcript?.text ?? "").not.toBeUndefined();
    }
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run test/backup-roundtrip.test.ts`
Expected: both pass without code changes (this pins the contract). If the first case fails on `updatedAt`, the archive dropped it — `buildBackup` spreads the whole record, so it should not; investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add test/backup-roundtrip.test.ts test/fixtures/thoughts-backup-v1.zip
git commit -m "Tests: backup round trip and the frozen v1 web archive

The zip is the only path notes take from the web app to the desktop app, so a
committed archive produced by the web build guards the format, and a round trip
through the file store proves audio and records survive byte-for-byte.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: OpenAI directly from the app

**Files:**
- Modify: `src/server/openaiTranscribe.ts`, `src/server/openaiStructure.ts`
- Modify: `app/lib/providers/openaiStt.ts`, `app/lib/providers/openaiLlm.ts`
- Test: `test/openai-server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/openai-server.test.ts
import { describe, expect, it } from "vitest";
import { openaiTranscribe } from "../src/server/openaiTranscribe.js";
import { openaiStructure } from "../src/server/openaiStructure.js";

function fakeFetch(reply: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

describe("openaiTranscribe / openaiStructure accept an injected fetch", () => {
  it("transcribe posts multipart to Whisper with the bearer key and prompt", async () => {
    const { f, calls } = fakeFetch({ text: "hi" });
    const res = await openaiTranscribe(new Blob(["x"]), "a.m4a", "sk-test", "Mara", f);
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = calls[0].init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("prompt")).toBe("Mara");
    expect((form.get("file") as File).name).toBe("a.m4a");
  });

  it("structure posts a strict json_schema chat completion", async () => {
    const { f, calls } = fakeFetch({ choices: [] });
    await openaiStructure(
      { system: "s", prompt: "p", schema: { type: "object" }, schemaName: "r", apiKey: "sk-test" },
      f,
    );
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0]).toEqual({ role: "system", content: "s" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/openai-server.test.ts`
Expected: FAIL — the functions ignore the extra argument and call the real `fetch` (network error or unexpected URL).

- [ ] **Step 3: Inject `fetch`**

`src/server/openaiTranscribe.ts` — add the parameter and use it:

```ts
export async function openaiTranscribe(
  audio: Blob,
  filename: string,
  apiKey: string,
  /** Optional vocabulary-bias prompt (the user's personal dictionary). */
  prompt?: string,
  /** The desktop app passes Tauri's CORS-free fetch; Node uses the global. */
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  // … unchanged form building …
  const upstream = await fetchImpl(WHISPER_URL, {
```

`src/server/openaiStructure.ts`:

```ts
export async function openaiStructure(
  req: StructureRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const upstream = await fetchImpl(CHAT_URL, {
```

Update the header comments: they are now "Isomorphic (Node CLI and the desktop app)".

- [ ] **Step 4: Run the test** → 2 passed.

- [ ] **Step 5: Providers call them directly**

`app/lib/providers/openaiStt.ts` — replace the imports and the fetch block:

```ts
// Desktop transcription: call Whisper directly through Tauri's fetch (runs from Rust, so
// OpenAI's browser CORS block doesn't apply), then reuse the shared transform.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { Transcript } from "@core/types";
import type { SttResult } from "@engine/providers/stt";
import { openaiTranscribe } from "@engine/server/openaiTranscribe";
import { transcriptFromStt } from "@engine/processors/transcribe/index";
import { buildSttPrompt, getDictionary } from "../dictionary";
import { getKeys } from "../keys";

// interface OpenAiVerbose unchanged

export async function transcribe(file: File): Promise<Transcript> {
  const { openai } = await getKeys();
  if (!openai) throw new Error("Add your OpenAI key in Settings.");
  const sttPrompt = buildSttPrompt(getDictionary());
  const res = await openaiTranscribe(file, file.name, openai, sttPrompt || undefined, tauriFetch as typeof fetch);
  if (!res.ok) {
    // unchanged error extraction
  }
  // unchanged result mapping
}
```

`app/lib/providers/openaiLlm.ts` — `callStructure` becomes:

```ts
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openaiStructure } from "@engine/server/openaiStructure";
import { getKeys } from "../keys";

async function callStructure<T>(req: LlmRequest, paragraphs: Chunk[]): Promise<T> {
  const { openai } = await getKeys();
  if (!openai) throw new Error("Add your OpenAI key in Settings.");
  const res = await openaiStructure(
    {
      system: req.system,
      prompt: req.buildPrompt(paragraphs),
      schema: req.schema,
      schemaName: req.schemaName,
      apiKey: openai,
    },
    tauriFetch as typeof fetch,
  );
  // unchanged: !res.ok handling, JSON parse of choices[0].message.content
}
```

`getKeys` is still synchronous until Task 7; `await` on a sync value is fine, so this compiles now and stays correct after Task 7.

- [ ] **Step 6: Typecheck** → clean (`hasDevServerKey` is no longer imported by the providers; it is deleted in Task 9).

- [ ] **Step 7: Commit**

```bash
git add src/server app/lib/providers test/openai-server.test.ts
git commit -m "Network: call OpenAI directly from the app via Tauri fetch

The isomorphic server functions take an injected fetch (default: global), so the
desktop app passes the Tauri http plugin's fetch, which runs from Rust and is not
subject to OpenAI's browser CORS block. No proxy is needed any more.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Key in the Keychain

**Files:**
- Rewrite: `app/lib/keys.ts`
- Modify: `app/components/SettingsKeys.tsx`, `app/App.tsx` (lines ~98–110, ~915, ~1273, ~1459)

No unit test: the module is a thin `invoke` wrapper; the manual check in Task 2 covered the Rust side.

- [ ] **Step 1: `app/lib/keys.ts`**

```ts
// Bring-your-own-key storage. The OpenAI key lives in the macOS Keychain (service
// "Thoughts", account "openai") via two Rust commands; it is read per request and never
// cached in JS or written to web storage.
import { invoke } from "@tauri-apps/api/core";

export interface Keys {
  openai: string;
}

export async function getKeys(): Promise<Keys> {
  const v = await invoke<string | null>("keychain_get", { account: "openai" });
  return { openai: v ?? "" };
}

export async function setKeys(keys: Keys): Promise<void> {
  await invoke("keychain_set", { account: "openai", value: keys.openai.trim() });
}

/** Ready to transcribe: a key is saved. */
export async function hasKeys(): Promise<boolean> {
  return Boolean((await getKeys()).openai);
}
```

- [ ] **Step 2: `app/components/SettingsKeys.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getKeys, setKeys } from "../lib/keys";
import "./settings-keys.css";

// Paste-your-own-key panel. The key lives in the macOS Keychain and is used for both
// transcription and structuring — one OpenAI account covers the whole app.
export function SettingsKeys({ onSaved }: { onSaved: () => void }) {
  const [openai, setOpenai] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getKeys().then((k) => setOpenai(k.openai));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setKeys({ openai });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sk">
      <h2 className="sk-title">OpenAI API key</h2>
      <p className="sk-intro">
        You need your own OpenAI API key to run the app. It's stored in your macOS Keychain —
        don't have one yet? Get one below.
      </p>

      <label className="sk-field">
        <span>OpenAI key</span>
        <input
          type="password"
          value={openai}
          onChange={(e) => setOpenai(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
        />
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
          Get an OpenAI key →
        </a>
      </label>

      {error && <p className="error">{error}</p>}
      <button className="sk-save" onClick={() => void save()} disabled={saving || !openai.trim()}>
        {saving ? "Saving…" : "Save key"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `app/App.tsx` boot gate**

Replace the two `hasKeys()`-initialised states (~lines 98–110):

```ts
  const [view, setView] = useState<"library" | "memo" | "settings">("library");
  // …other state unchanged…
  const [keysReady, setKeysReady] = useState(false);
  // Nothing renders until the Keychain read settles, so a keyless first run lands on
  // Settings without first flashing the library.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    void hasKeys().then((ok) => {
      setKeysReady(ok);
      if (!ok) setView("settings");
      setBooted(true);
    });
  }, []);
```

Immediately before the component's render `return (` (~line 915, after every hook):

```ts
  if (!booted) return null;
```

Replace both `setKeysReady(hasKeys());` call sites (Settings `onKeysSaved`, ~line 1273, and `KeysModal.onSaved`, ~line 1459) with:

```ts
              void hasKeys().then(setKeysReady);
```

- [ ] **Step 4: Typecheck and run**

`npm run typecheck` → clean. `npm run dev`: with no key saved the app opens on Settings; paste a key, Save → library. Quit and relaunch → library directly (key came from the Keychain). Upload a short recording → transcription and summary complete (Tasks 6 + 7 together).

- [ ] **Step 5: Commit**

```bash
git add app/lib/keys.ts app/components/SettingsKeys.tsx app/App.tsx
git commit -m "Keys: OpenAI key lives in the macOS Keychain

getKeys/setKeys/hasKeys become async over the two Rust commands; the app gates its
first render on the Keychain read so a keyless launch lands on Settings cleanly.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Export/import through native dialogs, and first-run onboarding

**Files:**
- Rewrite: `app/lib/exportLibrary.ts`
- Create: `app/lib/importArchive.ts`, `app/shell/OnboardingPanel.tsx`, `app/shell/onboarding-panel.css`
- Modify: `app/shell/SettingsPage.tsx`, `app/App.tsx` (library render ~line 1279)

- [ ] **Step 1: `app/lib/exportLibrary.ts`**

```ts
// "Download backup" on the desktop: build the zip and let the user pick where it goes.
import { save } from "@tauri-apps/plugin-dialog";
import { buildBackup } from "./backup";
import { writeAbsolute } from "./tauriFs";

const FILTER = [{ name: "Thoughts backup", extensions: ["zip"] }];

/** Resolves null when the user cancels the save dialog. */
export async function exportLibrary(): Promise<{ count: number; filename: string } | null> {
  const { blob, count, filename } = await buildBackup();
  const path = await save({ defaultPath: filename, filters: FILTER });
  if (!path) return null;
  await writeAbsolute(path, new Uint8Array(await blob.arrayBuffer()));
  return { count, filename: path.split("/").pop() ?? filename };
}
```

- [ ] **Step 2: `app/lib/importArchive.ts`**

```ts
// "Restore from backup" / first-run import: pick a Thoughts zip and merge it in.
import { open } from "@tauri-apps/plugin-dialog";
import { restoreBackup } from "./backup";
import { readAbsolute } from "./tauriFs";

const FILTER = [{ name: "Thoughts backup", extensions: ["zip"] }];

/** Resolves null when the user cancels the open dialog. */
export async function importArchive(): Promise<{ added: number; skipped: number } | null> {
  const path = await open({ multiple: false, directory: false, filters: FILTER });
  if (!path) return null;
  const bytes = await readAbsolute(path);
  return restoreBackup(new File([bytes], path.split("/").pop() ?? "backup.zip"));
}
```

- [ ] **Step 3: Settings uses them**

In `app/shell/SettingsPage.tsx`:
- Imports: drop `buildBackup, restoreBackup` and `useRef`; add `import { exportLibrary } from "../lib/exportLibrary";` and `import { importArchive } from "../lib/importArchive";`.
- Delete `fileRef`, `saveDevSeed`, the `import.meta.env.DEV` button block, and the hidden `<input type="file">`.
- Replace `downloadBackup` and `restoreFromFile`:

```ts
  async function downloadBackup() {
    setBusy("export");
    setBackupStatus(null);
    try {
      const r = await exportLibrary();
      if (r) setBackupStatus(`Saved ${r.count} note${r.count === 1 ? "" : "s"} to ${r.filename}.`);
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restoreFromArchive() {
    setBusy("restore");
    setBackupStatus(null);
    try {
      const r = await importArchive();
      if (r) {
        setBackupStatus(
          `Restored ${r.added} note${r.added === 1 ? "" : "s"}` +
            (r.skipped ? ` · ${r.skipped} already here` : "") +
            ".",
        );
        if (r.added) onRestored();
      }
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
```

- The Restore button's `onClick` becomes `() => void restoreFromArchive()`.
- Copy in the backup card: "Notes live only in this browser — keep a copy somewhere safe." → "Notes live only on this Mac — keep a copy somewhere safe."

- [ ] **Step 4: Onboarding panel**

```tsx
// app/shell/OnboardingPanel.tsx
// First run: an empty library offers to import the web app's backup archive. Shown
// instead of the feed until at least one note exists or the user starts fresh.
import { useState } from "react";
import "./onboarding-panel.css";

export function OnboardingPanel({
  onImport,
  onStartFresh,
}: {
  /** Runs the import; resolves null when the picker is cancelled. */
  onImport: () => Promise<{ added: number; skipped: number } | null>;
  onStartFresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setStatus(null);
    try {
      const r = await onImport();
      if (r && r.added === 0) setStatus("That archive had no new notes.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob">
      <h1 className="ob-title">Bring your notes from the web version</h1>
      <p className="ob-body">
        In the web app, open the library and click <strong>Download your notes</strong>. Then
        import that file here.
      </p>
      <div className="ob-actions">
        <button className="ob-primary" onClick={() => void run()} disabled={busy}>
          {busy ? "Importing…" : "Import backup…"}
        </button>
        <button className="ob-secondary" onClick={onStartFresh} disabled={busy}>
          Start fresh
        </button>
      </div>
      {status && <p className="ob-status">{status}</p>}
    </div>
  );
}
```

```css
/* app/shell/onboarding-panel.css */
.ob {
  max-width: 520px;
  margin: 120px auto 0;
  padding: 0 48px;
  text-align: center;
}
.ob-title {
  font-family: "Newsreader", Georgia, serif;
  font-weight: 500;
  font-size: 28px;
  margin: 0 0 12px;
}
.ob-body {
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 24px;
}
.ob-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.ob-primary,
.ob-secondary {
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.ob-primary {
  background: var(--accent);
  color: #fff;
  border: 1px solid var(--accent);
}
.ob-secondary {
  background: var(--surface);
  color: var(--text-2);
  border: 1px solid var(--border);
}
.ob-primary:disabled,
.ob-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
.ob-status {
  margin-top: 16px;
  font-size: 12.5px;
  color: var(--text-2);
}
```

- [ ] **Step 5: Wire it in App**

Imports:

```ts
import { OnboardingPanel } from "./shell/OnboardingPanel";
import { importArchive } from "./lib/importArchive";
```

State near the other flags:

```ts
  const [startedFresh, setStartedFresh] = useState(false);
```

At the library render site, wrap the feed:

```tsx
        ) : view === "library" ? (
          notesLoaded && summaries.length === 0 && !startedFresh ? (
            <OnboardingPanel
              onImport={async () => {
                const r = await importArchive();
                if (r?.added) setSummaries(await listNotes());
                return r;
              }}
              onStartFresh={() => setStartedFresh(true)}
            />
          ) : (
            <LibraryFeed
              summaries={filterFolder ? live.filter((s) => s.folder === filterFolder) : live}
              title={filterFolder ?? "All notes"}
              onOpen={openMemo}
            />
          )
        ) : (
```

(The `banner` prop from the web transition release is removed here; Task 9 deletes the banner itself.)

- [ ] **Step 6: Typecheck and run**

`npm run typecheck` → clean. `npm run dev` on an empty app-data folder (`rm -rf ~/Library/Application\ Support/com.willieshaw.thoughts` first): onboarding panel shows; Import → pick `test/fixtures/thoughts-backup-v1.zip` → feed appears with the notes, audio plays. Settings → Download → save dialog → file written where chosen. Settings → Restore the same file → "0 notes · N already here".

- [ ] **Step 7: Commit**

```bash
git add app/lib/exportLibrary.ts app/lib/importArchive.ts app/shell/OnboardingPanel.tsx app/shell/onboarding-panel.css app/shell/SettingsPage.tsx app/App.tsx
git commit -m "Desktop: native save/open for backups and a first-run import panel

An empty library offers to import the web app's archive before showing a feed, and
Settings' Download/Restore go through the macOS save and open dialogs.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Remove the web-only machinery

**Files (delete):** `worker/index.ts`, `wrangler.jsonc`, `app/shell/ExportBanner.tsx`, `app/shell/export-banner.css`, `app/lib/exportReminder.ts`, `app/lib/links.ts`, `test/export-reminder.test.ts`
**Files (modify):** `vite.config.ts`, `app/vite-env.d.ts`, `app/shell/LibraryFeed.tsx`, `app/main.tsx`, `.gitignore`, `tsconfig.json`, `package.json`, `README.md`

- [ ] **Step 1: Delete files**

```bash
git rm -r worker wrangler.jsonc app/shell/ExportBanner.tsx app/shell/export-banner.css app/lib/exportReminder.ts app/lib/links.ts test/export-reminder.test.ts
npm uninstall wrangler
```

- [ ] **Step 2: `vite.config.ts`** — replace the whole file:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The Thoughts frontend, served to the Tauri window in dev and built to dist/ for the
// app bundle. No server-side code: OpenAI is called from the app through Tauri's fetch.
export default defineConfig({
  root: "app",
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      // Isomorphic types + focus store.
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      // Shared pure engine logic (transforms, prompts, OpenAI calls). Node-free modules only.
      "@engine": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [".."] }, // allow importing shared modules that live outside app/
  },
});
```

- [ ] **Step 3: `app/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: `app/shell/LibraryFeed.tsx`** — remove the `banner` prop and its `{banner}` render line and the `ReactNode` import added by the web transition release.

- [ ] **Step 5: `app/main.tsx`** — remove the `navigator.storage.persist()` block (WKWebView inside Tauri does not need it; the notes are on disk anyway):

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Housekeeping**

- `.gitignore`: remove the `# Wrangler / Cloudflare` + `.wrangler` lines and `dev-fixtures/`.
- `tsconfig.json` `include`: `["src", "app", "vite.config.ts"]` (drop `functions`).
- `README.md`: rewrite "How processing and storage work" to say notes are folders under `~/Library/Application Support/com.willieshaw.thoughts/notes/`, the key is in the Keychain, and the app calls OpenAI directly; replace the "Deployment" section with:

```markdown
## Building the Mac app

```bash
npm run dev      # Tauri window + Vite dev server
npm run build    # unsigned Thoughts.app in src-tauri/target/release/bundle/macos/
```

The build is unsigned: right-click → Open the first time on a new machine. Signing and
notarization are tracked separately.
```

- [ ] **Step 7: Verify nothing references the deleted pieces**

```bash
grep -rn "hasDevServerKey\|VITE_DEV_HAS_KEY\|dev-seed\|ExportBanner\|exportReminder\|wrangler\|/api/transcribe\|/api/structure" app src test vite.config.ts README.md package.json
```

Expected: no output. Then `npm run typecheck && npm test` → clean, all files pass.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts app/vite-env.d.ts app/shell/LibraryFeed.tsx app/main.tsx .gitignore tsconfig.json package.json package-lock.json README.md
git commit -m "Retire the web deploy: worker, dev proxy, dev seed, transition banner

With OpenAI called from the app and notes on disk, the Cloudflare worker, the Vite
API middleware, the .env key fallback, the dev-seed auto-restore, and the export
reminder banner have no job left.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Build, acceptance, PR

- [ ] **Step 1: Full verification**

```bash
npm run typecheck && npm test && npm run build
```

Expected: typecheck clean; test files pass (`memory-fs`, `notes-db`, `backup-roundtrip`, `openai-server` plus the pre-existing 10 minus `export-reminder`); `src-tauri/target/release/bundle/macos/Thoughts.app` exists.

- [ ] **Step 2: Manual acceptance (spec §3)**

1. `rm -rf ~/Library/Application\ Support/com.willieshaw.thoughts` and open the built `Thoughts.app` (right-click → Open).
2. Lands on Settings with no key → paste key → Save → library shows the onboarding panel.
3. In the deployed web app, record two notes, one with a folder and tags; Download your notes.
4. Import that zip → both notes appear; open each: audio plays, summary and paragraphs render; the folder shows in the sidebar after re-creating it (folders are a localStorage registry, so re-create once).
5. Quit (⌘Q) and relaunch → notes still there; `ls ~/Library/Application\ Support/com.willieshaw.thoughts/notes/` shows one folder per note with `note.json` and `audio.*`.
6. Record a new note in the app → transcribes and summarizes.
7. Delete one note → Settings → Recently deleted → Empty now → its folder is gone from disk.
8. Settings → Download → zip saved to the chosen path.

Record the outcome of each step, including anything that failed, for the PR body.

- [ ] **Step 3: Push and PR against dev**

```bash
git push -u origin desktop-app
gh pr create --base dev --title "Thoughts as a Mac app: Tauri shell, notes on disk, Keychain key" --body "$(cat <<'BODY'
## Context
Notes lived only in browser IndexedDB and could be wiped by clearing site data. Spec: docs/superpowers/specs/2026-09-26-desktop-migration-design.md §2–§3. Follows the web transition release.

## Change
- Tauri 2 shell (`src-tauri/`) around the unchanged React app; `npm run dev` opens the app window.
- Notes stored as `notes/<id>/note.json` + `audio.<ext>` under Application Support, temp+rename writes, per-note lock, in-memory record cache. `notesDb.ts` keeps its API.
- OpenAI called directly with Tauri's fetch; the isomorphic server functions take an injected fetch.
- OpenAI key in the macOS Keychain via two Rust commands.
- First-run onboarding imports the web app's backup zip; Settings export/import use native dialogs.
- Deleted: Cloudflare worker, Vite API proxy, dev seed, `.env` key fallback, export reminder banner.

## Tests
- `memory-fs` (6), `notes-db` (10), `backup-roundtrip` (2, includes a committed v1 archive from the web build), `openai-server` (2) — each failed first against the old implementation.
- Full suite: <N> files pass. `npm run typecheck` and `npm run build` clean.

## How to verify
See "Manual acceptance" in docs/superpowers/plans/2026-09-26-desktop-app.md Task 10. Results: <paste>.

## Not in this PR
Signing/notarization, auto-update, sync, iPhone, hardware bridge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Fill `<N>` and `<paste>`; bind the PR to the app's PR bar (ccd_pr `get_status` / `bind_pr`).

- [ ] **Step 4: After merge (when Willie says)**

```bash
gh pr merge --squash --delete-branch && git checkout dev && git pull --ff-only
```

Then take down the Cloudflare deploy by hand whenever the web users have had their window.
