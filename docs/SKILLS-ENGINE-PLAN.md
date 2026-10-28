# Skills Engine — design plan and source coverage map

Status: **built** in 0.11.0 (2026-10-05). This file remains the build brief and the source coverage map; `docs/SKILLS-ENGINE.md` records what was actually built, including the two places the implementation deliberately differs from this plan (reviews are stored on the revision row as the Style Library already does, and default task bindings are derived from the approved revision rather than stored as rows). Step 7 below, the P06 Editing Room, is the next milestone.

## 1. What the owner asked for (2026-10-05)

- A **Skills section** in the program holding every skill extracted from the two "main brain" documents (Precision AI Operating System; YT Empire Builders Prompt Library) — nothing skipped or abandoned.
- The owner can **add his own skills**.
- The program **learns from its own work**, like the Hermes agent learns from its work and prepares for the next job: lessons from reviews, rejections and results upgrade the skills.
- Skills are **used in real time** by every room wherever they apply (niche finding, competitor decoding, hooks, scripts, visuals, editing, thumbnails, SEO …).
- The **editing brain** extracted from the editing repositories (docs/research/editing-brain) and the owner's **motion-designer title-card prompt** become Editing Room skills, so the Editing Room thinks like a professional editor and motion designer: which cut creates a hook, which clip is more creative, what makes a video boring or lazy, where each cut/effect belongs, with motion graphics and 2D animation when the script needs them.

## 2. Skill schema

Same shape as the research JSON files, plus engine fields:

```json
{
  "id": "hooks.universal-3-hook",          // stable, namespaced: <area>.<kebab-name>
  "title": "Universal 3-hook generator",
  "rooms": ["script", "hooks"],             // where it applies (see task keys below)
  "tasks": ["script.candidate", "script.hooks"],
  "kind": "principle|procedure|checklist|ruleset|formula|template|algorithm",
  "when": "One sentence: when this skill applies",
  "summary": "1-2 sentences",
  "inputs": {"title": "...", "script": "..."},
  "steps": ["ordered steps"],
  "do": ["concrete rules"],
  "avoid": ["anti-patterns"],
  "numbers": {"hook_length": "20 s / 3-4 sentences", "reading_level": "grade 8"},
  "checks": ["verifiable QA checks"],
  "tags": ["hook", "retention"],
  "source": "YT Empire Builders 3.1 (owner course material, restated)",
  "origin": "builtin|owner|learned",
  "status": "draft|approved|retired",
  "priority": 0                              // owner > learned > builtin when rules conflict
}
```

Write every builtin skill in our own words. The course documents are private purchased material and the repositories are AGPL/GPL for several sources, so no long verbatim passages.

## 3. Data model (SQLite, follows existing room patterns)

| Table | Purpose |
|---|---|
| `skills` | id, origin, status, current_revision, created/updated |
| `skill_revisions` | immutable (SQLite trigger, like style revisions): full skill JSON, sha256, author, reason, created_at |
| `skill_reviews` | named human approval/retire/revoke with confirmations; only approved revisions are used at runtime |
| `skill_bindings` | task key → skill id (+ order, required/optional); owner can pin or block a skill per family |
| `skill_usage` | every use: job/room/task, skill revision, injected tokens, outcome reference |
| `skill_lessons` | learning candidates (see §5): source event, evidence refs, proposed change (new do/avoid/number/check or a new skill draft), status proposed/approved/rejected, reviewer |
| `family_project_state` | per family: LOCKED / ACTIVE / OPEN / REJECTED items (Precision OS §32), fed to prompts |

Task keys (where skills are applied in real time): `niche.discover`, `niche.evaluate`, `competitors.scan`, `competitors.blueprint`, `research.brief`, `ideas.titles`, `script.candidate`, `script.hooks`, `script.review`, `voice.direction`, `scene.plan`, `visuals.prompt`, `visuals.stock-query`, `editing.plan`, `editing.review`, `motion.template`, `captions.segment`, `audio.mix`, `qc.review`, `packaging.title`, `packaging.thumbnail`, `packaging.seo`, `branding.identity`, `localization.check`, `analytics.review`.

