# Beta Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Thoughts to beta testers as a Developer-ID-signed, notarized, universal DMG on GitHub Releases, with an in-app updater so later builds install themselves.

**Architecture:** A tag-triggered GitHub Actions workflow runs the official `tauri-apps/tauri-action`, which builds a universal binary, signs and notarizes it with secrets, creates the release, and attaches the DMG plus the updater bundle and `latest.json`. The app gains the updater and opener plugins, a small update strip above the library, a release CSP, and a locally bundled Newsreader font. `package.json` becomes the single version source.

**Tech Stack:** Tauri 2 (`tauri-plugin-updater` 2.12, `tauri-plugin-process` 2.3, `tauri-plugin-opener` 2.5), `tauri-apps/tauri-action@action-v1.0.0`, GitHub Actions `macos-latest`, Vitest. Spec: `docs/superpowers/specs/2026-09-26-beta-distribution-design.md`.

**Branching:** `beta-distribution` off `dev`; PR against `dev`; then promote to `main`; the release tag goes on `main`.

**Human steps:** Task 1 (certificates, secrets) and parts of Task 9 (merging, tagging, installing) are Willie's. Everything else is code.

---

## File map

| Path | Responsibility |
|---|---|
| `app/public/fonts/Newsreader-Variable.woff2`, `Newsreader-Italic-Variable.woff2` (create) | Self-hosted font files. |
| `app/fonts.css` (create) | `@font-face` declarations, imported by the three stylesheets that use Newsreader. |
| `app/app.css`, `app/shell/hardware-study.css`, `app/shell/recorder-lab.css` (modify) | `@import "./fonts.css"` / `@import "../fonts.css"` at the top. |
| `app/index.html`, `app/hardware-lab.html`, `app/hardware-study.html` (modify) | Drop Google Fonts links. |
| `test/no-external-fonts.test.ts` (create) | Pins that no entry page references Google Fonts. |
| `app/components/SettingsKeys.tsx` (modify) | OpenAI link via the opener plugin. |
| `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` (modify) | Register opener/updater/process plugins and permissions; metadata. |
| `src-tauri/tauri.conf.json` (modify) | version → package.json, targets app+dmg, updater artifacts, CSP, updater plugin config, minimum macOS. |
| `app/lib/updater.ts` (create) | `checkForUpdate`, `installUpdate`, pure `updateStripState` reducer. |
| `test/updater.test.ts` (create) | Reducer + wrappers with the plugin mocked. |
| `app/shell/UpdateStrip.tsx`, `app/shell/update-strip.css` (create) | The strip UI. |
| `app/shell/LibraryFeed.tsx` (modify) | Optional `strip` slot. |
| `app/App.tsx` (modify) | Check once after boot; pass strip; Settings hook. |
| `app/shell/SettingsPage.tsx` (modify) | "Check for updates" card. |
| `.github/workflows/release.yml` (create) | Tag-triggered signed release. |
| `README.md` (modify) | Release procedure. |

---

### Task 1: One-time signing setup (Willie)

No repo changes. Do these once; the plan cannot proceed to Task 9 without them, but Tasks 2–8 do not depend on them.

- [ ] **Step 1: Developer ID Application certificate.** Xcode → Settings → Accounts → select the team `JH32293684` → Manage Certificates… → "+" → **Developer ID Application**. Confirm it exists:

```bash
security find-identity -v -p codesigning
```
Expected: a line containing `"Developer ID Application: William Fineberg (JH32293684)"`. Copy that exact quoted name; it is the `APPLE_SIGNING_IDENTITY` secret.

- [ ] **Step 2: Export the certificate.** Keychain Access → login keychain → My Certificates → right-click the Developer ID Application certificate → Export… → format `.p12`, save as `~/Desktop/thoughts-devid.p12`, set a password (this is `APPLE_CERTIFICATE_PASSWORD`). Then:

```bash
base64 -i ~/Desktop/thoughts-devid.p12 | pbcopy
```
The clipboard now holds `APPLE_CERTIFICATE`. Delete the `.p12` from the Desktop after adding the secret.

- [ ] **Step 3: App-specific password.** appleid.apple.com → Sign-In and Security → App-Specific Passwords → "+" → name it "Thoughts notarization". The generated password is `APPLE_PASSWORD`. Your Apple ID email is `APPLE_ID`. `APPLE_TEAM_ID` is `JH32293684`.

- [ ] **Step 4: Updater key pair** (once, ever; back the private key up outside this Mac):

