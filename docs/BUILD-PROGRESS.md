# YouTube Control Room - detailed build process

Last updated: 2026-10-16. Current application: 0.31.0. The Style Library shows one card per editing engine with its features inside; the hand-drawn engine gained keyword, comparison and head tools. The program learns a look from a reference (style studies) and turns it into a style draft after a named approval. The drawing hand is a stickman option; the stickman engine has whiteboard, storybook and doodle looks; the hand-drawn engine is an illustrated explainer. Hand-drawn engine v2: a hand draws and writes every scene; HyperFrames' transition brain, word-by-word captions and voice-over carve are in the edit. Long narrations stay in sync with the pictures, and every story builds its own world, cast and kit (objects, places and costumes the drawing vocabulary lacks). One long video can now use every engine where it serves the story (the story director, Story Mix style). Scenes can now be designed from scratch by Claude (the atelier engine, HyperFrames and OpenMontage method) next to the stickman, hand-drawn and motion-graphics engines; one shot can be redesigned on its own. Room 07 scores the video with music and places sound effects (ElevenLabs, on a click). Narration-only finishing is implemented in Room 07, the owner can correct caption wording and download WebVTT, Room 08 Review & QC reviews every render with Claude scanning every frame first, and videos can be any length (1-180 minutes); the current Claude direction is preserved. P07 and full P08 remain partial; final masters and publishing are not enabled.

## Resume here

Read HANDOFF.md, CONTINUATION-REVIEW.md, AUDIO-ROOM.md, build-status.json and README.md. The current owner decisions (2026-10-07) supersede the earlier Hermes-only direction: keep Claude, and build narration-only audio first with music deferred. The room-by-room contracts and older implementation log remain useful historical evidence.

The next operator check is a real primary-language production proof: approve script/narration/visuals, draft a current edit, run the updated FFmpeg readiness check, pin that build, save Audio Room settings, render and listen before signing the proof. P07 caption corrections and WebVTT are done (0.15.1); measured word alignment waits for an adapter decision. Room 08 Review & QC (P09) is built (0.16.0); the next development work is P10 Packaging, then the P11 final master. Do not enable dependent release stages until their required inputs and gates pass. Skills remain draft-only until exact revision approval; channel/niche profiles remain pin-only. Additional locales and per-channel OAuth are later stages; no publication endpoint exists.

## Owner decisions (2026-10-04)

- Verified changes go to the owner's local folder; GitHub pushes happen only on request.
- Hermes stays the writer for scripts and research briefs.
- Each room is built to full depth before moving on; integrated testing of all rooms follows.
- Human approval gates stay until the Y03 autopilot gate passes per format.
- The owner assigns styles to channels; Documentary Montage is the first executable style because visuals come from stock libraries and AI generation.
- Each family stores 3-10 competitor channels; competitor learning uses roughly 30% reference patterns and 70% original contribution.
- ElevenLabs is the narration provider.
- A Niche Factory will use the NexLev API/MCP plus the owner's niche ideas.

## Agreed delivery sequence

These delivery steps group the tracked milestones into one dependency order. Complete and verify each step before enabling the next dependent capability.

