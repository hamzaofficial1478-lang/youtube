# OpenMontage's orchestration brain, restated for a local YouTube production app

**Licence note.** OpenMontage is AGPL-3.0. This report covers ideas only. Everything is paraphrased, no code is reused, and the few vocabulary lists are standard industry terms. The companion file `om-meta.json` holds 41 machine-readable skills built from the same reading.

**What was read.** In full: the guide files, all 11 meta skills, every director skill in 5 pipelines, the style YAMLs, loader, schemas and 4 manifests. Skimmed: the other 7 pipelines, the two reviewer scoring modules, 4 artifact schemas, and the long-form/short-form/editing creative skills.

---

## 1. The architecture in one paragraph

OpenMontage contains no Python orchestrator. The agent itself is the orchestrator. Python provides only tools, schema validation and checkpoint files. All judgement lives in data and prose:

- **Pipeline manifests** (YAML) list the stages. Each stage declares its inputs, outputs, tools, review focus items, success criteria and approval flag.
- **Stage "director" skills** (Markdown) teach how to do each stage.
- **Meta skills** handle cross-cutting protocols: the reviewer, checkpoints, taste, reference analysis, skill creation and capability extension.
- **Style playbooks** (YAML) define looks.

Knowledge sits in three layers: (1) a tool registry saying what exists, (2) house skills saying how the house uses the tools, (3) vendor/technology skills saying how each provider works. **Lesson for your app:** keep the brain declarative. Your rooms should read manifests and skills at runtime rather than hard-coding policy. That is also what lets a Skills Engine change behaviour without code changes.

---

## 2. Pipeline map: what each stage decides and hands off

The generic production chain is research, proposal, script, scene plan, assets, edit, compose, publish. Each stage emits **one canonical, schema-validated artifact**, which is the only contract the next stage may read.

| OM stage | Canonical artifact | What it decides | Hands to the next stage | Human gate (explainer) | Your room |
|---|---|---|---|---|---|
| research | research_brief | Landscape gaps, sourced data points, real audience questions, misconceptions, ≥3 grounded angles | Angles and data | No (free, informational) | Niche, Competitors |
| proposal | proposal_packet + decision_log | Concept and hook, taste profile, style playbook, render engine, authoring mode, music plan, voice, itemised cost, delivery promise | Selected concept and production plan with budget cap | **Yes** (last free exit) | Niche / Script (pitch) |
| script | script | Word budget, arc, sections with timing, voice-performance cues, visual "enhancement cues", pronunciations | Timed sections and cues | **Yes** | Script, Voice (plan) |
| scene_plan | scene_plan | 1–3 scenes per section, scene types, durations, five-aspect shot specs, hero flags, required assets, overlays | Asset list per scene | **Yes** | Scene & Visual |
| assets | asset_manifest | Narration audio, images/clips, music; provenance, cost, prompt triplets | Files with ids | **Yes** (per-scene filmstrip, not a draft render) | Voice, Scene & Visual, Audio |
| edit | edit_decisions | Cuts and in/out points, layers, transitions, caption config, music/ducking, timing logic in metadata | Complete timeline | No (documentary montage: **yes**) | Editing, Captions, Audio |
| compose | render_report + final_review | Encode, grade, mix, burn captions, verify the real file | Verified render | No | QC |
| publish | publish_log | Title, description, chapters, tags, thumbnail concept, export bundle | Package | **Yes** | Publish |

**Documentary montage** shortens the chain to idea, shot list ("scene"), assets (retrieval), edit, compose. It gates every stage except compose, including edit. It is *retrieval-first*: the corpus is the raw material and the edit is where the thinking happens.

**Orchestration ("executive producer").** A stateful producer wraps stateless stage workers. It carries cumulative state: budget, measured narration lengths per section, style anchors, revision counts and an issues log. After each stage it chooses PASS, REVISE or SEND_BACK. A send-back reruns an earlier stage and invalidates everything after it. The caps:

- 3 revisions per stage
- 1 send-back per stage pair
- 3 send-backs total
- budget alert at 90% spent
- 30% of budget reserved for assets and render

When a cap is hit, the run continues with warnings rather than blocking. The classic cross-stage catch is the **narration feedback loop**. After TTS, each section's real audio length is compared with the plan:

- **Within +25% of plan:** stretch the scene.
- **More than 25% over:** send only that section back to the script stage with a word cap.

---

## 3. How the reviewer critiques a cut

### 3.1 Critique quality rules (applied to every finding)

| Property | Rule | Consequence if missing |
|---|---|---|
| Accurate | Point at a field, line, timestamp or frame | Do not file it; it's a guess |
| Complete | After one hit, sweep the artifact for the same class of error | "Found one, missed its twin" counts as a failed review |
| Constructive | Every critical carries a concrete fix; every suggestion carries a proposed change | A critical without a fix is downgraded to *investigation* |

### 3.2 Severity levels

| Level | Meaning | Must include | Blocks progress? | Typical triggers |
|---|---|---|---|---|
| **Critical** | Broken, incomplete or dangerously wrong | Proposed fix | Yes, fix and re-review | Invalid schema; unmet success criterion; false claim about, or near-copy of, the reference; spend >30% over estimate; unlogged engine swap; no final review; silent motion-to-still downgrade; slideshow/variation "fail"; two scenes sharing a primary subject; captions duplicating on-screen text (full list in `review.severity-ladder`) |
| **Suggestion** | Meaningful quality gain | Proposed change | No; noted and carried | Style-rule violation; surface-only differentiation; a loved element dropped; slideshow verdict "revise"; scenes missing shot intent; single-option decisions; all confidences 1.0; scope creep in assets |
| **Nitpick** | Polish | Nothing | No | Small wording or timing |
| **Investigation** | Real concern, no clear fix | Description | No; resurfaces next round | Anything un-pinpointable |

**Decision and pass threshold:**

- 0 criticals: **PASS**.
- 1 or more criticals: **REVISE**, then re-review.
- Still critical after the round cap: **PASS WITH WARNINGS**, with unresolved items logged.

The reviewer caps rounds at **2**; the producer allows **3**. Pick one; 2 is safer.

Every room also self-scores its artifact **1–5 on 5–8 room-specific criteria**. Any score below 3 forces a revision before submission. This is the reviewer's first line of defence.

### 3.3 Structural scores (lower is better)

| Score | Scale | Strong | Acceptable | Revise (suggestion) | Fail (critical) | Runs at |
|---|---|---|---|---|---|---|
| Slideshow risk (mean of 6 dimensions) | 0–5 | <2.0 | <3.0 | <4.0 | ≥4.0 (do not render) | Scene plan and edit; edit must not score worse |
| Scene variation (0.6 per violation, capped at 5) | 0–5 | <2.0 | <3.0 | <4.0 | ≥4.0 | Scene plan |

The six slideshow dimensions:

1. **Repetition:** one scene type above 70%, under 60% unique descriptions, or one shot size above 60%.
2. **Decorative visuals:** scenes with no information role, narrative role or shot intent.
3. **Purposeless motion:** moving shots without a stated intent.
4. **Missing shot intent:** scenes that never say why they exist.
5. **Text over-reliance:** text/stat cards above 60% of scenes scores 4.
6. **Unsupported "cinematic" claims:** no hero moment, under 30% of scenes moving, or under 30% with a lighting key.

The variation checker adds checks for shot-size runs, static-shot share, lighting variety, hero placement, texture keywords and generic adjectives. Its word list ("stunning", "modern", "seamless"…) doubles as a **lazy-description detector**. The source names these verdicts inconsistently; standardise on lower-is-better.

### 3.4 Final render review (mandatory, on the real file)

Five checks, plus a transcript comparison:

1. **Probe:** container, duration within ±5%, resolution, and an audio stream. No audio stream means stop.
2. **Frames:** at least 4 (opening, middle, climax, ending) or one per cut midpoint. Look for black frames, broken overlays, unreadable or stretched content, captions over faces, and wrong CTA text.
3. **Audio:** transcribe the render. Zero words means silent; under 80% of script words means cut off; the last spoken word should match the last scripted word.
4. **Promise:** the engine used matches the one locked at proposal, and the motion ratio is recorded.
5. **Subtitles:** coverage and drift.

Output is **pass / revise / fail** plus a routed action: present, re-render, revise edit, revise assets, block, or re-author. Publishing requires a pass.

### 3.5 Boring, lazy, amateur: the recurring tells

Each tell is paired with its fix in the JSON skill `review.boring-lazy-amateur-tells`.

- **Boring (rhythm):** equal holds; one transition everywhere; long runs of the same scene type; mostly text cards; mostly static shots; no hero moment; no quiet-versus-impact dynamics; music added at the end instead of cut to.
- **Lazy (thinking):** adjective-soup prompts; one pasted style prefix; category stock queries; picking the top score; re-titled duplicate concepts; template-first hooks; "read naturally" voice notes.
- **Amateur (craft):** freeze-frame endings; flashy transitions in a documentary register; ungraded mixed footage; upscaled low-res clips; captions that duplicate on-screen text or cover faces; AI images containing exact text; unducked music; mid-word cuts; black gaps; a dissolve on every cut; loudness jumps.

### 3.6 What triggers a redo of a single scene

The system always redoes the **smallest owning unit**, and excludes rejected candidates on the retry:

- **Weak retrieval for one slot** (similarity below 0.22): rewrite the queries and grow the pool, at most two passes. Then drop the slot or ask the user.
- **Adjacent twins** (same subject and scale, or dropped by the diversity pass): re-rank only that slot.
- **One narration section overruns:** see the stretch / send-back thresholds in §2.
- **One image misses:** a specific prompt refinement, at most 2 retries, never an identical retry.
- **Hero frame fails:** regenerate via pre-caption, critique, post-caption.
- **Clip too short for its hold:** slow it to 0.5–0.75× (near-static footage only), borrow time from the next slot, or use the #2 candidate.
- **Weak final image:** swap in a stronger one.
- **Caption over a face:** re-render with fixed placement.
- **Hero-spine scenes:** re-plan only those scenes.

**Whole-stage reruns are reserved for:** schema failure, a slideshow or variation "fail", a structural duration miss, or the wrong concept.

**Defect routing:**

| Defect | Goes back to |
|---|---|
| Audio | Render |
| Visual quality | Assets or scene plan |
| Duration | Script |
| Sync | Edit |
| Sharpness | Render or assets |
| Motion/timing | Edit or scene plan |
| Factual error | Script, then cascade forward |

---

## 4. Taste direction: how "taste" becomes rules

Taste is a compact **taste profile** that travels from proposal to review:

- **Design read:** a specific sentence tying the feel to audience, promise, platform and subject. "Modern and clean" is rejected.
- **Three integer dials, 1–10:**
  - *visual variance*, from a tight repeated grammar to every beat in its own mode;
  - *motion intensity*, from calm holds to fast kinetic language;
  - *information density*, from one idea per frame to dense dashboards.
- **Palette discipline, layout variation, reference strategy:** one reference frame per scene family, never one mood board for everything.
- **Anti-patterns and quality gates.**

**Dial interactions:**

- High motion with low density gives short kinetic beats.
- Low motion with high density gives steady layouts, charts that build up, and holds long enough to read.
- High variance needs anchors such as recurring type, palette or a sound motif.

**Hard rules:** same transition everywhere is forbidden when variance ≥4; dense callouts are forbidden when density ≤4.