## 4. Real-time use

1. **Selection.** For a task: approved skills bound to the task key, then tag/room matches; family pins and blocks applied; owner and learned skills outrank builtin when they conflict.
2. **Hermes injection.** Compile a compact *skill brief* (title, when, do, avoid, numbers, checks) into the system prompt within a token budget reserved from the family budget, like current Hermes calls. Record every injected revision in `skill_usage`.
3. **Deterministic rules in code.** Numeric rules are applied by the rooms, not left to the model: image count from word count, beat density (seconds per visual), text dwell `max(1.2, 0.35 + words/3.2)` s, caption limits (42 chars/line, ≤ 20 chars/s, ≤ 7 s), title length 50–70 chars, banned phrases ("stay tuned", "in this video", "delve", "dive"), raw `[PLACEHOLDER]` detection, loudness −14 LUFS / −1.5 dBTP.
4. **Source-of-truth hierarchy** (Precision OS §4) in prompt assembly: latest owner instruction → owner corrections → approved decisions → uploaded source material → project context → research → general knowledge → assumptions.
5. **Post-generation QA.** Run the skill's `checks` plus the Output QA checklist and anti-generic test; failures are shown to the reviewer, never silently "fixed".

## 5. Learning loop (Hermes-style: learn from own work, prepare for the next job)

Combines Precision OS §10 (corrections are training signals), §32–33 (project state, version control) and OpenMontage's lesson → skill loop (docs/research/editing-brain/om-meta.md §8).

1. **Capture events** the program already produces: script review notes and rejections, scene-plan edits and rejections, visual swaps, style-proof "needs changes" verdicts, accepted QC findings, editing reviewer findings (future P06/P09), owner edits to generated text, and later owner analytics (A01).
2. **Distil a lesson candidate** (rule-based first; an optional bounded Hermes call, budgeted, never automatic retries): *what was wrong → why → the reusable rule*, with evidence references and the skill it would change.
3. **Human review.** Lessons are proposals. A named owner review approves (creates a new skill revision or a new `learned` skill draft) or rejects (recorded under REJECTED so it is not proposed again).
4. **Use next time.** Approved lessons are in the next skill brief for that family/task.
5. **Measure.** Track whether outcomes improve after a revision (fewer rejections, QC findings, later retention/CTR when analytics exist). Skills with no benefit or repeated conflicts are flagged for retirement — the owner decides.

No lesson changes an approved skill without a human decision; no learning signal is invented.

## 6. Owner-added skills

- Form in the Skills page (all schema fields; rooms and task bindings as chips), saved as a draft revision, then approved like other revisions.
- Import/export a skill pack as JSON (validated against the schema; duplicates by id become new revisions, never silent overwrites).
- Paste a long prompt → "Convert to skill" (optional bounded Hermes call that drafts fields from the prompt; owner reviews before saving).

## 7. Skills page (UI)

Library with search and filters (room, task, origin, status, tag); skill detail with revisions and diff; usage history; lessons queue (approve/reject with reason); family pins/blocks; import/export. Follow the existing CSP rules (no inline styles; CSSOM via data attributes).

## 8. Source coverage map — nothing skipped

Every source section maps to at least one skill ID. During the build, a test must load the seeded pack and assert that every ID below exists.

### 8.1 Precision AI Operating System (36 sections + setup note)

