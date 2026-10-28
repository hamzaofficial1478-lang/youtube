# Review of the laptop program before it joined GitHub main - 2026-10-28

The owner had built 0.6.0 to 0.61.0 (79 commits) on the laptop without pushing. That history was pushed to the branch `laptop-import`, reviewed, fixed (0.61.1) and merged into `main`. `main` had nothing the laptop history lacked: its newest commit (02d0794) is where the laptop history starts, so the merge replaced outdated files with their newer versions and lost nothing. Only `hermes.js` (replaced by `writer.js` on 2026-10-06) and `tests/hermes.test.js` (renamed `tests/writer.test.js`) left on purpose.

Checked: every commit of the branch for keys, databases, logs and large files (none; only fake test keys); the server boundary (loopback only, Host and Origin checks against DNS rebinding and cross-site requests, Sec-Fetch-Site, the write token, CSP); every child process (argument arrays, no shell); key storage (DPAPI, never in responses); downloads; backup and restore; OAuth and uploads; the autopilot gate; the page templates (escaped, and the CSP blocks inline script); interrupted-job recovery; tests use temporary data folders only; `npm audit` (0 vulnerabilities). The large drawing and scene engines (drawn-engine.js, scene-room.js) were reviewed through their documents and targeted searches, not line by line.

| # | Finding | Fix in 0.61.1 |
|---|---|---|
| 1 | The repository is public: the skill packs restated from the owner's paid course documents (precision-os, prompt-library, mastery-bundle) and the Windows user name in the docs are visible to anyone. | The user name is removed from the docs. Making the repository private is the owner's decision (GitHub Settings, General, Change visibility); it is still public in the history. |
| 2 | A fresh download could not start: the launcher never installed the three npm packages. | Start-ControlRoom.ps1 runs `npm ci --ignore-scripts` on the first start and when package-lock.json is newer than the installed packages. Not run on Windows in the review (no PowerShell in the review machine). |
| 3 | AGENTS.md, README, HANDOFF, CLAUDE.md and BUILD-PROGRESS still said the laptop folder was the source of truth, and BUILD-PROGRESS still said 0.31.0. | Updated: GitHub `main` is the source of truth; stale README items (Reddit, music) corrected. |
| 4 | Codex runs read-only, which still reads any file of the Windows account; prompts carry outside text (Reddit, competitors, screenshots). | ai.js: any Codex tool event (command, file change, MCP, web search) stops the run and discards the answer. tests/ai-team.test.js. |
| 5 | Media downloads followed redirects and checked only the final address. | visual-sources.js: one hop at a time, each on the provider's media hosts. tests/scene.test.js. |
| 6 | A restore trusted the backup manifest's paths. | backup.js: names leaving the data folder (or odd backup IDs and hashes) refuse the whole restore before anything changes. tests/backup.test.js. |
| 7 | Replacing a language's channel did not wait for a running upload and kept the old access token in memory. | publishing-room.js: the same guard as a disconnect; replaced tokens dropped; a cached token is used only for an active connection. tests/publishing.test.js. |
| 8 | The state said YouTube "not_connected" and translation "not_implemented", and the start message said publishing was not enabled. | server.js reports a confirmed channel and the Claude-ready editions; the start message describes Room 11. |
| 9 | Caption text with a line break would end an .ass Dialogue line. | captions.js turns line breaks into spaces. Owner corrections already refused control characters, so this guards future paths only. |

Not bugs, but limits to keep in mind: Freesound sounds arrive as the 128 kbps preview MP3; Freesound and Jamendo reserve commercial API use; no live YouTube, Claude, ElevenLabs, Fish Audio, Reddit, Freesound or Jamendo call has been verified; the Windows DPAPI and fonts tests need the owner's PC.

# Program review and continuation roadmap — 2026-10-07

## Assessment

This is a substantial local production system, but not yet a finished autonomous YouTube business. Its strongest design is the chain of immutable revisions, explicit budget admission and named human approvals. The safest next build was narration finishing on that existing chain, which is now implemented as P08a in version 0.15.0. Music remains deferred under the owner's decision. The existing Claude migration is preserved.