**The "swap-the-title" test.** If the video could belong to any topic after changing the title, the taste is too generic.

For flagship work, a second layer applies: *borrow technical know-how, never borrow a previous look*.

- Write an art direction (palette, type personality, motion character, layout system, **one signature device**) before building.
- Plan every scene as its own composition. The signature device appears in only 1–2 beats.
- Use 2–4 motion ideas per beat and three or more distinct easing curves per video.
- Finish with an originality check: could another channel have published this? Have we used this look before?

---

## 5. Style playbook schema and defaults

**Fields:**

- `identity`: name, category, mood, pace enum, best_for.
- `visual_language`: palette (primary[], accent[], background, text, muted), composition, texture.
- `typography`: heading/body/code/stat font specs, a modular `scale_system`, and a `weight_matrix`.
- `motion`: allowed transitions, easing/spring feel, `pacing_rules` (min/max scene hold, text-card hold, stat-card hold, transition duration), entrance and exit.
- `audio`: voice style, music mood, music volume 0–1, SFX style, ducking threshold, and hero/transition voice shifts.
- `asset_generation`: prompt prefix, negative prompt, diagram style, consistency anchors, multi-still crossfade options.
- `overlays`: per-overlay colours and radius.
- `quality_rules`: enforced as law.
- `chart_palette`, `color_rules` (harmony, contrast check, colour-blind check), `taste_profile`.
- `overrides`: up to **20%** of scenes may deviate (hard max 50%), each with a logged reason.

**Preset defaults (seconds):**

| Preset | Pace | Transitions | Min hold | Max hold | Text card | Stat card | Transition | Music vol | Duck dB | Signature rules |
|---|---|---|---|---|---|---|---|---|---|---|
| clean-professional | moderate | fade, dissolve, slide | 2.5 | 12 | 3.5 | 3.0 | 0.4 | 0.08 | −3 | ≤3 colours on screen; ≥2 s between transitions |
| flat-motion-graphics | fast | wipe, zoom-in, morph, cut | 1.5 | 8 | 2.5 | 2.0 | 0.3 | 0.12 | −4 | new element every 2–3 s; SFX on major transitions; overshoot springs |
| minimalist-diagram | deliberate | fade, dissolve | 3.0 | 15 | 4.0 | 3.5 | 0.5 | 0.05 | −2 | 7:1 contrast; ≤2 colours; progressive reveal; ≥30% empty frame |
| premium-minimalist | deliberate | fade, dissolve, slide | 2.75 | 12 | 3.75 | 3.25 | 0.45 | 0.07 | −4 | taste dials 4/3/5; one focal object per frame |
| anime/storybook | slow | crossfade, drift, dissolve | 3.5 | 7 | 4.0 | 3.5 | 1.0 | 0.15 | −3 | 2–3 stills crossfaded per scene; vignette; no text in images |

**Automatic validation** (`playbook_loader.py`, understood only):

- WCAG contrast: body text ≥4.5, muted/large text ≥3.0, overlay alpha composited first.
- Colour-blind confusion pairs for saturated colours with similar lightness.
- Harmony offsets: complementary, analogous, triadic, split-complementary.
- Modular type scale from a 24 px video base, with captions not below 16 px.
- Weight hierarchy: headings at least 200 heavier than body is the recommendation; stat-card multiplier ≥2.

---

## 6. Reference analysis: turning a video into DNA without copying it

**Routing first.** "Make something like this" goes to reference analysis; "cut this footage" goes to source review.

**Analysis passes:**

1. Transcript (existing captions or local transcription).
2. Scene detection, falling back to uniform sampling.
3. Up to ~20 keyframes.
4. **Measured motion classification per scene:** real clip, animated still, or static image. Never guessed, because it decides the tool path.
5. A **vision pass** on keyframes. What stays constant across frames *is* the style. Ask: snap vs ease, cut vs fade, bounce vs slide, quick vs measured.

**The resulting brief (your "DNA card"):**

