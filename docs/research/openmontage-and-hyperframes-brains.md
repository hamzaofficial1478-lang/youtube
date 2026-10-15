# OpenMontage and HyperFrames: how their brains work, and what the program now runs (0.25)

Owner request (2026-10-09): analyse OpenMontage and HyperFrames in depth as the strongest editing brains, take how they *work* (not only their tips), run them through Claude inside the program, and re-check youtube-agent-skill.

| Repository | Revision read | License | What we did |
|---|---|---|---|
| calesthio/OpenMontage | `9327439db69021ab4b0e2776729bf3b58fdb5a87` (2026-10-03) | AGPL-3.0 | Read only. Its method is restated in our own words and code; no file copied. |
| heygen-com/hyperframes | `5ec2dd2e121f25b45f3cc642504757970ed41027` (2026-10-09) | Apache-2.0 | 22 animation blueprints and 48 motion rules vendored unchanged in `vendor/hyperframes/` (with LICENSE and NOTICE); the frame-worker contract and the composition format rebuilt in `atelier.js`, `atelier-runtime.js` and `motion.js`. |
| Jakeschincariol/youtube-agent-skill | `a2feb2104981a375ffd4f87ee04f4f5344ac43c6` (2026-09-16) | MIT | Re-checked: no newer commit upstream. Already integrated in 0.14 (`craft.js` ports the hook scorer, title linter, chapters, Shorts and retention tools; 14 draft skills; the hook formulas vendored). Nothing new to take. |

## 1. OpenMontage: the director's brain

What it is: an agent-run studio. A video goes through a **pipeline** (`pipeline_defs/*.yaml`: animated-explainer, documentary-montage, cinematic, character-animation, hybrid and others). Each stage has a **director skill** (`skills/pipelines/<pipeline>/*-director.md`) that decides, a **reviewer** (`skills/meta/reviewer.md`) that checks the stage's output against named criteria, and a **checkpoint** (`skills/meta/checkpoint-protocol.md`) where a human approves before the next stage spends money.

The parts that make it strong, and where each one now lives in our program:

| OpenMontage idea | Source | In the program |
|---|---|---|
| Taste direction before any shot: a one-sentence design read of the topic plus three dials (variance, motion, density, 1-10) | `skills/meta/taste-direction.md` | Claude's plan answer carries `direction` {read, signature, motion, dials, palette, fonts, avoid}; `At.validateDirection` keeps it inside the style's limits. Later plan parts design inside the same direction. |
| A signature device, used sparingly, so the video is recognisable | `taste-direction.md` | `direction.signature`; the plan prompt limits it to at most two beats. |
| Atelier / bespoke composition: when no template fits, design the shot from scratch | `skills/meta/bespoke-composition.md`, `animation-runtime-selector.md` | The new **atelier engine**: any shot can carry a `frame` and Claude designs it as an animated page. |
| Every scene settles five aspects: subject, motion, place, framing, camera; scene distinctness (neighbours never share a subject or a framing) | `skills/pipelines/explainer/*`, `reviewer.md` | `SCENE_CRAFT` in the scene-plan prompt (all engines, not only atelier). |
| Reviewer with named criteria, then repair only what failed | `reviewer.md` | The continuity review (0.21) plus, for atelier frames, the program's own checks (contract, banned code, text off the frame) and one repair attempt with the findings. |
| Human checkpoints before spending | `checkpoint-protocol.md` | Unchanged: plan approval, visual approval, the edit verdict. Composing frames starts only from the owner's plan click and reserves tokens first. |

Not taken: its tool/provider/downloader surface, Remotion code execution, its agents and any file (AGPL).

## 2. HyperFrames: the motion designer's brain

What it is: video as HTML. Each scene is a **composition** (a `<template>` with a root `data-composition-id`, clips with `data-start`/`data-duration`, and one paused GSAP timeline registered at `window.__timelines[id]`). A renderer seeks the timeline frame by frame in a headless browser and captures each frame, so motion is exact and repeatable.

The strong part is not the renderer but the **method** around it:

1. **Story design** (`skills/faceless-explainer/references/story-design.md`): pick a structure, a hook strategy, persuasion moves and beats before drawing anything.
2. **Visual design** (`references/visual-design.md`, `cut-catalog.md`): time-coded shot sequences, a blueprint per shot, a layout vocabulary (the hero fills 40-60 % of the frame, at least three framings and three depth layers across the video, a caption keep-out band at the bottom).
3. **Frame workers** (`faceless-explainer/sub-agents/frame-worker.md`): one worker per shot receives a small packet (its words, timing, blueprint, the cited motion rules, the art direction) and returns one composition. Small packets keep each call cheap and focused.
4. **Motion doctrine** (`hyperframes-animation`, `rules/*.md`, `blueprints/*.md`): smooth eases (power3) over bouncy ones, reveals paced on the voice (never front-load the whole shot), no idle "breathing" motion, no slow back-half pan, velocity-matched seams between shots.

In the program:

| HyperFrames idea | In the program |
|---|---|
| Blueprints and motion rules as a catalog | `vendor/hyperframes/` (unchanged). The plan prompt lists only blueprint ids with one line each and rule ids; a frame packet carries the full text of only the blueprint and the up to four rules that shot cites (`At.composeMessages`). |
| Frame worker, one call per shot | `scene-room.composeFrames`: one Claude call per atelier shot with its own token reservation (`kind atelier_frame`), its words with their times, its neighbours, the art direction. |
| Composition contract | `At.validateComposition` (one template, one registered paused timeline, no randomness, clock, timers, network, outside media, storage, eval, infinite repeats or `play()`), then a real browser load and audit; one retry with the findings. |
| Deterministic frame capture | `motion.js` `renderComposition`: fresh page per composition, CSP, GSAP 3.15 and plugins inlined from `node_modules`, `atelier-runtime.js` seeks clips and timeline, lossless PNG frames. Same input, same frames (tested). |
| Reveals on the voice | `At.warp`: the composition is designed on the plan's estimated word times; at render the timeline is warped so each designed moment lands when the narrator actually says that word. |
| Caption keep-out band | The runtime audit flags text in the bottom 17 % or off the frame; the packet tells Claude where the band is. |

Not taken: the HyperFrames CLI, studio, registry and Remotion bridge; its network fetching; its Web Audio graph.

## 3. Token discipline

- The plan prompt carries ids, not recipes (catalog lines ≤ 95 characters each; the whole atelier guide is about 6.6k characters).
- A frame packet carries only that shot's blueprint and rules (tested to stay under 16k characters).
- Each frame call has its own reservation inside the family budget and the room's `composeTokenLimit`; a failed attempt is retried once with the findings, never in a loop; answers are kept, so drawing and rendering never call Claude again.
- Owners can turn frame composing off (`composeFrames: false`); atelier shots then fall back to a free drawing from their words.

## 4. What remains

- Live test with real Claude of a full atelier video (plan, compose, draw, render) — see BUILD-PROGRESS.md for the result of the 0.25 run.
- People stay in the drawn engines; atelier designs graphics, type, diagrams and metaphors.

## 5. Third read of HyperFrames (0.28, `db845d9`)

Taken into the edit, restated in our own code (DRAWN-SCENES.md section 15):

- Transitions: the video's energy picks one primary transition for related scenes and an accent for a change of topic or the climax; the outro is the slowest. FFmpeg's xfade draws all of them.
- Captions: words light up on the voice; the payoff word gets an entrance in the accent.
- Audio: the voice-over carve - the music gives up only the speech band under the voice and keeps its bass and its top.

Left: caption theme presets, registry blocks, LUT grading, shader transitions.