The review covered the blueprint and handoff, repository/license decisions, tracked milestone evidence, startup/server boundaries, storage and revision patterns, writer migration and fixtures, editing/render/audio code paths, and the automated regression suite. It does not establish that every branch of every file is bug-free. No real channel, credential database, paid provider or publication endpoint was exercised.

## Architecture and code quality

| Layer | Current responsibility | Assessment / continuation rule |
|---|---|---|
| `server.js`, Windows launchers | Loopback server, fixed routes, guarded writes, local worker lifecycle | Appropriate for one Windows user. Keep fixed origins and write-token checks; do not expose it as a public service. |
| `store.js`, SQLite | Families/locales, jobs, immutable snapshots, approvals, budgets and transactions | Central authority is valuable. The file is large; extract bounded responsibilities only when changing them, with migration/contract tests. Avoid a broad rewrite during feature work. |
| `ai.js`, `writer.js`, research/intelligence services | Existing Claude direction, bounded reasoning, immutable candidate results | Preserve provider separation and review gates. Test doubles must match the new adapter boundary. A passing fixture does not validate live account/model availability. |
| `voice.js`, `style.js`, `scene-room.js` | Approved narration identity, style revisions, scene boards and licensed visuals | These are the authoritative inputs. Later rooms must bind to their exact approved versions and hashes. |
| `editing-brain.js`, `captions.js`, `craft.js`, motion templates | Deterministic editorial proposals, timing, craft advice and graphic composition | Keep pure functions free of I/O, clocks and randomness. Reasons and skill IDs make proposals reviewable; they do not prove professional quality on every script. |
| `editing-room.js`, `render-room.js`, `render.js`, `motion.js` | Revision operations, pinned local tools, proxy execution, technical evidence and style proof | Reuse this pipeline for audio. Maintain BT.709/range consistency, caption layering, cancellation, checksum and stale-input checks. |
| `audio.js` | Bounded narration settings, two-pass arguments and output QC | Small pure module; no provider dependency, arbitrary filter input, separate queue or mutable audio table. |
| `public/` | Room views and forms on the existing browser interface | Existing design is sufficient for this step. Keep inline validation, family scoping, explicit current revision and review evidence. |

The code generally favours small domain modules around one store, Node's standard library and simple browser views. That fits the declared single-user runtime. Some files use dense one-line validation and markup: it is efficient to read locally but needs careful scoped edits. The unfinished provider migration, stale test assumptions and contradictory docs were a more immediate risk than introducing a new architecture.

## Confirmed problems addressed

| Finding | Impact | Change / regression evidence |
|---|---|---|
| Render file serving checked file size without hashing content | Same-size corruption could be downloaded or accepted as the reviewed artifact | Verify SHA-256 on serving and on passing a proof; tests mutate a byte without changing length. |
| In-memory app instances used the normal data directory for media/recovery | A disposable test worker could share artifact paths with the owner's program | Allocate an OS temporary artifact root for `:memory:` apps and use it for protected-key storage; HTTP regression verifies separation. |
| Queued edit could become superseded before the worker claimed it | Wasted render work and confusing historical output | Recheck latest revision before execution; superseded queued edits become stale. Existing completion/review checks continue to reject stale output. |
| Tests mixed the old Hermes wire format with the current Claude adapter | Baseline suite had 20 reported failures and could not distinguish migration breakage from new regressions | Update the affected fixtures, writer construction, request assertions and documented format token ceilings. Preserve meaningful validation assertions. |
| Concurrency test depended on wall-clock speed | Slow Windows runs could fail despite correct serialization | Assert overlapping role counts and same-role exclusion directly. |
| README/progress still said editing/rendering were unbuilt and no dependencies existed | The next builder could repeat work or misdiagnose startup | Record current room support, partial milestones, existing Anthropic dependency and owner decisions. |