- **Pacing:** average, shortest and longest scene length; cuts per minute; pacing class; energy per scene.
- **Per-scene shot language:** type, size, movement, lighting, depth of field, colours, on-screen text.
- **Style:** palette and mood, typography, transition types, music style, narration speakers/delivery/wpm, subtitle style, production tier, closest house style plus delta.
- **Content:** summary, topics, claims to verify, audience, tone, hook technique, CTA.
- **Replication guidance:** 3–5 elements that make it work, custom-work items, complexity, whether motion is required, and **3–5 differentiation seeds**.

**Every shot is broken down in five aspects:** subject, subject motion, scene (overlays as their own layer), spatial framing, and camera. Absent aspects are marked N/A explicitly. The same five-aspect form is reused for scene plans and generation prompts, so analysis output flows straight into production.

**Anti-copy rules:**

- Each concept keeps ≥1 trait, changes ≥1 trait, and justifies the change.
- Differentiation patterns: same structure with a new subject, same subject with a new angle, same tone with a new treatment, a new platform/length, or a counter-take.
- The reviewer treats false claims about the reference, and carbon copies, as critical.
- Research reframes to "what did the reference miss, and what has changed since?"
- A **10–15 s sample** (hook plus one middle scene) is approved before full production.

---

## 7. Checkpoint and human-approval protocol

- Each stage writes **in_progress** on entry. Long stages refresh partial progress per completed scene, which gives live progress and exact resume.
- Gated stages write **awaiting_human**, present the artifact, review findings and cost (spent and projected), then **end the turn**. "Present and continue" is a violation.
- The writer refuses to mark a gated stage completed without `human_approved=true`.
- **Approval is per gate.** A blanket "do it all" counts only if logged as an approval-policy decision at the moment it is given.
- **Revisions archive** the superseded checkpoint to `history/`; nothing is destroyed.
- **The asset gate** is reviewed as a per-scene filmstrip (thumbnails, stills, waveforms), never a draft render. Rendering belongs to the next stage.
- **The decision log is append-only, keyed by category plus subject.** Changes append a new entry, and every entry lists the rejected alternatives with a calibrated confidence.
- Major changes need approval first: provider/model swap, motion-to-still, engine swap, dropping music or narration, sample-to-batch. Blockers are reported in five parts: tried, failed, failure class, options, recommendation.

---

## 8. The learning loop (skill creation and capability extension)

### 8.1 What OpenMontage actually has

OpenMontage's learning is **agent-authored and human-promoted**. It consists of:

1. **Skill-creator protocol**
   - *Trigger:* a reusable gap, never a one-off.
   - *Steps:* identify the gap (what, why it recurs, where it lives); research web best practice, similar skills and tool docs; choose a type (stage skill, meta skill, tool skill, style file).
   - *Template:* when-to-use, prerequisites, numbered process, **1–5 self-evaluation rubric**, submit, pitfalls.
   - *Writing principles:* teach judgement not steps, show good versus bad examples, name exact resources, be opinionated, match length to task.
   - *Finish:* register in the index, then validate that references resolve and the rubric and pitfalls exist.
2. **Capability-extension ladder.** Classify the gap first:
   - one-off transform: a project-scoped idempotent script;
   - recurring visual need: a custom style file or component;
   - missing provider: a minimal wrapper tool (user approval before the first paid call);
   - missing knowledge: web research, then a **project-scoped technique skill** recording provider/version, prompting patterns, best parameters, failure modes and source URLs.

   Every extension is logged with the closest existing option and why it lost, and the user is told. Originals are wrapped, never modified.
