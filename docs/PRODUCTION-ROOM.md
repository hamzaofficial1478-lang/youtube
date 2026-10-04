# Production Panel architecture

Reviewed 2026-09-19; updated 2026-10-04 for the live Voice Room (0.6) and Style Library & Assignment Room (0.7). This expands the production section before any visual provider is enabled.

## Goal

Turn one approved, sourced primary-locale script into one reviewable master video through explicit rooms. The Production Panel is the umbrella for scripting, voice, style selection, scene building, editing, audio, review, rendering and packaging. Each room owns a versioned artifact, approval gate, cost evidence and recovery path.

The Control Room remains the durable source of truth. No room may publish, approve its own output, select credentials, hide provider spending or rewrite another room's artifact in place. Existing Research and Content Studio screens remain focused workspaces, but their accepted outputs are Production Panel inputs.

## First dependable production loop

```text
saved evidence and approved primary-locale script
  -> voice direction and audition
  -> locked primary narration
  -> assigned, versioned channel-family style profile
  -> editable scene manifest
  -> rights-cleared visual assets
  -> revisioned edit timeline
  -> captions, music and mix
  -> proxy render
  -> frame + transcript + media QC
  -> final render
  -> human master approval
```

Localization, Shorts repurposing, unattended operation and publishing follow only after this primary-language loop passes with a real video.

## Assignment model

- The operator assigns one reviewed default editing style to a channel family.
- Every configured locale edition inherits that style so a visual master can be reused.
- A per-channel override may be added later only when it deliberately creates a separate visual production, cost plan and approval trail.
- A style profile is immutable after use. Changes create a new profile revision and stale only dependent planning artifacts.
- A failed renderer cannot silently switch styles. The operator must approve a fallback profile.
- Style assignment never grants a renderer, provider, asset library or publishing permission.

## Five launch style profiles

These are distinct production contracts, not decorative prompt labels.

| Style | Best fit | Core production rules | Reference direction |
|---|---|---|---|
| **Stickman Sketch Explainer** | Clear educational, business and conceptual explainers | Sparse figures, purposeful diagrams, restrained transitions, readable labels and narration-led pacing | Existing Stickman Video Director storyboard contract |
| **Hand-drawn Canvas** | Storytelling, essays and artistic education | Original whole-pose drawings, deliberate holds, pencil/ink/riso or mixed-media finish, 24 fps default, contact-sheet review and deterministic frame export | `alesha-pro/tools` hand-drawn Canvas skill |
| **Motion Graphics** | Fast short-form hooks, workflows and product concepts | Approved scene plan, stable scene IDs, text-safe animation, isolated scene renders, Remotion composition and isolated scene-level repair | Creatorberry/flick |
| **Documentary Montage** | History, culture, factual essays and sourced reporting | Evidence-led archive/stock selection, provenance per shot, restrained motion, readable maps/labels and narration-led chronology | OpenMontage documentary pipeline patterns |
| **Cinematic Hybrid** | Premium narrative essays, trailers and dramatic explainers | Shot grammar, continuity, generated or filmed visuals behind rights/cost gates, deliberate sound design and a strict proxy-review loop | OpenMontage cinematic patterns; optional future Omni-Video lab |

Every profile now defines frame rate, resolution per format, shot cadence, transition vocabulary, camera motion, typography, palette, caption treatment, visual-source and AI-disclosure policy, music/mix policy, renderer adapter, QC thresholds and an originality guard (reference share at most 30%). No profile is executable yet; renderers arrive from P05.

## Room map

### 1. Script & Brief Room, foundation live

Owns saved evidence, review-only topic briefs, immutable script candidates and exact approved primary-script revisions. It is currently exposed through Research Briefs and Content Studio.

Mandatory gates:

- Research evidence remains inert, sourced and operator-selected.
- A brief cannot create or approve a script.
- The approved primary-locale script is the exact production input.
- Script changes stale narration, style-dependent scenes and downstream approval.

### 2. Voice Room, live (0.6)

Owns voice profiles, pronunciation dictionaries, delivery cues, auditions and primary-narration revisions.

Mandatory gates:

- Match the family primary locale and exact approved script revision.
- Record provider, model, voice ID, consent or provider-license basis, generated time, external task ID and cost evidence.
- Store pace, energy, pauses, emphasis and pronunciation separately from the script.
- Validate actual decodable audio, not an extension or provider-success claim.
- Keep auditions immutable; paid retries require fresh confirmation.

### 3. Style Library & Assignment Room, live (0.7)

Owns editing-style profiles, revisions, compatibility rules and channel-family assignments. See [STYLE-ROOM.md](STYLE-ROOM.md) for the implemented contract, specification fields, API and verification record.

Mandatory gates:

