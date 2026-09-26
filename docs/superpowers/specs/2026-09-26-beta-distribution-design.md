# Beta distribution for the Mac app — design

**Date:** 2026-09-26
**Status:** Approved design, awaiting implementation plan
**Builds on:** `2026-09-26-desktop-migration-design.md` (the Tauri app now on `dev`/`main`)

## Problem

`npm run build` produces an ad-hoc-signed `Thoughts.app`. Gatekeeper blocks unsigned downloads on
current macOS, so the build cannot be handed to anyone. Beta testers need an app that opens
without warnings and that updates itself when a new build ships.

## Decisions taken

| Question | Decision |
|---|---|
| Channel | Developer ID signed + notarized **DMG on GitHub Releases**, with Tauri's in-app **updater**. Not TestFlight (sandboxing, beta review, 90-day expiry). |
| Build host | **GitHub Actions** on a `v*` tag, using the official `tauri-apps/tauri-action`. |
| Architectures | **Universal** binary (Apple Silicon + Intel). |
| Release flag | Betas are published as **ordinary releases** (not "pre-release") with beta version numbers, because GitHub's `releases/latest` pointer, which the updater endpoint uses, skips pre-releases. |
| Version source | **`package.json` is the single version**; `tauri.conf.json` reads it (`"version": "../package.json"`). `src-tauri/Cargo.toml` keeps a static `0.1.0` and is not the shipped version. |
| Icon | Default Tauri icon unless Willie supplies 1024-px artwork; then `tauri icon` regenerates the set. |
| Repository visibility | **Public.** The updater endpoint and release downloads are plain GitHub URLs, which a private repo would put behind a login. Decided 2026-09-26. |

Facts the design relies on: the app does not capture audio itself (no microphone entitlement or
usage description needed); the only external URLs are Google Fonts (to be removed) and the
OpenAI "get a key" link; the Developer Team ID is `L95DSGCT97`; an `Apple Development`
certificate exists on Willie's Mac but no `Developer ID Application` certificate yet.

## 1. One-time setup (Willie, outside the repo)

Written as a checklist in the plan with exact commands. In short:

1. **Developer ID Application certificate.** Xcode → Settings → Accounts → Manage Certificates →
   "+" → Developer ID Application. It lands in the login keychain.
2. **Export it** from Keychain Access as a `.p12` with a password. Base64-encode the file.
3. **App-specific password** for notarization at appleid.apple.com.
4. **Updater key pair.** Generated once with `npx tauri signer generate -w ~/.tauri/thoughts.key`
   (password-protected). The **public** key is committed in `tauri.conf.json`; the **private** key
   and its password become secrets. Losing the private key means existing installs can never
   accept another update, so it is backed up outside the machine.
5. **Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | base64 of the `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: William Fineberg (L95DSGCT97)` (exact name from `security find-identity -v -p codesigning`) |
| `APPLE_ID` | the Apple ID email |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | `L95DSGCT97` |
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/thoughts.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password |

None of these values ever enter the repo, the plan, or chat.

## 2. App configuration (`src-tauri/tauri.conf.json`, `Cargo.toml`, capabilities)

- `version`: `"../package.json"`.
- `bundle.targets`: `["app", "dmg"]`; `bundle.createUpdaterArtifacts: true`;
  `bundle.macOS.minimumSystemVersion: "10.15"`. The stray `bundle.android` block is removed.
  `Cargo.toml` scaffold metadata (`description`, `authors`) is filled in.
- `plugins.updater`: `{ "pubkey": "<committed public key>", "endpoints":
  ["https://github.com/willieshaw/walking-voice-recorder/releases/latest/download/latest.json"] }`.
- Rust: `tauri-plugin-updater`, `tauri-plugin-process`, `tauri-plugin-opener` registered in
  `lib.rs`. No new commands.
- Capabilities add `updater:default`, `process:default`, and `opener:allow-open-url` scoped to
  `https://platform.openai.com/*`.