3. **"When you don't know how" clauses** in the asset and proposal directors: search, check existing skills, write a project-scoped skill with sources, and log "learned technique: <name>".
4. **Promotion is only a suggestion.** Project skills are "suggested for promotion" to the shared library. The guide also says that a debugging finding should become a skill update so the next agent need not repeat the investigation.
5. **Raw learning signals already captured:**
   - review records with per-finding disposition;
   - append-only decision logs, where user overrides show up as revised entries;
   - rejected-pick logs with scores and reasons;
   - pre/critique/post prompt triplets per asset;
   - archived checkpoint history;
   - final-review issues;
   - "worked precedents" studied for *process, not look*;
   - a distinctness check against previous videos.

**What is missing:**

- automatic mining of these signals into lessons;
- promotion thresholds;
- trial/evaluation of a new skill;
- version numbers or changelogs for skills;
- retirement.

Promotion depends on a human merging files. A Hermes-style engine must add those parts.

### 8.2 Proposed Skills Engine loop

The thresholds below are proposed defaults; they do not come from OpenMontage.

1. **Capture** after every video:
   - findings (severity, category, room, disposition);
   - revisions and send-backs;
   - user overrides (decision-log revisions on the same key);
   - rejected picks and failed samples;
   - prompt triplets;
   - final-review issues;
   - gate feedback text;
   - later YouTube analytics (CTR, average view duration, retention dips mapped to scene ids via timestamps).
2. **Distil** by clustering on category, room and root cause into a *lesson card*: trigger, failure, fix that worked, evidence ids, measured impact.
3. **Gate.** Promote a lesson card to a candidate skill only when:
   - the same class recurs in **≥3 videos**; or
   - the user overrides the same default **≥2 times**; or
   - a fix verified by a passing re-review generalises beyond one video.

   Everything else stays as a project note.
4. **Draft** with the skill-creator template and the `om-meta.json` shape. Status is `candidate`, scoped to its rooms.
5. **Validate statically:** references resolve, numbers sit inside schema ranges, rubric and pitfalls are present, and there is no silent conflict with an active skill. The candidate must declare what it supersedes.
6. **Shadow trial** on the next 2–5 videos. Run the room and the reviewer with and without the candidate. Compare criticals, slideshow and variation scores, revision rounds, first-try approvals, user overrides and, later, retention.
7. **Promote** to `active` after **2 consecutive non-regressing wins**. Bump the version, write a changelog, log a capability-extension decision and add it to the index.
8. **Version semantically:**
   - patch: wording or in-range numbers;
   - minor: a new step or check;
   - major: a changed default or a contradicted rule.

   Keep every version for rollback.
9. **Retire** (deprecate, never delete) when a skill has not fired in ~20 videos, the user has contradicted it ≥3 times, or a trial regresses. Record the reason and the successor.
10. **Close the loop into enforcement.** Each active skill contributes its `checks` to the room's review focus and its `numbers` to validators, so a lesson becomes a gate, not just documentation.

**Guardrails carried over from OpenMontage:** never learn from unreviewed output alone; tie every lesson to concrete artifact evidence (the accuracy rule); prefer updating an existing skill over creating a near-duplicate; keep all extensions project-scoped until promoted.

---

## 9. Documentary-montage and explainer editing rules (summary)

Full numbers are in the `doc.*`, `script.*`, `scene.*` and `editing.*` skills in the JSON.

**Documentary montage.**

- *Brief:* one thematic question, one register and one shape (single-image expansion, before/after, three-act 30/40/30, catalogue). Cut caps: 30–45 s gets 8–12 cuts, 60–90 s gets 15–25, 2–3 min gets 30–50.
- *Hold table (base/min/max, s):* elegiac 4.0/2.5/7.0; reverent 3.5/2.0/6.0; dreamlike 3.0/1.5/5.5; wry 2.0/1.0/4.0; urgent 1.2/0.5/2.5. Heroes (≥2) hold longest; total within ±10%. The source's worked examples don't match this table, so compute from the formula.
- *Retrieval:* each slot describes one concrete photograph using nouns and adjectives; 2–3 queries of ≤5 words; a candidate pool 8–12× the slot count; rank on the description; similarity ≥0.30 usable, 0.22–0.30 needs judgement, below 0.22 grow the pool (max 2 passes); diversify neighbours; log rejections.
- *Edit:* arrange by beat, not score. Trim to the best moment, end before the action finishes, keep 4–6-frame handles, never freeze. Heroes land on downbeats. Use one ~2 s silence in pieces ≥60 s, music at 0.7 with a 4 s tail fade, at most 4 transition types, 0.5–1.5 s L-cuts on the hardest joins, and a written reason for every cut. End tag: 3–9 words for 5–8 s, overlaid on footage.
- *Render:* one canvas, letterbox rather than upscale, one LUT across the timeline, 24 fps, CRF 18, then verify the file.