- Start with the five named launch profiles above; new styles require their own fixtures and QC contract.
- Assign styles explicitly, inherit across locale editions and record who changed the assignment.
- Lock the exact profile revision into every scene manifest and timeline.
- Block unsupported format/aspect/renderer combinations.
- Never silently fall back to another style or mutate previously approved videos.

### 4. Scene & Visual Room

Owns the scene manifest and visual assets.

Mandatory gates:

- Each scene retains narration range, purpose, duration, style-profile revision, direction, asset origin, rights state, source evidence, provider/model/task identity and revision history.
- Uploaded media requires an explicit rights statement. Generated media records synthetic-media status and disclosure implications.
- One scene can be repaired without regenerating unrelated voice or visuals.
- Remote providers are optional adapters with explicit capability, resolution, duration, budget and cancellation contracts.
- Every model adapter exposes a versioned capability snapshot rather than a hardcoded universal form: supported surface, setting allowlist/defaults, media-input roles and limits, output contract, commercial-use/disclosure constraints and current connector revision.
- Generation jobs retain the exact prompt revision, capability snapshot, input asset IDs, provider request/task IDs, admitted cost, lifecycle events, returned URLs, downloaded immutable artifacts, checksums, probes and terminal outcome. Browser cookies, public uploads and gallery state are never the source of truth.

### 5. Editing Room

Owns a deterministic timeline rather than a flattened mystery file.

Mandatory gates:

- Revisioned video, audio, text and overlay tracks use stable scene, track, clip, asset and transition IDs plus one canonical frame/timebase contract.
- Cuts, trims, ripple edits, gaps, linked A/V, merges, track order, sync locks and multicam choices are explicit timeline operations, never hidden renderer behavior.
- Crop, transform, layout, speed changes and ramps, opacity, blend mode, fades, transitions, keyframes, typography, caption treatment, effects and color grades are versioned data.
- Audio alignment, timecode/audio-correlation sync, dialogue edits, silence policy, beat markers, gain, denoise and room-tone decisions retain measurable evidence and stay compatible with the Audio Room boundary.
- Color work records scopes, clipping, reference frame, primary corrections, wheels, curves, qualified hue changes and LUT provenance instead of storing only a flattened look.
- Writes use optimistic concurrency, preconditioned stable IDs, atomic batches, post-edit receipts, shared undo, immutable history and safe single-scene repair.
- Low-resolution local proxies, waveforms, thumbnails and frame/contact-sheet inspection close the blind-edit loop before any final render.
- Interchange is explicit and versioned: Control Room JSON remains authoritative; EDL/XML/FCPXML, CapCut draft and lossless-conform exports are derived artifacts with compatibility reports.
- FFmpeg is the dependable Windows render and probe boundary. LosslessCut, Palmier Pro and CapCut are optional references or adapters, never the sole source of truth.

### 6. Captions & Localization Room

Owns timed transcript, captions, visible text and later language editions.

Mandatory gates:

- Align captions to the selected narration and scene timeline.
- Support locale-aware segmentation, including scripts without whitespace.
- Preserve editable SRT or WebVTT and rendered-caption settings.
- Check reading speed, line length, timing gaps, overlaps, safe areas and clipping.
- Localization begins only after the primary master is locked.

### 7. Audio Room

Owns music, sound effects and final mix.

Mandatory gates:

- Record origin, license, attribution, permitted platforms and expiry for every asset.
- Measure loudness, peaks, clipping, silence and channel layout.
- Store ducking, fades and mix parameters as timeline data.
- Never substitute an unlicensed track after failure.

### 8. Review & QC Room

Owns evidence that a reviewer can inspect the finished audiovisual work.

Mandatory gates:

- Decode the complete media file.
- Generate timestamped contact sheets with dense sampling around the hook.
- Align frames, transcript, captions, cuts and on-screen text.
- Check black/frozen frames, missing audio, A/V drift, caption coverage, unsafe areas, abrupt cuts, stale assets and unexpected duration.
- AI observations are review notes, never rights, factual or publish approval.

### 9. Packaging Room

Owns thumbnails, titles, descriptions, disclosures and reviewable variants.

Mandatory gates:

- Variants remain separate from the approved master and live metadata.
- Text and images retain source, synthetic-media and rights evidence.
- No live title or thumbnail swap occurs without a separate operator decision.

### 10. Render & Recovery Room

Owns proxy/final jobs, checkpoints and reproducibility.

Mandatory gates:

- Pin renderer version and capture input manifest, command plan, output checksum, media probe and bounded log summary.
- Resume only verified stages; changed artifacts invalidate downstream checkpoints.
- Unknown external outcomes require reconciliation before retry.
- Final approval becomes stale when any production input changes.

## New repository assessment

### wide-trace/open-higgsfield