| § | Section | Skill ID(s) |
|---|---|---|
| — | Pipeline CONTEXT → UNDERSTANDING → RESEARCH → REASONING → EXECUTION → VERIFICATION → DELIVERY; purpose | `os.execution-partner` |
| 1 | Core operating principle (workspace, not chats) | `os.context-first` |
| 2 | Build project memory (identity, projects, content system, preferences) | `os.project-memory` |
| 3 | Context retrieval protocol (latest approved > correction > latest revision > older draft) | `os.context-retrieval` |
| 4 | Source-of-truth hierarchy (8 levels) | `os.source-hierarchy` |
| 5 | Do not fake certainty (known / inferred / unknown) | `os.known-inferred-unknown` |
| 6 | Real goal: immediate task, underlying goal, next production step | `os.downstream-thinking` |
| 7 | Input-first execution | `os.input-first` |
| 8 | File-first rule | `os.file-first` |
| 9 | Reference-based creative work (decode reference DNA) | `os.reference-dna` |
| 10 | Iteration memory (corrections are constraints) | `learning.corrections-as-constraints` |
| 11 | Minimum necessary questions | `os.minimum-questions` |
| 12 | Research mode | `research.evidence-protocol` |
| 13 | Precision before speed (5 passes) | `os.five-pass` |
| 14 | Output QA check | `qc.output-qa` |
| 15 | YouTube strategy mode (MARKET → … → REPEATABILITY) | `strategy.youtube-chain` |
| 16 | Competitor analysis (9 DNA layers; copyable principles vs assets) | `competitors.nine-dna` |
| 17 | Niche bending (transfer psychology, not wording) | `niche.niche-bending` |
| 18 | Scripting standard (spoken, earn the next section) | `script.spoken-standard` |
| 19 | Visual generation mode (every visual serves narration) | `scene.visual-serves-narration` |
| 20 | Character lock system | `scene.character-bible` |
| 21 | Voice-over → editing map (TIME → NARRATION → VISUAL → ASSET → MOTION → TRANSITION → SFX → NOTE; beat math) | `editing.voiceover-edit-map` |
| 22 | Thumbnail system (title asks, thumbnail intensifies, video answers) | `packaging.thumbnail-system` |
| 23 | Business strategy mode | `strategy.business-chain` |
| 24 | Workflow architecture (repeat → system) | `os.systemize-repeats` |
| 25 | Master prompt generation (13 parts) | `os.master-prompt-anatomy` |
| 26 | Checkpoint system | `os.checkpoints` |
| 27 | Error recovery (what failed, why it matters, what remains, next action) | `os.error-recovery` |
| 28 | Communication style (match language, Roman Urdu OK) | `os.communication` |
| 29 | Don't over-explain simple tasks | `os.depth-matching` |
| 30 | Agentic behaviour | `os.use-tools` |
| 31 | Completion standard (usable output) | `qc.completion-standard` |
| 32 | Project state LOCKED / ACTIVE / OPEN / REJECTED | `learning.project-state` |
| 33 | Version control (FINAL wins) | `learning.version-preference` |
| 34 | Session bootstrap fields | `os.project-bootstrap` |
| 35 | Anti-generic rule | `qc.anti-generic` |
| 36 | Final operating command | `os.operating-command` |
| — | Community setup (keep context, references and assets together) | `os.project-workspace` |

### 8.2 YT Empire Builders Reusable Prompt Library (44 prompts + library rules)