1. [x] Live Hermes validation, completed 2026-09-10.
2. [x] Daily research and topic evidence briefs, completed 2026-09-11.
3. [x] Expressive narration in the family’s selected primary locale, completed 2026-09-20.
4. [x] Five versioned editing-style profiles and explicit channel-family assignments, completed 2026-10-04.
4a. [x] Competitor Intelligence (R05) and Niche Factory (R06), added by the owner on 2026-10-04 and built the same day (live provider verification pending keys).
5. [x] Real scenes and licensed visual assets bound to narration and style revisions, completed 2026-10-04 (live provider verification pending keys).
6. [x] FFmpeg readiness, deterministic proxy rendering and one sandboxed style proof, completed 2026-10-04 with fixture media (the owner's first proof on real visuals is pending).
7. [x] Revisioned editing timeline and single-scene repair, completed 2026-10-05 as the Editing Room with the editing brain and critic (canvas motion templates follow as P06b).
8. [ ] Production captions and visible-text QC.
9. [ ] Licensed music, sound effects and audio-mix QC.
10. [ ] Complete audiovisual Review & QC evidence. (0.16.0: Room 08 built and tested on fixtures; proof on real material pending.)
11. [ ] Reviewable packaging variants, then final render, recovery and human master approval.
12. [ ] Optional configured-language editions with independent retries and approvals.
13. [ ] Per-channel YouTube OAuth, private upload and reconciliation.
14. [ ] Attach approved captions/thumbnails and schedule the exact approved edition.
15. [ ] Authorized analytics and controlled autopilot.
16. [ ] Gradual scaling toward 10 to 15 channel families.

## What the user requested

A UI-based program that researches markets and competitors, proposes differentiated niches and daily topics, writes original scripts, directs expressive voice, edits videos, optionally localizes into user-selected family languages, uploads and manages 10-15 channel families with a variable number of channels, then learns from results. Tier A/B are user-defined market profiles. The 90-100 day period is a validation target, not a guarantee of ranking or earnings. The user requested a separate folder and a detailed record of completed and remaining work.

## Current milestone and acceptance

Current milestone: captions (P07, primary language) and the YouTube craft engine (S02), v0.14. Acceptance: captions are part of the immutable edit revision and follow the narration, carry every narrated word exactly once, never overlap, are burned in as the top layer only when switched on and download as SRT; graphics keep out of the caption band; the craft scores equal the upstream Python tools on the same inputs; craft output is advice or a draft only; never-used words block Hermes candidates but never the owner's own draft. Remaining for P07: measured word timing, owner-editable caption text, WebVTT, locale caption editions (L01-L03). Earlier: FFmpeg readiness and assembly proxy (P05) v0.10 is complete. Acceptance: readiness records versions, checksums, filters, encoders and a byte-identical fixture; renders run only with the pinned binaries and only from current approved inputs whose checksums still match; the proxy is frame-exact against the narration for cut, crossfade and dip-to-black; QC covers duration, frame, audio, black and frozen pictures; results and manifests are immutable; a human records the style-proof verdict. Previous milestone: Scene & Visual Room (P04) v0.9 is complete with fake-provider verification. Acceptance: a plan needs an approved script, an approved narration and a ready style handoff; every revision is immutable with stable scene and shot IDs; stock searches stay within hourly caps and a 24-hour cache; downloads come only from provider media hosts with size, type, checksum and ffprobe checks; AI images are admitted against a monthly budget and never retried silently; a named human approves the plan and the full board with rights and AI-disclosure decisions; any later change ends the approval. Previous milestone: Competitor Intelligence (R05) and Niche Factory (R06) v0.8 are complete with fake-provider verification. Acceptance: no outside request without an explicit owner action, reserved data caps and token budgets, no automatic retries, YouTube data about other channels display-only and purged after 30 days, blueprints blocked unless they pass the 30/70 rule and copy guard, niche scores computed in code with hard filters winning, and every effect (script guidance, narrator prefill, style draft, new family) behind a named human review. Previous milestone: Style Library & Assignment Room v0.7 is complete. Acceptance: five launch styles exist as reviewable drafts; no draft can be assigned; every revision is immutable; a family default must be approved and format-compatible; overrides need explicit acknowledgement; fallbacks are manual-only; retiring or revoking blocks the handoff instead of switching styles. Preserve original data during editing and tests; configured language slots are still not connected YouTube channels.

<!-- CHECKLIST:START -->
Completed: 21 / 56 tracked work items. These items have different sizes; this is not a percentage of total engineering effort.

### 01 · Local foundation

A dependable local workspace that preserves every draft and distinguishes planning from live automation.

- [x] **F01 Blueprint review and repository register** (done) - Reviewed blueprint and pinned source; preserved licenses and recorded reuse decisions in REPOSITORIES.md.
- [x] **F02 Channel families and local persistence** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F03 Content studio and review gates** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F04 Saved storyboard planning jobs and export** (done) - Automated checks passed on 2026-09-08; desktop family, draft, review and storyboard flow verified. See BUILD-PROGRESS.md.
- [x] **F05 Local request protection and browser usability** (done) - Request boundary tests passed; desktop and 390 x 844 browser draft editing/revision checks passed on 2026-09-08.
- [x] **F06 Process ledger, launcher and release checks** (done) - 29 automated checks passed; Windows start/stop/restart passed under the same user. Ledger, setup guide and GitHub workflow updated.
- [x] **F07 Family competitor channels** (done) - 2026-10-04: families store 0-10 validated competitor channels (@handle, UC… ID, /channel/, /user/ links; duplicates, video, /c/ and non-YouTube links rejected). Edits keep approved scripts. 3 automated checks in tests/competitors.test.js.

### 02 · Accounts and research

Approved data access and evidence-led research without invented metrics.

- [ ] **R01 Protected provider and channel credentials** (testing) - Named connector CRUD, encrypted credentials and read-only YouTube/OpenAI/ElevenLabs tests implemented (37 checks passed). Remaining: per-channel OAuth state/PKCE, identity binding and refresh/revocation; MCP/Reddit live adapters.
- [ ] **R02 YouTube read-only connector** (testing) - Implemented/tested bounded public channel lookup with synthetic responses. Remaining: real Google project/key verification, owner identity, recent-video collection, quota accounting and source retention.
- [ ] **R03 Permitted web, Reddit and Agent-Reach tools** (planned) - Confirm platform access and permitted use; add narrow adapters and real health checks. Agent-Reach get_status alone is not reading/searching.
- [x] **R04 Daily niche and topic evidence briefs** (done) - Version 0.5 stores revisioned permission-labeled evidence and immutable date-scoped review-only briefs with source links, confidence, deduplication, expiry, token accounting and deliberate retries. A live brief completed on 2026-09-11; desktop and 390 x 844 layouts passed. Automatic collection is intentionally not enabled.
- [x] **R05 Competitor Intelligence Room** (done) - Version 0.8 (2026-10-04): Competitors page with revisioned owner observations, explicit NexLev/YouTube scans against reserved data caps (no automatic retries; 3 deliberate attempts), YouTube data display-only and purged after 30 days unless derived-metrics approval is recorded, Hermes technique blueprints with evidence refs, prompt compaction, 30/70 rule and 8-word copy guard, named review with three confirmations, revoke/supersede/outdated detection; approved blueprints feed Hermes script guidance, narrator-form prefill and a validated style draft, each still human-gated. Fake-provider tests in tests/intelligence.test.js; full suite 123 tests, 121 passed, 2 Windows-only skipped; desktop and 390 x 844 browser flows passed. Live NexLev/YouTube/Hermes verification pending owner keys. 0.9 adds per-competitor blend picks (voice-over, narration, editing, thumbnails, visuals): revisioned, enforced per area (picked channels only, at most 30% reference per area), with a blend recipe, packaging brief and outdated detection when picks change.
- [ ] **R05c Style studies: the program learns a reference video's look from frames on this PC (measured rhythm and colours, Claude study, 30/70 and copy guard, named approval, style draft with a planning brief)** (testing) - 0.30.0 (2026-10-15): live study of our own preview (37 s, 7,757 tokens) mapped to Stickman · Whiteboard with 5 learned techniques and 12 of our own; dialog checked in the browser; npm test 263/263 passed.
- [x] **R06 Niche Factory** (done) - Version 0.8 (2026-10-04): Niche Factory with revisioned owner ideas (keywords, seed channels), explicit NexLev discovery (niche overview, similar channels, keyword search, labelled analytics estimates), Hermes rubric evaluation with evidence refs and 20 distinct episode ideas, score computed in code (25/25/20/15/15), hard filters forcing do-not-produce, 6-word title copy guard, separate monthly token budget, shortlist/reject/approve review and family creation from an approved niche. Fake-provider tests and browser flows passed; live NexLev MCP (OAuth) not used, REST API only; live verification pending owner keys.

### 03 · Original scripts and production

A sourced primary-language master becomes a real, reviewable video.

- [x] **P01 LLM writing with claim and budget controls** (done) - Version 0.5 enforces long-form/Shorts word and structure policy, current evidence links, transactional monthly/per-job token reservations, usage settlement, unknown-use blocking and capped deliberate retries. A live 888-word long-form candidate passed on 2026-09-11 using 2,855 tokens; the saved draft remained unchanged.
- [x] **P02 Directed, expressive primary-language narration** (done) - Version 0.6 implements immutable family voice profiles and pronunciation lexicons, consent/commercial-rights evidence, fixed OpenAI/ElevenLabs adapters, pre-request validation, family-local character reservation/settlement, capped deliberate retries, immutable checksummed WAV artifacts, fail-closed FFmpeg decode and measured QC, human comparison and intelligibility approval, revocation, artifact-integrity checks and downstream invalidation. The protected HTTP/runtime workflows, local real-audio fixtures, corruption/tampering cases, 1440 x 1400 desktop and exact 390 x 844 mobile reviews passed. The complete 100-test suite passed after all eight findings from the independent fail-closed review were fixed. No live provider request is claimed; that remains a separate explicit potentially billable operator action.
- [x] **P03 Style Library and channel assignments** (done) - Version 0.7 (2026-10-04): five launch profiles seeded as reviewable drafts; immutable, trigger-protected revisions with diffs; named human approval with three confirmations; custom and derived styles; family default, acknowledged channel overrides and manual-only approved fallbacks; renderer compatibility checks; retire/revoke without silent switching; per-family style handoff; invalidation ledger. 9 style checks; full suite 110 passed, 2 Windows-only skipped; desktop and 390 x 844 browser flows passed. Documentary Montage chosen as the first executable style.
- [x] **P04 Scene & Visual Room with rights provenance** (done) - Version 0.9 (2026-10-04): Scene & Visual Room with rule-based and Hermes scene plans (stable scene/shot IDs, word-share timing from the approved narration, style-bound checks, immutable revisions, single-scene repair), versioned capability registry, Pexels/Pixabay search with hourly caps and 24-hour cache, licensed downloads restricted to provider media hosts with checksum and ffprobe evidence, OpenAI image generation with monthly budget admission, deliberate retries, visual approval with rights and AI-disclosure decisions, snapshot handoff and invalidation. 9 scene checks with real FFmpeg on generated media and fake providers; full suite 133 tests, 131 passed, 2 Windows-only skipped; desktop and 390 x 844 browser flows passed. AI video, generated graphics and maps have no adapter yet; live provider verification pending owner keys.
- [x] **P05 FFmpeg readiness, proxy renderer and first style proof** (done) - Version 0.10 (2026-10-04): FFmpeg readiness (versions, binary SHA-256, filter/encoder inventory, byte-identical fixture), owner-pinned binaries re-checked before every render, deterministic 360p assembly proxy of the approved board on the approved narration (frame-snapped shots, Ken Burns stills, held/trimmed clips, cut via concat or crossfade/dip via frame-exact xfade), QC (duration, frame, audio, black, frozen), contact sheet, immutable render manifest with commands and logs, cancellation, restart recovery and a human style-proof verdict. 5 render checks with real FFmpeg; full suite 138 tests, 136 passed, 2 Windows-only skipped; desktop and 390 x 844 browser flows passed. Documentary Montage proven with fixture media; the owner's first proof on real visuals and his Windows FFmpeg build is pending.
- [x] **S01 Skills Engine: reviewed operating knowledge used at runtime** (done) - 313 builtin skills seeded as drafts from the three owner documents (38 + 51 + 64, the CB YT AI Mastery bundle added in 0.11.1) and the editing-brain research (160); channel and niche profiles are pin-only and reach only the family they are pinned to; a coverage test asserts every skill ID the build brief maps. Immutable revisions with a named three-point approval, owner skills, import/export, per-family pins and blocks, a compiled brief injected into the Hermes script and research prompts inside the family token limit, a usage log of the exact revisions injected, deterministic rule helpers, and a learning loop whose lessons only ever produce a draft. 16 Skills tests; full suite 154/154 on Node 24.18.1 (0.11.1). Nothing is injected until a human approves that exact revision.
- [x] **P06 Editing Room: editing brain, critic and revisioned edit** (done) - Version 0.12 (2026-10-05): a deterministic editing brain (editing-brain.js) drafts the edit from the approved board, the narration pauses measured with FFmpeg silencedetect and the family style: sentence-snapped cuts, breathing holds with heroes and the hook limit, eased camera moves that never repeat on neighbours, long-still punch-ins, clip trims and safe slow-downs, structural transitions within a budget, a fade-out ending, retention markers and proposed motion graphics (stat, quote, date, plan text, the owner's title card at turns). A critic scores slideshow risk and files critical/suggestion/polish findings with fixes and skill IDs. Immutable revisions, optimistic concurrency, undo, single-scene repair, owner-correction lessons, and an edit render through the pinned FFmpeg with an ASS graphics layer, uniform BT.709 segments, planned-dark QC and a byte-identical re-render. 8 editing tests; full suite 162/162; desktop and 390 x 844 browser flows passed. 0.14.1: stock clips are measured for hidden cuts and kept inside one shot; the critic flags hidden cuts and edit renders check for unplanned cuts (claude-video scene detection).
- [x] **P06b Animated graphics: canvas charts, timelines, lists, comparisons and diagrams** (done) - Version 0.13 (2026-10-06): six deterministic Canvas2D templates (bar and line charts, timeline, list build, comparison, process diagram) with clean or hand-drawn finish, drawn in the local Microsoft Edge/Chrome over the DevTools Protocol (no npm packages, networking blocked) and overlaid on the edit as lossless RGBA clips. The editing brain proposes them only from the script's own data; owners edit the data line by line or add graphics. Browser readiness probe; manifest records browser and frame hashes. Full suite 165/165; a Shorts edit with an animated timeline renders byte-identically twice; a bar chart added from the page passed QC. Map routes and stick-figure animation remain.
- [ ] **P06c Drawn scenes: stick figures, hand-drawn and motion-graphics shots** (testing) - 0.19.0 (2026-10-08): sketch.js closed vocabulary with validation, a free fallback from the narration and Claude's planning guide; motion-templates.js sketch-scene draws figures, props, text, arrows and bubbles stroke by stroke with idle motion, hand-drawn or clean finish, text kept in frame and off drawings; generated-graphics is executable as the local drawn-scene capability (Draw all scenes, clips versioned by sketch and engine); drawn styles render through the montage assembler; light-palette captions use the style ink; no overlays duplicate a drawing's words. Demo: Claude planned a 62-second lightning explainer in 17 drawn shots (66 s, 10,190 tokens), drawn at 1080p in 4-6 minutes, edited and rendered with every check passing; frames reviewed and five layout/legibility issues fixed. Full suite 211/211.
- [ ] **P06d Engines that work together: stickman, hand-drawn, motion graphics and footage** (testing) - 0.20.0 (2026-10-09): engines.js primary/partner matrix with written refusals (stickman never joins hand-drawn); sketch.js cast with looks, 40 poses, 26 expressions, 15 emotes, about 125 props, 25 sets, moods, 25 motion effects, 9 kinetic text styles, cues on words, lenient repair of Claude drawings with named warnings; browser engine in six drawn-*.js files (pure functions of time, catalog equal to the vocabulary); Room 04 720p previews; renders redraw drawn shots on the captions' word times with three browsers and JPEG frames; the brain cuts on cue words and never trims drawn clips; launch library v2 drafts for unrevised launch profiles. Demo: Claude planned the 39.5 s lightning script in 18 cued shots with a cast of two (105 s, 14,569 tokens, no warnings), previews drawn in 276 s, render at 1080p in 150 s (489 s before the speed-up), every check passing; frame review found and fixed a counter hidden behind its burst, a title card over a drawn shot, false hidden-cut flags on drawn flashes, characters and a stamp cropped during zooms, and a slow ink reveal. Full suite 220/220 passed, 0 skipped (263 s).
- [ ] **P06e Engine reasoning, unlimited cast and the continuity review** (testing) - 0.21.0 (2026-10-09): engines.js now describes strengths, risks and usual mixes and nothing is forbidden in code (owner instruction: reasoning, not hard-coded rules); shots that leave the main look need a reason in their notes; launch library v3 restores photos/footage/AI images to drawing styles as options; the cast takes every character the script needs (sanity bound 40); scenes carry a setting; Sk.continuity notes place jumps and screen-direction flips; the continuity review (second Claude answer per part, own token limit) redraws shots that do not match their words. Real Claude test on the 39.5 s demo: the review changed 4 of 18 shots with reasons (a stamp naming the sun before it was spoken, a stamp cropped by a zoom, a picture that did not match 'hear it', a character jumping sides), 43,222 tokens for plan and review. Drawn frames back to lossless PNG.
- [ ] **P08b Voice direction: the narrator's emotion follows the script** (testing) - 0.22.0 (2026-10-09): delivery.js (18 emotions, energy, pace, pause, stressed words; inline tags on ElevenLabs v3/v4, per-segment voice settings or OpenAI instructions; request limits; Claude prompt); voice-direction.js (Claude on a click inside a token reservation, immutable revisions per script revision, strict owner edits); auditions perform the newest direction with billed tag characters and 3 paid attempts per direction; the scene planner receives each sentence's delivery. tests/delivery.test.js (4). Full suite 225/225.
- [ ] **P08c Music and sound effects: the score, generated music, the family library and the mix** (testing) - 0.23.0 (2026-10-09): music.js (score validation that refuses named artists, free score, Claude music-supervisor prompt, ElevenLabs music and sound-effect requests, 20 effect kinds in the main engine's flavour, effects placed from drawn-shot events by density, one FFmpeg mix graph with sidechain ducking); soundtrack.js (family settings with commercial-use confirmation and monthly limits, immutable scores and checksummed generated files, Claude and ElevenLabs only on a click inside reservations, never retried by themselves); the render mixes music and effects under the finished voice and normalizes the whole mix; Room 07 page with score, settings, library, players and the mix settings. tests/soundtrack.test.js (3, one with real FFmpeg for every ducking choice) and two render tests with real FFmpeg (a Claude score generated through a fake ElevenLabs, limits, retry, mix at -16 LUFS; effects on hand-drawn and motion cutaways). Two bugs found by the tests and the browser check and fixed: generated-file checksums and a rounding overlap in the free score. Browser check on the demo workspace: free score, settings save, paid buttons refuse without a tested ElevenLabs connection.
- [ ] **P06f Fixes applied by the program, scene continuity that mends itself, Claude token transparency** (testing) - 0.23.1 (2026-10-09, owner review): editing-brain autoFix applies every critic finding with a safe operation when an edit is drafted and lists it (Editing Room, Room 08); new operations for same-move, graphic-short, transition overuse/variety and long unchanged stretches. Sk.continuity accepts place changes the words or notes go to; Sk.mend fixes the rest on Claude and free plans; old plans show notes by today's rules (demo plan: 6 warnings became 0, 4 shots redrawn by the review shown). Fast captions are one Room 08 item sent to the Voice Room (demo: 13 suggestions became 1). Plan and review answers get up to 32,000 output tokens; a review that runs out of room keeps the plan; jobs record read/answer/thinking (demo plan: answer about 4,700 of 14,297 output tokens, the rest thinking). Page banner and plain message when the program is not running; server logs stray errors instead of stopping. Tests: sketch, editing (autoFix), qc-review (grouping), scene (token split; streamed fake answers). Full suite 229/229.
- [ ] **P06g Stickman engine v3: text that fits, no empty openings, staged objects, living props, shadows, bigger characters** (testing) - 0.24.0 (2026-10-10): live test on the demo. Fresh Claude plan with the 0.23.1 rules: 37,537 tokens (read 22,341, answer about 6,400, thinking about 8,800); the continuity review answered every note (2 place jumps fixed, 3 real moves kept with reasons, 1 misquoted text fixed), 0 continuity warnings, nothing left for the program to mend. The first attempt lost 16,958 tokens because a 663-character summary failed the 600 limit; descriptive text is now trimmed. 17 shots drawn in 215 s; fresh edit (no automatic fixes needed on drawn shots; caption speed follows the demo voice); 1080p render with all 9 checks passing. Frame review of that render found text running off the frame under a focus zoom, lone icons on plain backdrops, still props, small characters and pink-tinted faces under the danger mood; engine v3 fixes them (re-render: all checks pass, the counter and the face stay in frame). Tests: sketch (near-miss effects, carry), scene (trim), drawn (browser). Full suite 230/230.
- [ ] **P06h Atelier engine: Claude designs shots from scratch (HyperFrames and OpenMontage method), redesign of one shot** (testing) - 0.25.0/0.25.1 (2026-10-10): live Claude runs on the demo. Atelier plan 19,006 tokens; 9 designed shots, 167,486 tokens (2 retries: one false alarm of the audit, fixed; one real). Two near-black openings failed the render check; each was redesigned alone (about 14k tokens) and the re-render passed all 9 checks. Stickman with two atelier shots, hand-drawn and motion-graphics plans rendered with all checks passing. 45,147 tokens with frame design off (the review moved six arrows and one heart onto their words and kept one storm layout). 18 shots drawn; render passed all 9 checks. Frame review: faces on the dark palette were dark, and a burst stayed behind while its counter moved to the top edge; fixed (light faces, effects follow what they were placed on, big words keep headroom); the re-render passed all 9 checks. Full suite 238/238.
- [x] **P06i Story director: every engine in one long video (Story Mix), chapters, re-hooks and a measured mix** (done) - 0.26.0 (2026-10-10): live 8 min 26 s Story Mix video planned by real Claude: story director 18,138 tokens (12 chapters, 50 beats, 16 atelier), plan job 423,128 tokens, 17 designed shots 254,843 tokens, 24 undesigned shots drawn by Claude for 50,621 tokens; mix hand-drawn 32%, stickman 30%, motion 26%, atelier 12%, longest stretch 39 s. 720p render (demo setting) in 19 minutes, 8 min 26 s, 77 MB, all 9 checks passed (71 measured cuts, all planned). Full suite 244/244.
- [ ] **P06j World kit: every story builds its own world, cast, objects, places and costumes; physics and era checks; long narrations in sync** (testing) - 0.27.0 (2026-10-11): sync measured on the 8-minute GPS narration - before, 79 of 104 sentence starts off by more than 1 s (worst 6.2 s early); after, none, all 61 scene cuts within 0.1 s. Live director answer (17,740 tokens) built a stone-age world, cast and kit of 8 items, drawn correctly by the three engines. Full suite 250/250.
- [ ] **P06k Hand-drawn engine v2 (a hand draws and writes every scene) and HyperFrames tools in the edit: transition brain, active-word captions, voice-over carve** (testing) - 0.28.0 (2026-10-15): hand and handwriting checked in the browser and on a 12 s preview; all seven xfade transitions run on the installed FFmpeg; carve measured (speech band -8.4 dB, bass -3.1 dB, medium); npm test 254/254 passed.
- [ ] **P06l Stickman looks (whiteboard with the drawing hand, storybook, doodle) and the hand-drawn engine as an illustrated explainer, each with its own editing** (testing) - 0.29.0 (2026-10-15): 28.7 s preview of every look drawn by the program; hand track probed (draws, writes left to right, lifts, leaves); Style Library fields checked in the browser; npm test 258/258, then 41 related tests after the brief field. 0.31.0 (2026-10-16): Style Library one card per engine (looks are Stickman features); hand-drawn keyword, versus, head; a 36-second hand-drawn demo (our own food-truck script, free Windows demo voice): Claude planned it in the hand-drawn engine (58,477 tokens: designed truck, fryer and fuel pump, keywords, price tag, sticky note, callouts, VS comparisons, cartoon people), the program drew, edited and rendered it at 1080p; every render check passed except audio clipping (the raw demo voice, 0.16 dBTP, no narration finish). The first render found a bug: a drawing browser restarted after a stall failed with 'MOTION is not defined' (fixed in motion.js start(), with a test); the review of the first render made places faint line art, moods light and keywords keep off the edge on the hand-drawn engine. npm test 265/265 passed.
- [ ] **P06m Whiteboard animation (hand-drawn engine), the illustrated stickman look, every transition for every engine, a bigger drawing vocabulary, no hard-coded taste** (testing) - 0.32.0 (2026-10-16): 36 s whiteboard demo planned by Claude (58,340 tokens) with its own scene transitions, moods, camera and new faces; render QC passed except clipping of the free demo voice; same-place cut flash found in the demo and fixed; Style Library card and editor checked in the browser; npm test 272/272 passed.
- [ ] **P06n Paid pictures inside drawn shots: Claude illustrates the shots that deserve it, the hand traces them; the planner decides where; Room 04 upgrades one shot** (testing) - 0.33.0 (2026-10-16): 39.5 s 720p showcase - Claude chose 3 pictures, 2 more added with Room 04 'Paid picture', every whiteboard look one paid and one free; render QC passed; three program faults found by the demo and fixed (lost pictures on a stop, a plan discarded over its reservation, picture pacing); Room 04 checked in the browser; npm test 276/276 passed.
- [ ] **P06o Mix of an engine's looks (stickman, hand-drawn) and paid pictures in every engine, each in its own style** (testing) - 0.34.0 (2026-10-17): one picture checked in all five stickman looks and motion graphics; npm test 280/280 passed.
- [x] **P06p Motion engine v2: five designs or a mix, charts, timelines, networks and kinetic type, flat-design people** (done) - 0.35.0 (2026-10-17): designs and tools rendered and checked; a live Claude plan completed with designs chosen per scene; npm test 284/284 passed. The demo rendered (47.4 s, all QC checks passed); its review led to the 0.36 readability fixes.
- [ ] **P06q History cartoon look, real maps and crowds for every engine** (testing) - 0.36.0 (2026-10-17): look, maps (four finishes, date line) and crowds rendered and checked; map and crowd validation, free maps and drawing tests added.
- [ ] **P06r One engine per style, motion graphics as a layer, the Documentary engine; places of the past** (testing) - 0.37.0 (2026-10-18): engine scope, documentary looks, period places, backdrops and map fly-in rendered and checked; Style Library checked in the browser; npm test passed (see commit).
- [ ] **P06s Motion layer upgrade: word animations, textures, depth layers, map moves** (testing) - 0.38.0 (2026-10-18): every animation, texture, layer, entrance and map move rendered and checked; showcase reel rendered; tests added (sketch and drawn).
- [x] **S02 YouTube craft engine: hooks, packaging, chapters, Shorts, outliers, retention and writing voice** (done) - Version 0.14 (2026-10-06): craft.js ports youtube-agent-skill's hook scorer (five properties, 0.6 mean + 0.4 weakest, 21 formulas), title/thumbnail pairing linter, chapter drafting (pauses, vocabulary shift, scene and paragraph breaks; 0:00, 3+, 10 s rules), outlier multiples over the channel median, a Shorts finder (20-55 s, complete opening, a turn, ends on a line) and a retention-CSV reader ending in one fix. Scores match the Python originals exactly on the same inputs. Families gain a writing voice: Hermes writes in it and never-used words block a candidate. Advice shows on drafts, chapters and Shorts in the Editing Room, multiples and title formulas in competitor scans. 31 new draft skills (youtube-agent-skill 14, HyperFrames 17). 9 craft tests plus room and competitor checks.
- [ ] **P07 Captions & Localization Room** (testing) - Version 0.14 (2026-10-06): every new edit carries a caption track (captions.js): words timed inside the narration's measured sentence windows with clause pauses anchored at commas; phrases split into the fewest even captions (never ending on a weak word); 2 lines x 42 characters for long-form, rate-sized groups for Shorts; scarce inline emphasis on figures and negations. Burned in as the top ASS layer (bottom band on 16:9, above the Shorts buttons on 9:16, clearing for full-screen graphics), SRT download per edit revision, on/off as an owner change, caption QC in the critic. 7 caption tests plus render checks; full suite 181/181 on Node 24.18.1 with FFmpeg 8.1.2 and Edge 154. 0.15.1 (2026-10-08): owner caption corrections as the revisioned set-caption op (timing fixed, narration words kept for coverage QC and reset, *word* emphasis, critic nitpick) and a WebVTT download beside the SRT; full suite 192/192, browser check of correct/save/reset/download on a scratch workspace.
- [ ] **P08 Audio Room for licensed music, SFX and mix** (testing) - 0.15.0: narration-only Audio Room reuses immutable edit revisions and the pinned render queue. Original levels or two-pass loudness normalization, 48 kHz stereo WAV, encoded AAC loudness/true-peak/silence/layout/duration checks, checksum-verified downloads and named listening confirmation. Real FFmpeg regression tests and browser checks are recorded in BUILD-PROGRESS.md.
- [ ] **P09 Review & QC Room with video intelligence** (testing) - 0.16.0 (2026-10-08): Room 08 Review & QC. Renders add full decode, audio/video alignment, clipping (without a narration finish), a dense hook contact sheet and tile geometry; black/frozen/unplanned-cut checks keep time spans. review.js (pure) builds one timecoded issue list (render checks per moment, the critic, captions caption by caption with narration coverage) with repair links, a sentence-by-sentence aligned read with frame thumbnails, and blockers (out of date, changed files, failed or missing decode proof) that the verdict cannot accept. The style-proof verdict stays the only approval, now opened from Room 08. Failing fixtures: truncated and damaged MP4s fail the decode, a 0.5 s audio shift fails alignment; verdict invalidation tested. Full suite and browser checks recorded in BUILD-PROGRESS.md. 0.17.0: Claude frame scan (frame-scan.js): frames at every clip, graphic and hook half-second, contact sheets from the pinned FFmpeg, per-answer token reservation, kept answers, findings with frames and repair links in the review, optional named per-family automatic scan; after a completed scan the verdict may confirm flagged moments instead of a full watch. Videos of any length: targetMinutes 1-180 scales the script, job token limit, streamed answers, scene planning in parts, narration and render limits; a 25.5-minute synthetic edit rendered and reviewed with every check passing.
- [ ] **P10 Packaging Room** (testing) - 0.18.0 (2026-10-08): Room 09 Packaging. packaging.js (pure) validates packages, checks honest figures (digits or English words), YouTube limits, title/thumbnail craft, writing voice, disclosure and chapters, composes the description with chapters, AI note and visual credits, and builds the thumbnail ASS layer. packaging-room.js keeps immutable revisions, draws content-addressed 1280x720 thumbnails from the approved visuals with the pinned FFmpeg, drafts with Claude inside a token reservation and approves by name only for a Room 08-approved render; approvals go stale on a newer package, script or Room 08 change. Browser check on a scratch workspace: free start drew 3 thumbnails at 1280x720; the edit dialog saved r2; Room 08 approval by flagged moments; package approval refused until the phone-size confirmation. One real Claude draft (7,196 tokens) was rejected for an accent word not among its overlay words; the parser now drops such an accent instead, and the real draft was not repeated.
- [ ] **P11 Final render, recovery and primary master approval** (planned) - Render from the exact approved inputs, resume only verified stages, reconcile unknown external outcomes, invalidate stale downstream approvals, and require a human decision on the final primary-language master.

### 04 · Optional configured-language editions

Reuse the visual master while preserving meaning, natural voice and scene timing.

- [ ] **L01 Scene translation and local packaging** (planned) - Adapt scripts, visible text, titles, descriptions and thumbnails only for each family’s configured additional locales; keep every locale independently retryable.
- [ ] **L02 Language narration and synchronization** (planned) - Generate actual voices, adjust natural wording/timing and verify with proficient language reviewers.
- [ ] **L03 Independent edition approvals** (planned) - Track outputs and revisions by configured locale; propagate source corrections and permit independent retry and release decisions.

### 05 · Controlled publishing

Publish the right approved version to the right channel without duplicates.

- [ ] **Y01 Private resumable upload and reconciliation** (planned) - Implement and test per-channel destination binding, upload session recovery and unknown-outcome reconciliation on a real test channel.
- [ ] **Y02 Attach approved thumbnails/captions and schedule** (planned) - Attach already approved production assets, confirm future time zones, audience/disclosure settings, project audit status and each quota bucket, then schedule the exact approved edition.
- [ ] **Y03 Rules-based unattended operation** (planned) - Enable only after pilot quality and recovery gates pass; enforce spend limits, pause/cancel and exception alerts.

### 06 · Learning and portfolio scale

Use actual owner evidence and measured capacity to reach 10-15 families.

- [ ] **A01 Authorized analytics and experiments** (planned) - Verify supported owner reports, measurement windows and approved derived-data use; show unavailable values honestly.
- [ ] **A02 Backup/restore and production reliability** (planned) - Add supported backup UI/automation; test restore, external job leases, retry ceilings, disk pressure and provider failures.
- [ ] **A03 Sustained scale and growth validation** (planned) - Measure 14-day reliability, quota, render capacity, cost and language review load; validate each channel over its own 90-100 day period.

<!-- CHECKLIST:END -->

## Implementation log

### 2026-10-18 - motion layer upgrade (0.38.0)

- **Owner request:** upgrade the motion graphics animation (typography, background and layering animations like Vox, MagnatesMedia and Dhruv Rathee); motion graphics are a layer of every engine (0.37).
- **Research:** Vox and Dhruv Rathee storyboards in the browser, plus tutorial titles naming the techniques (research/motion-graphics-references.md "Motion layer animation").
- **Built:**
  - 9 word animations, 7 textures, back and front depth layers with parallax and soft focus, 4 new entrances;
  - map styles, the map camera flying to a place, travellers on routes, pulsing pins, dimming;
  - the planner brief for all of these.
- **Checked:**
  - Every animation mid-move and settled, every texture, the layers, the entrances and the map moves were rendered and checked.
  - A labelled showcase reel was rendered at 720p (scratchpad motion3, 37 s, 12 shots). Its review fixed starred key-word spans and made the words on accent bars crisp.
  - `npm run check` passed; `npm test` 291/291 passed.
- **Not done:** footage cards and 3D globes (they need footage or 3D); an owner review of the reel.

  No GitHub push.

### 2026-10-18 - one engine per style, motion graphics as a layer, the Documentary engine (0.37.0)

- **Owner review:**
  - Mix must stay inside the chosen engine (Story Mix stays as the mix of all engines), and the owner must see where each mix is chosen.
  - The pepper background repeated; the king belongs on a throne or in a castle, built like a film; maps were too short.
  - Motion graphics are a layer of every engine, not a style; the documentaries belong in a Documentary engine, including StickOrbit.
- **Research:** StickOrbit storyboard frames read in the browser (research/motion-graphics-references.md "Painted history").
- **Built:**
  - `engineScope`, so a style on one engine uses only that engine.
  - Motion graphics as a layer in every planner brief; the Motion Graphics launch style retired (launch library v10).
  - The Documentary engine with the looks footage, cartoon, painted, vector, infographic, kinetic, collage and data, or a mix of them; the history cartoon moved there.
  - Style Library wording and editors that say where each kind of mix is chosen.
  - Seven places of the past and a sailing ship; places of today replaced in stories of the past; abstract backdrops with six patterns.
  - Scene-building and map guidance, a short-map warning, and maps that fly in.
- **Checked:**
  - The new places, looks, backdrops and map fly-in were rendered and checked.
  - The Style Library cards and the Documentary editor were checked in the browser (no console errors).
  - `npm run check` passed; `npm test` results are recorded in the commit message.
- **Not done:**
  - AI-painted scenes (need an image key); footage with motion graphics (needs a stock or image key).
  - More motion-layer animation (typography, backgrounds, layering), which the owner wants next.
  - No new demo video: the owner asked for the fixes only.

  No GitHub push.

### 2026-10-17 - History cartoon, maps and crowds; demo fixes (0.36.0)

- **Owner request:** why 84,000 tokens for two paid pictures; research more OverSimplified-like channels and build the style; add maps (approved); a 40-50 s demo of all styles at 720p focused on the hook and picture quality.
- **Research:** History Matters, Sam O'Nella Academy and Extra History storyboards read in the browser (nothing downloaded); research/motion-graphics-references.md "History cartoons".
- **Built:** Stickman look History cartoon (`chronicle`); `maps.js` with the pinned `world-atlas` 2.0.2 data (Natural Earth, public domain); `map` and `crowd` elements for every engine; free plans draw maps; period headwear, outfits and moustaches; readability and layout fixes from the motion demo; hook guidance for the planner; paid pictures at medium effort.
- **Checked:** the motion demo rendered (47.4 s, 720p, every QC check passed) and was reviewed frame by frame; its problem shots were drawn again after the fixes; the history look, maps (four finishes, the date line) and crowds rendered and checked; effort experiment on one picture (high 26,108 / medium 13,149 / low 3,962 tokens). All-styles demo (scratchpad demo8, 42.9 s, 720p): a live Claude plan used every engine and look it chose (history cartoon with maps and crowds, whiteboard pencil, doodle, collage, kinetic, infographic, data desk), 31,773 plan tokens plus 25,084 for two pictures at medium effort; every render QC check passed. The first draw found that a stored map and network links changed when checked again; fixed and covered by a test of every element kind. `npm run check` passed; `npm test` 288/288 passed.
- **Not done:** historical borders; motion overlays on footage (needs keys); the room and home sets still hold modern things (a TV, a lamp) in stories set in the past.

  No GitHub push.

### 2026-10-17 - motion engine v2 (0.35.0)

- **Owner request:** build the motion-graphics engine to full depth; it works best with the other engines; research more motion-graphics channels (owner links MagnatesMedia and OverSimplified).
- **Research:** research/motion-graphics-references.md (Kurzgesagt, The Infographics Show, Business Casual, Wendover, RealLifeLore, MagnatesMedia, Johnny Harris, OverSimplified; storyboard frames in the browser, nothing downloaded).
- **Built:** five motion designs or Mix; flat-design people; chart, timeline, network, statement and poster tools for every engine; collage sticker pictures; style editor and cards; launch library v9; plan answers up to 64,000 tokens and a default planner limit of 100,000, with a clear message when Claude runs out of room.
- **Checked:** all five designs and every tool rendered and checked frame by frame (final and mid-build). A live Claude plan of a 47-second demo first failed (thinking used the whole 32,000-token answer); with the new room it completed (36,078 plan tokens, 2 pictures, 47,938 tokens): Claude chose vector, kinetic, infographic, data and collage designs per scene, with reasons. `npm test` 284/284 passed, plus the new out-of-room test.
- **Not done:** the demo was planned but not yet drawn and rendered; maps need a public-domain country-shapes package and the owner's go-ahead; the OverSimplified-inspired stickman look is proposed, not built.

  No GitHub push.

### 2026-10-17 - Mix of an engine's looks; paid pictures in every engine (0.34.0)

- **Owner request:** the paid/free picture judgement in every editing engine, without making videos boring; and for each engine with several styles, a choice between one specific style and Mix (all of the engine's styles in one video).
- **Built:** `mix` for the stickman look and the whiteboard look (style), `sketch.look` per stickman shot, the mix brief for Claude (MIX_RULE), engine fallbacks; the picture budget for every style with drawn shots; engine- and look-aware illustrator messages; per-look picture rendering and the motion-design build (`buildPicture`); Style Library cards list Mix and paid pictures; editor hints explain Mix.
- **Checked:** one picture rendered in all five stickman looks and in motion graphics (traced and coloured per look; motion builds in shape by shape). Tests: engines (mix briefs only where they apply), sketch (shot look, guide fields, illustrator per engine, outlines rule), style (mix validates, cards list Mix and paid pictures), drawn (a shot's own look, mix fallbacks, motion picture builds without a pen). `npm run check` passed; `npm test` 280/280 passed.
- **Not tested:** a full Claude-planned video in Mix (next demo); the owner's verdict.

  No GitHub push.

### 2026-10-16 - paid pictures inside drawn shots; a 40-second showcase of every whiteboard look (0.33.0)

- **Owner request:** a 40-second video showing every hand-drawn style, made for quality (render at 720p), showing the difference between free and paid pictures; the program must know where a paid picture is worth it. The owner has a ChatGPT subscription, not an OpenAI API key, and asked whether Claude can draw the pictures. The program cannot use a ChatGPT subscription, so the paid picture is drawn by Claude on the connected Claude subscription (paid in tokens).
- **Built:** `illustrate.js` (a picture is data only: SVG path data and #hex colours, checked in Node; the illustrator's messages); the sketch element `picture` and a shot's own `board`; planner guidance and a picture budget (visual settings: pictures per minute, picture token limit); `scene-room.illustrate` (one reserved answer per picture, one retry with findings, failed or over-budget pictures leave the free drawing); the engine's `drawPicture` (the hand traces the outlines in order, colour right behind the pen, at most 45% of the picture's screen time, per whiteboard look; a background shape is laid as colour without an outline; an effect on a picture keeps its size); Room 04 "Paid picture" for one shot (`pictureForShot`) with its job in the history.
- **Found by the demo and fixed:** a stopped session lost four finished pictures (about 65,000 tokens) - a plan job now keeps its finished review and pictures (`reviewed`, `plan_pictures`) and recovery marks a picture's or frame's own reservation unknown; a plan 9,503 tokens over its 130,000-token reservation was thrown away (139,503 tokens) - it is now kept with a warning and the real use settled; pictures first finished just before their cut and one read as a white card - pacing and backdrop rules above.
- **Demo:** the journey of a coffee bean (our own script, free Windows demo voice, 39.5 s, 720p). Claude planned it and chose three pictures itself (farm, cargo ship, roasting machine); two free shots were upgraded with Room 04 "Paid picture" (the cut-open cherry, the barista at the espresso machine), so every whiteboard look shows one paid and one free shot; the looks were set per shot as an owner edit. Render QC passed (decode, alignment, duration, frame, audio, clipping, black frames: only the planned dip to black, frozen picture, unplanned cuts). Demo labels (look; free or paid) were burned into a copy for the owner. Tokens recorded in the demo workspace: 171,932 for plans and reviews, 330,352 for 16 picture answers (including the lost and the discarded runs).
- **Checked in the browser:** Room 04 lists each shot's picture, every drawn shot has "Paid picture", its dialog opens with description, size, replace and connector, the job history shows each picture's tokens, the visual settings have pictures per minute and the picture token limit; no console errors.
- **Tests:** illustrate checks (path data only, colours, limits, outlines), sketch (picture element, one per shot, board per shot), drawn (the pen is on the picture while it is traced, more lines then colour, finished well before the shot ends, each look different), scene (budget, illustrator once per picture with a retry, free fallback past the budget, kept pictures reused on retry, recovery of picture reservations, Room 04 paid picture for one shot and a failing one that changes nothing). `npm run check` passed; `npm test` 276/276 passed.
- **Not tested:** OpenAI images inside drawn shots (needs an API key); an ElevenLabs narration with pictures; the owner's verdict.

  No GitHub push.

### 2026-10-16 - whiteboard animation, the illustrated stickman look, every transition for every engine (0.32.0)

- **Owner review:** the program's taste must not be hard-coded (the colourful city was better than the forced plain paper); the illustrated food-truck video looked like coloured stick figures, so that look belongs to Stickman; the hand-drawn engine must make whiteboard animation like his four tutorial links, with the After Skool style as one more look; transitions, effects and cuts were too limited and too basic, and every engine should be able to use any of them.
- **Research:** the four whiteboard tutorials and After Skool sampled frame by frame in the browser (research sections 6-7). All four tutorials make their pictures with AI image/video models.
- **No hard-coded taste:** the 0.31 faint-set/faint-mood rule is removed; every planner brief carries the TASTE line (references are ideas; Claude chooses what makes each scene appealing and says why).
- **Stickman look `illustrated`** (finish `ink`) is the former illustrated hand-drawn drawing, with its own preset and brief.
- **Hand-drawn = whiteboard animation** (finish `wb`): people drawn as people (`drawPerson`), handwritten words, the drawing hand as an option, five whiteboard looks in `drawing.board` (cartoon, marker, pencil, framed, dry-erase). Launch library v8 ("Hand-drawn Whiteboard").
- **Transitions:** `transitions.js`, 43 transitions on 39 FFmpeg xfade drawings, for every renderer and every launch style. Claude chooses a scene's `transition` in the plan; the editing brain uses it first, keeps its own choice as the fallback and no longer turns transitions into cuts by itself. Style studies give the reference's transitions as a hint in the brief, never a limit. The Style Library summarises a style that allows them all in one line.
- **Drawing vocabulary** (`drawn-scene/13`): 19 expressions, 7 moods, 6 camera moves, 10 shot openings, 8 effects; near-miss names point at the new real ones.
- **Demo (found and fixed):** a 36-second whiteboard video of our food-truck script (free Windows demo voice). Claude planned it in 58,340 tokens and chose by itself scene transitions (zoom-cut, push-left, push-down, crossfade), new moods (warm, calm), the handheld camera, new faces (awkward, focused) and the crack effect. The render showed the street fading in from white at a cut between two shots on the same street; fixed (`holdSet`) and rendered again. QC: decode, alignment, duration, frame, black frames, frozen picture and unplanned cuts passed; audio clipping failed at +0.16 dBTP because the demo Windows voice has no narration finish (not a program change).
- **Checked in the browser:** the Hand-drawn Whiteboard card (features, whiteboard look, hand, "All 43 transitions and cuts"); its editor has the Whiteboard look select (five looks), the hand, no stickman look, and all transitions ticked; no console errors.
- **Tests:** transitions (Claude's choice, aliases, xfade mapping, every xfade drawn by the installed FFmpeg), drawn (every camera, opening, effect and mood changes the picture; whiteboard looks differ; hand in the hand-drawn engine; same place kept across a cut), scene (transition offered, kept, unknown names dropped), style (every launch style allows all; board validation), engines (boards, TASTE), study. `npm run check` passed; `npm test` 272/272 passed (final run, with the same-place test).
- **Not tested:** a live ElevenLabs narration and music on this video; the owner's verdict on the new engine; AI pictures revealed by the hand (needs an image key and the owner's decision).

  No GitHub push.

### 2026-10-16 - one card per engine; the hand-drawn engine grows (0.31.0)

- **Owner review:** the stand-alone hand-drawn engine (illustrated objects, the Mr. Finance family) and the stick figure drawn by a hand (a Stickman feature) are different things; the Style Library looked messy with every stickman look shown as an engine - show the main editing engines only and list each engine's features in its own card; look for more hand-drawn styles; make a 30-second hand-drawn video.
- **Style Library:** launch library v7 drops the three separate stickman-look styles; untouched copies are retired automatically (an approved, assigned or revised one stays). Each card lists its engine's features; stick-figure styles show their look and the hand; the editor's Stickman engine features section picks the look and the hand, and a look fills in its recommended colours, shot lengths, transitions and motion.
- **Research:** Mr. Finance's older keyword look, Sprouts (MinuteVideos ink whiteboard), MinuteEarth and Primate Economics, sampled frame by frame (research section 5).
- **Hand-drawn engine:** `keyword` (a big hand-lettered word in a top corner), `versus` (a comparison divider with its word in a circle), prop `head` (a head in profile to think inside); brief: colour for meaning, corner chapter labels, one metaphor world per video. `drawn-scene/11`.
- **Video:** a 36-second hand-drawn demo (our own food-truck script, free Windows demo voice): Claude planned it in the hand-drawn engine (58,477 tokens: designed truck, fryer and fuel pump, keywords, price tag, sticky note, callouts, VS comparisons, cartoon people), the program drew, edited and rendered it at 1080p; every render check passed except audio clipping (the raw demo voice, 0.16 dBTP, no narration finish). The first render found a bug: a drawing browser restarted after a stall failed with 'MOTION is not defined' (fixed in motion.js start(), with a test); the review of the first render made places faint line art, moods light and keywords keep off the edge on the hand-drawn engine.
- **Checked in the browser:** seven cards with their features (the old look styles retired in a workspace that had them); choosing Storybook and Whiteboard in the Stickman editor filled in their settings and the hand; the Hand-drawn editor has no stickman section; no console errors.
- **Tests:** drawn (keyword, versus, head), style (look presets valid on the stickman spec; retiring the old look styles unless used; seven launch styles), engines. `npm run check` passed; `npm test` 265/265 passed.

  No GitHub push.

### 2026-10-15 - style studies: the program learns a look by itself (0.30.0)

- **Owner review (2026-10-15):** "the program should learn by itself ... the self learning, the self thinking is still too weak"; earlier: "analyze and adopt the competitors' style on every niche ... the style will be different, but it should follow the physics".
- **Built (R05c):** on the Competitors page, Style studies → Study a reference. The owner names a video file, a screenshot or a folder of screenshots on this PC; the pinned FFmpeg makes two contact sheets of 18 frames and measures the cut rhythm and the main colours; Claude studies the sheets once (family token reservation, never retried by itself) and maps the look onto our engines and looks; strict checks (vocabulary, hex palette, 30/70, copy guard, no channel name, measured rhythm wins); named approval with three confirmations; a style draft from the matching launch style with the palette, shot lengths, transitions, look and a planning brief that reaches the planner, review and director as LEARNED LOOK. Links are kept for the record only; nothing is downloaded.
- **Live check:** one study of our own 0.29 preview video in the demo workspace: 37 s, 7,757 tokens (13,400 reserved); Claude named the drawing hand, storybook street, doodle gag and illustrated price tags and sticky notes, mapped it to Stickman · Whiteboard, and returned 5 techniques, 12 of our own and 6 things never to copy, plus a brief in our own words. The cut detection found 4 of the 7 shots (white boards cut to white boards score below the 0.3 scene threshold).
- **Checked in the browser:** the Style studies card and the Study a reference dialog on a throwaway workspace.
- **Tests:** study (answer checks, the 30/70 rule, copy guard, channel name, measured rhythm; style draft with skipped changes; measurements; end to end with real FFmpeg: a video measured and studied once, approval gate, style draft, screenshots folder, a failed check kept with its reasons, the family token limit). `npm run check` passed; `npm test` 263/263 passed.
- **Not tested:** a study of a real competitor video (needs a file the owner has); approving a learned style draft and planning a video with its brief.

  No GitHub push.

### 2026-10-15 - stickman looks and the drawing hand; hand-drawn as an illustrated explainer (0.29.0)

- **Owner review of 0.28:** the hand was added to the hand-drawn engine but it belongs to the stickman engine, as an option; it looked broken and basic and needs better drawing and movement; two reference videos are new stickman styles; the hand-drawn engine must have its own style (a third reference) and its own editing; the program's self-learning is too weak.
- **Research:** the three references were studied frame by frame in the browser (no downloads) and written up in docs/research/stickman-and-handdrawn-references.md (The Life Outline, Zenn, Mr. Finance and its channel's two looks).
- **Built:** the drawing hand as a stickman style option, redrawn from smooth outlines, with physics (enters, travels on lifted arcs, rests on long pauses, leaves; one pen draws one thing at a time; letters written with the pen moving through them); stickman looks whiteboard, storybook (bean bodies, warm paper, chapter cards) and doodle (big eyes, thick marker, bold ground), each with a launch style (launch library v6) and a planning brief; the hand-drawn engine as an illustrated explainer (clean ink, coloured-pencil shading, sticky notes, price tags, callouts, handwritten labels with arrows, dashed connectors, faces on objects, cartoon people; no hand); the Style Library edits the look, the hand and an optional planning brief (groundwork for style studies). `drawn-scene/10`.
- **Checked:** a 28.7 s preview of all looks drawn by the program (no Claude); the hand's positions over a shot (on the house while drawing it, writing the title left to right, lifting and leaving, gone after); the Style Library editor in the browser on a throwaway workspace (the new fields show and keep their values; no console errors).
- **Tests:** drawn (the hand option, the looks and the chapter card, the illustrated hand-drawn vocabulary), style (the drawing setting, the brief, launch library v6), engines (look briefs, hand-drawn brief, learned brief). `npm run check` passed; `npm test` 258/258 passed before the brief, then the style, engine, director and scene tests (41) passed after it.
- **Not tested:** a full video with a Claude plan in any new look; the planner's use of the look briefs (prompt text only); looks inside a Story Mix render.

  No GitHub push.

### 2026-10-15 - hand-drawn engine v2 and the HyperFrames editing tools (0.28.0)

- **Owner request (2026-10-11):** the stickman engine is almost done; proceed to the next editing engine, and check HyperFrames again and build its most advanced tools into the editing engine. Next engine in his order: hand-drawn ("I loved how it was drawing the scenes").
- **Hand-drawn v2 (`drawn-scene/9`):** a hand holding a marker draws every ink stroke (its tip on the stroke being drawn, a small working wobble, gone when nothing is drawing, never in other engines); titles, labels and highlights are handwritten left to right; fills wash in after their outline. Checked on a 12 s preview (beach, office, number card): the hand draws the ship, then writes "Sailing west, 1492".
- **Transition brain (HyperFrames `db845d9`, restated):** the style's motion intensity sets the energy; one primary transition between related scenes, an accent for a change of topic or the turn, a gentle wind-down and the slowest outro; a drawing that opens with its own move gets a cut; at most about one transition every 20 s. Push, slide, zoom, whip-pan and wipe now render (FFmpeg xfade `slideleft`, `coverleft`, `zoomin`, `hblur`, `wipeleft`; each checked on the installed FFmpeg).
- **Active-word captions:** for styles with `activeWordHighlight` (stickman, motion graphics, Story Mix, atelier) the words light up as they are said, the hero word in the accent with a short pop. Checked visually in an FFmpeg burn-in.
- **Voice-over carve:** the music is split at 300 Hz and 4 kHz and only the speech band is ducked under the voice; bass and top stay. Measured (medium): speech band -8.4 dB, bass -3.1 dB under the voice; before, everything dropped equally. Closes the open P08 carve item.
- **Tests:** transition brain (energies, accents, drawn moves, xfade in the render plan), active-word captions (beats follow the word times, hero pop, corrected captions), the carve measured with real FFmpeg, the hand and handwriting in the browser. `npm run check` passed; `npm test` 254/254 passed.
- **Not tested:** a full hand-drawn video with a Claude plan, narration and render (only the engine preview without voice); the new transitions inside a full edit render (the xfade filters were checked on their own and in the render plan); the carve on real ElevenLabs music and narration (synthetic signals only); the owner's listening check.

  No GitHub push.

### 2026-10-11 — voice sync on long videos, and a world for every story (0.27.0)

- **Owner review of the 8-minute Story Mix video:** "pretty best; we can lock this engine", but (1) from 2:03 the pictures came 4-5 s before the voice; (2) the sailors were under water; (3) "stepping out of a train" showed a house door; (4) characters and scenes must be built for each story (stone-age people for a stone-age script), by reasoning, following physics, adapting to each niche and its competitors.
- **Sync, found and fixed:** measured against the narration's own sentence-end pauses (0.9 s, against 0.45 s at commas), the edit's sentence starts drifted from sentence 28 (2:08) on, up to 6.2 s early: each start was snapped to the nearest pause of any kind around a word-count estimate. `alignSentences` now places all sentences in one pass (spoken weight, sentence-end pauses preferred, each sentence measured from the real start of the one before). Same narration: before, 79 of 104 sentences off by more than 1 s; after, none; all 61 scene cuts within 0.1 s of the voice (a fresh edit, no new render; the owner asked for confirmation only).
- **World kit (P06j):** `kit.js` (shapes checked into points, never run as code), `kit:<id>` references in drawings for props, held props, sets, settings and cast outfits, drawings that carry their kit, every engine drawing kit items in its finish; the director's map adds the world (era, place, rules), a cast dressed for it and the kit, and reads the niche's competitor guidance; parts read the world, the cast and the kit names only.
- **Physics and era:** `Sk.worldNotes` names people on the sea floor (ocean set) unless the words are about diving and modern things in a prehistoric, ancient or medieval story unless the line is about today; the review gets them as notes and a WORLD check; `Sk.worldMend` moves people left under water to the beach. The plan prompt says what the words name is what is shown (a train is a train).
- **Live check (real Claude, one answer, 17,740 tokens):** the director built a stone-age world for a 19-sentence hunt script - era prehistoric, an ice-age valley, eight rules, a cast of four in a fur tunic, a kit of a spear, a flint point, a woolly mammoth, a campfire, a cave interior, a snowy valley and a gully; all drawn correctly in the stickman, hand-drawn and motion engines.
- **Tests:** world (kit checks, references, carried kits, physics and era, kit drawing in three engines), director (world, cast, kit, niche guidance), scene (the story director end to end with world, cast, kit and the sea-floor mend), editing (a long narration stays on the voice; fails on the old code). `npm run check` passed; `npm test` 250/250 passed.
- **Not tested:** a full plan, draw and render with a designed world (only the director's answer and the engines' drawing of its kit were checked live); kit items inside atelier frames (the atelier engine designs its own shapes); held kit props are drawn at the hand's prop size.

  No GitHub push.

### 2026-10-10 — the story director: every engine in one long video (0.26.0)

- **Owner request:** "combine all of them, so in a long video all editing styles are used with scene building: where the stickman, where hand-drawn, where atelier, where motion graphics, with a well structured and hooked video; videos of 8 to 10 minutes in one style bore the viewer." Motion graphics stay in (the owner's feedback was not a request to remove them).
- **Built:** `director.js` (map, repair, slice, mix measure), the Story Mix launch style, map-first plan jobs, parts that follow their slice, the mix strip and chapters in Room 04, settings for the story director and designed shots per minute, "Draw them with Claude" for undesigned shots, shot-length slack for animated shots. DRAWN-SCENES.md section 13.
- **Live test (demo workspace 3, real Claude on the owner's subscription):** a new original 1,319-word script, "How your phone knows exactly where you are" (GPS), narrated with the free Windows voice at normal speed: 8 min 26 s, 105 sentences, 7 plan parts.
  - Story director: 18,138 tokens. 12 chapters with a home engine and a re-hook each (atelier cold open, stickman "Lost in a strange city", hand-drawn "From stars to Sputnik", motion "Why four satellites", hand-drawn "Einstein's ten kilometre problem", stickman "Lost in the mirror maze", motion "The world's hidden clock"...), 50 beats, 16 of them atelier (budget 17).
  - Plan parts and continuity reviews: 423,128 tokens for the job (the map, 7 parts of about 27,000-37,000 tokens, 7 reviews of about 22,000-27,000). 17 designed shots: 254,843 tokens, all passed their checks first time.
  - Found and fixed: the parts made every shot of an atelier beat a designed shot (41 for 17 beats), so 24 fell back to drawings from their words; Claude then drew those 24 in one redraw job (50,621 tokens). One 6.3 s drawn shot against a 6 s limit blocked approval (now a warning for animated shots). An 8-minute narration crashed the audio check (fractional tool time limit, fixed in voice.js).
  - Final mix: hand-drawn 32%, stickman 30%, motion graphics 26%, atelier 12%; longest stretch in one engine 39 s; about 5.7 engine changes a minute; no mix warnings. 151 shots.
  - Drawing review found a target pin over the hero's face (faces are now kept clear, `drawn-scene/8`) and sailors standing on the sea floor (the guide now says `ocean` is under water; this plan keeps it). One Room 04 drawing and the first 1080p render failed on a stalled browser while the laptop throttled on a low battery (6-15%, charging slower than it drained): the render ran 3.6 hours before failing. Both now try a stalled browser again.
  - Render: 720p render (demo setting) in 19 minutes, 8 min 26 s, 77 MB, all 9 checks passed (71 measured cuts, all planned).
- **Tests:** director (map repair, slice, prompts, mix), scene (story director end to end with a retry that does not pay the map twice, redraw of undesigned shots, shot slack, guide off, a stalled drawing tried again), drawn (faces clear), editing (a stalled browser during a render), voice (two-minute-plus narration), style and engines lists. `npm run check` passed; `npm test` 244/244 passed.
- **Not tested:** the story director on a single-style long video other than Story Mix (the code path is the same); Shorts; ElevenLabs narration live; music on a long mixed video; a 1080p render of the long video (720p was used for the demo because of the laptop's power state).

  No GitHub push.

### 2026-10-10 — the atelier engine and four engines tested live with Claude (0.25.0, 0.25.1)

- **Owner request (2026-10-09):** fix the storm staging, the slow map, the room that shows before Sam, and the scenes running late behind the voice; analyse OpenMontage, HyperFrames and youtube-agent-skill in depth and run their brains through Claude; test hand-drawn and motion graphics with a real Claude plan; never waste Claude's tokens; make the program able to edit in any style.
- **Research:** research/openmontage-and-hyperframes-brains.md. youtube-agent-skill has no newer commit than the 0.14 port (`a2feb21`).
- **0.25.0, atelier engine (P06h):** art direction in the plan, one Claude frame worker per designed shot, HyperFrames-style compositions checked for safety and layout, rendered frame by frame in the local browser with GSAP 3.15 and warped onto the narrator's words; HyperFrames recipes vendored (Apache-2.0); new launch style "Atelier · designed per video". DRAWN-SCENES.md section 11.
- **Live tests (demo workspace, real Claude on the owner's subscription; tokens as reported by Claude):**
  - Stickman plan: 49,017 tokens (plan 27,807; continuity review 21,210, which fixed one place jump and one misquoted stamp). Claude chose two atelier shots for the big numbers; their frames cost 41,396 tokens at high effort. 17 shots drawn; 1080p render, all 9 checks passed. Frame review: the last scene showed the room before Sam (fixed: characters arrive with their shot); the expression "curious" was unknown (now mapped).
  - Atelier plan: 19,006 tokens for the plan; 9 designed shots in 11 frame answers, 167,486 tokens. One retry was a false alarm of our own audit (a counter's masked digits; fixed), one was real (text off the frame; Claude fixed it). The plan picked stock footage for the hook on a PC without a stock key (new plans now only offer sources with a tested connection; the demo hook became a drawn shot by owner edit). The first render failed the black-frame check twice (near-black openings); the two shots were redesigned on their own for 14,124 and 14,255 tokens, and the re-render passed all 9 checks.
  - Hand-drawn plan: the first attempt was lost (16,770 tokens) because Claude repeated a scene's sentence range on one shot; extra fields are now dropped. Second attempt: 35,723 tokens (the review rebuilt one shot that jumped from the home to a field and kept one real move with a reason). 13 shots drawn; render passed all 9 checks. Open: the opening shot holds 3.3 s (style limit 2.5 s); the critic lists it.
  - Motion graphics plan: 45,147 tokens with frame design off (the review moved six arrows and one heart onto their words and kept one storm layout). 18 shots drawn; render passed all 9 checks. Frame review: faces on the dark palette were dark, and a burst stayed behind while its counter moved to the top edge; fixed (light faces, effects follow what they were placed on, big words keep headroom); the re-render passed all 9 checks.
- **0.25.1 repairs (DRAWN-SCENES.md section 12):** frame workers at medium effort; the audit counts only visible text; the first-frame rule and a black-frame probe before the render; "Redesign" for one atelier shot (Room 04) and "Drop the atelier design" in the shot edit; owner edits keep frames, the art direction and the compose report (they were silently dropped); only fetchable sources offered; extra plan fields dropped; characters on the first frame (`drawn-scene/7`); near-miss expressions; the atelier guide is not sent when frame design is off; an interrupted drawing says it is local and free.
- **Tests:** atelier (masked counters, black probe), scene (fetchable sources, frames survive edits, redesign success/failure/brief/tokens, drop design, extra fields, guide off), sketch (near-miss faces), drawn (characters on the first frame), ai (frame effort). `npm run check` passed; `npm test` 238/238 passed.
- **Not tested:** ElevenLabs word timestamps live (no key on this PC yet); fish.audio is not a supported narration provider; Shorts (vertical) atelier shots; the Room 04 "Redesign" button in the browser (the API is covered by tests); other rooms still reject Claude answers with extra fields (flagged as a separate task).

  No GitHub push.

### 2026-10-10 — live test and stickman engine v3 (0.24.0)

- **Owner request:** test a brand-new Claude plan with the new rules and a fresh edit of the demo, then continue to the next build (the stickman engine, per the owner's order).
- **Live test (demo workspace, real Claude on the owner's subscription):**
  - First attempt: Claude's plan was rejected because its summary had 663 characters (limit 600), 16,958 tokens lost. Fixed: descriptive text (summary, directions, notes, queries, image prompts) is trimmed at a word; on-screen text stays strict.
  - Second attempt: 37,537 tokens (read 22,341; answer about 6,400; thinking about 8,800). The continuity review answered every note: 2 place jumps fixed, 3 real moves kept with reasons in the shot notes, 1 on-screen text corrected to match the words. 0 continuity warnings; nothing left for the program to mend. One effect name ("highlight") was not in the vocabulary; near-miss names now map to real ones.
  - Fresh edit: 17 clips, 0 critical, 0 suggestions; no automatic fixes were needed on drawn shots (the brain's fixes apply to stock and still edits, covered by tests); the caption-speed note follows the fast demo voice.
  - 17 shots drawn in 215 s; 1080p render with all 9 checks passing.
- **Frame review → engine v3:** "45 every second" ran off the frame under a focus zoom; lone icons on plain backdrops; still props; small characters; danger mood tinted faces pink; shots could open empty; a character popped in again after a cut inside a scene. All fixed (see DRAWN-SCENES.md section 9). The camera fix was found by drawing the shot alone with the style's real font (Patrick Hand): the zoom now never goes closer than the words and the faces fit together.
- **Code:** `drawn-engine.js`, `drawn-kit.js` (`K.pill`), `drawn-figures.js` (sizes), `drawn-sets.js` (danger mood), `sketch.js` (VERSION drawn-scene/6, `FX_NEAR`, carry in `Sk.mend`), `scene-room.js` (trimmed descriptive text).
- **Tests:** `tests/sketch.test.js` (near-miss effects, carry), `tests/scene.test.js` (trim), `tests/drawn.test.js` (browser). `npm run check` passed; `npm test` **230/230 passed, 0 skipped** (370 s).
- **Not tested:** the hand-drawn and motion-graphics engines with a real Claude plan (next in the owner's order); a fresh Claude plan with the carry fix (the demo plan predates it).

  No GitHub push.

### 2026-10-09 — the program fixes what it can, and says so (0.23.1)

- **Owner review (screenshots):** (1) do Claude's plans waste tokens on explaining itself; (2) what are the six scene-plan warnings, does the program fix them; (3, 5) "Failed to fetch" when saving settings; (4) Room 08 listed 13 suggestions without changing the video.
- **Findings:**
  - (1) Claude's answers are compact JSON (the 16-shot plan answer is about 4,700 tokens). Most output is Claude's thinking before it answers: about 9,600 of 14,297 output tokens in the plan and 5,500 of 6,885 in the review (effort high). The real waste was in two of the four test runs (71,839 and 17,734 tokens): the review answer was cut off at the 16,000-token ceiling and thrown away.
  - (2) The warnings were saved with the plan by an older rule; with today's rules only one remained (nature to beach), and the words say "sand into glass".
  - (3, 5) The demo program had been stopped (by me at the end of the previous turn) while its page stayed open; the page showed the browser's bare "Failed to fetch".
  - (4) All 13 were one cause: the demo narrator speaks up to 30 characters a second, and captions must show exactly what is said.
- **Code:** `editing-brain.js` (autoFix, new fix operations, caption advice), `editing-room.js` (fixes applied on drafting, listed), `sketch.js` (word-aware continuity, mend), `scene-room.js` (mend on Claude/free plans, review keeps moves with reasons, live continuity notes, 32,000-token answer room, review out of room keeps the plan, token split), `review.js` and `render-room.js` (one item for fast captions, the brain's fixes in Room 08), `server.js` (stray errors logged, program keeps running), pages `public/app.js` (banner, plain message), `public/scene-room.js`, `public/editing-room.js`, `public/review-room.js`, `public/index.html`, `public/style.css`; tests `tests/fake-claude.js` and `tests/scene.test.js` (streamed answers like the real API).
- **Tests:** new assertions in `tests/sketch.test.js`, `tests/editing.test.js`, `tests/qc-review.test.js`, `tests/scene.test.js`. `npm run check` passed; `npm test` **229/229 passed, 0 skipped** (278 s).
- **Browser check (demo workspace):** the plan shows 0 warnings and "4 fixed before you saw it"; job lines show read/wrote; Room 08 shows one caption-speed item with 13 moment buttons; stopping the program shows the banner and the plain message, and the page reconnects when it is back.
- **Not tested:** a fresh Claude plan with the new continuity mending and token split (it uses tokens); a fresh edit of the demo with the automatic fixes on drawn shots (drawn edits rarely have fixable findings).

  No GitHub push.

### 2026-10-09 — music and sound effects (0.23.0)

- **Owner request:** "add music and sfx build this room now all the related settings into the audio room like music, sfx or all the things". Read [AUDIO-ROOM.md](AUDIO-ROOM.md).
- **Code:**
  - `music.js` and `soundtrack.js` (new).
  - `audio.js`: music and sfx blocks in the edit's audio settings, the mix filters in readiness.
  - `editing-room.js`: the render scope carries the music cues and effects with files, times and levels.
  - `render-room.js`: the mix stage (checksums, one filter graph, measure, normalize the whole mix).
  - `server.js`: routes, workers and state.
  - Page: `public/audio-room.js` (score, settings, library, players, mix settings), `public/editing-room.js` (the set-audio op), `public/render-room.js` (forms), `public/app.js`, `public/style.css`.
- **Tests:**
  - `tests/soundtrack.test.js` (3): score rules and repair, effect placement by density, a real FFmpeg mix for every ducking choice.
  - `tests/editing.test.js`: a Claude score generated through a fake ElevenLabs (real MP3s), the commercial-use gate, cost confirmation, the monthly limit and a deliberate retry, then a render with the music under the voice at -16 LUFS; the drawn-cutaway render now also places and mixes effects on its drawn moments.
  - Two bugs found and fixed: generated files were checksummed wrongly (the render and the players would have refused them), and the free score saw back-to-back scenes as overlapping after rounding (found in the browser on the demo plan; the test now uses those exact times).
  - `npm run check` passed; `npm test` **229/229 passed, 0 skipped** (367 s).
- **Browser check (demo workspace, not the owner's data):** the room shows the score, settings and library; the free score made two cues; settings saved with the commercial-use confirmation; Generate refuses without a tested ElevenLabs connection; music cannot be switched on before the score is generated.
- **Not tested:**
  - live ElevenLabs music and sound effects (they need the owner's key and spend money);
  - a real Claude score;
  - listening to a real mix.

  No GitHub push.

### 2026-10-09 — voice direction (0.22.0)

- **Owner request:** the narrator's voice should change with the script (plain, happy, sad, energetic, quiet), guided by the script, the style and competitor techniques. Read [VOICE-DIRECTION.md](VOICE-DIRECTION.md).
- **Code:**
  - `delivery.js` and `voice-direction.js` (new), and the page script `public/voice-direction.js`.
  - `store.js`: `directionId` on auditions, direction checks in the scope, `voiceDirectionLines`, direction in handoffs.
  - `voice.js`: performs the segments.
  - `ai.js`: task `voice`.
  - `server.js`: routes, worker and state.
  - `scene-room.js` and `sketch.js`: sentences carry their delivery to Claude.
  - `app.js`: the panel in the Voice Room.
- **Tests:** `tests/delivery.test.js` (4: validation and repair, provider segments, the Claude job and owner edits, an audition performing tags with varied speed). `npm run check` passed; `npm test` **225/225 passed, 0 skipped**.
- **Not tested:**
  - live ElevenLabs v3/v4 performance (it needs the owner's key);
  - the Voice Room panel in the browser;
  - the scene planner prompt with real deliveries.

  No GitHub push.

### 2026-10-09 — engine reasoning, unlimited cast and the continuity review (0.21.0)

- **Owner review of the 0.20 demo:**
  - The engine pairing rules must not be hard-coded and must not be called the owner's rule: the owner gave a hint and wants Claude to reason about what fits where.
  - Quality comes first, so render speed should not cost quality.
  - Characters as many as the script needs.
  - Scenes must match the script and keep continuity.
  - Voice expression and an Audio Room with music and SFX are next.
  - The order is the stickman engine first, then the other engines step by step.
- **Code:**
  - `engines.js` rewritten as strengths, risks and usual mixes. `sketch.js` allows any drawing engine, a cast of up to 40, settings, continuity notes and new guide rules (script match, continuity).
  - `scene-room.js`:
    - scene settings;
    - a warning when a shot leaves the main look without a reason;
    - continuity warnings;
    - the continuity review (`reviewPlan`, its own token limit, tolerant JSON reading);
    - settings `continuityReview` and `reviewTokenLimit`.
  - `style.js`: launch library v3.
  - `motion.js`, `render-room.js`, `scene-room.js`: lossless PNG frames again; drawn intermediates at CRF 12 with the slow preset.
- **Real Claude test** on the demo workspace:
  - The first two runs exposed a review answer budget that was too small; it is now a separate limit.
  - The third run: the plan plus the review used 43,222 tokens, and the review changed 4 of 18 shots with plain-language reasons.
- **Tests:** engines rewritten (2); sketch tests extended (7); the planner test covers the review (redraw applied, reasons kept, unknown labels ignored); the documentary test expects a reason warning instead of a refusal.
  - `npm run check` passed; `npm test` **221/221 passed, 0 skipped**.
- **Not tested:**
  - a full render of the reviewed plan;
  - hand-drawn and motion styles end to end.

  No GitHub push.

### 2026-10-09 — engines that work together: the stickman engine, hand-drawn and motion partners (0.20.0)

- **Owner review of the 0.19 demo:**
  - The scenes were plain; props looked like still images.
  - There was no scene building, no motion graphics, no gestures, and the pace was slow.
  - The owner wants stick characters like their reference (big heads, looks, expressions) and Claude reasoning about characters.
  - Styles should update automatically.
  - Engines should work together, with sensible pairings (never stickman inside hand-drawn).
  - Budget is not a concern; quality is. Built P06d; read [DRAWN-SCENES.md](DRAWN-SCENES.md).
- **Code:**
  - `engines.js` (new): the matrix of primary engines, partners and refusals; planner sources; Claude's guide.
  - `sketch.js`: the cast; the vocabulary (poses, expressions, emotes, props, sets, moods, camera, transitions, effects, text styles); cues; lenient and strict checks; the fallback; the guide.
  - `drawn-kit.js`, `drawn-props.js`, `drawn-things.js`, `drawn-figures.js`, `drawn-sets.js`, `drawn-engine.js` (new): the browser engine. `motion-templates.js` delegates drawn shots to it, and `motion.js` loads it and captures opaque frames as JPEG.
  - `scene-room.js`:
    - partner sources;
    - cast across plan parts (16 sentences per part when drawing is primary);
    - cue timing;
    - repaired drawings with plan warnings, strict owner edits;
    - 720p previews timed on words.
  - `editing-brain.js`: cuts on cue words; drawn clips never trimmed; no plan overlays on drawn scenes.
  - `editing-room.js`: drawings in the render scope; no cut measurement for drawn clips.
  - `render-room.js`: redraws drawn shots on the captions' word times (up to three browsers), records frame hashes and the engine version, and treats drawn shots' own flashes as planned changes.
  - `style.js`: launch library v2 (Stickman drawn-only, faster pacing; Hand-drawn drawn-only; Documentary gains drawn cutaways); new launch specs added as drafts to unrevised launch profiles.
  - Scene Room: the cast and each shot's cue.
- **Demo** (separate demo workspace on this PC, never the owner's data):
  - The same lightning script as the 0.19 demo, so the two can be compared. The free Windows voice now runs at rate +2 with long pauses shortened outside the program (39.5 s instead of 62 s).
  - Claude planned 18 shots, all cued, with a cast of two: Sam (blue hoodie) and Dr. Volt (white curly hair, glasses, moustache, lab coat). It used motion shots for 45 per second, 4 million a day and 30,000 degrees. This took 105 s and 14,569 tokens, with no warnings.
  - Previews took 276 s. The edit had 18 clips, 15 of them cut on their cue words, and the critic found nothing.
  - The 1080p render went from 489 s to 150 s after switching to JPEG frames and three browsers. Every check passed.
  - The frame review found these issues, all fixed:
    - a counter hidden behind its own burst (backdrop effects now draw first);
    - a title card covering a drawn shot (no plan overlays on drawn scenes);
    - false hidden-cut flags on drawn flashes;
    - a character and a stamp cropped during zooms (the camera now keeps characters and words in frame);
    - a slow ink reveal.
- **Tests:**
  - new `tests/engines.test.js` (2) and `tests/drawn.test.js` (every vocabulary word draws, frames are identical on redraw, shots never sit still);
  - `tests/sketch.test.js` rewritten (6);
  - the drawn-scene planner test (cast, cues, repairs, strict owner edits, 720p preview);
  - editing tests for cue cuts and a documentary with hand-drawn and motion cutaways rendered on words;
  - a style test for launch-library upgrades.
  - `npm run check` passed; `npm test` **220/220 passed, 0 skipped (263 s)**.
- **Not tested:**
  - ElevenLabs narration with drawn shots;
  - Shorts drawn shots end to end;
  - hand-drawn and motion styles end to end with real Claude plans (only in automatic tests and contact sheets).

  No GitHub push.

### 2026-10-08 — drawn scenes for stick-figure, hand-drawn and motion-graphics videos (0.19.0)

- Owner request: see a real editing draft, "i want stick animation or motion graphic or handdrawn video ... the editing brains i added i want to test those". The styles and skills existed, but no engine drew their shots. Built P06c; read [DRAWN-SCENES.md](DRAWN-SCENES.md).
- **Code**:
  - `sketch.js` (new): the vocabulary, validation, fallback from the narration, Claude guide and engine version.
  - `motion-templates.js`: the `sketch-scene` template.
  - `visual-sources.js`: the `drawn-scene` capability makes `generated-graphics` executable.
  - `scene-room.js`: sketches in plans (Claude, rules, edits), `queueDrawAll`/`runDraw`, browser option.
  - `render-room.js`: drawn adapters assemble like a montage.
  - `editing-brain.js`: no overlays on drawn scenes; a stat label stops at its clause.
  - `captions.js`: light-palette captions in the style ink.
  - `style.js`: Stickman's primary source is generated-graphics; renderer notes.
  - UI: "Draw all scenes" and the drawing summary per shot.
- **Demo** (separate demo workspace, never the owner's data; free Windows voice, Microsoft David):
  - a 62-second lightning explainer in the Stickman style;
  - Claude's scene plan (17 drawn shots; one hook shot switched from a paid AI image to a drawing);
  - Draw all, the edit and a 1080p render (demo-only preset), all file checks passing.
  - Reviewing the frames found five issues, all fixed and redrawn:
    - captions unreadable on white;
    - a grey scene-text box duplicating drawn words;
    - text off the frame edge;
    - slow draw-on;
    - an unclear globe and sand; then a chalkboard shot breaking caption contrast, text over props, a duplicated stat with a bad label, and labels on arrows.
  - The video was sent to the owner.
- **Tests**:
  - `tests/sketch.test.js` (3);
  - a drawn-scene test in `tests/scene.test.js`: rules sketches, a Claude bad prop named, owner redraw, a real drawing by the program, no redraw of an unchanged shot, renderer not blocking;
  - caption contrast and the no-overlay/stat-label checks in `tests/captions.test.js`.
  - `npm run check` passed; `npm test` **211/211 passed, 0 skipped** (210 s; one earlier run took 42 min only because the demo was drawing and rendering at the same time).
- **Not tested**: ElevenLabs narration with drawn scenes, Shorts (vertical) drawn scenes beyond layout scaling, Hand-drawn Canvas and Motion Graphics end to end (same engine, different finish). No GitHub push.

### 2026-10-08 — Room 09 Packaging (0.18.0)

- P10 built; read [PACKAGING-ROOM.md](PACKAGING-ROOM.md).
  - `packaging.js` (pure) covers:
    - validation;
    - checks: honest figures (digits or English number words), YouTube limits, title/thumbnail craft, writing voice, disclosure, chapters;
    - the composed description (text, chapters, AI note, visual credits);
    - the thumbnail ASS layer;
    - Claude's prompt and answer.
  - `packaging-room.js`:
    - immutable revisions;
    - content-addressed 1280x720 thumbnails from the approved visuals with the pinned FFmpeg (`eq` and `vignette` added to readiness);
    - Claude drafts inside a token reservation;
    - a named approval only for a Room 08-approved render, going stale on change;
    - export text for YouTube Studio.
  - `public/packaging-room.js`: Room 09 live, with full-size and phone-size thumbnails and a download link.
- Tests: `tests/packaging.test.js` (4) and an end-to-end Room 09 test with real FFmpeg (free start, owner edit, unsupported figure, Room 08 gate, approval, Claude draft via a stand-in, stale approval, tampered thumbnail). The last full run was 206/206 before the final small fixes (spelled-out figures, forgiving accent words); afterwards `npm run check` passed and `tests/packaging.test.js` passed 4/4. The full suite was not re-run after those fixes.
- Browser check: free start drew 3 thumbnails; the edit dialog saved r2; Room 08 approval by flagged moments; package approval refused until the phone-size box was ticked, then approved.
  - The check also found the false "unsupported 5,000" (the script says "five thousand"), which was fixed.
  - One real Claude draft (7,196 tokens) was rejected because an accent word was not among its overlay words. The parser now drops such an accent, but the real draft was not repeated.
- Not tested: a successful real Claude package draft, real owner material. No GitHub push.

### 2026-10-08 — Claude frame scan and videos of any length (0.17.0)

- Owner requests (2026-10-08):
  - "make claude to check for the frames": the owner only checks errors, not the whole video.
  - "do not want the program to be hardcoded or packed too small": 5-, 10-, 20-, 30-minute videos or longer, at the owner's choice.
- **Frame scan (P09b, [REVIEW-QC.md](REVIEW-QC.md) §4).**
  - `frame-scan.js` samples a frame at every clip and graphic, the hook at 0.5 s steps, and fill-ins at ≤4 s.
  - Contact sheets are cut from the real render with the pinned FFmpeg (16 frames each). Six sheets go to Claude per answer, with notes on what the narration, caption, shot and graphic are at each frame.
  - Each answer is parsed strictly (frame, severity, kind, what, fix) and its findings are kept.
  - Tokens are reserved per answer (23,200); nothing retries by itself. Failed answers are retried deliberately and alone.
  - Optional per-family automatic scan, switched on by name.
  - Findings join the Room 08 list with their frame and repair link. After a completed scan the verdict may confirm "checked every flagged moment" instead of a full watch.
  - `ai.js` sends image prompts to Claude Code as a stream-json user message, still with no tools. One tiny live call ("red" square) verified that path first.
- **Any length ([VIDEO-LENGTH.md](VIDEO-LENGTH.md)).**
  - Drafts carry `targetMinutes` (1-180). The script word range, paragraphs, answer room and job token limit scale with it.
  - API answers above 16,000 tokens are streamed; Claude Code timeouts scale with the answer size.
  - Scene plans of long scripts run in parts of 60 sentences, keeping finished parts and settling usage per attempt. Sanity bounds are now 2,000 scenes / 6,000 shots.
  - Narration: per-narration characters up to 2,000,000; 5-minute requests; analysis and join timeouts scale.
  - Pause analysis timeout scales; FFmpeg output capture is 4 MiB; the overview contact sheet holds up to 300 frames.
  - The family form's token fields now match the server (the old UI capped the script job at 8,000 tokens).
- **Tests**:
  - `tests/frame-scan.test.js` (3): sampling, sheets, prompt notes, strict answer checks, image path to Claude Code.
  - The Editing Room render test now scans the real render with a stand-in Claude: sheets, answers, settled usage, findings in the review, and a verdict passed by flagged moments.
  - A 30-minute script test: policy, store, job limit, streamed answer, quality gate.
  - A 3-part scene plan with a bad part retried alone and usage settled once per call.
  - Streaming fake added.
  - `npm run check` passed; `npm test` **201/201 passed, 0 skipped** (136 s).
- **Measured, scratch workspace with synthetic media**:
  - A 25.5-minute edit: 276 clips, 562 captions, 42 graphics, 7 valid chapters.
  - It rendered at 360p in 393 s (198.5 MB) with all nine file checks passing (273 cuts, all planned).
  - Its Review & QC report took 1.1 s; page state was 517 KB.
- **Real scan, scratch 4:15 render, on the owner's subscription**:
  - 93 frames in one Opus 5.5 answer, 46 s, 18,800 tokens (15,856 in / 2,944 out) inside a 23,200 reservation.
  - 14 findings, 7 of them critical. On the synthetic test footage Claude flagged:
    - the test patterns as unrelated to the narration;
    - TV static as a broken signal;
    - captions lost on the white colour bars;
    - a corner label on a clip;
    - a static-looking opening.
  - Every finding showed its frame; no CSP violations.
  - The browser check found the thumbnail overlapping the text column (fixed) and the acceptance wording omitting Claude (fixed).
- **Not tested**: real narration and stock media at 20-30 minutes, a 60-minute-plus render, final 1080p masters (P11), the API-key streaming path against the live API (tested against a streaming fake). No GitHub push.

### 2026-10-08 — Room 08 Review & QC (0.16.0)

- P09 (CONTINUATION-REVIEW step 3), built around existing evidence with no second approval chain. See [REVIEW-QC.md](REVIEW-QC.md).
- Render worker: full decode (`-v error`, any error line or non-zero exit fails), audio/video alignment from ffprobe (start and end within one frame; end within one frame + 50 ms), audio clipping when the edit has no narration finish, a dense hook contact sheet (1 s steps over 15 s; 0.5 s over a Short's first 5 s), tile geometry for both sheets from their real size, and time spans on black-frame, frozen-picture and unplanned-cut checks. New file kind `hook`.
- `review.js` (pure): blockers (out of date, missing/changed files, failed or missing decode proof); one issue list in time order from failed render checks (one entry per span, naming the clip), the critic (with its fix ops), and captions caption by caption (the critic's caption summaries are replaced; coverage against the narration sentences is added); repair links (clip editor, caption correction, graphic editor, critic fix, Audio Room); a sentence-by-sentence aligned read (captions, clips, cuts, graphics, thumbnail tile, issue count); status blocked / awaiting verdict / approved / changes requested; a "not checked" list.
- `RenderRoom.qcReport` + `GET /api/renders/:id/qc`. The verdict now refuses any blocker and requires acceptance of every critical editor/caption finding from the review (coverage included); it records the review counts. Duplicate file checks in the verdict were replaced by the review's integrity check.
- UI: `public/review-room.js` (Room 08 live). Timecodes, contact-sheet tiles and sentence rows jump the player. Repair buttons open the right dialog in the Editing or Audio Room. The verdict form moved here; the Editing and Audio Rooms link to it. The page CSP forbids inline style attributes, so tile and thumbnail geometry is applied through the CSSOM (`qcApplyLayout`). The first browser pass caught this (CSP violations); after the fix, 0 violations were seen and tiles sit within 1 px of their frames.
- Tests: `tests/qc-review.test.js` (4). Covers decode and alignment rules, real FFmpeg failing fixtures (truncated MP4, damaged bytes, 0.5 s shifted audio), blockers and the status ladder, timecoded findings, repairs, caption entries, coverage, and the aligned read. The Editing Room render test now asserts the new checks, the hook sheet, the report, the integrity blocker on a tampered file, the approved status and invalidation by a newer edit. `npm run check` passed; `npm test` **196/196 passed, 0 skipped** (136 s) on Node 24.18.1, FFmpeg 8.1.2, Edge.
- Browser check on a disposable scratch workspace (port 3472, never data/control-room.sqlite), real local renders of a 4:15 synthetic edit:
  - all 9 file checks passed (full decode; alignment +0/−15 ms; clipping −30.9 dBTP);
  - Room 08 showed "Ready for your verdict", 4 editor issues, 42 aligned sentence rows with thumbnails and 66 labelled tiles;
  - time chips and tiles moved the player; "Change S01A" opened the clip dialog in the Editing Room;
  - the verdict form refused missing confirmations, then recorded a pass ("Approved");
  - a caption correction afterwards turned the page to "Blocked" with "The earlier approval no longer applies".
- Not tested: real owner material, a long-form render longer than 4:15, the review of a final master (P11). No live provider call was made; no GitHub push.

### 2026-10-08 — caption corrections and WebVTT (0.15.1)

- P07 gap closing (CONTINUATION-REVIEW step 2). `captions.editCaption` and the editing-brain op `set-caption {groupId, text}` / `{groupId, reset: true}` change one caption's wording in a new immutable edit revision. Timing never moves; the group keeps the narration's timed words, so the coverage check still compares the narration and a reset restores them. `*word*` sets the single emphasised word (punctuation may sit outside). Text is validated: at most two lines' worth of characters, no control characters, braces, backslashes or `-->` (ASS/SRT/VTT safety). The critic adds a `captions-edited` nitpick naming the corrected captions.
- `captions.vtt` and `GET /api/edit-revisions/:id/captions.vtt` (`text/vtt`, escaped `&<>`); `EditingRoom.captionsSrt` became `captionsFile(revisionId, kind)`.
- Editing Room: **Read and correct the captions** lists a **Correct** button per caption (hidden on stale edits); the dialog shows the narration's words, the timing and a reset checkbox once a caption was corrected; **Download WebVTT** sits beside the SRT button.
- Tests: 2 new caption tests (WebVTT cues equal the SRT cues, escaping; correction, validation, reset), op/critic coverage in the captions test, and an Editing Room revision test (correction gives r4 with unchanged timing, SRT and WebVTT carry the corrected words, filename `-r4.vtt`, undo restores the hash) plus 404 checks for both sidecar routes. `npm run check` passed; `npm test` **192/192 passed, 0 skipped** on Node 24.18.1 with FFmpeg 8.1.2 and Edge.
- Browser check on a disposable scratch workspace (port 3472, never data/control-room.sqlite): the dialog opened with the emphasis marked; a correction saved as r4 with the timing unchanged; the WebVTT download returned `text/vtt` with the corrected words and an `-r4.vtt` filename; the critic note appeared; the reset checkbox saved r5 with the narration's words and the original emphasis; no console errors. A doubled full stop in the dialog hint and the reset checkbox layout were fixed during the check.
- Not tested: a real ElevenLabs narration, a real render of a corrected caption (the render reads the same `lines` already covered by the ASS tests). Measured word alignment is still not built. No live provider call was made; no GitHub push.

### 2026-10-07 — narration-only Audio Room and continuation review (0.15.0)

- Owner decisions: keep the current Claude direction; build narration-only first and choose music later. The pre-existing provider migration was preserved. Current architecture, confirmed findings, remaining stages and the continuation's file inventory are in [CONTINUATION-REVIEW.md](CONTINUATION-REVIEW.md).
- P08a: added pure `audio.js` helpers and Room 07 UI. Audio settings are immutable edit operations, reused by the pinned render worker. Normalization measures the stereo narration, applies a second pass, saves a 48 kHz stereo 24-bit WAV and checks the actual encoded AAC for duration, layout, loudness, true peak and silence. Original-level mode is available. Source timing and source files stay intact. Passing audio QC plus a named listening confirmation are required for approval. Full P08 remains `testing` because music, SFX and real-narration acceptance are outstanding. See [AUDIO-ROOM.md](AUDIO-ROOM.md).
- Integrity fixes: hash-check media downloads and files used for approval (including same-size corruption); reject superseded queued edits before rendering; isolate `:memory:` application's media/protected-key roots in OS temporary directories. New HTTP coverage verifies temporary roots, range streaming, invalid ranges, guarded writes and same-size tampering.
- Restored the regression baseline after the incomplete Claude fixture migration: updated provider payloads, writer dependencies, token-limit assertions and UI names; concurrency coverage now measures overlap rather than wall-clock thresholds.
- Browser checks found and fixed a misplaced listening checkbox and mobile action-row overflow. The final review form rejects missing listening confirmation and stores a completed synthetic-fixture verdict; a subsequent settings revision requires a fresh preview and does not inherit the old proof.
- Verification on Windows Node 24.18.1 with installed FFmpeg/ffprobe 8.1.2: `npm run tracker` passed; `npm run check` passed; final `npm test` **190/190 passed, 0 failed, 0 skipped**, 305.1 seconds. Real Windows DPAPI tests ran under the normal user account. The earlier focused audio/editing/scene run passed 26/26 with no skips. `git diff --check` passed. The default npm wrapper on this PC points at a missing roaming installation, so these npm scripts were run through `C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js` with Node; the system installation was not changed.
- Browser verification used a disposable loopback workspace, synthetic narration/media and blocked provider calls: empty-family isolation; invalid loudness rejected; settings create r2; real 36-second audio/video preview; native playback (ready state 4, time advanced without error); encoded result −16.02 LUFS; missing-listening rejection; named test verdict; original-level change creates r3 with a new preview requirement. At desktop width 1280 and mobile 390 × 844, final document scroll width matched client width (1265 and 375 respectively). Mobile settings were visually inspected. No browser error logs remained. Screenshots are local ignored artifacts in `test-results/audio-desktop.jpg` and `test-results/audio-mobile.jpg`.
- No live Claude, YouTube, NexLev, ElevenLabs, stock or AI-image call was made. Synthetic tests do not verify natural speech, actual rights or professional creative quality. Long-form throughput, live-provider migration, backup restore, final masters, localization and publishing remain unverified. P07 caption editing/WebVTT/alignment gaps remain recorded; no dependent release stage was enabled.
- Delivered in place to `C:\Users\ammar laptops\Desktop\YT\youtube`. The owner's database was not used for tests. No GitHub push or separate project folder was created.

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

### 2026-10-04 - owner decisions, competitor channels and Style Library (0.7.0)

- Recorded the owner's decisions in AGENTS.md, build-status.json and this file. Delivery changed to the owner's local folder; GitHub pushes only on request.
- Housekeeping: test fixtures that hard-coded September 2026 expiry dates now compute dates relative to today (one test had started failing after 30 Sep 2026). The app version is read from package.json and shown in the sidebar and health endpoint instead of a stale "Version 0.5" label.
- F07: families store 0-10 validated competitor channel references (@handle, UC… ID, /channel/ and /user/ links). Duplicates, video, playlist, /c/ and non-YouTube links are rejected. Competitor edits do not revoke approved scripts. The family card shows the list and asks for 3-10.
- P03: new `style.js` module and `public/style-room.js` UI. Five launch profiles are seeded as drafts. Revisions are immutable (SQLite triggers block spec updates and deletes), carry SHA-256 hashes and field-level diffs, and need named human approval with three confirmations. Custom and derived styles are supported. Assignments: family default, acknowledged channel overrides, manual-only approved fallbacks, revoke and retire, all with a supersede history and dependency-ledger entries. Renderer support matrices block impossible format/fps/transition/camera combinations. Text/background contrast must reach 4.5:1 and the reference share is capped at 30%.
- Documentary Montage (FFmpeg montage) is chosen as the first executable style for P05.
- NexLev integration research for R06: the REST API uses base `https://prod.dashboard.nexlev.io/api` with an `x-api-key` header (endpoints under `/external/...` for niche overview, similar channels, outliers, channel videos, analytics and transcripts); the MCP server uses OAuth. Recorded in REPOSITORIES.md; nothing is connected yet.
- Verification: `npm run check` passed; full suite 112 tests, 110 passed, 2 skipped (Windows-only DPAPI) on Node 22 in the build sandbox; new files `tests/style.test.js` (9) and `tests/competitors.test.js` (3). Chromium drove approve → assign → override → fallback → new revision → spec viewer at 1440 × 1400 and the Style Room at 390 × 844 with no horizontal overflow and no console/CSP errors. Not yet run: the suite on the owner's Node 24 Windows machine and the Windows DPAPI checks.

### 2026-10-04 - Competitor Intelligence and Niche Factory (0.8.0)

- New modules: `intel-sources.js` (bounded JSON reads, tolerant normalisation of NexLev/YouTube payloads, copy-guard shingles, `NexLevClient`, `YouTubePublicClient`, `QuotaLedger` with per-job reserve/settle/unknown/release for NexLev requests per UTC month and YouTube units per Pacific day), `competitor-intel.js` (R05) and `niche-factory.js` (R06). UI in `public/intelligence.js` with two new pages (Competitors, Niche Factory) and one shared dialog. NexLev added as a connector provider with a 1-request metadata test.
- R05: per-family scan settings, revisioned owner observations per competitor, explicit scans (NexLev profile/videos/outliers/transcripts; YouTube public data display-only unless the owner records YouTube derived-metrics approval; purged after 30 days), Hermes blueprints with evidence refs, prompt compaction to the analysis token limit, 30/70 rule and 8-word copy guard, named review with three confirmations, supersede/revoke, outdated detection when the competitor list changes. Effects: Hermes script guidance (script job type carries the guidance analysis id), narrator-form prefill, and a new style draft with validated adjustments (invalid ones skipped and listed; reference share capped at 30%).
- R06: revisioned owner niche ideas (keywords, seed channels), NexLev discovery (niche overview, similar channels, keyword search, analytics estimates), Hermes evaluation with exactly 20 distinct episode ideas and evidence refs, rubric score 25/25/20/15/15 computed in code, hard filters (rights, evidence, suitability, cost, originality) forcing "do not produce", 6-word title copy guard, separate monthly token budget, shortlist/reject/approve review, and family creation from an approved niche (prefilled form, then linked and locked).
- Interrupted jobs are marked on restart; deliberate retries (3 attempts at most) require confirmation when provider usage is unknown.
- Verification: `npm run check` passed; full suite 123 tests, 121 passed, 2 skipped (Windows-only DPAPI) on Node 22 in the build sandbox; `tests/intelligence.test.js` adds 11 checks with a fake NexLev/YouTube/Hermes network. Chromium (desktop 1440 px and 390 x 844) drove observations → scan → blueprint → refused approval without confirmations → approval → style draft → narrator prefill, and niche idea → discovery → evaluation (81, strong) → approval → family created and linked; blocked, interrupted and do-not-produce states were rendered. No page errors, no CSP violations, no horizontal overflow. These are fixture checks; no live NexLev, YouTube or Hermes call was made.

### 2026-10-04 - Blend picks and Scene & Visual Room (0.9.0)

- R05 blend picks (owner request): every competitor link on the Competitors page gets five toggles (voice-over, narration, editing, thumbnails, visuals); picks are revisioned per family (`competitor_picks`). The analysis sends Hermes the picked channels per area, and validation enforces that adopted patterns only use picked areas and cite picked channels, with at most 30% reference per area as well as overall. A blend recipe shows each area's sources or "100% your own". New picks make an approved blueprint outdated. Outputs: voice → narrator draft, narration → script guidance, editing → style draft, thumbnails → packaging brief (new), visuals → scene planner guidance.
- P04 foundations: `visual-sources.js` with a versioned capability registry (Pexels photo/video, Pixabay photo/video, OpenAI images), Pexels/Pixabay search clients (fixed origins, header key for Pexels, query key for Pixabay never logged), an OpenAI image client (b64 decode, PNG/JPEG sniffing), downloads restricted to provider media hosts with size caps, magic-byte checks and streaming SHA-256, ffprobe evidence and ffmpeg thumbnails. Pexels and Pixabay connector slots with one-request tests. QuotaLedger now also caps Pexels and Pixabay requests per UTC hour.
- P04 room: `scene-room.js` and `public/scene-room.js`. Sentence splitting (Latin, Urdu/Hindi/CJK punctuation; abbreviations merged), word-share timing from the approved narration, free rule-based plans and Hermes scene plans (token-budgeted, structural failures blocked, quality issues kept as draft issues), style-bound checks, competitor-name and "in the style of" guards, immutable trigger-protected revisions with stable scene/shot IDs, scene and shot edits, split/merge/add/remove, refresh for a new narration or style, plan review with two confirmations; stock search jobs with 24-hour cache and local previews, licensed imports, AI generation with per-family monthly budget and owner-entered prices, batch search/top-pick/generate with up-front cap and budget checks, deliberate retries (3 attempts, confirmation after interruption), restart recovery, selections with an audit log, board summary, visual approval with rights, sequence, warning and AI-disclosure confirmations, snapshot handoff and invalidation ledger entries.
- Verification: `npm run check` passed; full suite 133 tests, 131 passed, 2 skipped (Windows-only DPAPI) on Node 22 in the build sandbox; new `tests/scene.test.js` (9) uses real FFmpeg/ffprobe on generated media and a fake Pexels/Pixabay/OpenAI/Hermes network; `tests/intelligence.test.js` adds a blend-picks test. Chromium (1440 px and 390 × 844) drove a Hermes plan of 24 scenes / 48 shots → shot edit → plan approval → 40 stock searches → 40 licensed downloads → 8 AI images → shot change in the sourcing dialog → visual approval → handoff ready; and blend picks → scan → blend-constrained blueprint → approval → pick change → outdated. No page errors, no CSP violations, no horizontal overflow. These are fixture checks; no live Pexels, Pixabay, OpenAI or Hermes call was made.

### 2026-10-04 - FFmpeg readiness and assembly proxy (0.10.0)

- `render.js`: PATH resolution without a shell, SHA-256 of the FFmpeg/ffprobe binaries, filter and encoder inventory, a byte-identical fixture render, the proxy planner (frame-snapped shot boundaries, zoompan Ken Burns cycle scaled by the style's motion intensity, held or trimmed clips, lossless concat for cuts, frame-exact xfade chains for crossfade/dip-to-black with extended outgoing segments), bit-exact libx264/AAC settings, and blackdetect/freezedetect parsing.
- `render-room.js`: readiness history, owner pin of the exact binaries (re-checked before every render), render jobs from the Room 04 handoff (Documentary Montage / ffmpeg-montage only), input checksum verification, per-shot segment rendering with progress, narration mux, QC (duration, frame, audio, black, frozen with shot labels), contact sheet, immutable result and render manifest (commands with local paths removed, bounded logs), cancellation of queued or running renders, three deliberate attempts, restart recovery, out-of-date detection and the human style-proof verdict. Video is streamed with HTTP ranges.
- UI: Room 05 is active with the assembly preview (readiness card, pin, inputs gate, progress, player, QC findings, contact sheet, manifest link, verdict, history).
- Verification: `npm run check` passed; full suite 138 tests, 136 passed, 2 skipped (Windows-only DPAPI) on Node 22 with FFmpeg 6.1.1 in the build sandbox; new `tests/render.test.js` (5) renders real proxies and proves a byte-identical re-render, frame-exact cut/crossfade/dip-to-black assemblies, pin mismatch, cancellation and restart recovery. Chromium (1440 px and 390 × 844) ran readiness → pin → a 5-minute, 48-shot proxy (rendered in about 62 s) → QC (the flat AI fixture images were correctly flagged as frozen) → verdict. No page errors or horizontal overflow. Not yet verified: the owner's Windows FFmpeg build and real stock/AI visuals.

### 2026-10-05 - Skills Engine research and move to Claude Code

- Owner request: a Skills Engine holding every skill from his two "main brain" documents, owner-added skills, learning from the program's own work, real-time use in every room; an Editing Room that thinks like a professional editor and motion designer; his motion-designer title-card prompt as an Editing Room skill.
- Done: both documents read in full (Precision AI Operating System, 36 sections; YT Empire Builders Prompt Library, 60 pages / 44 prompts). The editing repositories were re-cloned at their pinned revisions and analysed in depth; results in `docs/research/editing-brain/` (4 reports, 160 skill drafts in our own words, FFmpeg recipes tested on 6.1.1). `docs/SKILLS-ENGINE-PLAN.md` holds the engine design and a coverage map from every document section and prompt to a skill ID.
- Not done: no Skills Engine or Editing Room code yet; no tests changed. The owner then moved the project to Claude Code; `docs/HANDOFF.md` and `CLAUDE.md` describe how to continue.

## Validation record

### Current release 0.14.1 - Hidden cuts in stock clips (from claude-video)

- Owner request (2026-10-06): deeply analyse bradautomates/claude-video and take its brain into the rooms without adding mess. Read in full at `03ceb42` (MIT); notes in `research/claude-video.md`. It is a video-perception tool (/watch), not an editor, so its brain is the evidence method.
- `render.js`: `sceneCuts` measures hard cuts in a video (scene score above 0.3; fast camera moves do not count). Readiness requires `select` and `showinfo`.
- Editing Room: every approved stock video clip is measured once (cache `media_analyses`, keyed by SHA-256). The brain's `cleanWindow` keeps each window inside one continuous shot and says why in the trim reason; the critic's `hidden-cut` finding offers the clean in-point as a one-click fix.
- Render QC: edit renders gain **unplanned cuts**, which measures the finished video and fails on any cut the edit did not plan.
- Skills: 5 draft skills (`skills/claude-video.json`); 349 builtin skills in total.
- Left out: video downloading and cookies (YouTube terms; other channels stay display-only), the Gemini engine, Whisper transcription, near-duplicate detection between different assets (needs calibration on real footage).
- Verification on the owner's PC: `npm run check` passed; full suite **183/183**. New: the hidden-cut room test (cut measured once, windows avoid it, forced window flagged, the render check fails on it and passes after the fix) and a pure `cleanWindow` test; the main edit render passes the new check. The detector found the cut at 2.50 s in a two-shot clip and none in a moving pan.
- Not verified: real stock footage from Pexels or Pixabay (only synthetic clips).

### Release 0.14.0 - Captions (P07) and the YouTube craft engine (S02)

- Owner request (2026-10-06): deeply analyse heygen-com/hyperframes and Jakeschincariol/youtube-agent-skill, build their most useful features into the program, and continue with what was not done yet. Research, pinned revisions and decisions: `research/hyperframes-and-youtube-agent-skill.md`, `REPOSITORIES.md`.
- Added `craft.js` (port of youtube-agent-skill, MIT; `hooks.json` vendored unchanged with its licence):
  - hook scorer (five properties, 0.6 x mean + 0.4 x weakest, 21 formulas) and title/thumbnail pairing linter, both returning the Python originals' numbers on the same inputs;
  - chapter drafts (pauses, vocabulary shift, scene starts and the script's paragraph breaks; 0:00, 3+, 10 s rules);
  - outlier multiples over the channel median (recent uploads only) with each title's formula;
  - a Shorts finder (20-55 s, a complete opening, a turn or a proof, ends on a line);
  - a retention-CSV reader (hook leak, cliffs with what the narration said, slide, one fix);
  - never-used words of the family writing voice.
- Families gain an optional **writing voice** (audience person, never-used words, own phrases, refused claims, format notes). Hermes receives it (script prompt version 3); never-used words block a candidate; the hook score is added to candidate quality as advice.
- Added `captions.js` (P07): words timed inside the measured sentence windows with clause pauses anchored at commas; phrases split into the fewest even captions, never ending on a weak word; long-form 2 lines x 42 characters, Shorts sized by speaking rate; scarce inline emphasis on figures and negations; the top ASS layer, bottom band on 16:9 and above the Shorts buttons on 9:16, clearing for full-screen graphics; SRT per revision; `set-captions` owner operation; caption checks in the critic.
- HyperFrames doctrine applied in code: smooth long-tail easing instead of overshoot in the canvas templates; graphics kept above the caption band (line chart and list build moved up; the Shorts scene label moved to the upper third).
- Skills: 31 new drafts (`skills/youtube-agent.json` 14, `skills/hyperframes.json` 17); 344 builtin skills in total.
- UI: a Craft check on every draft (hook bars with the weakest property and its fix, title check, thumbnail pairing); Writing voice in the family form; Captions, YouTube chapters, Shorts candidates and the retention reader in the Editing Room; × median and title formula columns in competitor scans; Room 06 marked active.
- Found while testing:
  - First captions grouping ended captions on weak words ("60% of the", "who did / not trust") and emphasised "Every"; it now splits phrases evenly with weak-word costs and lifts only figures and negations.
  - Chapter drafts clustered in the first 30 seconds (upstream scoring sees "new" vocabulary near the start); boundaries now skip the first and last three sentences and use paragraph breaks.
  - The Shorts finder opened a candidate on "Since then, …"; such openings now count as leaning on the sentence before.
  - On Shorts the hook's scene label hid the captions during the opening; the label moved up and no longer clears them.
  - **Headless Edge stopped starting** during the final suite: Edge relaunched itself, the launcher exited silently and 26 headless browsers from test runs were left running. The launcher now reads the DevTools port from the profile's `DevToolsActivePort` file and closes the browser itself with `Browser.close`; a regression check asserts the browser and its profile are gone after closing. Only those headless test processes were stopped.
- Verification on the owner's PC, Node 24.18.1, FFmpeg 8.1.2, Microsoft Edge 154: `npm run check` passed and the full suite passed **181/181** with zero failures, skips or cancellations, leaving no browser processes or profiles behind. New: `tests/craft.test.js` (9), `tests/captions.test.js` (7), plus caption, SRT, retention and craft assertions in the Editing Room render test and outlier assertions in the competitor scan test.
- Renders: long-form and Shorts edits rendered with real FFmpeg; frames checked by eye (bottom band on 16:9 with the figure in the accent colour; lower-middle rail on Shorts, clearing for the quote and title card).
- Browser (scratch database, desktop and 375 px): craft check and pairing on drafts; captions panel, switching captions off, the critic's one-click fix back on (r3), SRT download (200, attachment); chapters on the script's section breaks; five Shorts candidates; the retention reader naming a cliff at 1:52 with its narration; no horizontal overflow at 375 px.
- Not verified: a real ElevenLabs narration (word times inside phrases are estimated, not measured); live NexLev data in the new competitor columns; Google Chrome.

### Release 0.13.0 - Animated graphics (P06b)

- Added `motion-templates.js`: six canvas templates (bar chart, line chart, timeline, list build, comparison, process diagram) built from the `motion.*` research.
  - Eased builds, count-ups, arc-length line draws, proportional timelines, family palette and fonts.
  - A clean or a hand-drawn finish (seeded double strokes, handwriting font, paper grain).
  - Every frame is a pure function of time: no randomness, clocks or timers.
- Added `motion.js`: drives the locally installed Microsoft Edge or Google Chrome over the DevTools Protocol with Node's built-in WebSocket (no npm packages).
  - Headless, a throwaway profile, networking blocked, our own script injected into about:blank, pixels taken from the canvas.
  - A readiness probe checks that the browser is found, records its version and SHA-256, and confirms the same frame draws identically twice.
- Editing brain: proposes animated graphics only from the script's own data:
  - three or more same-unit numbers become a bar chart (labels from the words before each number), or a line chart when each number has a year;
  - three or more years become a timeline, which replaces that scene's date stamps;
  - "three reasons: …" or First/Second/Third become a list;
  - "X versus Y" becomes a comparison;
  - "A leads to B, which turns into C" becomes a process diagram.
- Repeated labels never become a chart. Every proposal tells the owner to check the data. The finish follows the style (sketch styles are hand-drawn).
- Data is kept as editable lines and validated (`canvasData`): one unit per chart, real years, exactly two comparison sides. New owner operation `add-graphic` adds any text or animated graphic, accepted at once and never overlapping another.
- Rendering: accepted animated graphics are drawn in the browser during the edit render, packed into lossless RGBA clips and overlaid at their start time under the text layer.
  - Their dark panel counts as planned in the black-frame QC.
  - The manifest records the browser and a hash of each graphic's frames.
  - Cancelling a render also stops the browser.
  - Readiness now requires the `overlay` filter and the `png` encoder.
- UI: friendly names, a data editor per template (title plus one entry per line with a format hint), **+ Add a graphic**, and an "animated graphics" chip on the readiness card.
- Found while testing:
  - A timeline's dark panel failed the black-frame QC; animated-graphic windows are now planned dark moments.
  - Bar labels crossed commas and year-number pairs became a junk timeline; labels now stop at punctuation, and a line chart wins over a timeline.
  - The readiness report named headless Edge as "Chrome"; it now names the browser from its path.
- Verification on the owner's PC, Node 24.18.1, FFmpeg 8.1.2 and Microsoft Edge 154: `npm run check` passed and the full suite passed **165/165** with zero failures, skips or cancellations. Three new tests:
  - data parsing, each detector, finish, add and edit validation, and the overlay plan;
  - the browser renderer drawing identical frames at the requested size;
  - a full room render with an animated timeline: QC passed, the panel verified on screen, byte-identical twice.
- Browser (scratch database): the readiness chip showed animated graphics passing. A bar chart added through the new dialog rendered with every QC check passing, and the frames showed bars growing while values counted up, then a hold and the fade-out.
- Not verified: maps and stick-figure animation (not built), fonts the styles name but that are not installed on this PC (a fallback font draws them), Google Chrome (only Edge was tested).

### Release 0.12.0 - Editing Room (P06)

- Owner mandate (2026-10-05): the Editing Room must think like a professional editor and motion designer, built from a deep analysis of the editing repositories. The analysis lives in `docs/research/editing-brain/` (OpenMontage's editor and reviewer brain, the palmier/capcut/lossless-cut timeline rules, flick and hand-drawn motion design, 160 skills). This release turns it into code.
- Added `editing-brain.js`, pure and deterministic:
  - measured sentence timing (FFmpeg `silencedetect` pauses);
  - sentence-snapped cuts;
  - breathing holds with hero weighting and the hook limit, no three equal holds;
  - long stills split into a wide hold and a detail punch-in;
  - eased camera moves chosen by role and never repeated on neighbours;
  - clip trims and safe slow-downs;
  - structural transitions within a budget;
  - a fade-out ending and retention markers;
  - proposed motion graphics (stat reveal, quote card, date stamp, plan text, and the owner's title card at turn scenes with one accent word).
- Every decision carries a reason and the skill ID it restates. The critic files critical, suggestion and polish findings with fixes (some one-click) and a six-dimension slideshow-risk score.
- Added `editing-room.js`:
  - immutable edit revisions (SQLite triggers) tied to the exact board, narration, script and style;
  - optimistic concurrency and full validation before anything is saved;
  - undo as a new revision and single-scene repair that keeps every other decision;
  - a cached pause analysis;
  - approved editing skills recorded with each edit in the Skills usage log;
  - a lesson candidate when the owner makes the same correction in two different edits of a family (a proposal only).
- Rendering: `render.planTimeline` renders an edit revision.
  - One segment per clip, lossless joins for runs of hard cuts, `xfade` for soft transitions, one ASS graphics layer through libass (eased entrances, accent colour) and the fade-out.
  - Title cards and the fade-out count as planned dark moments in QC. The manifest records the edit revision and the graphics SHA-256. The verdict asks the owner to accept any remaining critical findings.
  - `REQUIRED_FILTERS` now include `settb`, `setparams`, `fade`, `ass` and `silencedetect`, so run the readiness check again.
- Fixed while browser-testing: every render segment is now converted to one colour profile (BT.709, TV range, explicit tags).
  - Mixed full-range JPEG stills and TV-range clips changed format mid-stream; FFmpeg rebuilt the filter graph and a crossfade dropped a 16.8 s chunk. A 40 s edit rendered as 23.9 s, and the duration QC caught it.
  - A regression test fails without the fix and passes with it.
  - The plain assembly proxy benefits too: stills and clips no longer carry different brightness ranges.
- Fixed in the page: the clip dialog showed holds rounded to 0.1 s and submitted them as changes. Only fields the owner actually changes become operations now.
- UI: Room 05 shows an **Edit decisions** card:
  - an SVG timeline strip (stills, clips, heroes, soft transitions, graphics, markers; click to change);
  - facts, the critique with one-click fixes, and motion graphics to accept, reject or edit;
  - every cut and its reason, plus per-scene **Redo** buttons;
  - undo, history, **Render this edit** and **Draft a fresh edit**.
  - The plain assembly render remains available.
- Verification on the owner's PC, Node 24.18.1 and FFmpeg 8.1.2: `npm run check` passed and the full suite passed **162/162** with zero failures, skips or cancellations. That includes 8 new editing tests:
  - pause alignment;
  - a frame-exact, deterministic auto edit;
  - the critic;
  - owner operations and scene repair;
  - the ASS layer and render plan;
  - the full room with a real FFmpeg render (pause-aligned, graphics, byte-identical re-render, verdict with accepted criticals, out-of-date handling);
  - the override lesson;
  - HTTP routes.
- Browser (scratch database, real FFmpeg): Room 05 at 1440 px and at an exact 390 x 844 showed no page overflow. Only the existing room rail and the decisions table scroll inside themselves.
- Clicked through in the in-app browser:
  - Apply this fix (r2);
  - accept a graphic (r3);
  - the clip dialog (r4, one change);
  - undo (r5);
  - a graphic saved unchanged ("Nothing changed");
  - Render this edit: 40.00 s for 40.00 s of narration, every QC check passed, the title card was recognised as planned.
- Not verified: no real stock or AI media, no human narration (test tones with pauses), no Hermes call (the brain does not use one). Canvas motion templates (charts, maps, hand-drawn, stick figure) are P06b. Music, SFX and ducking are P08, captions P07. Fonts not installed on the PC fall back to a system font.

### Release 0.11.1 - CB YT AI Mastery bundle and pin-only skills

- Read the owner's CB YT AI Mastery Prompts Bundle in full (475 pages, private, outside the repository) and restated it as `skills/mastery-bundle.json`: 64 skills in our own words covering exact-length outlining and section-by-section expansion, contrast framing, invisible hooks, owner-angle questions, audience reports, niche signals and niche blending, competitor growth forensics and editing-pattern decoding, image and keyword craft, screenplay breakdowns, the zero-decision assembly package, format rotation, an authenticity guardrail, stall response, metadata, music briefs and 16 niche profiles. Notes, coverage changes and every excluded tactic are in `docs/research/mastery-bundle-analysis.md`.
- Excluded on purpose: invented authority, ethnicity- or immigration-based title formulas, religion outrage titles, AI video of real people, realistic fake CCTV, film clips and downloads as visuals, franchise retellings, delete-and-re-upload, and device/IP/account/AdSense-identity tactics for getting around YouTube enforcement. Where a prompt depended on one of these, the skill keeps the technique and states the replacement.
- Added `pinOnly` skills: a pin-only skill is never selected by default even when approved, and reaches a brief only where the owner pins it. All niche profiles and format-specific templates (30 of the 64) are pin-only, so one family's niche rules cannot leak into another's prompts. The flag is optional and absent on older payloads, so existing revision hashes are unchanged. The Skills page shows "pin to a family" on such cards and the owner form has the checkbox, so proposing a change keeps the flag.
- Added five deterministic rules: `wordsForMinutes`, `wordAllocationIssues` (sections to chapter to target, exactly), `paragraphImageCount` (per-style tier tables), `imageIntervalSeconds` and `titleVariationIssues`. They are tested and ready for the outline step and the Editing Room; no room calls them yet.
- The owner's title-card prompt is kept verbatim in the private handoff folder (`source-documents/title-card-prompt.original.txt`); its rules are the existing `motion.title-cards-canvas` skill.
- Fixed a 0.11.0 layout defect found in this check: below 740 px the stacked Skills filters each took 170 px of height because their flex-basis became a height. Copy on the Skills page now names the three source documents.
- Verification on the owner's PC, Node 24.18.1: `npm run check` passed and the full suite passed **154/154** with zero failures, skips or cancellations (16 Skills tests, one new: pin-only isolation across two families; rule tests extended). Headless Edge over the DevTools Protocol at exact 360 x 780, 390 x 844 and 1440 x 1400 on a scratch database: 313 cards, no page overflow, no element past the viewport, filters 59-61 px tall; the pin-only label, the "only where pinned" note and the form checkbox render.
- Not verified: no Hermes or provider call. The real `data/control-room.sqlite` receives the 64 new drafts the next time the program starts (seeding is additive and skips existing IDs).

### Release 0.11.0 - Skills Engine

- Added `skills.js`: a reviewed, revisioned skill library with its own tables, SQLite immutability triggers for revisions, named three-point approval, retirement, owner skills, JSON import/export, per-family pins and blocks, a usage log, a lessons queue and per-family project state.
- Seeded 249 builtin skills as **drafts**: 38 from the Precision AI Operating System (36 sections plus the pipeline and setup notes), 51 from the YT Empire Builders Prompt Library (library rules plus all 44 prompts) and the 160 editing-brain research drafts. Every skill is written in our own words and carries the section it restates. The owner's two source documents stay outside the repository. A coverage test asserts that every skill ID mapped in SKILLS-ENGINE-PLAN section 8 exists, so nothing from the documents was dropped. Seeding is idempotent and never replaces an existing skill.
- Nothing is injected until a human approves that exact revision. Approving a newer revision supersedes the older one, and exactly one revision of a skill serves runtime at a time. A draft revision never changes what the rooms are already using.
- Runtime: selection honours pins, blocks and the owner > learned > builtin order; the compiled brief carries only `when`, `do`, `avoid`, `numbers` and `checks` plus the source-of-truth order and the family's open project state; it is capped at 1800 bytes of the family job token limit and drops whole skills rather than trimming a rule in half. Over-budget jobs are refused with a message naming the cause instead of overspending.
- Wired into the Hermes script-candidate and daily-research prompts, including both deliberate-retry paths. The approved skill set is part of the job deduplication key, so a changed library produces a new job rather than reusing an old result. Every use records the exact revision IDs injected, the byte size and the number dropped.
- Added deterministic rule helpers applied in code rather than by a model: image count per word count, beat math, on-screen text dwell, caption limits, title length, banned phrases, raw-placeholder detection, 25-word sentence cap and loudness targets. Each is unit tested on both the passing and the failing side.
- Added the learning loop. The script quality gate, scene-plan rejections and style-proof "needs changes" verdicts raise lesson candidates from the program's own reviews. A lesson is a proposal: approving one writes a new **draft** revision that still needs its own approval, and rejecting one records the finding under the family's REJECTED project state so it is not proposed again. Duplicate captures for the same source reference are ignored, and a capture failure can never roll back the review that produced it.
- Added the Skills page: library with search and six filters, full skill detail with revisions, the lessons queue, the usage log, per-family project state, the built-in numbers, owner skill form, import and export. One dialog serves every form, and no inline style attribute is used.
- Fixed a pre-existing Windows defect in four HTTP tests that predated this milestone: the temporary directory was removed before the server closed, so `rmSync` failed with EPERM and the later close hook never ran, leaving a listening socket that stopped `node --test` from ever exiting. `npm test` could not complete on the owner's PC. Removal now happens inside the server-close callback, as `control-room.test.js` already did.
- Verification on the owner's PC, Node 24.18.1 and FFmpeg 8.1.2: `npm run check` passed, `npm run tracker` reported 16/34, and the full suite passed **153/153 with zero failures, skips or cancellations** in 33 seconds (138 pre-existing plus 15 new Skills tests). The Windows DPAPI tests ran and passed under the owner's normal account rather than being skipped.
- Browser verification drove headless Edge over the DevTools Protocol at an exact 390 x 844 and at 1440 x 1400. The Skills page and all five of its tabs showed no horizontal page overflow, no element past the viewport, no internal scroller and no vertical clipping; the Production, Content studio, Channel families and Research pages were rechecked at 390 x 844 for regressions and were unchanged. Two layout defects found during that check were fixed: `.row-end` would not shrink, which pushed the page wider than a phone screen, and a card header overflowed its column on desktop.
- Not verified: no live Hermes, provider or paid call was made for this milestone. The injection path is verified against the assembled prompt and the recorded usage rows, not against a paid response. Only `script.candidate` and `research.brief` are injected so far; the other 23 task keys are selectable and tested but are wired as their rooms are built. The "convert a pasted prompt into a skill" helper is not built.

### Current release 0.5.0 - quality gate and daily evidence briefs

- Added explicit family monthly, script-job and research-job token ceilings. Admission reserves a job ceiling inside the same SQLite transaction that claims work, so concurrent claims cannot oversubscribe the family-local month. Budget rejection makes zero completion calls.
- Added separate script usage rows with reserved, settled, released, unknown and budget-violation states. Valid provider totals settle exactly; missing, inconsistent or over-limit usage blocks the result. Provider dollar cost was not reported, so no estimate was fabricated.
- Added deterministic format gates. Long-form requires 600-1,200 words, targets 800-1,000, requires four paragraphs, the exact returned hook in the opening and a complete payoff. Shorts requires 80-180 words and at least two paragraphs. The earlier 267-word live candidate now renders as quality-blocked and cannot be used.
- A fresh live script job `beb226dd-a8be-4bb3-9b0b-3774f673030d` completed on attempt 1. Immutable candidate `c8e4869c-9e5f-4525-bf39-b8bc99616094` passed at 888 words with 1,383 prompt, 1,472 completion and 2,855 total tokens. The saved draft remained unchanged.
- Added family-scoped, revisioned research evidence with title, HTTPS URL, publisher, publication/access/expiry dates, permission, analysis mode, factual notes, rights notes and archive/restore history.
- Added separate date-scoped research jobs and immutable topic briefs. Only same-family, current, unarchived, unexpired, human-permitted evidence marked for brief synthesis reaches Hermes. Duplicate submissions reuse the same evidence-hash job; exact/near-duplicate topics are retained as quality failures.
- Research output is exact, bounded JSON: an honest no-topic decision or up to three source-linked topics with audience need, why-now evidence, original angle, three hooks, outline, claims, confidence, missing evidence, uncertainties and expiry. High confidence requires two distinct selected sources.
- Live research first failed closed on an invalid empty `missingEvidence` item; no brief or content was attached and the unknown 4,000-token reservation was retained. The prompt was tightened and deliberate retry job `7a97055d-43d5-4630-bc60-8f40b9390c7a` completed on attempt 2 with 2,055 tokens. Brief `b6c06956-0b5f-4525-bf39-b8bc99616094` retained complete S1 provenance and did not create or edit content.
- The live 0.5 health endpoint returned `local-planning-research-and-reasoning`. Desktop and exact 390 x 844 CDP screenshots showed a readable evidence selector, token summary, job history and source-linked review-only brief with no draft, approval or publishing action.
- The original v0.5 release gate passed `npm run tracker`, `npm run check`, the complete 85/85 automated suite and `git diff --check`. A clean independent fail-closed review reproduced the cached-browser connector retest, stale locale/format jobs, queue and worker boundaries, cost wording, and locale-aware planning with no release blockers. The reviewer used isolated memory/temporary state and did not access live credentials or the production database.

### 2026-09-19 - Production Panel and style architecture

- Expanded production into one umbrella panel with ten rooms: Script & Brief, Voice, Style Library & Assignment, Scene & Visual, Editing, Captions & Localization, Audio, Review & QC, Packaging, and Render & Recovery. Only the Script & Brief foundation is live; Voice is next and all production-media powers remain off.
- Added five planned, versioned editing profiles: Stickman Sketch Explainer, Hand-drawn Canvas, Motion Graphics, Documentary Montage and Cinematic Hybrid. The default assignment belongs to a channel family and is inherited by locale editions; override or fallback requires a separate explicit decision.
- Statically reviewed and pinned Creatorberry/flick `4442fe355644317aafbe15c55ea3fbcd0217cd8d`, calesthio/OpenMontage `08e2151fa02de28a5d6a312b3d575692bf147ad7`, and alesha-pro/tools hand-drawn Canvas `2083cb61310da66abb891bc495ee14018dd25106`. No upstream package, runtime or generated code was installed or enabled.
- Desktop at 1440 x 1400 and exact mobile CDP at 390 x 844 rendered `#production` successfully. The page heading, architecture link, truthful statuses, ten room cards and five style cards were readable. Document width equaled viewport width at 390 pixels; only the intended horizontal navigation strip scrolls.
- Verification passed: `npm run tracker` reported 8/30, `npm run check` passed, the complete 86/86 automated suite passed, and `git diff --check` passed. The first independent review found broad provider-spending wording, a stale ledger/order and one Flick capability overstatement; all were corrected before release.

### 2026-09-20 - OpenHiggsfield static review

- Statically reviewed and pinned `wide-trace/open-higgsfield` at `b16a0efe4d7e2707b56f8ccb02387fd2a9d2eddf`. No package was installed, no upstream app was run, no credential was entered and no model or upload request was sent.
- Mapped its 38-entry image/video catalog, declarative settings, media-role caps, native/fanned-out batches, asynchronous task lifecycle and gallery reuse flow into future Scene & Visual Room requirements.
- Did not copy or activate the project. No license file exists, GitHub reports no detected license, and no automated test/spec files were present at the reviewed revision.
- Rejected its browser-cookie credential, request/response logging, unauthenticated upload-token and public-blob assumptions. Any future adapter must use encrypted server-side connectors, fixed origins, rights and cost admission, private immutable inputs, bounded polling/reconciliation and checksummed/probed result artifacts.

### 2026-09-20 - Voice Room v0.6 release gate

- Completed the bounded Voice Room: immutable profile and lexicon revisions, approved-script admission, rights and consent records, tested connector provenance, local budget reservation/settlement, explicit unknown-outcome retry confirmation, fixed OpenAI/ElevenLabs speech adapters, canonical WAV artifacts and FFmpeg/ffprobe QC.
- Added human audition comparison, intelligibility approval, revocation and downstream invalidation. Approval, playback and handoff recheck path containment, exact size and SHA-256 so a replaced or missing file cannot remain trusted.
- The independent read-only review reported eight blockers covering multi-chunk assembly, paid-attempt admission, request-start accounting, artifact integrity, FFmpeg preflight, corrupt decode handling, provider-specific preflight and playback-safe polling. All eight were fixed with regressions. A final clean rereview was attempted but the external Codex account hit its usage limit; no clean rereview result is claimed.
- Release verification passed `npm run tracker`, `npm run check`, the complete 100/100 automated suite and `git diff --check`. Desktop `1440 x 1400` and exact mobile `390 x 844` visual reviews had no release-blocking overflow or clipping. No live narration provider request was sent.

### Current release 0.4.0 - Hermes reasoning boundary

- Added a dedicated Hermes connector using only the fixed local API at `127.0.0.1:8642`. Its bearer key uses the existing Windows-DPAPI connector storage and is never returned to the browser.
- Added one bounded, stateless primary-locale script-candidate call through Hermes Chat Completions. Saved family/content/source data is treated as untrusted prompt data. Factual jobs require permitted evidence notes.
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
- A restricted local Hermes reasoning provider is connected for manually authorized text candidates and briefs. Speech, translation and video providers remain unconnected. No content is uploaded to YouTube.
- Draft and research evidence URLs remain manually entered and are not fetched by Hermes. Optional public channel lookup contacts only the fixed Google API endpoint. Permission, accuracy and rights status remain explicit creator attestations.
- The storyboard is a rough six-part scaffold, not finished direction. It may split a sentence and cannot guarantee timing. It must be refined before TTS or rendering.
- Localized scripts, voices, thumbnails and subtitles are not produced yet. User-selected language slots and pending states are real records, not translations.
- Media rendering is not implemented. FFmpeg detection must not be mistaken for a rendering test.
- The database is durable on a local disk, but this milestone has no automated backup/restore facility. Stop the app and preserve the whole data directory before moving machines. Keep it off synchronized/network folders while running.
- No dependency or runtime audit of the full upstream app was performed; only copied modules and their active callers are in the release test scope.
- API quotas, platform permission, channel authorization and source rights must be validated before the corresponding live connector is enabled.

## Decisions still needed for future stages

The exact market profiles, first niche/format, realistic operating budget, additional editing repositories, intended always-on host, Google project/channel access, permitted data sources, each family’s primary and optional additional locales, voice preferences and clone consent if relevant. The local family form captures the decisions that can be made now.

## Change discipline

For each future stage record: requirement, files changed, source modules adopted, test command, result, live services involved, cost (if any), known limitation and next action. Mark tasks done only after the relevant evidence is recorded. Tests use isolated temporary databases and must never delete real user content. A checklist count is not an estimate of engineering work completed.