- Source: https://github.com/wide-trace/open-higgsfield
- Pinned revision: `b16a0efe4d7e2707b56f8ccb02387fd2a9d2eddf`
- License: unresolved. There is no license file and GitHub reports no detected license, so no source is copied even though the README says open source.
- Decision: Scene & Visual Room capability-schema, generation-lifecycle and gallery-workflow reference only. No Next.js app, dependency, credential, Vercel Blob path or provider call is integrated.
- Keep as independently implemented requirements: one versioned catalog for image and video adapters; per-model allowlisted settings/defaults; start/end/reference/video/audio role limits; validated request-plane mapping; explicit native versus fanned-out batch semantics; bounded asynchronous task polling; immutable run history; favorite/select/reuse/download review tools; and restoration of the exact prompt/settings/input set into a new unsubmitted draft.
- Reviewed scope: 38 catalog entries at this revision and controls for aspect ratio, resolution, duration, output format, generated/original audio, batch size, prompt enhancement, CFG, multi-shot and character orientation. Catalog presence is not live-provider verification or authorization.
- Reject from the Control Room boundary: credentials persisted in browser cookies, request/response logging, arbitrary provider result URLs as durable artifacts, unauthenticated upload-token issuance, publicly readable Vercel Blob inputs, missing upload-size ceilings, automatic retries, silent model fallback and browser-only history as provenance.
- Required adapter gates: fixed provider origin and connector revision, encrypted server-side secret, rights/disclosure review, local or private immutable inputs, role/count/type/size/decode validation, budget admission, idempotency, unknown-outcome reconciliation, cancellability evidence, downloaded result hashes/probes and human selection. The upstream repository has no automated test/spec files, so its behavior is not accepted without our own fixtures.

### Creatorberry/flick

- Source: https://github.com/Creatorberry/flick
- Pinned revision: `4442fe355644317aafbe15c55ea3fbcd0217cd8d`
- License: MIT.
- Decision: motion-graphics workflow reference; no runtime integration yet.
- Keep: approve `flick-plan.md` before build, stable scene specifications, one renderable scene folder per approved scene, isolated scene repair, poster/frame evidence and Remotion composition.
- Reject from the bounded runtime: arbitrary URL downloading, transcript extraction, package installation and open-ended generated code execution. These stay outside Hermes.
- Before reuse: preserve the MIT notice, pin Remotion/Chromium dependencies, audit bundled sound provenance and run generated scene code in a network-blocked sandbox with path and resource limits.

### calesthio/OpenMontage

- Source: https://github.com/calesthio/OpenMontage
- Pinned revision: `08e2151fa02de28a5d6a312b3d575692bf147ad7`
- License: AGPL-3.0.
- Decision: architecture and style-taxonomy reference only. No source is copied into this application and the upstream agent/tool suite is not launched.
- Keep as independently reimplemented ideas: manifest-defined pipelines, human approval checkpoints, immutable stage artifacts, event ledgers, single-scene repair and documentary/cinematic pipeline separation.
- Reject: its broad agent/tool surface, downloader/provider shortcuts, credential access and publishing paths inside the Control Room process.
- Licensing: AGPL obligations require deliberate legal/architecture review before any code reuse or service deployment. Reading the design does not make its code permissively reusable.

### alesha-pro/tools hand-drawn-canvas-animation

- Source: https://github.com/alesha-pro/tools/tree/main/skills/hand-drawn-canvas-animation
- Pinned revision: `2083cb61310da66abb891bc495ee14018dd25106`
- License: repository MIT.
- Decision: candidate future Hand-drawn renderer adapter after sandbox and provenance tests.
- Keep: Canvas 2D timelines, whole-pose drawing rules, finite exposures, palette/finish profiles, deterministic headless-Chrome frame export, FFmpeg encode, contact sheets and explicit visual QC.
- Guardrails: authored HTML/JavaScript is executable code. Run it in a network-blocked worker with fixed input/output roots, CPU/memory/time quotas and no secret-bearing environment. Validate every output before adoption.
- Asset safety: keep asset-level source/license/attribution records. Example photos, fonts, motion references and music are not automatically cleared merely because the repository code is MIT.
- Originality: use general media techniques, not imitation of a living artist's signature style or direct copying of example scenes.

### mifi/lossless-cut

- Source: https://github.com/mifi/lossless-cut
- Pinned revision: `20f2e34687a691dd15b18c030d108b3b66d44098`
- License: GPL-2.0-only.
- Decision: lossless-conform and technical media-workflow reference only; no source or Electron runtime is integrated.
- Keep as requirements: frame/keyframe-aware segments, lossless cut and reorder where codecs permit, deterministic remux/concatenate/track operations, chapter and EDL interchange, waveform/thumbnails, media/stream inspection, black/silence/scene detection, undo/redo and explicit FFmpeg command evidence.
- Do not overclaim: lossless operations do not replace grading, compositing, effects or final encoding. Smart cut and the local HTTP API are experimental.
- Guardrails: any later adapter is fixed-root, allowlisted and version-pinned; it produces a reviewed command plan and derived artifact. The upstream unauthenticated local API is never exposed to Hermes, and GPL obligations require deliberate review before code reuse or distribution.

