# YouTube Control Room - detailed build process

Last updated: 2026-09-10. Current application: 0.4.0, local planning, protected connectors and a bounded Hermes reasoning integration. Full production automation remains in development.

## Resume here

Read this file, build-status.json, REPOSITORIES.md and ../README.md. This docs folder contains YouTube_Automation_Program_Blueprint.pdf. GitHub is the source of truth: https://github.com/hamzaofficial1478-lang/youtube. Fetch current repository changes before continuing; use a working copy for tests and push verified changes. Follow the blueprint sequence: one dependable English loop, then three languages, then controlled portfolio growth. Do not interpret this first release as a finished automated channel business.

The restricted `youtube-control-room` Hermes profile, loopback API server, protected connector and first live factual candidate were verified on 2026-09-10. The next action is to define explicit long-form quality and token-budget gates from that result, then begin permitted daily research and topic evidence briefs. Per-channel OAuth authorization and identity isolation remain a later account milestone. There is no publication endpoint. See HERMES-SETUP.md and YOUTUBE-SETUP.md.

## Agreed 11-step delivery sequence

These 11 delivery steps group the remaining tracked milestones into the order agreed with the user. Complete and verify each step before enabling the next dependent capability.

1. [x] Live Hermes validation, completed 2026-09-10.
2. [ ] Daily research and topic evidence briefs.
3. [ ] Expressive English narration.
4. [ ] Real scenes and licensed visual assets.
5. [ ] FFmpeg rendering and media quality control.
6. [ ] Spanish and Italian localization.
7. [ ] Per-channel YouTube OAuth and identity binding.
8. [ ] Private test-channel upload and reconciliation.
9. [ ] Scheduling, captions and thumbnails.
10. [ ] Analytics and controlled autopilot.
11. [ ] Gradual scaling toward 10 to 15 channel families.

## What the user requested

A UI-based program that researches markets and competitors, proposes differentiated niches and daily topics, writes original scripts, directs expressive voice, edits videos, localizes to English/Spanish/Italian, uploads and manages 10-15 channel families (30-45 channels), then learns from results. Tier A/B are user-defined market profiles. The 90-100 day period is a validation target, not a guarantee of ranking or earnings. The user requested a separate folder and a detailed record of completed and remaining processes.

## Current milestone and acceptance

Foundation: create a family, save a sourced English draft, review the exact version, prepare a saved planning scaffold, export it, restart the program and retain the work. Preserve original data during editing and tests. Explicitly distinguish planned language slots from connected YouTube channels.

<!-- CHECKLIST:START -->
Completed: 6 / 23 tracked work items. These items have different sizes; this is not a percentage of total engineering effort.

### 01 · Local foundation

A dependable local workspace that preserves every draft and distinguishes planning from live automation.

- [x] **F01 Blueprint review and repository register** (done) - Reviewed blueprint and pinned source; preserved licenses and recorded reuse decisions in REPOSITORIES.md.
- [x] **F02 Channel families and local persistence** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F03 Content studio and review gates** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F04 Saved storyboard planning jobs and export** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F05 Local request protection and browser usability** (done) - Request boundary tests passed; desktop and 390 x 844 browser draft editing/revision checks passed on 2026-09-08.
- [x] **F06 Process ledger, launcher and release checks** (done) - 29 automated checks passed; Windows start/stop/restart passed under the same user. Ledger, setup guide and GitHub workflow updated.

### 02 · Accounts and research

Approved data access and evidence-led research without invented metrics.