**Explainer.**

- *Script:* ~150 wpm; revise outside 0.7–1.15× of the target length; narration fills 85–90% of runtime; arc runs hook → setup → "therefore/but" build → climax → landing; a visual cue every 8–10 s.
- *Scene plan:* 1–3 scenes per section drawn from the technique library; no run of four same-type scenes; at least 3 types; no gaps over 1 s; exact text is rendered natively.
- *Edit:* re-time to measured narration; one primary layer at a time; mandatory captions (≤8 words per line, lower 20% in vertical, never on faces or duplicating on-screen text); ducked music (e.g. 0.08 volume, −8 dB, 200/500 ms); holds clamped to the style; validate for gaps, overlaps, missing files and narration overruns before render.

---

## 10. Recommendations for the local app

**Skills Engine**

1. Adopt the `om-meta.json` shape as the canonical skill record. Add `version`, `status` (candidate/active/deprecated), `evidence[]`, `trial_results[]`, `supersedes`, `last_fired_at` and `fire_count`.
2. Make **`numbers` and `checks` executable**. Room validators read thresholds from active skills (hold ranges, word budgets, similarity floors, caption limits) instead of constants in code. That is what makes learning change behaviour.
3. Implement the **append-only decision log** and **per-finding dispositions** from day one; they are the training data for §8.2. Key decisions by (category, subject) so user overrides are detectable.
4. Ship the **reviewer as a skill consumer**: room review focus = manifest focus + every active skill's `checks` scoped to that room. Enforce the accuracy, completeness and fix-required rules in the finding schema (critical with no `proposed_fix` is auto-downgraded).
5. Store **reference DNA cards** from the Competitors room in a library. The Niche room can aggregate pacing classes, cuts per minute and hook techniques across a niche, and Script/Editing can pull target ranges from the closest DNA.

**Editing Room**

1. Make **beat math first-class**: a register/tone selector drives slot count, hold table and transition whitelist, with a live ±10% duration meter.
2. Run the **slideshow-risk and variation scores live** as the timeline changes. Block render at ≥4.0 and show the dimension reasons as fix cards.
3. Provide an **adjacency inspector**: same subject plus scale, palette runs over 4, same motion direction, captions colliding with on-screen text or faces.
4. Use **retrieval-first b-roll slots** for the faceless format: description, 2–3 queries, candidate pool, ranked picks, exclude list, rejected-pick log. One-click "use #2" redoes a single slot.
5. Add a **music grid**: beat detection, hero-on-downbeat snapping, one silence window, a loudest-section offset for the track, ducking presets per style.
6. Add a **retention overlay** for long-form: hook-complete marker at 0:30, first-payoff marker before 2:00, minor/major interrupt cadence (20–30 s / 60–90 s), re-hook markers, and a −14 LUFS meter.
7. Make **post-render QA mandatory**: probe, ≥4 sampled frames, audio transcript against script (≥80% words), promise check. Route failures automatically to the owning room using §3.6.

**Inconsistencies in the source to avoid copying:** review round caps (2 vs 3); the variation-score direction; documentary worked examples that do not match the hold table; explainer wall-time (20 in the manifest vs 15 in the skill).
