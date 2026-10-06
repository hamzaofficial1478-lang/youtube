# Research behind the Skills Engine and the Editing Room

Collected on 2026-10-05 for the next two milestones: the **Skills Engine** (owner request of 2026-10-05) and **P06 Editing Room**. Everything here is written in our own words. Nothing is executable; it is input for building and seeding skills.

## editing-brain/

Deep reads of the editing repositories the owner added, done at the pinned revisions recorded in ../REPOSITORIES.md. Each topic has a narrative report (`.md`) and a JSON list of skill drafts (`.json`) in the Skills Engine schema described in ../SKILLS-ENGINE-PLAN.md.

| File | What it covers | Skill drafts | Source and license |
|---|---|---|---|
| om-creative.md / .json | How a professional editor decides: cut priority, shot length by style, hook construction, retention defence, pattern interrupts, J/L cuts, transition grammar, B-roll literal vs metaphor, stock query craft, seam hiding, colour, on-screen text, captions, music ducking, loudness, SFX, post-render QC | 49 | OpenMontage `skills/creative`, `skills/core` (AGPL-3.0, ideas restated, no text or code copied) |
| om-meta.md / .json | Orchestration: stage pipeline, reviewer rubric and severity ladder, boring/lazy/amateur tells, scene-level redo routing, taste dials, style playbook schema, reference-video DNA, checkpoint protocol, and the **lesson → skill learning loop** | 41 | OpenMontage `skills/meta`, `skills/pipelines`, `styles`, `schemas` (AGPL-3.0, ideas restated) |
| motion.md / .json | Motion graphics and 2D animation: graphics vs footage, graphic type selector, easing, reading time, type hierarchy, safe areas, accent discipline, 12 templates (title card, lower third, quote, stat, chart, comparison, list, timeline, map route, keyword highlight, diagram, hand-drawn reveal), deterministic render contract, Chrome DevTools frame harness without npm packages, FFmpeg-native text path, render QA. Includes `motion.title-cards-canvas`, the owner's title-card prompt turned into a skill | 35 | flick (MIT), alesha-pro hand-drawn-canvas-animation (MIT), OpenMontage remotion/hyperframes/ink-theater (AGPL-3.0, ideas restated), owner-supplied title-card prompt |
| timeline.md / .json | Timeline data model (frames vs source time), track taxonomy, operation contract with receipts, AI-editor tool surface, dead-air removal, word-boundary cuts, retakes, script↔ASR alignment, scene/black/freeze detection, beats, caption segmentation and QC, punch-ins, ducking, loudness, FFmpeg render graph (recipes tested on ffmpeg 6.1.1), lint rules, interchange and CapCut draft cautions | 35 | palmier-pro (GPLv3 historical source, ideas restated), capcut-cli (MIT), lossless-cut (GPL-2.0, ideas restated); open-higgsfield and Omni-Video brief notes |

Total: 160 skill drafts. They are **drafts**: the Skills Engine must import them as `builtin` skills in draft state for review, not as approved rules.

## hyperframes-and-youtube-agent-skill.md (2026-10-06)

The deep read of heygen-com/hyperframes and Jakeschincariol/youtube-agent-skill: what was read, what became code (`craft.js`, the captions in `captions.js`, the smooth easing in the canvas templates), what became skills (`skills/hyperframes.json`, `skills/youtube-agent.json`), and what was left out and why.

## The owner's two "main brain" documents

The owner attached two documents on 2026-10-05 and asked that every skill in them be extracted into the Skills Engine without skipping anything:

- *Precision AI Operating System — Community Edition* (36 sections): how the model should think — context first, source-of-truth hierarchy, known/inferred/unknown, downstream thinking, five-pass precision, output QA, YouTube strategy chain, competitor DNA, niche bending, scripting standard, visual and character lock, voice-over → editing map, thumbnail system, project state (LOCKED/ACTIVE/OPEN/REJECTED), version control, anti-generic rule.
- *YT Empire Builders — Reusable Prompt Library* (60 pages, 44 prompts in 10 parts): niche research and competitor decoding, ideas/titles/packaging, 13 scripting engines (hooks, retention, documentary, long-form), image-prompt engines, thumbnail engines, editing and visual mapping, SEO, branding, translation, and the 10-phase forensic automation OS.

The originals are private course material and are kept outside the repository (see ../HANDOFF.md for where). ../SKILLS-ENGINE-PLAN.md maps every section and every prompt to a skill ID so the extraction can be checked for completeness.