- [ ] **R01 Protected provider and channel credentials** (testing) - Named connector CRUD, encrypted credentials and read-only YouTube/OpenAI/ElevenLabs tests implemented (37 checks passed). Remaining: per-channel OAuth state/PKCE, identity binding and refresh/revocation; MCP/Reddit live adapters.
- [ ] **R02 YouTube read-only connector** (testing) - Implemented/tested bounded public channel lookup with synthetic responses. Remaining: real Google project/key verification, owner identity, recent-video collection, quota accounting and source retention.
- [ ] **R03 Permitted web, Reddit and Agent-Reach tools** (planned) - Confirm platform access and permitted use; add narrow adapters and real health checks. Agent-Reach get_status alone is not reading/searching.
- [ ] **R04 Daily niche and topic evidence briefs** (planned) - Collect dated evidence, explicit audience profiles, differentiation, confidence and topic deduplication. Gate API-derived scores on required permission.

### 03 · Original scripts and production

A sourced English master becomes a real, reviewable video.

- [ ] **P01 LLM writing with claim and budget controls** (testing) - A dedicated tool-free profile and first live factual candidate were verified on 2026-09-10: one completed attempt, 1,974 tokens, four S1-linked claims, three uncertainties and an unchanged saved draft. The 267-word result was too short for long-form production. Remaining: explicit per-job/monthly token policy and enforceable long-form quality criteria.
- [ ] **P02 Directed, expressive English narration** (planned) - Audition voices; save pronunciation/delivery cues and consent; check actual audio and failed-provider behavior.
- [ ] **P03 Real scene editing and visual assets** (planned) - Replace the rough planning scaffold with editable scenes and license-tracked media. Integrate additional editor repositories only after review.
- [ ] **P04 FFmpeg render, preview and media QC** (planned) - Install/choose a reviewed FFmpeg build; render and completely decode fixtures, validate audio/captions, repair individual scenes.

### 04 · Spanish and Italian editions

Reuse the visual master while preserving meaning, natural voice and scene timing.

- [ ] **L01 Scene translation and local packaging** (planned) - Adapt scripts, visible text, titles, descriptions and thumbnails for the selected Spanish locale and Italian.
- [ ] **L02 Language narration and synchronization** (planned) - Generate actual voices, adjust natural wording/timing and verify with proficient language reviewers.
- [ ] **L03 Independent edition approvals** (planned) - Track EN/ES/IT outputs and language-specific revisions; propagate source corrections and permit independent release decisions.

### 05 · Controlled publishing

Publish the right approved version to the right channel without duplicates.

- [ ] **Y01 Private resumable upload and reconciliation** (planned) - Implement and test per-channel destination binding, upload session recovery and unknown-outcome reconciliation on a real test channel.
- [ ] **Y02 Thumbnails, captions and scheduling** (planned) - Confirm attachments, future time zones, audience/disclosure settings, project audit status and each quota bucket.
- [ ] **Y03 Rules-based unattended operation** (planned) - Enable only after pilot quality and recovery gates pass; enforce spend limits, pause/cancel and exception alerts.

### 06 · Learning and portfolio scale

Use actual owner evidence and measured capacity to reach 10-15 families.

- [ ] **A01 Authorized analytics and experiments** (planned) - Verify supported owner reports, measurement windows and approved derived-data use; show unavailable values honestly.
- [ ] **A02 Backup/restore and production reliability** (planned) - Add supported backup UI/automation; test restore, external job leases, retry ceilings, disk pressure and provider failures.
- [ ] **A03 Sustained scale and growth validation** (planned) - Measure 14-day reliability, quota, render capacity, cost and language review load; validate each channel over its own 90-100 day period.

<!-- CHECKLIST:END -->

## Implementation log

### 2026-09-08 - source review and structure

- Created a separate `outputs/youtube-control-room` project folder beside the PDF.
- Reviewed the blueprint, upstream main entry point, credential behavior, scheduler, metadata validation and FFmpeg helper.
- Recorded a selective-reuse decision. Downloaded full automation source for inspection, but did not run its entry point, install its dependencies, import secrets or start its scheduler.
- Copied unmodified metadata and FFmpeg helpers with their MIT license. Retained the other two repositories' selected reference files and licenses.
- Selected Node 24 standard-library HTTP, SQLite and test runner. No npm dependencies are required by this release.