| # | Prompt | Skill ID | Program room |
|---|---|---|---|
| — | How to use: 8-part prompt card, chaining, placeholder rule, model choice | `library.prompt-card-anatomy`, `library.chaining`, `qc.no-raw-placeholders`, `library.model-routing` | all |
| — | Pipeline map NICHE ▸ IDEAS ▸ SCRIPT ▸ VISUALS ▸ THUMBNAIL ▸ EDIT ▸ SEO ▸ BRAND ▸ SCALE; "test with data, scale winners" | `library.pipeline-map`, `learning.scale-winners` | all |
| 1.1 | Trend Hunter (Tier-1, surging not evergreen) | `niche.trend-hunter` | Niche Factory |
| 1.2 | Trend → Niche Converter (sub-niches, faceless verdict, 10 ideas test) | `niche.trend-to-niche` | Niche Factory |
| 1.3 | Niche Comparison Engine (14 points) | `niche.compare-14-point` | Niche Factory |
| 1.4 | Niche Selection Checklist (5 pillars + mock-create test) | `niche.selection-checklist` | Niche Factory |
| 1.5 | Channel DNA Extractor (8 layers + template summary + improvement) | `competitors.channel-dna-extractor` | Competitors |
| 1.6 | Channel DNA + Competitor Ecosystem Map (6 steps, content goldmine) | `competitors.ecosystem-map` | Competitors / Niche |
| 2.1 | Master Video Ideas Generator | `ideas.master-ideas` | Script / Packaging |
| 2.2 | Deep Research → 30 Topics + 15 Packaged Titles (promise → fulfilment → thumbnail) | `ideas.promise-fulfilment-thumbnail` | Research / Packaging |
| 2.3 | Deep Research Report (9 sections) | `research.deep-report` | Research briefs |
| 2.4 | Trend Report → Clustered Titles (50–70 chars, 2–3 series clusters) | `ideas.clustered-titles` | Packaging |
| 2.5 | Revive Channel — Similar-Winner Generator | `ideas.similar-winner` | Learning / Analytics |
| 2.6 | Channel Stats Strategist | `analytics.stats-strategist` | Analytics (A01) |
| 3.1 | Universal Hook Generator (5 criteria, grade 8, 20 s, banned phrases) | `hooks.universal-3-hook` | Script |
| 3.2 | 9-Layer Retention Hook Framework | `hooks.nine-layer-retention` | Script / Editing |
| 3.3 | Documentary-Style Script Builder | `script.documentary-builder` | Script |
| 3.4 | Speaker-Style Script (context lean-in → scroll-stop → contrarian snapback) | `script.three-step-hook` | Script |
| 3.5 | Advanced Outline Builder (open loops) | `script.open-loop-outline` | Script |
| 3.6 | News / Article → Script (Art of Scripting) | `script.news-to-script` | Script |
| 3.7 | Originalize / Rewrite Script | `script.originalize` | Script (with copy guard) |
| 3.8 | $15K Unified Script System (5 gated phases) | `script.unified-five-phase` | Script |
| 3.9 | Evidence-first documentary system (9 phases, receipts, banned phrases, ≤ 25-word sentences) | `script.evidence-first-documentary` | Script / Research |
| 3.10 | Viral Hooks Extractor | `hooks.viral-hooks-extractor` | Competitors / Script review |
| 3.11 | Title + Script Psychology Analyzer (promise kept) | `qc.title-script-promise` | Script review / Packaging |
| 3.12 | Script-to-Voiceover Recommender | `voice.voice-recommender` | Voice Room |
| 3.13 | 3-Hour Long-Script Method (controlled passes) | `script.long-form-passes` | Script |
| 4.1 | Word-Count Image Prompt Generator (1 per 10–15 words, style prefix, no text) | `visuals.word-count-prompts` | Scene & Visual |
| 4.2 | Themed Image Generator (themes, editor notes, distribution, camera/lighting table) | `visuals.themed-editor-mapped` | Scene & Visual / Editing |
| 4.3 | Story-Trigger Image Generator (confirm before generating) | `visuals.confirm-before-generate` | Scene & Visual |
| 4.4 | Art-as-Story Decoder (5–7 directions from one artwork) | `visuals.art-as-story` | Niche / Ideas |
| 5.1 | Thumbnail Psychology Analyzer | `packaging.thumbnail-pick` | Packaging |
| 5.2 | 3-Layer Thumbnail Design Engine (matched light, chroma green, 3 words not in title) | `packaging.thumbnail-three-layer` | Packaging |
| 5.3 | Thumbnail Concept Director (5 concepts → sketches → pick → 3 renders, strict character count) | `packaging.thumbnail-concept-director` | Packaging |
| 6.1 | Cinematic Editing Director (line-by-line table, visual types, verified stock only, effects/motion/transition vocabulary, chunked) | `editing.line-by-line-blueprint` | Editing |
| 6.2 | 60% AVD Visual-Alignment Engine | `editing.avd-visual-alignment` | Editing |
| 7.1 | SEO Title/Description/Tags (keyword at start/middle/end) | `seo.keyword-position-titles` | Packaging |
| 7.2 | Script-Aware SEO System (long/short tail, ≤ 300-char tags) | `seo.script-aware` | Packaging |
| 7.3 | 15-Video SEO Roadmap (search → engagement → recommendation) | `seo.fifteen-video-roadmap` | Packaging / Planning |
| 8.1 | Branding & Visual Identity Engine | `branding.visual-identity` | Family setup |
| 9.1 | Mono-Lingual Creator Finder | `localization.creator-finder` | Localization (research only) |
| 9.2 | Creator Outreach Email | `localization.creator-outreach` | Draft only — sending needs the owner |
| 9.3 | Translation Accuracy Checker | `localization.translation-check` | Localization (L01) |
| 10.1 | Faceless Automation OS (10 phases, visual PATH A–D, authenticity first) | `os.faceless-automation-os`, `visuals.path-selector` | All rooms |
| 10.2 | Credible Source Scraper | `research.credible-sources` | Research |
| 10.3 | Trend → Faceless-Video Mapper (24 h) | `niche.trend-24h-faceless` | Niche Factory |

