# Hardware Track Split Implementation Plan

> **For agentic workers:** This plan is executed by the controller directly (history rewrite; every step verifies before the next). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the standalone-recorder hardware track into a new private repository with its history, purge those paths from this repository's history, and make this repository public.

**Architecture:** Two throwaway clones under the session scratchpad: one filtered to the hardware paths and pushed to `willieshaw/thoughts-recorder`; one filtered to exclude them and force-pushed over `main`, `dev`, `beta-distribution`. A follow-up PR fixes the few references the app kept. Spec: `docs/superpowers/specs/2026-09-26-hardware-split-design.md`.

**Tech Stack:** `git filter-repo` (Homebrew), `gh`.

**Path list** (used verbatim in both filters):
```
PRODUCT_SPEC.md
CAD_PROTOTYPE_SPEC.md
cad
app/hardware-lab.html
app/hardware-lab.css
app/hardware-study.html
app/hardwareLab.tsx
app/hardwareStudy.tsx
app/shell/RecorderLab.tsx
app/shell/HardwareStudy.tsx
app/shell/recorder-lab.css
app/shell/hardware-study.css
src/core/recorder.ts
test/recorder.test.ts
output
```

---

### Task 1: Preconditions

- [ ] Working tree clean on every branch; `beta-distribution` local tip recorded (`git rev-parse beta-distribution`).
- [ ] Remove the two stale worktrees: `git worktree remove --force .claude/worktrees/cranky-bell-7c3c1b` and `…/distracted-elbakyan-c983ef`; `git worktree prune`; delete the local branch `claude/distracted-elbakyan-c983ef`.
- [ ] `gh repo view willieshaw/thoughts-recorder` fails (name free).

### Task 2: Extract the hardware history into the new private repo

- [ ] `gh repo create willieshaw/thoughts-recorder --private --description "Standalone voice recorder: product spec, CAD form study, lab UIs (split from walking-voice-recorder)"`.
- [ ] `git clone --no-local --branch dev "<this repo>" <scratch>/extract && cd <scratch>/extract && git filter-repo $(for p in <path list>; do printf -- '--path %s ' "$p"; done)` — keeps only those paths; commits that touched nothing else vanish.
- [ ] Add `README.md` explaining origin (split from walking-voice-recorder on 2026-09-26; lab pages need the Thoughts app's Vite setup to run) and commit it.
- [ ] `git remote add origin https://github.com/willieshaw/thoughts-recorder.git && git push -u origin dev:main`. Verify on GitHub: `gh api repos/willieshaw/thoughts-recorder/contents --jq '.[].name'` lists `PRODUCT_SPEC.md`, `cad`, `app`, `src`, `test`, `README.md`; `gh repo view … --json visibility -q .visibility` is `PRIVATE`.

### Task 3: Purge the paths from this repository's history

- [ ] `git clone --no-local --no-single-branch "<this repo>" <scratch>/purge && cd <scratch>/purge && for b in main dev beta-distribution; do git branch --track $b origin/$b 2>/dev/null || true; done` then `git filter-repo --invert-paths $(…same --path list…)`.
- [ ] Verify: `git log --all --name-only --format= | sort -u | grep -E '^(PRODUCT_SPEC|CAD_PROTOTYPE|cad/|app/hardware|app/shell/(RecorderLab|HardwareStudy|recorder-lab|hardware-study)|src/core/recorder|test/recorder|output/)'` prints nothing.
- [ ] For each of `main`, `dev`, `beta-distribution`: `git checkout $b && npm ci --silent && npm run typecheck && npm test`. Expected: typecheck clean; the suite passes except `test/no-external-fonts.test.ts` on `beta-distribution` (it reads the deleted lab pages) — that is the known fix-up in Task 5. Anything else failing stops the plan.
- [ ] Record the mapping of old→new tips: `git log -1 --format=%h` per branch.

### Task 4: Force-push and reset the working checkout

- [ ] From the purge clone: `git remote add origin https://github.com/willieshaw/walking-voice-recorder.git && git push --force origin main dev beta-distribution`.
- [ ] In the working checkout: `git fetch origin && for b in main dev beta-distribution; do git branch -f $b origin/$b; done && git checkout beta-distribution && git reflog expire --expire=now --all && git gc --prune=now`. Verify `git log --all --name-only --format= | grep -c PRODUCT_SPEC` is 0 and `git status` is clean.

### Task 5: Fix the references the app kept

Branch `drop-lab-references` off `dev`:
- [ ] `README.md`: delete the paragraph about `hardware-lab.html` / `hardware-study.html` and the sentence linking `PRODUCT_SPEC.md`.
- [ ] `test/no-external-fonts.test.ts`: `pages = ["app/index.html"]`; the stylesheet loop lists only `"app/app.css"`.
- [ ] `app/lib/ingest.ts` header: "the device/RecorderLab bridge" → "the device bridge".
- [ ] `.gitignore`: remove the three lines for CAD/render output (`# Generated CAD…`, `cad/output/`, `output/`).
- [ ] `npm run typecheck && npm test` green (17 files). Commit "Drop the last references to the hardware track (moved to thoughts-recorder)" with the project trailer; PR into `dev`; merge; promote `dev` to `main` (fast-forward). Rebase `beta-distribution` onto `dev` and re-run its suite (the same test-file edit applies there; resolve the trivial conflict by taking the new list).

### Task 6: Go public and verify

- [ ] `gh repo edit willieshaw/walking-voice-recorder --visibility public --accept-visibility-change-consequences`.
- [ ] Anonymous check: `cd <scratch> && GIT_TERMINAL_PROMPT=0 git -c credential.helper= clone https://github.com/willieshaw/walking-voice-recorder.git anon && cd anon && git log --all --name-only --format= | sort -u | grep -c -E 'PRODUCT_SPEC|cad/|hardware|core/recorder'` → 0; `curl -sI https://github.com/willieshaw/walking-voice-recorder/releases | head -1` → 200.
- [ ] Willie files the GitHub Support request: "Please purge unreachable objects from willieshaw/walking-voice-recorder after a history rewrite" (support.github.com → Repository → Remove data). The plan records the date.