Baseline under the normal Windows account: 185 tests, 165 passing, 20 failing, zero skipped. This includes nested-test reporting. Final results are recorded separately in BUILD-PROGRESS.md; earlier failed attempts are not treated as verification.

## Built, partial and still planned

| Area | What exists | What is still required |
|---|---|---|
| Foundation | Families, primary/additional locales, revisions, local SQLite, approval and cost records, protected connector slots | Supported backup/restore and operational failure drills; current live account verification |
| Research and discovery | Review-only briefs, competitor observations/blend picks, NexLev/YouTube adapters, original technique blueprints, Niche Factory | Owner account tests, ongoing source/rights review and evidence-based niche validation; MCP/Reddit are still setup records |
| Script and skills | Claude direction, candidate quality gates, craft checks, 349 built-in skill drafts, exact-revision approvals | Owner skill selection and realistic editorial acceptance; imported knowledge is not automatically active |
| Voice | Explicit auditions, narration provenance/rights, technical audio evidence and human handoff | Owner's actual ElevenLabs connection, prices, pronunciation and full listening proof |
| Styles and scenes | Immutable style assignment, montage renderer, scene board, stock search/import and AI-image path | Actual source/rights verification; other renderers, AI video and map/stick-figure adapters |
| Editing and motion | Deterministic editorial plan, critic, owner operations/undo/scene repair, canvas graphics, hidden-cut checks, pinned proxy render | Professional review across real scripts/formats; additional specialized adapters where needed |
| P07 captions | Burned captions, SRT and WebVTT, on/off, owner text corrections (0.15.1), narration-based phrase windows, caption QC | Measured word alignment, real ElevenLabs validation; additional-language captions later |
| P08 audio | **P08a implemented:** immutable narration settings, normalized/original-level WAV, encoded AAC QC, listening gate | Real narration proof; licensed music/SFX, cue editing, ducking/fades and music carve deferred by owner |
| P09 review/QC | Room 08 (0.16.0): full decode, A/V alignment, clipping, hook sheet, one timecoded issue list with repair links, aligned read, verdict gated on blockers; Claude frame scan (0.17.0) | Proof on real material; final-master review at P11 |
| P10 packaging | Craft suggestions and draft chapter/Shorts advice | Reviewable title/description/thumbnail artifacts tied to content and locale; packaging approval |
| P11 final rendering | Pinned deterministic proxy pipeline | Final-resolution contracts, subtitles/mix packaging, delivery verification and robust recovery |
| Localization | Family language isolation and configured editions | Approved translation, localized narration/captions/packaging, native review and per-edition invalidation |
| YouTube release | Public lookup only | Per-channel OAuth identity isolation, idempotent upload, processing checks, scheduling and release approval |
| Autopilot and scale | Human gates and explicit job admission | Format-specific Y03 evidence, authorized analytics, restore drills and sustained quota/cost/capacity measurements |

## Ordered next steps and acceptance gates