- **CSP** (release): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src ipc:
  http://ipc.localhost blob:; base-uri 'self'; object-src 'none'`. Tauri adds its own script
  hashes. `connect-src` lists `blob:` because the waveform code `fetch()`es blob URLs (WebKit
  doesn't enforce CSP on that today, but the policy should state it). OpenAI is not in
  `connect-src` on purpose: those requests go through the http plugin over IPC, not the webview's
  fetch.
- Signing: hardened runtime (the bundler's default when an identity is set); no custom
  entitlements file.

## 3. Updater in the app

- `app/lib/updater.ts`: `checkForUpdate(): Promise<UpdateInfo | null>` wrapping the plugin's
  `check()`, and `installUpdate(update, onProgress)` wrapping `downloadAndInstall()` then
  `relaunch()`. Pure state reducer `updateBannerState(check, phase)` for the strip, unit-tested
  with the plugin mocked (states: hidden, available, downloading with percent, error).
- `app/shell/UpdateStrip.tsx` (+ css, same visual family as the old export banner): rendered
  above the library feed via a new optional `strip` slot on `LibraryFeed`. Copy: "Thoughts
  {version} is ready." with one button **Restart to update**; shows download progress; shows the
  error message inline on failure and offers Retry. Never blocks the app; dismissible for the
  session.
- `App.tsx` calls `checkForUpdate()` once after boot (after the Keychain read settles) and holds
  the result in state. Settings gains a **Check for updates** button that runs the same check and
  reports "You're on the latest version" or surfaces the strip.
- No silent installs, no background timers.

## 4. Release workflow (`.github/workflows/release.yml`)

- Trigger: `push` of tags matching `v*`.
- Runner: `macos-latest`. Steps: checkout; Node 22 + `npm ci`; Rust stable with
  `aarch64-apple-darwin` and `x86_64-apple-darwin`; `npm run typecheck && npm test`;
  `tauri-apps/tauri-action@action-v1.0.0` (pinned tag) with `args: --target universal-apple-darwin`,
  `tagName: ${{ github.ref_name }}`, `releaseName: "Thoughts ${{ github.ref_name }}"`,
  `releaseDraft: false`, `prerelease: false`, `uploadUpdaterJson: true`, and the eight secrets
  as `env`. The action signs, notarizes, creates the release, and attaches the DMG, the
  `.app.tar.gz` updater bundle with its `.sig`, and `latest.json`.
- `GITHUB_TOKEN` needs `contents: write` (declared in the workflow `permissions`).

## 5. Cutting a release

1. Work lands on `dev` via PRs as usual; `dev` is promoted to `main`.
2. A release branch bumps the version without tagging: `npm version 0.2.0-beta.1
   --no-git-tag-version`, PR into `dev`, merge, promote to `main`.
3. Tag the promoted commit on `main`: `git tag v0.2.0-beta.1 <sha> && git push origin
   v0.2.0-beta.1`. (Tagging is not a commit, so this respects "never commit on main".)
4. The workflow produces the release. Testers on any older version are offered it on next launch.

Version numbers: `0.2.0-beta.N` during the beta, `0.2.0` for the first general release. The
updater compares semver, so betas order correctly and `0.2.0` supersedes every `0.2.0-beta.N`.

## 6. Fixes that ship with the first beta

- **Local Newsreader.** The variable font files (regular + italic, OFL-licensed) live under
  `app/public/fonts/`, declared with `@font-face` in `app/app.css`; the Google Fonts `<link>`s
  are removed from all three HTML entry pages.
- **Opener for external links.** The "Get an OpenAI key →" link calls `openUrl()` from the
  opener plugin (a plain `target="_blank"` does nothing in the Tauri window). Any other external
  `<a>` found during implementation gets the same treatment.
- **CSP** as in §2.

## 7. What testers experience

Download the DMG from the release page (the web app's "Get the Mac app" banner link already
points at releases), drag Thoughts to Applications, open it: no Gatekeeper dialog. The Keychain
prompt, if any, appears once because the signed app's identity is stable. New builds show up
as the in-app strip; one click restarts into the new version.

## 8. Testing

- Unit: `test/updater.test.ts` for the state reducer and the check/install wrappers with the
  plugin mocked (available / none / error / progress).
- Workflow: proven by the first tag. The plan's last task cuts `v0.2.0-beta.1`, watches the
  run, fixes and re-tags (`v0.2.0-beta.2`, …) until a notarized DMG is attached.
- Manual acceptance on this Mac: download the DMG from the release page, install, `spctl -a -vv
  /Applications/Thoughts.app` reports accepted with source "Notarized Developer ID", app opens
  with no dialog, fonts render offline, the OpenAI link opens the browser; then cut the next beta
  and confirm the running app shows the strip, installs, and relaunches on the new version.

## 9. Out of scope

TestFlight, Mac App Store, crash reporting or analytics, custom icon artwork (unless supplied),
Windows/Linux, background update timers, delta updates.