### 8.3 Editing brain (docs/research/editing-brain)

160 skill drafts with their own IDs: `editing.*` (49, om-creative), meta/pipeline/review/taste/style/reference/learning (41, om-meta), `motion.*` (35), `timeline.*` (35). Import them all; dedupe overlaps by merging into the stronger skill and keeping both sources.

### 8.4 Owner's motion-designer prompt

`motion.title-cards-canvas` (in motion.json): deterministic `renderFrame(t)` Canvas2D title cards — LINES (4–6 statements of 1–6 words), palette #0b0b0f / #f4f2ec / accent #c8ff3d, Space Grotesk 700 (OFL), 1920×1080 @ 30 fps; fade in rising 40 px over 0.5 s, hold `max(1.2, 0.35 + words/3.2)` s, fade out 0.25 s; exactly one accent word per card; 144 px margin; no randomness or clocks; `DURATION`/`FPS`/`READY`; stills first, then frames, then `ffmpeg … -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart`. Research notes: the formula alone gives 7.8–17.85 s, so a fit rule stretches holds to reach 15 s and warns past ×1.6; the accent vs ink contrast is only 1.05:1, so the accent must not be the only signal; on Windows the app can drive Edge/Chrome through the DevTools Protocol with Node's built-in WebSocket (no puppeteer).

## 9. Conflicts and policy notes for the build

- The library has both "clickbait" prompts (7.1, 2.4) and an authenticity-first, non-clickbait OS (10.1). Store both; the family's approved packaging policy chooses. Default to the authenticity-first rule because generic, inauthentic AI content is a monetisation risk.
- "Rewrite a competitor transcript" (3.6, 3.7) must run through the existing 30/70 rule and copy guards; it may never reproduce wording.
- "Verified stock links only" (6.1) is already enforced: stock comes only from Pexels/Pixabay API results with provider-host downloads.
- Outreach (9.2), uploads and any paid generation stay owner actions.
- Prompts that name outside tools (Grok, CapCut, Photopea) map to Hermes, NexLev, our timeline and our renderers.

## 10. Build order and acceptance

1. `skills.js` + store tables/triggers + seed pack loader (builtin drafts from §8; coverage test asserts every ID).
2. Review/approval flow, owner skill form, import/export.
3. Runtime: selection, compact brief, token reservation, usage log; wire into Hermes calls in research, script, niche, competitors, scene planning.
4. Deterministic rule helpers used by rooms (§4.3) with unit tests.
5. Learning loop: event capture from existing review paths → lesson candidates → review → new revision; tests for no silent changes.
6. Skills page UI, desktop + 390×844 checks.
7. Then P06 Editing Room on top of the editing/motion/timeline skills (timeline schema in editing-brain/timeline.md §2; reviewer rubric in om-meta.md §3; motion templates in motion.md §4).

Acceptance: every source ID present; nothing used at runtime unless approved; every use logged; lessons never change a skill without a named review; token use reserved and settled; full suite passes.