### 2026-09-08 - local application

- Implemented family settings: name, audience tier, explicit countries, audience description, niche hypothesis, format, EN/ES locales, planning time zone, weekly cadence and monthly budget in integer cents.
- Every family gets EN, ES and IT slots marked not connected. Fifteen active families is the pilot product limit; archiving preserves drafts.
- Implemented original drafts, optional sources, source permission notes, factual/fiction distinction and creator review attestation.
- Added draft -> in_review -> approved transitions. Missing required evidence/rights/script fields block review. Edits increment content revision, clear previous approval and clear derived storyboard/edition states.
- Added saved storyboard jobs keyed by content ID and revision. Repeated requests reuse the same job. Changed drafts/archived families cancel stale jobs. The job produces only an explicitly approximate planning scaffold.
- Added export with version, family, script, sources, scenes, language statuses and limitations. User text is rendered as text or escaped HTML.
- Added loopback binding, allowed Host/Origin checks, per-process write token, JSON input limit, fixed static routes and optimistic conflict detection.
- Added Overview, Families, Studio, Connections and Build progress UI. Counts come from stored records; no demo metrics are seeded.

## Validation record

### Current release 0.4.0 - Hermes reasoning boundary

- Added a dedicated Hermes connector using only the fixed local API at `127.0.0.1:8642`. Its bearer key uses the existing Windows-DPAPI connector storage and is never returned to the browser.
- Added one bounded, stateless English script-candidate call through Hermes Chat Completions. Saved family/content/source data is treated as untrusted prompt data. Factual jobs require permitted evidence notes.
- Added exact candidate validation for title, angle, hook, script, source-linked claims and uncertainties. Factual candidates require at least one claim and every claim must cite a supplied source ID; claims and IDs appear in review. Unknown source IDs, malformed shapes, prose wrappers and oversized responses fail closed while streaming.
- Added durable, revision-scoped Hermes jobs and immutable `script_candidates`. Duplicate queue requests reuse one job. Generation never overwrites or approves the saved draft.
- Added the Content Studio actions **Ask Hermes** and **Use candidate**. Using a candidate opens the normal editor; the operator must review and save it through the existing revision/approval rules.
- Running requests are not silently replayed after restart. Failed, stale and cancelled jobs can be deliberately retried up to three total attempts; interrupted/unknown requests require a distinct confirmation. Before claim and completion, jobs recheck connector existence, Hermes provider, protected key, exact revision and latest passed test status.
- Connector testing now authenticates to both `/v1/capabilities` and `/v1/toolsets`, uses bounded streaming JSON parsing, and refuses any enabled toolset with concrete tools. The first script milestone is reasoning-only.
- Added `docs/HERMES-SETUP.md`. On 2026-09-10, created the separate `youtube-control-room` profile with no bundled skills, no MCP servers and every API-server toolset disabled. The authenticated live capability/toolset checks passed.
- Generated one live factual candidate from the official YouTube Help recommendation-system page. The job completed on its first attempt with 1,331 prompt tokens, 643 completion tokens and 1,974 total tokens. It returned four S1-linked claims and three uncertainties; the original saved draft remained unchanged.
- The live candidate was 267 words. Its structure, evidence discipline and uncertainty handling passed manual review, but its length is insufficient for the selected long-form format. The provider response exposed token usage but no dollar cost. P01 stays in testing until explicit token-budget and long-form quality gates are enforced.
- The actual Content Studio UI was read through the Hermes desktop preview: the completed job, candidate, claims, official source links, uncertainties and **Use candidate** action rendered correctly. The separate Browser Use driver timed out before opening localhost; the preview and API checks completed instead.
- `npm run check` passed. `npm test`: 46 passed with no failures, skips or cancellations under the normal Windows account before the live call; fixture tests themselves make no paid generation calls.

### Current release 0.3.0 - connector slots