### palmier-io/palmier-pro

- Source: https://github.com/palmier-io/palmier-pro
- Pinned revision: `b4b1333f9404a2ca8a9509443955cd1c501de480`
- License: GPLv3 historical source through v0.7.6; later binary releases are proprietary.
- Platform: macOS 26 on Apple Silicon, so it is not a direct runtime candidate for this Windows-local application.
- Decision: advanced nonlinear-editing architecture reference only; no source, binary or MCP service is integrated.
- Keep as independently implemented requirements: stable IDs and project-frame coordinates; atomic batch edits and mutation receipts; linked A/V and sync-lock rules; split/ripple/insert/move/remove/swap; trims/speed/fades/transforms/crops/blends; settings copy and clip-relative keyframes; multi-clip layouts; timecode/audio sync and multicam; timeline transcripts, word/silence cuts and beat detection; text/captions; primary, wheel, curve, hue and LUT grading; scopes/reference comparison; effects and denoise; export queues and XML/FCPXML interchange.
- Reject from the Control Room boundary: broad external-agent mutation, arbitrary project/file access, silent account-dependent cloud fallback and paid generation inside editing. Hermes cannot connect to Palmier's MCP server.
- Licensing boundary: the current proprietary binary cannot be copied, modified, redistributed, reverse engineered or treated as proof that historical GPL source includes every current feature.

## Previous production references retained

| Source | Pinned revision | Decision | Production use |
|---|---:|---|---|
| [Give Claude Eyes gist](https://gist.github.com/conradcaffier03/ef914685fc9d7da91b6591947fa1ddb2) | `c246d670dfd22e9e6b8fe19f556bac428fd52483` | Pattern only | Local contact-sheet and transcript alignment in Review & QC. No code copied because no explicit license was found. |
| [SAIS-FUXI/Omni-Video](https://github.com/SAIS-FUXI/Omni-Video) | `adcee0a4a5b439ad3615f825298221b21177d4e3` | Optional future visual lab | Potential bounded text/video generation and editing. Repository/model licensing must be resolved and the A14B path needs roughly 80 GB VRAM. |
| [renezander030/capcut-cli](https://github.com/renezander030/capcut-cli) | `49f70e3b07f1a236d45acb9b49a70c141dd1ee98` | Candidate optional adapter | Pinned local CapCut/JianYing draft adapter only after schema fixtures, backup, dry-run, editor-open and concurrency gates pass. |
| [CapCut Pro Professional, rejected](https://github.com/ElevationEDM/CapCut-Pro-Professional) | `40cfc5c267dc30ce36fbe81b88611e1357e7b85e` | Rejected | Untrusted unrelated Windows ZIP and apparent subscription circumvention. Never download, install, distribute or integrate. |
| [darkzOGx/youtube-automation-agent](https://github.com/darkzOGx/youtube-automation-agent) | `260d7a94ab2d5bb2a98ce6620bfda7efd56ebd6b` | Mine patterns selectively | Rebuild selected scene repair, recovery, provenance, retention and readiness ideas behind Control Room gates. Never run its scheduler as the authority. |

## Integration order

1. Voice Room data model, auditions, consent, direction and real-audio QC. Done (0.6).
2. Style Library schema, five immutable profiles and channel-family assignment rules. Done (0.7).
3. Scene manifest with narration/style dependencies, rights provenance and a versioned capability registry for image/video adapters; OpenHiggsfield informs the schema and review flow, not the runtime.
4. FFmpeg readiness and deterministic proxy renderer.
5. One sandboxed style proof before broader adapters. Decision 2026-10-04: Documentary Montage through the FFmpeg montage adapter, because visuals come from stock libraries and AI generation.
6. Editing timeline and single-scene repair.
7. Caption alignment, then Audio Room mix/QC.
8. Full Review & QC evidence and Packaging Room variants.
9. Optional derived editing adapters only after compatibility and licensing fixtures pass: lossless conform first, then CapCut draft interchange; Palmier remains architecture-only on this Windows runtime.
10. Final render, recovery and human master approval.
11. Only then begin configured-language editions and publishing work.

## Explicit exclusions

- No cracked, repackaged or unofficial Pro binaries.
- No subscription, watermark or licensing bypass.
- No unrestricted shell, filesystem, browser, downloader or publishing capability for Hermes.
- No arbitrary generated HTML/JavaScript execution in the Control Room process.
- No code copying with absent, ambiguous or incompatible licensing.
- No external model call without explicit cost admission and immutable task evidence.
- No silent style fallback, provider fallback, rights substitution or publishing.