1. **Prove the current primary-language path with owner-approved real material.** Start from one short, approved script and actual narration/visuals. Verify the current Claude connection deliberately; select and approve only intended skills. Check/pin FFmpeg, draft the edit, save audio settings, render, inspect captions and listen. Every artifact must show its current inputs and a named verdict. This is not a request for automatic paid generation.
2. **Close P07 usability gaps before final release depends on captions.** Done in 0.15.1: revisioned caption text edits and WebVTT from the same validated caption model, narration timing preserved, a new revision for every correction. Measured alignment needs a separate adapter decision and tests; until then word timings must remain labelled estimated.
3. **Build P09 consolidated Review & QC around existing evidence.** Done in 0.16.0 (docs/REVIEW-QC.md). Reuse room checks, report timecoded findings and links back to repair, and block stale/missing/corrupt inputs. Verify full decode, A/V drift and review invalidation with failing fixtures. Do not add a second competing approval chain.
4. **Build P10 packaging then P11 final master.** P10 done in 0.18.0 (docs/PACKAGING-ROOM.md); P11 is next. Approve exact title/description/thumbnail and final media revisions. Verify output dimensions/frame rate, captions, sound, provenance and retries/recovery before connecting uploads.
5. **Expand audio when music sourcing is chosen.** Store licenses and attribution before accepting tracks; make cue/duck/fade decisions immutable; test speech intelligibility, track boundaries and the final encoded mix. Do not EQ narration just to imitate a music-carve recipe. (0.23.0: music and effects are generated by ElevenLabs under the owner's commercial-use confirmation, cue/duck/fade settings live on the immutable edit revision and the encoded mix is checked; the speech-frequency carve and a live listening proof remain.)
6. **Add only the needed specialist renderer.** Map routes, stick-figure animation and other styles each need their own bounded input schema, pinned execution, media probes, rights review and deterministic fixtures. Existing draft skills do not supply adapters.
7. **Build optional localization, then per-channel OAuth/upload.** Test wrong-channel and wrong-language rejection, token expiry, duplicate avoidance and interrupted uploads before publication is possible.
8. **Earn autopilot with measurements.** Keep approval gates until Y03 passes for a specific format. Measure real reliability, provider cost, render duration, disk growth and review load before scaling families.

Steps 1–3 are the immediate continuation. P08 remains partial in the tracker because the owner deliberately deferred music, and P07 is also honestly marked partial. There is no claim that the overall program is production-complete.

## Efficiency and flexibility

Audio adds two measurement passes and one WAV conversion to the existing local render. It deliberately keeps source timing fixed, which avoids rebuilding clip/caption synchronization. Superseded queued edits are rejected early. This release does not claim a speedup: no representative long-form performance benchmark was run.

The synchronous SQLite design is acceptable for the current single-process scope. Full-file SHA checks on media requests protect artifact integrity but can cost I/O for large final masters; measure this at P11 before introducing a safe cache. Render state polling and disk growth also need measurement on long videos. Do not add worker hosts, distributed queues or generic provider frameworks without a demonstrated need.

## Delivery and file inventory

All work was written directly to `%USERPROFILE%\Desktop\YT\youtube`. No standalone project copy, GitHub commit or push was made. The pre-existing dirty Claude migration was retained; the following list describes this continuation's edits, not authorship of every pre-existing diff.

- New implementation: `audio.js`, `public/audio-room.js`.
- Integration and integrity fixes: `editing-brain.js`, `editing-room.js`, `render.js`, `render-room.js`, `server.js`, `public/app.js`, `public/editing-room.js`, `public/render-room.js`, `public/index.html`.
- New regression coverage: `tests/audio.test.js`, `tests/audio-http.test.js`; extended `tests/editing.test.js`.
- Migration/regression fixture corrections: `tests/ai.test.js`, `tests/scene.test.js`, `tests/intelligence.test.js`, `tests/control-room.test.js`, `tests/research.test.js`, `tests/p01-quality.test.js`, `tests/review-blockers.test.js`.
- Version/check scripts: `package.json`, existing untracked `package-lock.json`.
- Current documentation: `AGENTS.md`, `README.md`, `docs/HANDOFF.md`, `docs/BUILD-PROGRESS.md`, `docs/build-status.json`, `docs/REPOSITORIES.md`, this review and `docs/AUDIO-ROOM.md`.

Temporary scripts/logs/screenshots are under ignored `test-results/`; disposable databases and synthetic media use OS temporary directories. The owner's `data/control-room.sqlite` was not used for tests. No live credentials or provider responses were collected, and no paid generation or publishing was triggered.

## Verification limits

See the latest BUILD-PROGRESS.md entry for commands, counts, browser coverage and failures. Real FFmpeg and normal-account Windows DPAPI checks are distinct from mocked provider tests. No live Claude, YouTube, NexLev, stock, AI-image or ElevenLabs call is proved by this work. Synthetic narration proves signal processing and state transitions, not natural speech quality. Backup restoration, long-form capacity, complete translation, publishing and unattended multi-day reliability remain unverified.
