# YouTube Control Room - detailed build process

Last updated: 2026-09-08. Current application: 0.1.0, local planning foundation. Full production automation remains in development.

## Resume here

Read this file, build-status.json, REPOSITORIES.md and ../README.md. This docs folder contains YouTube_Automation_Program_Blueprint.pdf. GitHub is the source of truth: https://github.com/hamzaofficial1478-lang/youtube. Fetch current repository changes before continuing; use a working copy for tests and push verified changes. Follow the blueprint sequence: one dependable English loop, then three languages, then controlled portfolio growth. Do not interpret this first release as a finished automated channel business.

The next dependent stage is protected provider/channel configuration, followed by a real read-only YouTube identity test. Before implementation, choose an appropriate secret store and channel-specific authorization design. The running version intentionally has no credential entry fields or live publication endpoint.

## What the user requested

A UI-based program that researches markets and competitors, proposes differentiated niches and daily topics, writes original scripts, directs expressive voice, edits videos, localizes to English/Spanish/Italian, uploads and manages 10-15 channel families (30-45 channels), then learns from results. Tier A/B are user-defined market profiles. The 90-100 day period is a validation target, not a guarantee of ranking or earnings. The user requested a separate folder and a detailed record of completed and remaining processes.

## Current milestone and acceptance

Foundation: create a family, save a sourced English draft, review the exact version, prepare a saved planning scaffold, export it, restart the program and retain the work. Preserve original data during editing and tests. Explicitly distinguish planned language slots from connected YouTube channels.

<!-- CHECKLIST:START -->
Completed: 4 / 23 tracked work items. These items have different sizes; this is not a percentage of total engineering effort.

### 01 · Local foundation

A dependable local workspace that preserves every draft and distinguishes planning from live automation.

- [x] **F01 Blueprint review and repository register** (done) - Reviewed blueprint and pinned source; preserved licenses and recorded reuse decisions in REPOSITORIES.md.
- [x] **F02 Channel families and local persistence** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F03 Content studio and review gates** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F04 Saved storyboard planning jobs and export** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [ ] **F05 Local request protection and browser usability** (testing) - Automated request protection and desktop flow passed; mobile editing remains unverified.
- [ ] **F06 Process ledger, launcher and release checks** (testing) - Ledger and runnable checks recorded; startup passed. Verify stopping a running managed instance and a full launcher restart cycle.

### 02 · Accounts and research

Approved data access and evidence-led research without invented metrics.

- [ ] **R01 Protected provider and channel credentials** (planned) - Choose secret storage; implement per-channel OAuth state/PKCE and token refresh/revocation; never reuse one account slot.
- [ ] **R02 YouTube read-only connector** (planned) - Verify returned channel identity, public metadata access, quota buckets, errors and source retention with actual accounts.
- [ ] **R03 Permitted web, Reddit and Agent-Reach tools** (planned) - Confirm platform access and permitted use; add narrow adapters and real health checks. Agent-Reach get_status alone is not reading/searching.
- [ ] **R04 Daily niche and topic evidence briefs** (planned) - Collect dated evidence, explicit audience profiles, differentiation, confidence and topic deduplication. Gate API-derived scores on required permission.

### 03 · Original scripts and production

A sourced English master becomes a real, reviewable video.

- [ ] **P01 LLM writing with claim and budget controls** (planned) - Connect one approved provider; validate structured outlines, hooks, original scripts and claim references; meter cost and retries.
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

- `npm run check`: passed on Node 24.18.1, 2026-09-08.
- `npm test`: 20 passed, zero failed, skipped or cancelled. Covers validation, three-language families, exact budgets, archive/restore, optimistic conflicts, review gates, approval invalidation, job deduplication/cancellation/recovery, export, SQLite persistence and HTTP request protection. Tests use isolated databases.
- Desktop browser: created a disposable family, saved an original fictional draft with a reviewed source, submitted and approved it, queued a storyboard, and inspected six completed scenes and truthful language states. Verified HTML-like family text renders literally. Browser test records were isolated from the real workspace.
- Windows launcher: startup and health check passed during foundation work; an initial runtime-version quoting issue was corrected. The later stop command correctly reported an already-stopped instance. Stopping a running launcher-managed instance and a full start/stop/restart cycle remain to be verified.
- Mobile editing flow remains unverified. Foundation F05/F06 remain in testing; passing automated checks is not a claim of complete browser or production validation.

### 2026-09-08 - GitHub handover

- User requested all existing and future project code be maintained in `hamzaofficial1478-lang/youtube` rather than additional PC folders.
- Prepared the application at repository root, alongside tests, launchers, the process ledger, all selected upstream source/license files and the PDF with its source script.
- Preserved the repository's initial commit history. Local database files, QA records, logs, credentials and upstream inspection downloads are excluded from the handover.
- Future work must fetch the current repository, complete the remaining foundation checks, and commit/push tested changes. Actual automation milestones remain planned as listed above.

## Known limitations and unresolved work

- This is a single-user local app. There is no public hosting, multi-user authentication, multi-machine worker coordination or tested unattended Windows service setup.
- Node 24 is required. Node SQLite availability was checked on the actual local runtime; deployment to other runtimes needs verification.
- There are no paid text, speech, translation or video providers connected. No content is uploaded to YouTube.
- Research sources are manually entered. Permission/accuracy status is a creator attestation, not automated verification. Submitted URLs are stored but never fetched by this release.
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
