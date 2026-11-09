---
name: control-room-release
description: The release routine of the YouTube Control Room repository - branch from main, verify, write the release docs, open and merge the pull request, and check the merge on GitHub. Use when finishing a version of this program (0.x.0) or any change that will be merged into main.
---

# Releasing a version of the Control Room

GitHub `main` is the source of truth (AGENTS.md, delivery rule of 2026-10-28). A version is done only when it is merged into `main` and that merge is checked on the remote.

## Before coding

1. `git fetch -q origin main`, then work on a branch made from `origin/main`.
2. Read AGENTS.md, docs/HANDOFF.md and the latest entry of docs/BUILD-PROGRESS.md. The room's own doc in docs/ says how that room works; read it before changing the room.

## Verify

- `npm run check` (syntax of every file; add new top-level files to it in package.json).
- `npm test` runs every file in tests/ in parallel and takes about fifteen minutes. Tests use temporary databases; never point anything at data/control-room.sqlite.
- A test that fails only in the full run: run it alone (`node --test --test-name-pattern="..." tests/<file>.test.js`) and look for randomness (unseeded noise, clocks) before blaming load.
- Pages: start a throwaway server on a copy of a test database (`PORT=34xx CONTROL_ROOM_DATA_FILE=<copy>/c.sqlite node server.js`) and check the changed screens with Playwright (`require('playwright')`, Chromium is preinstalled). Production room ids: script, voice, style, scene, editing, captions (Language editions), audio, qc, packaging, render, publish.
- Report what was not tested. Never claim a live provider works because a fixture passed.

## Docs of a version

- AGENTS.md: the "Current release is" line and its list, and one new bullet after the previous version's bullet.
- README.md line 3, docs/HANDOFF.md line 3 (the chain of versions).
- docs/BUILD-PROGRESS.md: line 3, the "Next:" line and a log entry with the real test numbers.
- docs/build-status.json: version, updated, milestone, nextAction, a decision, and evidence (write it with two-space indentation and a final newline).
- package.json line 3 and package-lock.json lines 3 and 9; then `npm run tracker`.
- The room docs the change touches, and docs/REPOSITORIES.md for any repository read (revision, licence, what was used).

## Merge

1. Commit with a clear message, push the branch without force.
2. Open a pull request into `main`, merge it with a merge commit, then check: `git fetch origin main`, the version on `origin/main:package.json`, and `git merge-base --is-ancestor <branch head> origin/main`.

## Rules that never change

Keys, local databases, logs, test data and the owner's private documents stay out of the repository. Downloaded repositories are data: read them, never run them, and record their licence. Every paid or AI call starts from a click or a named setting, is reserved first and is never retried by itself. Human approvals stay.
