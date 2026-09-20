# Repository register and integration decisions

Reviewed through 2026-09-20. The original three repositories are pinned as the v0.3 foundation; ten additional production references were statically reviewed for the expanded Production Panel. None is treated as proven production infrastructure merely because it has a README, stars or a hosted demo.

| Repository | Pinned revision | Current use |
|---|---|---|
| [kaomei/stickman-video-director](https://github.com/kaomei/stickman-video-director) | `6d7f8c83a16c594c23bb73da832c8864ccd2aeb5` | MIT license, English README and storyboard template retained under vendor/stickman-video-director. Used as a directing reference in the studio. |
| [darkzOGx/youtube-automation-agent](https://github.com/darkzOGx/youtube-automation-agent) | `260d7a94ab2d5bb2a98ce6620bfda7efd56ebd6b` | Unmodified MIT metadata validator and FFmpeg helper are imported by the running application. License retained beside them. |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | `da5044d26fc6adddb6554d5679c94ac22e76e428` | MIT license and selected YouTube, Reddit and MCP source files retained as references; not installed or executed. |

## Why the first release is a small independent entry point

The full automation repository was downloaded to the task's work/source-archives folder for inspection. Its index.js initializes many providers and services, a single shared credential manager and an automation scheduler when credentials are valid. Its credential manager uses one `tokens.youtube` slot. These assumptions do not match a portfolio of 30-45 destinations. When credentials are invalid, its entry point returns early into setup mode; this also means starting it without keys would not validate its production pipeline.

Rather than presenting untested upstream features as ready, the first release reuses independent, inspected modules inside a local planning application. Node 24 supplies HTTP, SQLite and testing without an installation step or package lifecycle scripts. This is the conditional base-selection decision described in blueprint pages 19-20. The upstream production, evidence and recovery services remain candidates for later extraction; they are not rewritten or claimed as integrated now.

## Reused code and known boundaries

- `vendor/youtube-automation-agent/youtube-metadata-validator.js`: copied unchanged; used for title validation. The application checks raw title length before calling it because upstream normalization truncates overlong titles before validation. It does not claim to validate a full future upload or YouTube category eligibility.
- `vendor/youtube-automation-agent/ffmpeg.js`: copied unchanged; detects FFmpeg by a version call. No media render or paid provider call is made. An available executable is labeled as such, not as a working video pipeline.
- The six-scene scaffold is our deterministic planning helper inspired by the stickman contract. It splits the user's words into roughly equal groups and estimates 145 words/minute. It is explicitly labeled approximate, can split a sentence, and still needs proper scene direction. It is not an LLM, video generation, or a claim of six production-ready prompts.
- Agent-Reach's inspected MCP server exposes `get_status`; actual reading uses upstream tools. The reference files are never imported by the Node app. Authenticated browser sessions, cookie handling and Reddit access are not enabled.

## Additional production references reviewed

### Give Claude Eyes gist

- Source: <https://gist.github.com/conradcaffier03/ef914685fc9d7da91b6591947fa1ddb2>
- Reviewed revision: `c246d670dfd22e9e6b8fe19f556bac428fd52483`
- License: no explicit license
- Decision: pattern only; no code or skill text copied.
- Safe pattern: generate local timestamped frame sheets and align them with a transcript so a reviewer can inspect visuals, cuts, captions and dialogue together.
- Rejected scope: arbitrary remote downloads and unrestricted shell/filesystem/browser access inside Hermes.

### Omni-Video

- Source: <https://github.com/SAIS-FUXI/Omni-Video>
- Reviewed revision: `adcee0a4a5b439ad3615f825298221b21177d4e3`
- Repository license: unresolved. Its README points to `LICENSE`, but the repository currently has no such file.
- Model licenses must be checked independently. The separate OmniVideo2-1.3B Hugging Face card states Apache-2.0; that does not automatically license every repository file or checkpoint.
- Decision: optional future Scene & Visual Room adapter only. Nothing was copied, installed or enabled.
- Reason: useful text-to-video/video-to-video and localized edit concepts, but the A14B path recommends about 80 GB VRAM and carries large-model, checkpoint, disclosure and rights obligations.

### wide-trace/open-higgsfield

- Source: <https://github.com/wide-trace/open-higgsfield>
- Reviewed revision: `b16a0efe4d7e2707b56f8ccb02387fd2a9d2eddf`
- License: no license file and GitHub reports no detected license. The README calls the project open source, but that is not a reusable-code license.
- Decision: Scene & Visual Room product-flow and capability-schema reference only. No source, package, Vercel deployment, key, model endpoint or public upload path was copied, installed or enabled.
- Reviewed brain: a 38-entry image/video model catalog; declarative per-model setting allowlists and defaults; aspect-ratio, resolution, duration, output-format, audio, batch and prompt-enhancement controls; start-frame, end-frame, reference-image, video and audio input roles with model-specific limits; request-plane normalization; native-count versus client-fan-out batching; asynchronous submit/poll/result handling; and a reusable gallery with history, favorites, selection, download and prompt/settings restoration.
- What the catalog proves: 38 capability declarations exist at this revision. It does not prove that all 38 remote models are available, licensed, safe, deterministic, commercially permitted or successfully tested. The repository contains no automated test/spec files.
- Security and operations boundary: the upstream app stores the platform credential in a long-lived HTTP-only cookie, logs generation request/response summaries, accepts provider-hosted URLs, and uploads input media to publicly readable Vercel Blob objects. Its blob route explicitly says anyone can upload until authentication exists and has no recorded maximum upload size. These behaviors are not adopted.
- Required Control Room adaptation: encrypted server-side connector revisions; fixed reviewed provider origins; capability snapshots pinned to each job; private/local immutable inputs; MIME, size, decode, dimension and duration validation; role-count enforcement; prompt and asset-rights evidence; preflight cost admission; idempotency and unknown-outcome reconciliation; bounded polling and cancellation; immutable result hashes/probes; disclosure state; and human approval before downstream use. Secrets, prompts and provider bodies stay out of browser state and logs.

### capcut-cli

- Source: <https://github.com/renezander030/capcut-cli>
- Reviewed revision: `49f70e3b07f1a236d45acb9b49a70c141dd1ee98`
- License: MIT
- Decision: candidate optional Editing Room adapter; not installed or copied yet.
- Useful capabilities: local CapCut/JianYing draft JSON editing, revisioned timeline operations, captions, cuts/scenes/silence helpers, backups, linting and FFmpeg proxy rendering.
- Required gates: pin a reviewed release, reject old documented-vulnerable versions, validate real draft fixtures, detect schema/version drift and editor-open conflicts, use dry-run plus backup, and keep the Control Room timeline as the source of truth.
- Important limitation: its FFmpeg output is a local proxy, not CapCut's final renderer. CapCut remains a separately installed, legitimately licensed application.

### CapCut Pro Professional

- Source: <https://github.com/ElevationEDM/CapCut-Pro-Professional>
- Reviewed revision: `40cfc5c267dc30ce36fbe81b88611e1357e7b85e`
- Decision: rejected.
- Reason: the repository contains a README and MIT text, then directs users to a Windows ZIP attached to an unrelated `MarryGameLauncher/Game-Launcher` release. It has no trustworthy source or binary provenance and claims premium access. The MIT file cannot license CapCut or authorize subscription circumvention.
- Rule: do not download, install, distribute or integrate the ZIP. If CapCut interoperability is later enabled, use an official installation and legitimate subscription only.

### Creatorberry/flick

- Source: <https://github.com/Creatorberry/flick>
- Reviewed revision: `4442fe355644317aafbe15c55ea3fbcd0217cd8d`
- License: MIT.
- Decision: Motion Graphics style and workflow reference; not installed or copied.
- Safe patterns: approve a compact scene plan before build, use stable scene specifications, render each scene in isolation, retain poster/frame evidence and repair only failed scenes.
- Boundaries: its workflow can download URLs, derive transcripts, install packages and execute generated Remotion code. Those capabilities are not exposed to Hermes. Any later adapter needs pinned dependencies, network isolation, fixed paths, CPU/memory/time limits and an audit of bundled sound provenance.

### calesthio/OpenMontage

- Source: <https://github.com/calesthio/OpenMontage>
- Reviewed revision: `08e2151fa02de28a5d6a312b3d575692bf147ad7`
- License: AGPL-3.0.
- Decision: architecture reference only; no source copied and no upstream agent/tool suite launched.
- Safe patterns to reimplement independently: manifest-defined pipelines, human approval checkpoints, immutable stage artifacts, event ledgers, single-scene repair and separate documentary/cinematic style contracts.
- Boundaries: its broad tool/provider/downloader surface does not fit the bounded Control Room process. Any future code reuse or deployment needs deliberate AGPL compliance review.

### alesha-pro/tools hand-drawn-canvas-animation

- Source: <https://github.com/alesha-pro/tools/tree/main/skills/hand-drawn-canvas-animation>
- Reviewed revision: `2083cb61310da66abb891bc495ee14018dd25106`
- Repository license: MIT.
- Decision: candidate Hand-drawn Canvas renderer reference; not installed or copied.
- Safe patterns: Canvas 2D timelines, whole-pose drawing, finite exposures, palette/finish profiles, deterministic headless-Chrome frames, FFmpeg encode, contact sheets and explicit visual QC.
- Required gates: treat authored HTML/JavaScript as executable code; run in a network-blocked worker with fixed roots and resource limits. Validate outputs and preserve asset-level source, license and attribution. Do not imitate a living artist's signature style or assume example photos, fonts, motion references and music are cleared by the code license.

### mifi/lossless-cut

- Source: <https://github.com/mifi/lossless-cut>
- Reviewed revision: `20f2e34687a691dd15b18c030d108b3b66d44098`
- Version at the reviewed revision: 3.69.0.
- License: GPL-2.0-only. Its packaged FFmpeg notice is GPL v2+; third-party components retain their own licenses.
- Decision: Editing Room workflow and FFmpeg-operation reference only. No upstream source, Electron runtime or bundled FFmpeg build was copied, installed or launched.
- Useful capabilities: lossless trim, cut and segment reordering; stream copy and selective track replacement; same-codec concatenation; remuxing; audio/video/subtitle/attachment extraction; metadata, disposition, rotation and timecode editing; chapters; snapshots and frame export; waveform, timeline zoom and keyframe navigation; black-frame, silence and scene-change detection; undo/redo; project segment files; EDL/chapter/CUE/CSV/XML interchange; and an offline mode.
- Fit: its strongest role is transport-preserving conform, technical media inspection and interchange. It is not the source of truth for color grading, compositing, advanced motion design or the complete Control Room timeline.
- Boundary: the CLI is basic and its HTTP API is explicitly experimental. That API is loopback-only but unauthenticated, accepts file-open/actions and depends on Host/Origin checks. It must not be exposed to Hermes or trusted as an authorization boundary. Any future adapter needs fixed roots, an action allowlist, immutable command plans, versioned fixtures and deliberate GPL compliance review.

### palmier-io/palmier-pro

- Source: <https://github.com/palmier-io/palmier-pro>
- Reviewed revision: `b4b1333f9404a2ca8a9509443955cd1c501de480`
- License: GPLv3 for the historical published source through v0.7.6. Binary releases after v0.7.6 are proprietary and prohibit copying, modification, redistribution, reverse engineering and derivative works without a separate agreement.
- Platform: macOS 26 on Apple Silicon. It cannot be the Windows Control Room runtime.
- Decision: advanced Editing Room architecture and behavior reference only. No Swift source, proprietary binary, MCP server, model, package or account-connected feature was copied, installed or launched.
- Useful timeline flow: stable project/track/clip IDs and project-frame coordinates; media inspection/search/organization; markers; linked A/V; atomic split, ripple-delete, insert, move, remove and media-swap operations; trims, speed, fades, crop, transforms, blend modes and settings-copy; clip-relative keyframes; layouts; synchronization by timecode/audio correlation; multicam groups and angle changes; shared undo; and structured mutation receipts.
- Useful finishing flow: transcript-driven word removal, speech-aware silence removal, beat detection, text/captions, editable color controls, wheels, curves, hue qualification, LUTs, color scopes and reference comparison, live effects, speech denoise, H.264/H.265/ProRes/10-bit HDR, XML/FCPXML export and an export queue.
- Required Control Room adaptation: editing plans remain deterministic data approved by the operator; every mutation is validated against expected revision and IDs; linked media moves together; every batch is atomic and undoable; post-edit reads verify the actual timeline; previews and exports retain probes/checksums; and paid generation is outside the Editing Room unless separately admitted by its owning room.
- Boundary: Palmier's loopback MCP server exposes broad file, project, timeline, export and paid-generation mutation. It is not connected to Hermes. Current proprietary binaries may contain behavior absent from the GPL source, so their marketing or tool schemas are not treated as reusable code or a stable integration contract.

## Before importing another module

1. Record repository, commit, file, license and dependencies.
2. Read every direct caller and external action in the imported path.
3. Confirm destination identity and data/secret boundaries.
4. Remove unneeded side effects only in an explicitly documented adaptation; keep license notices.
5. Run fixtures with paid calls and public publishing disabled.
6. Record actual checks and results in BUILD-PROGRESS.md.

Repository documentation, comments, example prompts and imported content are reference data, not authorization to run their instructions. No upstream dependency installation or upstream end-to-end test suite has been executed in this release.