```bash
cd "/Users/willie/Documents/Claude/Voice Recorder" && npx tauri signer generate -w ~/.tauri/thoughts.key
```
It asks for a password (this is `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; it may be empty, but set one). It prints the **public** key; it is also saved at `~/.tauri/thoughts.key.pub`. `TAURI_SIGNING_PRIVATE_KEY` is the full contents of `~/.tauri/thoughts.key` (`cat ~/.tauri/thoughts.key | pbcopy`). Tell Claude when this exists; Task 6 reads the public key from `~/.tauri/thoughts.key.pub` and commits it.

- [ ] **Step 5: Add the eight repository secrets** at https://github.com/willieshaw/walking-voice-recorder/settings/secrets/actions: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Verify the names:

```bash
gh secret list --repo willieshaw/walking-voice-recorder
```
Expected: the eight names listed (values are never shown).

---

### Task 2: Branch, bundled Newsreader font

**Files:** create `app/public/fonts/Newsreader-Variable.woff2`, `app/public/fonts/Newsreader-Italic-Variable.woff2`, `app/fonts.css`, `test/no-external-fonts.test.ts`; modify `app/app.css`, `app/shell/hardware-study.css`, `app/shell/recorder-lab.css`, `app/index.html`, `app/hardware-lab.html`, `app/hardware-study.html`.

- [ ] **Step 1: Branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b beta-distribution
```

- [ ] **Step 2: Write the failing test**

```ts
// test/no-external-fonts.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The desktop app must render offline and make no request to Google on launch: every entry
// page uses the self-hosted Newsreader files declared in app/fonts.css.
const pages = ["app/index.html", "app/hardware-lab.html", "app/hardware-study.html"];

describe("entry pages load no external fonts", () => {
  for (const page of pages) {
    it(`${page} has no fonts.googleapis / fonts.gstatic reference`, () => {
      const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
      expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    });
  }
  it("fonts.css declares the local Newsreader faces and every Newsreader stylesheet imports it", () => {
    const css = readFileSync(new URL("../app/fonts.css", import.meta.url), "utf8");
    expect(css).toMatch(/@font-face[\s\S]*font-family: "Newsreader"[\s\S]*fonts\/Newsreader-Variable\.woff2/);
    expect(css).toMatch(/fonts\/Newsreader-Italic-Variable\.woff2/);
    for (const sheet of ["app/app.css", "app/shell/hardware-study.css", "app/shell/recorder-lab.css"]) {
      expect(readFileSync(new URL(`../${sheet}`, import.meta.url), "utf8")).toMatch(/@import "\.{1,2}\/fonts\.css";/);
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run test/no-external-fonts.test.ts` → 4 failures (three pages still reference Google; `app/fonts.css` does not exist).

- [ ] **Step 4: Download the font files** (Newsreader is OFL-licensed; these are Google's latin-subset variable files, regular and italic, covering opsz 6–72 and weight 200–800):

```bash
mkdir -p app/public/fonts
curl -sSL -o app/public/fonts/Newsreader-Variable.woff2 "https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjIJFJpc.woff2"
curl -sSL -o app/public/fonts/Newsreader-Italic-Variable.woff2 "https://fonts.gstatic.com/s/newsreader/v26/cY9CfjOCX1hbuyalUrK439vCjohCBJWxZA.woff2"
file app/public/fonts/*.woff2 && ls -la app/public/fonts
```
Expected: both files reported as `Web Open Font Format (Version 2)`, roughly 130–150 KB each. If a URL 404s (Google rotates `v26`), fetch the current ones: `curl -s -A "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15" "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&display=swap"` and take the `src: url(...)` of the `/* latin */` block for `font-style: normal` and `font-style: italic`.

- [ ] **Step 5: Declare the faces** — create `app/fonts.css`:

```css
/* Self-hosted Newsreader (OFL). Variable axes: opsz 6–72, wght 200–800. Served from
   app/public/fonts so the app renders offline and makes no request to Google on launch.
   Imported by every stylesheet that sets font-family: Newsreader. */
@font-face {
  font-family: "Newsreader";
  font-style: normal;
  font-weight: 200 800;
  font-display: swap;
  src: url("/fonts/Newsreader-Variable.woff2") format("woff2");
}
@font-face {
  font-family: "Newsreader";
  font-style: italic;
  font-weight: 200 800;
  font-display: swap;
  src: url("/fonts/Newsreader-Italic-Variable.woff2") format("woff2");
}
```

Then add, as the very first line, `@import "./fonts.css";` to `app/app.css` and `@import "../fonts.css";` to `app/shell/hardware-study.css` and `app/shell/recorder-lab.css` (the lab pages don't load `app.css`). Vite inlines CSS `@import`s at build time.

- [ ] **Step 6: Remove the Google links** from `app/index.html` (the two `<link rel="preconnect">` and the stylesheet `<link>`), and the equivalent lines from `app/hardware-lab.html` and `app/hardware-study.html`.

- [ ] **Step 7: Verify**

Run: `npx vitest run test/no-external-fonts.test.ts` → 4 passed. `npm run typecheck` clean. `npx vite build` ok, and `ls dist/fonts` shows both files. Then `source "$HOME/.cargo/env" && npm run dev`: the library title renders in Newsreader (compare against a system serif by toggling Wi-Fi off first if convenient). Quit the app.

- [ ] **Step 8: Commit**

```bash
git add app/public/fonts app/fonts.css app/app.css app/shell/hardware-study.css app/shell/recorder-lab.css app/index.html app/hardware-lab.html app/hardware-study.html test/no-external-fonts.test.ts
git commit -m "Fonts: bundle Newsreader locally

The desktop app fetched its serif from Google Fonts on every launch, which fails
offline and contradicts the app's only-talks-to-OpenAI story. The two variable files
(regular, italic; OFL) now ship in the bundle.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Opener plugin for external links

**Files:** modify `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `app/components/SettingsKeys.tsx`, `package.json`.

- [ ] **Step 1: Install**

```bash
npm install @tauri-apps/plugin-opener@^2
```
In `src-tauri/Cargo.toml` `[dependencies]` add `tauri-plugin-opener = "2"`. In `src-tauri/src/lib.rs` add `.plugin(tauri_plugin_opener::init())` after the dialog plugin line. In `src-tauri/capabilities/default.json` `permissions` add:

```json
    {
      "identifier": "opener:allow-open-url",
      "allow": [{ "url": "https://platform.openai.com/*" }]
    }
```

- [ ] **Step 2: Route the link through the opener** — in `app/components/SettingsKeys.tsx` add `import { openUrl } from "@tauri-apps/plugin-opener";` and replace the anchor with:

```tsx
        <a
          href="https://platform.openai.com/api-keys"
          onClick={(e) => {
            e.preventDefault(); // a plain target=_blank does nothing inside the Tauri window
            void openUrl("https://platform.openai.com/api-keys");
          }}
        >
          Get an OpenAI key →
        </a>
```
Grep for any other external anchor in `app/` (`grep -rn 'href="https\?://' app --include=*.tsx`); treat each the same way, adding its origin to the opener scope.

- [ ] **Step 3: Verify**

`npm run typecheck` clean; `cd src-tauri && source "$HOME/.cargo/env" && cargo check` finishes (new crate compiles). If `cargo check` or a later `tauri build` reports a plugin-opener npm/crate minor mismatch, pin the crate the same way `tauri-plugin-http` is pinned (`"~2.<npm minor>"`). `npm run dev`: Settings → click "Get an OpenAI key →" → the default browser opens the page. Quit.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json app/components/SettingsKeys.tsx
git commit -m "Desktop: open external links in the browser via the opener plugin

Inside the Tauri window a target=_blank anchor does nothing, so the 'Get an OpenAI
key' link was dead. It now opens the system browser, scoped to platform.openai.com.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Bundle config, single version source, CSP

**Files:** modify `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (metadata).

- [ ] **Step 1: `tauri.conf.json`** — replace the whole file with (the `plugins.updater` block is added in Task 6; leave it out here):

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Thoughts",
  "version": "../package.json",
  "identifier": "com.willieshaw.thoughts",
  "build": {
    "beforeDevCommand": "npm run dev:web",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build:web",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Thoughts",
        "width": 1200,
        "height": 820,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src ipc: http://ipc.localhost blob:; base-uri 'self'; object-src 'none'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "createUpdaterArtifacts": true,
    "macOS": {
      "minimumSystemVersion": "10.15"
    },
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
Notes: OpenAI is deliberately absent from `connect-src` (those calls go over IPC via the http plugin). `media-src blob:` keeps audio playback (object URLs) working; `img-src data:` covers inline SVG data URIs if any. The `android` block is gone.

- [ ] **Step 2: `Cargo.toml` metadata** — set `description = "Thoughts: local-first voice notes"`, `authors = ["Willie Shaw"]`, leave `version = "0.1.0"` with a comment `# not the shipped version: tauri.conf.json reads package.json`.

- [ ] **Step 3: Verify the CSP doesn't break the app.** `source "$HOME/.cargo/env" && npm run dev`: open a note → audio plays (blob URL under `media-src`), transcript renders, the mini waveforms render (inline `style=` attributes need `style-src 'unsafe-inline'`), Settings renders, fonts render. Right-click → Inspect Element → Console: no CSP violation lines. Quit. Then `npm run build` → bundle succeeds and `src-tauri/target/release/bundle/dmg/Thoughts_0.1.0_universal.dmg` or `Thoughts_0.1.0_aarch64.dmg` exists (local builds are single-arch unless you pass `--target universal-apple-darwin`; the workflow passes it). `plutil -p src-tauri/target/release/bundle/macos/Thoughts.app/Contents/Info.plist | grep -E "LSMinimumSystemVersion|CFBundleShortVersionString"` shows `10.15` and `0.1.0` (read from package.json).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Desktop: DMG target, package.json as the version source, release CSP

The bundle now produces a DMG alongside the .app and emits updater artifacts; the
app version comes from package.json so one bump covers everything; and the webview
is locked to itself by a CSP (blob audio and Tauri IPC allowed, OpenAI reached only
through the http plugin over IPC).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Updater module with tests

**Files:** create `app/lib/updater.ts`, `test/updater.test.ts`; modify `package.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`.

- [ ] **Step 1: Install plugins**

```bash
npm install @tauri-apps/plugin-updater@^2 @tauri-apps/plugin-process@^2
```
`Cargo.toml` `[dependencies]`: `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"`. `lib.rs`: add `.plugin(tauri_plugin_updater::Builder::new().build())` and `.plugin(tauri_plugin_process::init())`. Capabilities: add `"updater:default"` and `"process:default"`.

- [ ] **Step 2: Write the failing test**

```ts
// test/updater.test.ts
import { describe, expect, it, vi } from "vitest";

// The plugin modules touch Tauri globals; mock them before importing the module under test.
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(async () => undefined),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import { checkForUpdate, installUpdate, updateStripState } from "../app/lib/updater.js";

describe("updateStripState (pure)", () => {
  it("is hidden when there is no update or it was dismissed", () => {
    expect(updateStripState(null, { phase: "idle" })).toEqual({ kind: "hidden" });
    expect(updateStripState({ version: "0.2.0-beta.2" }, { phase: "dismissed" })).toEqual({ kind: "hidden" });
  });
  it("offers the update when idle", () => {
    expect(updateStripState({ version: "0.2.0-beta.2" }, { phase: "idle" })).toEqual({
      kind: "available",
      version: "0.2.0-beta.2",
    });
  });
  it("reports progress while downloading, as a whole percent or null when size is unknown", () => {
    expect(updateStripState({ version: "v" }, { phase: "downloading", received: 50, total: 200 })).toEqual({
      kind: "downloading",
      version: "v",
      percent: 25,
    });
    expect(updateStripState({ version: "v" }, { phase: "downloading", received: 50, total: null })).toEqual({
      kind: "downloading",
      version: "v",
      percent: null,
    });
  });
  it("surfaces an error with the message", () => {
    expect(updateStripState({ version: "v" }, { phase: "error", message: "boom" })).toEqual({
      kind: "error",
      version: "v",
      message: "boom",
    });
  });
});

describe("checkForUpdate / installUpdate (plugin wrappers)", () => {
  it("returns null when the plugin reports no update", async () => {
    mocks.check.mockResolvedValueOnce(null);
    expect(await checkForUpdate()).toBeNull();
  });
  it("returns the version and keeps the plugin handle", async () => {
    const handle = { version: "0.2.0-beta.2", downloadAndInstall: vi.fn() };
    mocks.check.mockResolvedValueOnce(handle);
    const u = await checkForUpdate();
    expect(u).toEqual({ version: "0.2.0-beta.2", handle });
  });
  it("rejects when the check itself fails (caller shows the error)", async () => {
    mocks.check.mockRejectedValueOnce(new Error("offline"));
    await expect(checkForUpdate()).rejects.toThrow("offline");
  });
  it("installUpdate streams progress, then relaunches", async () => {
    const events: unknown[] = [];
    const handle = {
      version: "v",
      downloadAndInstall: vi.fn(async (cb: (e: unknown) => void) => {
        cb({ event: "Started", data: { contentLength: 100 } });
        cb({ event: "Progress", data: { chunkLength: 40 } });
        cb({ event: "Progress", data: { chunkLength: 60 } });
        cb({ event: "Finished" });
      }),
    };
    await installUpdate({ version: "v", handle }, (p) => events.push(p));
    expect(events).toEqual([
      { received: 0, total: 100 },
      { received: 40, total: 100 },
      { received: 100, total: 100 },
    ]);
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run it and watch it fail** — `npx vitest run test/updater.test.ts` → cannot resolve `../app/lib/updater.js`.

- [ ] **Step 4: Implement**

```ts
// app/lib/updater.ts
// In-app updates: check GitHub Releases (the endpoint is in tauri.conf.json) once after boot
// and on demand from Settings; install only when the user clicks. The plugin verifies the
// bundle's signature against the public key in the config before installing.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface AvailableUpdate {
  version: string;
  /** The plugin's handle; opaque to the UI. */
  handle: Pick<Update, "version" | "downloadAndInstall">;
}

export interface Progress {
  received: number;
  /** Bytes expected, or null when the server didn't say. */
  total: number | null;
}

export type StripPhase =
  | { phase: "idle" }
  | { phase: "dismissed" }
  | { phase: "downloading"; received: number; total: number | null }
  | { phase: "error"; message: string };

export type StripState =
  | { kind: "hidden" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "error"; version: string; message: string };

/** What the strip shows for a given update + phase. Pure. */
export function updateStripState(
  update: { version: string } | null,
  phase: StripPhase,
): StripState {
  if (!update || phase.phase === "dismissed") return { kind: "hidden" };
  switch (phase.phase) {
    case "idle":
      return { kind: "available", version: update.version };
    case "downloading":
      return {
        kind: "downloading",
        version: update.version,
        percent: phase.total ? Math.floor((phase.received / phase.total) * 100) : null,
      };
    case "error":
      return { kind: "error", version: update.version, message: phase.message };
  }
}

/** Resolves null when the running version is current. Rejects on network/manifest errors. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const u = await check();
  return u ? { version: u.version, handle: u } : null;
}

/** Download, verify, install, then relaunch into the new version. */
export async function installUpdate(
  update: AvailableUpdate,
  onProgress: (p: Progress) => void,
): Promise<void> {
  let received = 0;
  let total: number | null = null;
  await update.handle.downloadAndInstall((e) => {
    if (e.event === "Started") {
      total = e.data.contentLength ?? null;
      onProgress({ received, total });
    } else if (e.event === "Progress") {
      received += e.data.chunkLength;
      onProgress({ received, total });
    }
  });
  await relaunch();
}
```
Check `node_modules/@tauri-apps/plugin-updater/dist-js/index.d.ts` for the exact `DownloadEvent` shape and `Update` method names; adapt if they differ and say so.

- [ ] **Step 5: Run** — `npx vitest run test/updater.test.ts` → 8 passed. `npm run typecheck` clean. `cd src-tauri && source "$HOME/.cargo/env" && cargo check` ok.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json app/lib/updater.ts test/updater.test.ts
git commit -m "Updater: plugin wiring and a tested check/install module

Registers the updater and process plugins and adds a small module the UI drives:
checkForUpdate, installUpdate (progress callback, then relaunch), and a pure
reducer for what the update strip shows.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Updater endpoint and public key

**Files:** modify `src-tauri/tauri.conf.json`. **Depends on Task 1 Step 4** (the key pair).

- [ ] **Step 1: Read the public key** (never the private one):

```bash
cat ~/.tauri/thoughts.key.pub
```

- [ ] **Step 2: Add the plugin block** to `tauri.conf.json` as a top-level sibling of `app`/`bundle`:

```json
  "plugins": {
    "updater": {
      "pubkey": "<paste the exact contents of thoughts.key.pub>",
      "endpoints": [
        "https://github.com/willieshaw/walking-voice-recorder/releases/latest/download/latest.json"
      ]
    }
  }
```

- [ ] **Step 3: Verify** — `npx tauri build --debug 2>&1 | tail -5` fails fast if the pubkey is malformed; a debug build otherwise completes (no signing key is needed for a debug build; `createUpdaterArtifacts` will warn that no signing key is set — expected locally).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "Updater: GitHub Releases endpoint and public key

Installs verify every update bundle against this key before installing; the private
half lives only in CI secrets and Willie's backup.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Update strip, library slot, Settings check

**Files:** create `app/shell/UpdateStrip.tsx`, `app/shell/update-strip.css`; modify `app/shell/LibraryFeed.tsx`, `app/App.tsx`, `app/shell/SettingsPage.tsx`.

- [ ] **Step 1: The strip**

```tsx
// app/shell/UpdateStrip.tsx
// "A new version is ready": one button, progress while it downloads, error inline. Driven
// entirely by the pure updateStripState so the component holds no logic of its own.
import type { StripState } from "../lib/updater";
import "./update-strip.css";

export function UpdateStrip({
  state,
  onInstall,
  onDismiss,
}: {
  state: StripState;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  if (state.kind === "hidden") return null;
  return (
    <div className="update-strip" role="status">
      {state.kind === "available" && (
        <>
          <span>Thoughts {state.version} is ready.</span>
          <button className="ghost-btn" onClick={onInstall}>
            Restart to update
          </button>
          <button className="update-strip-close" onClick={onDismiss} aria-label="Not now">
            ×
          </button>
        </>
      )}
      {state.kind === "downloading" && (
        <span>
          Downloading Thoughts {state.version}
          {state.percent === null ? "…" : ` · ${state.percent}%`}
        </span>
      )}
      {state.kind === "error" && (
        <>
          <span className="error">Update failed: {state.message}</span>
          <button className="ghost-btn" onClick={onInstall}>
            Retry
          </button>
          <button className="update-strip-close" onClick={onDismiss} aria-label="Not now">
            ×
          </button>
        </>
      )}
    </div>
  );
}
```

```css
/* app/shell/update-strip.css — same family as the old export banner. */
.update-strip {
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
.update-strip > span:first-child {
  flex: 1;
  min-width: 200px;
}
.update-strip .ghost-btn {
  background: var(--surface);
}
.update-strip-close {
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 17px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
}
.update-strip-close:hover {
  color: var(--text);
  background: rgba(37, 99, 235, 0.1);
}
```

- [ ] **Step 2: LibraryFeed slot** — add `import type { ReactNode } from "react";`, a prop `strip?: ReactNode` documented as "Optional notice rendered above the heading, inside the reading column.", and render `{strip}` as the first child of `.lf-page`.

- [ ] **Step 3: App wiring** (`app/App.tsx`, surgical `Edit`s; the file has non-UTF-8 bytes, use `grep -a`):
- Imports: `import { UpdateStrip } from "./shell/UpdateStrip";` and `import { checkForUpdate, installUpdate, updateStripState, type AvailableUpdate, type StripPhase } from "./lib/updater";`
- State near `booted`:
```ts
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [updatePhase, setUpdatePhase] = useState<StripPhase>({ phase: "idle" });
```
- In the boot effect's `.finally`, after `setBooted(true)`, kick off one check that never blocks or errors the UI:
```ts
      .finally(() => {
        setBooted(true);
        checkForUpdate().then(setUpdate, () => undefined); // silent at launch; Settings reports errors
      });
```
- Two handlers next to the other handlers:
```ts
  async function handleInstallUpdate() {
    if (!update) return;
    setUpdatePhase({ phase: "downloading", received: 0, total: null });
    try {
      await installUpdate(update, (p) => setUpdatePhase({ phase: "downloading", ...p }));
    } catch (e) {
      setUpdatePhase({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }
  /** Settings' manual check: resolves a human-readable line for the card. */
  async function handleCheckForUpdates(): Promise<string> {
    const u = await checkForUpdate();
    setUpdate(u);
    setUpdatePhase({ phase: "idle" });
    return u ? `Thoughts ${u.version} is ready — see the library.` : "You're on the latest version.";
  }
```
- Library render: pass `strip={<UpdateStrip state={updateStripState(update, updatePhase)} onInstall={() => void handleInstallUpdate()} onDismiss={() => setUpdatePhase({ phase: "dismissed" })} />}` to `LibraryFeed`.
- Settings render: pass `onCheckForUpdates={handleCheckForUpdates}` and `appVersion={__APP_VERSION__}` where `__APP_VERSION__` is defined by Vite: in `vite.config.ts` add `define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) }` and in `app/vite-env.d.ts` add `declare const __APP_VERSION__: string;`.

- [ ] **Step 4: Settings card** — `SettingsPage` gains props `appVersion: string` and `onCheckForUpdates: () => Promise<string>`, state `const [updateStatus, setUpdateStatus] = useState<string | null>(null); const [checking, setChecking] = useState(false);`, and a new section after Backup:

```tsx
      <div className="sp-section-head">
        <div>
          <div className="sp-section-label">Updates</div>
          <div className="sp-section-count">Thoughts {appVersion}</div>
        </div>
      </div>
      <div className="sp-card sp-backup">
        <div className="sp-backup-main">
          <div className="sp-backup-title">Check for updates</div>
          <div className="sp-backup-sub">
            New builds install in place and restart the app. Thoughts also checks once at launch.
          </div>
        </div>
        <button
          className="sp-backup-btn sp-backup-primary"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            setUpdateStatus(null);
            onCheckForUpdates()
              .then(setUpdateStatus, (e: unknown) =>
                setUpdateStatus(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setChecking(false));
          }}
        >
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>
      {updateStatus && <p className="sp-backup-status">{updateStatus}</p>}
```

- [ ] **Step 5: Verify** — `npm run typecheck` clean; `npm test` all pass; `npm run dev`: Settings shows "Thoughts 0.1.0"; "Check now" reports either "You're on the latest version." (no release yet → the plugin may instead reject with a 404 on `latest.json`; that message is shown in the card and is acceptable until the first release exists). Library shows no strip. Quit.

- [ ] **Step 6: Commit**

```bash
git add app/shell/UpdateStrip.tsx app/shell/update-strip.css app/shell/LibraryFeed.tsx app/App.tsx app/shell/SettingsPage.tsx vite.config.ts app/vite-env.d.ts
git commit -m "Updater: strip above the library and a Check for updates card

One launch-time check, a one-click 'Restart to update' with progress, errors inline,
and a manual check in Settings that also shows the running version.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Release workflow and README

**Files:** create `.github/workflows/release.yml`; modify `README.md`.

- [ ] **Step 1: Workflow**

```yaml
# .github/workflows/release.yml
# Push a tag like v0.2.0-beta.1 (on main) and this builds a universal, Developer-ID-signed,
# notarized Thoughts.app + DMG, publishes the GitHub release, and attaches the updater
# bundle and latest.json that running apps poll.
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - run: npm ci
      - run: npm run typecheck
      - run: npm test

      - uses: tauri-apps/tauri-action@action-v1.0.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Thoughts ${{ github.ref_name }}"
          releaseBody: "Download the DMG, drag Thoughts to Applications. Existing installs update themselves."
          releaseDraft: false
          prerelease: false
          uploadUpdaterJson: true
          args: --target universal-apple-darwin
```
Confirm input names against `https://github.com/tauri-apps/tauri-action/blob/action-v1.0.0/action.yml` (`gh api repos/tauri-apps/tauri-action/contents/action.yml?ref=action-v1.0.0 --jq .content | base64 -d | grep -E "^  [a-zA-Z]+:"`). Adjust if any differs and report.

- [ ] **Step 2: README** — add a "Releasing a beta" section after "Building the Mac app":

```markdown
## Releasing a beta

1. On a branch off `dev`: `npm version 0.2.0-beta.N --no-git-tag-version`, commit, PR into `dev`, merge, promote `dev` to `main`.
2. Tag the promoted commit on `main`: `git tag v0.2.0-beta.N <sha> && git push origin v0.2.0-beta.N`.
3. The Release workflow builds a universal, signed, notarized DMG and publishes the GitHub release with the updater manifest. Running apps offer the update on next launch.

Betas are published as ordinary releases (not "pre-release") because the updater endpoint uses the repository's `latest` release.
```

- [ ] **Step 3: Verify the YAML parses** — `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/release.yml'))" && echo ok` (or `npx --yes yaml-lint .github/workflows/release.yml`). `npm test` still green.

- [ ] **Step 4: Commit and open the PR**

```bash
git add .github/workflows/release.yml README.md
git commit -m "Release: tag-triggered signed, notarized universal DMG on GitHub Releases

tauri-action builds for both Apple architectures, signs with the Developer ID
certificate, notarizes, publishes the release, and attaches the DMG plus the updater
bundle and latest.json. README documents the beta release procedure.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin beta-distribution
gh pr create --base dev --title "Beta distribution: signed DMG releases and in-app updates" --body "$(cat <<'BODY'
## Context
Spec: docs/superpowers/specs/2026-09-26-beta-distribution-design.md. The Mac app built ad-hoc-signed and could not be handed to testers.

## Change
- Newsreader bundled locally; no Google Fonts requests.
- Opener plugin for external links (the OpenAI key link was dead in the Tauri window).
- DMG target, updater artifacts, release CSP, package.json as the single version source.
- Updater plugin + tested module, update strip above the library, Check for updates in Settings.
- `.github/workflows/release.yml`: on a `v*` tag, universal build, Developer ID signing, notarization, GitHub release with DMG + latest.json.

## Tests
- `test/no-external-fonts.test.ts` (4), `test/updater.test.ts` (8), all failed first.
- Full suite: <N> files / <M> tests; typecheck clean; `npm run build` produces the DMG locally.

## How to verify
Merge, promote to main, tag `v0.2.0-beta.1` (see README "Releasing a beta"); the workflow should publish a notarized DMG. Acceptance steps are in the plan's Task 9.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

### Task 9: First beta release and acceptance

**Requires:** Task 1 complete (secrets present), PR from Task 8 merged into `dev` and `dev` promoted to `main`.

- [ ] **Step 1: Version bump PR** — branch `release-0.2.0-beta.1` off `dev`; `npm version 0.2.0-beta.1 --no-git-tag-version`; commit `package.json` + `package-lock.json` as "Release: 0.2.0-beta.1"; PR into `dev`; merge; promote `dev` to `main` (fast-forward, as before).

- [ ] **Step 2: Tag main**

```bash
git fetch origin && git tag v0.2.0-beta.1 origin/main && git push origin v0.2.0-beta.1
```

- [ ] **Step 3: Watch the run**

```bash
gh run list --workflow release.yml --limit 1
gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: green. Typical first-run failures and fixes: certificate import (check `APPLE_CERTIFICATE` is base64 of the .p12 and the password matches); notarization rejected (read the log's notarytool output; usually a missing hardened runtime or an unsigned nested binary, both handled by the bundler when `APPLE_SIGNING_IDENTITY` is set); updater signing (the private key or its password wrong). Fix, bump to `0.2.0-beta.2` via Step 1, re-tag, repeat until green.

- [ ] **Step 4: Inspect the release**

```bash
gh release view v0.2.0-beta.1 --json assets -q '.assets[].name'
```
Expected: `Thoughts_0.2.0-beta.1_universal.dmg`, `Thoughts_0.2.0-beta.1_universal.app.tar.gz`, `Thoughts_0.2.0-beta.1_universal.app.tar.gz.sig`, `latest.json`. `curl -sL https://github.com/willieshaw/walking-voice-recorder/releases/latest/download/latest.json` shows `"version": "0.2.0-beta.1"` and a `darwin-universal` (or `darwin-aarch64`/`darwin-x86_64`) platform entry with a `url` and `signature`.

- [ ] **Step 5: Install like a tester (Willie, on this Mac)** — quit any running Thoughts; download the DMG from the release page in Safari; open it; drag Thoughts to Applications; eject; open from Applications. Expected: no Gatekeeper dialog. Then:

```bash
spctl -a -vv /Applications/Thoughts.app
codesign -dv --verbose=2 /Applications/Thoughts.app 2>&1 | grep -E "Authority|Runtime"
```
Expected: `accepted`, `source=Notarized Developer ID`; Authority lines naming Developer ID Application and Apple Root CA; `Runtime Version` present. In the app: Settings shows "Thoughts 0.2.0-beta.1"; the key is still there (Keychain item is by service/account, unaffected by the new signature; approve the one-time prompt with Always Allow if shown); notes still load from the same Application Support folder; fonts render with Wi-Fi off; "Get an OpenAI key →" opens the browser.

- [ ] **Step 6: Prove the updater** — cut `0.2.0-beta.2` (Step 1–3) with any small change (e.g. the README line). Launch the installed `0.2.0-beta.1`: the strip reads "Thoughts 0.2.0-beta.2 is ready." → Restart to update → progress → the app relaunches and Settings shows `0.2.0-beta.2`. Also confirm Settings → Check now on the new build says "You're on the latest version."

- [ ] **Step 7: Hand to testers** — send the release page URL (`https://github.com/willieshaw/walking-voice-recorder/releases/latest`). The web app's "Get the Mac app" banner already points at the releases page.

- [ ] **Step 8: Record** — note the two release tags and any workflow fixes in the PR thread; update `docs/superpowers/specs/2026-09-26-beta-distribution-design.md` only if the procedure changed.