- Completed the requested connector-management substep: add, edit, test and delete named slots; separate encrypted keys; duplicate-name and revision checks; key retention/removal; edit-triggered test invalidation; per-slot in-flight locks.
- YouTube, OpenAI and ElevenLabs tests call fixed read-only metadata endpoints. They do not generate content or authorize channel ownership. MCP/Reddit slots accept setup notes and report adapter not implemented; they reject keys until their adapters exist.
- Added a connectors table without changing family/content records. Existing v0.2 key storage and access are preserved. Named-slot ciphertext is kept in a BLOB column; state responses never return it or decrypted keys.
- `npm run check` passed. `npm test`: 37 passed, no failures or skips under the normal Windows account, using synthetic credentials and responses. Real DPAPI encryption/decryption was verified. No real provider keys or live provider calls were used.
- Desktop browser fixture verified slot creation, test result, edit dialog, blank password field on reopen, renamed slot with retained key and cleared test status. Store and HTTP tests verified deletion and other-slot preservation. Mobile connector-specific workflow has not yet been separately checked; the earlier foundation mobile checks remain valid for the tested draft flow.
- Phase 01 remains complete. R01/R02 remain in progress because per-channel OAuth and live provider verification are still pending. Read CONNECTORS.md for the exact boundary.
- GitHub is the delivery location. Local files are a working copy for testing only; completed changes must be pushed and linked by GitHub commit. Do not present a local edit link as evidence of a completed push.

### Attribution and runtime decision

GitHub's contributor endpoint was checked: only hamzaofficial1478-lang was listed, with the three existing commits. darkzOGx is credited in retained upstream references/license notices, not added as a project contributor or collaborator. The app uses Node.js for UI/API coordination; Python tools and FFmpeg workers remain suitable for specialized processing. Heavy rendering should run outside the request-handling process. No whole-program rewrite is planned just to change language.

### Current release 0.2.0 - 2026-09-08

- `npm run check`: passed. `npm test`: 29 passed, zero failures or skips under the normal Windows account. Restricted sandbox run passed 28 but could not access Windows DPAPI; the complete real-encryption test passed outside that sandbox with synthetic keys. No real provider credentials or Google calls were used.
- Added checks for channel-link validation, fixed Google origin, header-only credential transmission, no secret in status/results, missing/hidden metrics, large counts, provider denial, network failure, response-size limits, wrong channel identity, concurrent operations, replacement/forget, ciphertext at rest and corruption handling.
- Phone viewport 390 x 844: edited and saved the existing isolated QA draft; confirmed revision increment and removal of its previous approval/storyboard. New research fixture UI passed key save, successful lookup, literal HTML-like result title, unavailable subscribers, provider-denial recovery and forget/disable flow. Desktop layout was also inspected; no browser warning/error logs were recorded.
- Windows launchers passed start -> stop -> start -> stop under one Windows account. Fixed the vague null-reference error when Windows cannot expose process details; this now fails with an actionable message without stopping an unverifiable process.
- Initial new HTTP test cleanup ran before the server closed; corrected cleanup order and reran successfully. Initial helper execution was blocked by default PowerShell script policy; added the same process-scoped invocation option used by the existing launcher. No global policy was changed.
- Live Google key validity, project restrictions/quota and actual public data remain unverified. OAuth, per-channel bindings, private analytics and publishing are not implemented. R01/R02 are deliberately not marked done.

### Earlier foundation checks

- `npm run check`: passed on Node 24.18.1, 2026-09-08.
- `npm test`: 20 passed, zero failed, skipped or cancelled. Covers validation, three-language families, exact budgets, archive/restore, optimistic conflicts, review gates, approval invalidation, job deduplication/cancellation/recovery, export, SQLite persistence and HTTP request protection. Tests use isolated databases.
- Desktop browser: created a disposable family, saved an original fictional draft with a reviewed source, submitted and approved it, queued a storyboard, and inspected six completed scenes and truthful language states. Verified HTML-like family text renders literally. Browser test records were isolated from the real workspace.
- Windows launcher: startup and health check passed during foundation work; an initial runtime-version quoting issue was corrected. The later stop command correctly reported an already-stopped instance. Stopping a running launcher-managed instance and a full start/stop/restart cycle remain to be verified.
- Mobile editing flow remains unverified. Foundation F05/F06 remain in testing; passing automated checks is not a claim of complete browser or production validation.

