# Hardware track split — design

**Date:** 2026-09-26
**Status:** Approved design
**Why now:** Beta distribution (`2026-09-26-beta-distribution-design.md`) needs this repository public so release downloads and the updater manifest are plain URLs. The repository also holds the standalone recorder's product spec, CAD work, and lab UIs, which stay private.

## Decisions taken

| Question | Decision |
|---|---|
| What moves | The hardware set: `PRODUCT_SPEC.md`, `CAD_PROTOTYPE_SPEC.md`, `cad/**`, `app/hardware-lab.{html,css}`, `app/hardware-study.html`, `app/hardwareLab.tsx`, `app/hardwareStudy.tsx`, `app/shell/RecorderLab.tsx`, `app/shell/HardwareStudy.tsx`, `app/shell/recorder-lab.css`, `app/shell/hardware-study.css`, `src/core/recorder.ts`, `test/recorder.test.ts`, plus the never-pushed generated outputs (`output/**`, `cad/output/**`) if any commit still names them. |
| What stays | The app-side ingest contract: `app/lib/ingest.ts`, `src/core/ingest.ts`, `test/ingest.test.ts`, and `DeviceRecordingMetadata` / `Note.deviceRecording` in `src/core/types.ts`. They describe how Thoughts accepts a proxy-then-master recording, not the device. Existing spec/plan/README prose that mentions a recorder is left as is. |
| Destination | New **private** repository `willieshaw/thoughts-recorder`, receiving those paths with their full commit history. |
| Scrub here | `main`, `dev`, and `beta-distribution` are rewritten so no commit contains the moved paths, then force-pushed. Old commits linger on GitHub's PR pages until garbage collection; a GitHub Support purge request follows. |
| Then | Repository visibility flips to public. |

## Procedure (summary; the plan has the exact commands)

1. **Extract with history.** A throwaway clone of this repo is filtered down to the hardware paths only (`git filter-repo --path …`), gets a short README, and is pushed as `main` of the new private repo.
2. **Purge here.** A second throwaway clone carrying `main`, `dev`, and `beta-distribution` is filtered with `--invert-paths` over the same list. Verification before any push: no commit on any branch touches the paths, and typecheck + tests pass at each branch tip (the font test and README still reference the lab pages, so a small fix-up is expected to be needed and is applied as a normal commit after the push, see step 4).
3. **Force-push** the three rewritten branches. Stale worktrees under `.claude/worktrees/` are removed first; the working checkout is reset to the rewritten remotes and its old objects expired.
4. **Fix-up commit** on a branch off `dev`: README loses the lab-page paragraph and the `PRODUCT_SPEC.md` link; `test/no-external-fonts.test.ts` lists only `app/index.html` and `app/app.css`; the `RecorderLab` mention in `app/lib/ingest.ts`'s header becomes "the device bridge"; `.gitignore` drops the `cad/output/` and `output/` lines. PR into `dev`, promote to `main`; `beta-distribution` is rebased onto the new `dev`.
5. **Go public.** `gh repo edit --visibility public`. Then a GitHub Support request to purge unreachable objects (old PR commits), filed by Willie with the repository name.
6. **Verify from outside:** a fresh anonymous clone shows no hardware path in `git log --all --name-only`, and the release URL pattern `https://github.com/willieshaw/walking-voice-recorder/releases` resolves without login.

## Risks and how they are handled

- **History rewrite touches every commit's hash.** Anyone with an old clone must re-clone; only Willie's machine and the stale worktrees exist. PR numbers and the squash-merge commits keep their messages; their SHAs change.
- **Something in the app still imports a moved file.** Caught by typecheck and the test suite at each branch tip before pushing (step 2).
- **Old objects on GitHub.** Not reachable by browsing, only by SHA, until GC or the support purge. The hardware content is design documentation, not credentials, so the residual window is acceptable.
- **The Cloudflare Git integration** is suspended, so force-pushes trigger no builds.

## Out of scope

Scrubbing the word "recorder" from prose; moving the ingest contract; the third-party `.docx` reference file (untracked, stays on disk).
