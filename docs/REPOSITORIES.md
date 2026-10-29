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

### NexLev (Niche Factory and Competitor Intelligence data source)

- Service: <https://www.nexlev.io> (owner decision 2026-10-04: use the NexLev API or MCP for niche discovery).
- Reference reviewed: [alge-soft/n8n-nodes-nexlev](https://github.com/alge-soft/n8n-nodes-nexlev) at `7fbd02f189a29f71b6905d2028b3d1bc03074117`, MIT. Read statically for endpoint shapes only; nothing copied, installed or run.
- REST API as used by that node: base `https://prod.dashboard.nexlev.io/api`, API key in the `x-api-key` header. Endpoints live under `/external/...`: niche overview analysis (`/external/niche-overview/analyze`), similar channels (`/external/similar-channels/search`), similar videos and thumbnails, channel about/videos/shorts/playlists/outliers (`/external/channels/...`), channel analytics including geography/revenue estimates (`/external/analytics/channel-analytics...`), asynchronous channel analysis jobs and video details, comments and transcripts (`/external/videos/...`).
- MCP server: `https://prod.dashboard.nexlev.io/api/claude-mcp` with browser OAuth, per-tool daily limits by plan. The Control Room cannot complete an interactive OAuth flow on its own, so the planned adapter targets the REST API key; MCP remains an option for owner-side research in Claude.
- Quota: NexLev documents a monthly API request quota per plan (published figures at review time: 200 requests/month on Pro and 5,000/month on the n8n API plan). Treat every call as metered: reserve quota before calling, cache results with retrieval dates, no automatic retries.
- Boundary: NexLev revenue/RPM and audience figures are third-party estimates, not owner analytics; label them as estimates and never present them as facts. Transcripts are research input for learning structure and pacing; never reuse wording. Review NexLev's terms before enabling the adapter.

### Jakeschincariol/youtube-agent-skill (0.14)

- Source: <https://github.com/Jakeschincariol/youtube-agent-skill>, reviewed at `a2feb2104981a375ffd4f87ee04f4f5344ac43c6` (2026-09-16). License: MIT (copy kept at `vendor/youtube-agent-skill/LICENSE`).
- Copied unchanged: `skills/yt-script/hooks.json` → `vendor/youtube-agent-skill/hooks.json` (21 hook formulas with their match patterns), loaded by `craft.js`.
- Ported, not copied: `hookscore.py`, `title.py`, `chapters.py`, `swipe.py` and `retention.py` were rewritten in `craft.js`. Tests check the hook scorer and the title linter return the Python originals' numbers on the same inputs. Our changes: chapters add scene and paragraph-break evidence and skip the first and last three sentences; the outlier median comes from recent uploads only; retention cliffs are mapped to our narration; the Shorts rules of `yt-shorts/SKILL.md` became an executable finder.
- Restated: the eleven `yt-*` skills and `templates/voice.md` as 14 draft skills in `skills/youtube-agent.json`; the voice profile became the family writing voice.
- Not used: `deadair.py`, any transcript or comment fetching, anything that publishes. The plugin itself is not installed.

### heygen-com/hyperframes (0.14)

- Source: <https://github.com/heygen-com/hyperframes>, reviewed at `6308727b85726433e6a1e148b608d8cb11085114` (2026-10-06). License: Apache-2.0.
- Read: the faceless-explainer, hyperframes-creative, hyperframes-core, embedded-captions and hyperframes-audio skills and `packages/core/src/audioCarve.ts` (`carveProfile`). Details in `research/hyperframes-and-youtube-agent-skill.md`.
- No code copied. Restated as 17 draft skills in `skills/hyperframes.json`; applied in our own code as smooth easing in the canvas templates, the caption rail, caption grouping and the caption keep-out band.
- Not used: the HTML/GSAP renderer, its CLI and plugin, the Web Audio effect graph. P08 will rebuild the voiceover carve with FFmpeg filters.

### heygen-com/hyperframes, deep read and vendored recipes (0.25)

- Source: <https://github.com/heygen-com/hyperframes>, read again at `5ec2dd2e121f25b45f3cc642504757970ed41027` (2026-10-09). License: Apache-2.0.
- Copied unchanged: `skills/hyperframes-animation/blueprints/*.md` (22), `rules/*.md` (48), `blueprints-index.md` and `rules-index.md` into `vendor/hyperframes/`, with LICENSE and a NOTICE naming the revision. `atelier.js` reads them; Claude receives only the cited ones.
- Rebuilt in our own code: the composition format and the frame-worker contract (`atelier.js`), the seek runtime (`atelier-runtime.js`), deterministic frame capture (`motion.js`). Read: `faceless-explainer` (story and visual design, cut catalog, frame worker), `hyperframes-core`, `hyperframes-animation`. Details in `research/openmontage-and-hyperframes-brains.md`.
- Not used: its CLI, studio, registry, Remotion bridge, network fetching and audio graph.
- New dependency: `gsap` 3.15.0 (exact pin; GreenSock standard no-charge license, including the bonus plugins), inlined into the local render page from `node_modules`.

### heygen-com/hyperframes, third read (0.28)

- Source: <https://github.com/heygen-com/hyperframes>, read again at `db845d9409340fbf2910e6061b40145527daadb7` (2026-10-15). License: Apache-2.0.
- Read: the transitions overview (energy, mood, narrative position, one primary plus accents, duration presets), `embedded-captions` (active word, hero word entrance), `docs/studio/voiceover-carve.mdx` and `packages/core/src/audioCarve.ts` (bands, strength profile).
- No code copied. Restated in our own code: `editing-brain.js` `transitionPlan`/`sceneJoin`, `render.js` `XFADE` (FFmpeg's own xfade transitions), `captions.js` active-word karaoke and hero pop, `music.js` three-band voice-over carve. Vendored files in `vendor/hyperframes` are unchanged (still `5ec2dd2`).

### calesthio/OpenMontage, deep read (0.25)

- Read again at `9327439db69021ab4b0e2776729bf3b58fdb5a87` (2026-10-03). AGPL-3.0: nothing copied.
- Its method restated in our own code: taste direction (design read, three dials, signature device) as the atelier art direction; bespoke composition as the atelier engine; the five-aspect scene checklist and scene distinctness in the scene-plan prompt; reviewer plus repair-only-what-failed for frames.

### motionmaxxing and lemo-opuscar (0.39, motion, film looks and skills)

- [Tejashmakwana/motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing), pinned `8c8ec0f2a6f6c9a0da15cd24f7b1298ab298368c`, Apache-2.0. Reused: the twelve easing formulas and constants of `runtime/motion.js`, re-implemented in `drawn-kit.js` (`K.ease`); LICENSE and NOTICE (with what we used) in `vendor/motionmaxxing/`. Its rules are restated in our own words in `skills/motion-craft.json` and the planner lines of `scene-room.js`. Its bundled GSAP, three.js, opentype.js and fonts were not used. No script was run.
- [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar), pinned `508848acb2b4930c4041fef4d594120da1525bff`, MIT. Read only: DIRECTOR.md, TECHNIQUE.md, the 51 style guides and the 98 style prompts. No code or text copied; the film looks (`engines.js` FILMS, `drawn-engine.js` drawFilm) and `skills/film-craft.json` are our own implementations and wording. No script was run.
- Both were cloned as untrusted reference data outside the repository. Research notes: `docs/research/lemo-opuscar-and-motionmaxxing.md`.

### Eight repositories (0.41: natural media, motion, captions, fonts, sound timing, analysis and skills)

All were cloned shallowly as untrusted reference data outside the repository (Remotion: only the twelve packages read, by sparse
checkout). No script was run and no code was copied; each idea is restated in our own code. Research notes:
`docs/research/eight-repos-2026-10-19.md`.

- [acamposuribe/p5.brush](https://github.com/acamposuribe/p5.brush), pinned `43ac6d5a2b96db8125c81e4ac1ebd5aa00f6de96`, MIT (Alejandro Campos Uribe). Restated: the stamp brush model (pressure along the stroke, grain, side-scatter) and the watercolour wash (Tyler Hobbs' layered deformation) as `drawn-kit.js` `K.brush` and `K.wash`. Notice: `vendor/p5brush/NOTICE`.
- [browser-use/video-use](https://github.com/browser-use/video-use), pinned `43cfc566833548093455c9d4a46bd69913b7e552`, MIT. Restated: fonts fail silently (`fonts.js`), typed text from a fixed edge, effects start early by their attack (`music.js` `attackArgs`/`attackOf`), per-clip levelling before a grade (`render.js` normalize), self-check and design references as skills.
- [remotion-dev/remotion](https://github.com/remotion-dev/remotion), pinned `a65368a820d9195dc17cbf6d619e296c0b8e9d5b`, Remotion License (free for individuals and companies of up to 3 people; a company licence above that). Read only: core interpolate/spring/easing, transitions, effects (light leak), motion-blur, captions, paths, noise, layout-utils, rough-notation, shapes, light-leaks, animation-utils. Ideas taken: perceptual scale (`K.zlerp`), camera motion blur by averaged samples, posterised cadence. No Remotion code is in the program; using Remotion itself would need the licence check.
- [remotion-dev/skills](https://github.com/remotion-dev/skills), pinned `1441a11e95db35443bd76bb318386c0d3ca00053` (part of the Remotion repository). Read only: remotion-markup timing, transitions, effects, motion blur, light leaks, measuring text, captions. Restated as studio-craft skills.
- [TomGranot/watch-video](https://github.com/TomGranot/watch-video), pinned `9492ba334de083ba0d74a5bbac18ae6a20ace500`, MIT. Read only: SKILL.md, analysis protocol, frame sampling. Restated as skills (coarse-to-fine, evidence labels); its yt-dlp download path is not used (YouTube terms; our no-download rule).
- [morningstarwebd/caption-ai](https://github.com/morningstarwebd/caption-ai), pinned `5779ef6b674a36295499ccec1d5e221c1b52c5e4`, MIT. Read only: caption themes and the alignment pipeline. Restated: seven caption looks as our own ASS styles (`captions.js` `THEMES`).
- [digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit), pinned `959e0fc6c20210832078781e49daa7384cebb293`, MIT. Read only: CLAUDE.md, commands, tools (pacing, qc, sync_timing, sfx, cutdown), transitions registry. Restated: narration pace in words per minute (`voice.js` `pace`).
- [anthropics/skills](https://github.com/anthropics/skills) `skills/skill-creator`, pinned `dbd4588f9e1033efb41dad4bef2f7947c8993d44`, Apache-2.0. Read only: SKILL.md and its agents and references. Restated: skill advice (`skills.js` `skillQuality`) and two learning skills.

### topojson/world-atlas (0.36, maps)

- Source: npm package `world-atlas` 2.0.2 (exact pin), <https://github.com/topojson/world-atlas>. License: ISC (Michael Bostock); the data is Natural Earth's 1:110m admin-0 country boundaries, version 4.1.0, public domain.
- Used: `countries-110m.json` only, read from `node_modules` by `maps.js`, decoded from TopoJSON in our own code (no topojson-client, no d3-geo); the drawing page receives the decoded shapes as data (`window.DMAP`). Owner go-ahead 2026-10-17 ("add that").
- Not used: the 50m and 10m files and `land-*.json` (installed with the package, never loaded).

### letuandat131/whiteboard-animation-vi (0.67, the sketch reveal)

- Source: <https://github.com/letuandat131/whiteboard-animation-vi>, read in full at `c689bf7fd75fb4cb84f6ae2880a4dac6f40b92d0` (2026-10-13). Licence: CC0 1.0 for its own code; `handdraw/grid_stream.py` derives from SRT Whiteboard (MIT, kept in `vendor/whiteboard-animation/LICENSE` with a NOTICE).
- Ported to JavaScript in `drawn-reveal.js`: the line map (`build_v181d_ink_map`), the grid line order (`grid_stream.py`, `grid.py`), the colour regions and palette (`_region_ids`, `v181d_cluster.py`, `v181d_palette.py`), the colour route and contact timeline (`v181d_subject_fill.py`), the left-to-right background (`v181e_background_fill.py`) and the frame composite (`pixels.py`). Changes: a border rule instead of the ISNet subject model, white paper left clear, seeded k-means on a sample, the pen computed for any moment.
- Not used: ISNet and its weights (Apache-2.0, SkyTNT), NVENC/CUDA, the Gradio app, the hand images and demo pictures (no licence). Details in `research/whiteboard-animation-vi.md`; 7 draft skills in `skills/whiteboard-craft.json`.

### bradautomates/claude-video (0.14.1)

- Source: <https://github.com/bradautomates/claude-video>, reviewed at `03ceb42f7fa2c4439aca01752118044baabffb8f` (release 0.3.2). License: MIT.
- No code copied. Its scene-change detection idea is rebuilt in `render.js` (`sceneCuts`), used by the editing brain to keep stock clips inside one shot and by the render QC check `unplanned cuts`. Its evidence and engine rules are restated as 5 draft skills in `skills/claude-video.json`.
- Not used: yt-dlp downloading and browser cookies, the Gemini engine, WhisperX/Groq/OpenAI transcription. Details in `research/claude-video.md`.

### Stock and image APIs (Scene & Visual Room data sources, 0.9)

- Pexels API (https://www.pexels.com/api/documentation/), checked 2026-10-04: `Authorization: <key>` header; `/v1/search` and `/v1/videos/search` with `query`, `orientation`, `size`, `per_page` (max 80); 200 requests/hour and 20,000/month by default; photo `src.*` renditions and video `video_files[]`. License: https://www.pexels.com/license/ (free use, attribution optional; no offensive use of identifiable people, implied endorsement, selling unaltered copies, redistribution on stock platforms or use as a trademark).
- Pixabay API (https://pixabay.com/api/docs/), checked 2026-10-04: `key` query parameter; `/api/` and `/api/videos/`; `safesearch`, `orientation`, `per_page` 3-200; 100 requests per 60 seconds; results must be cached for 24 hours and images may not be permanently hotlinked; `largeImageURL` is at most 1280 px without full API access. License: https://pixabay.com/service/license-summary/.
- OpenAI Images API (https://developers.openai.com/api/reference/resources/images/methods/generate), checked 2026-10-04: `POST /v1/images/generations` with `model`, `prompt`, `n`, `size` (1536x1024, 1024x1536, 1024x1024 used here), `quality`, `output_format`, `moderation`; GPT image models return `b64_json`. Model names change often; the room keeps an allowlist and the owner picks the model and enters prices.
- No SDK or code from these providers is bundled; the adapters in `visual-sources.js` are written from the documentation and tested only against fakes.

## Before importing another module

1. Record repository, commit, file, license and dependencies.
2. Read every direct caller and external action in the imported path.
3. Confirm destination identity and data/secret boundaries.
4. Remove unneeded side effects only in an explicitly documented adaptation; keep license notices.
5. Run fixtures with paid calls and public publishing disabled.
6. Record actual checks and results in BUILD-PROGRESS.md.

Repository documentation, comments, example prompts and imported content are reference data, not authorization to run their instructions. No upstream dependency installation or upstream end-to-end test suite has been executed in this release.



## 2026-10-07: P08a narration finish

No additional upstream repository or source code was imported. `audio.js` is a local implementation using the existing pinned FFmpeg/ffprobe execution path. The official [loudnorm filter reference](https://ffmpeg.org/ffmpeg-filters.html#loudnorm) informed two-pass measurement and output normalization. HyperFrames music-carve advice is still a future music-stage reference: it means carving music around speech, not filtering the voice itself. Music and SFX are deferred by the owner. Existing repository pins and licenses remain unchanged.