The mobile and launcher gaps in this earlier record were resolved by the 0.2.0 checks above.

### 2026-09-08 - protected research setup

- Completed the foundation's remaining targeted checks; started R01/R02 with the smallest usable public-research slice.
- Added `youtube.js`, a fixed Windows DPAPI helper and Connections forms. Saving a key performs no external call. The key stays outside SQLite and is not returned to the browser. Encrypted replacement is atomic, and forget clears the local copy.
- Added a bounded, manual `channels.list` adapter for public IDs/handles. Only one request runs at a time; key replacement/removal is blocked while that request is active. Failures do not trigger automatic retries or reveal raw upstream messages.
- Kept large totals exact and missing values unavailable. Show source identity/time without claiming owner authorization or inferred ranking/tier/retention metrics. Results are not persisted.
- Added repeatable synthetic browser fixtures isolated from normal startup and real data. Preserved all three upstream revision/license records; no additional upstream module was imported.
- Updated README, setup guide, structured checklist and GitHub continuation instructions. No paid services were called. Next required input is a YouTube Data API key entered only into the actual application's Connections page.

### 2026-09-08 - GitHub handover

- User requested all existing and future project code be maintained in `hamzaofficial1478-lang/youtube` rather than additional PC folders.
- Prepared the application at repository root, alongside tests, launchers, the process ledger, all selected upstream source/license files and the PDF with its source script.
- Preserved the repository's initial commit history. Local database files, QA records, logs, credentials and upstream inspection downloads are excluded from the handover.
- Future work must fetch the current repository, complete the remaining foundation checks, and commit/push tested changes. Actual automation milestones remain planned as listed above.

## Known limitations and unresolved work

- This is a single-user local app. There is no public hosting, multi-user authentication, multi-machine worker coordination or tested unattended Windows service setup.
- Node 24 is required. Node SQLite availability was checked on the actual local runtime; deployment to other runtimes needs verification.
- There are no paid text, speech, translation or video providers connected. No content is uploaded to YouTube.
- Draft evidence URLs remain manually entered and are not fetched. Optional public channel lookup contacts only the fixed Google API endpoint. Permission/accuracy status for draft evidence remains a creator attestation.
- The storyboard is a rough six-part scaffold, not finished direction. It may split a sentence and cannot guarantee timing. It must be refined before TTS or rendering.
- Spanish/Italian scripts, voices, thumbnails and subtitles are not produced. Language slots and pending states are real records, not translations.
- Media rendering is not implemented. FFmpeg detection must not be mistaken for a rendering test.
- The database is durable on a local disk, but this milestone has no automated backup/restore facility. Stop the app and preserve the whole data directory before moving machines. Keep it off synchronized/network folders while running.
- No dependency or runtime audit of the full upstream app was performed; only copied modules and their active callers are in the release test scope.
- API quotas, platform permission, channel authorization and source rights must be validated before the corresponding live connector is enabled.

## Decisions still needed for future stages

The exact market profiles, first niche/format, realistic operating budget, additional editing repositories, intended always-on host, Google project/channel access, permitted data sources, chosen Spanish locale, voice preferences and clone consent if relevant. The local family form captures the decisions that can be made now.

## Change discipline

For each future stage record: requirement, files changed, source modules adopted, test command, result, live services involved, cost (if any), known limitation and next action. Mark tasks done only after the relevant evidence is recorded. Tests use isolated temporary databases and must never delete real user content. A checklist count is not an estimate of engineering work completed.
