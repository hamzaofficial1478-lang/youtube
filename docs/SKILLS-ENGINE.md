# Skills Engine (v0.41.0)

The Skills Engine is the program's reusable operating knowledge: what to do, what to avoid, and the
exact numbers each room applies. It was built from `docs/SKILLS-ENGINE-PLAN.md`; this file records
what actually exists, what it may and may not do, and where it is wired in.

Open it in the app at **Skills** in the left navigation.

## 1. The boundary, in one paragraph

Every skill is a **draft** until a named human approves that exact revision (since 0.73 the built-in skills come
approved with the program by the owner's decision of 2026-10-30, section 8; own and learned skills still wait for a
named approval). A draft is visible,
searchable and reviewable, but it never reaches a prompt and never changes how a room behaves.
Approving a revision is the only thing that puts a skill into use. Revisions are immutable and are
never deleted, so what was in force on any given day stays reconstructible.

## 2. What is in the library

420 builtin skills, all written in our own words:

| Pack | Skills | Source |
|---|---|---|
| `skills/precision-os.json` | 38 | Precision AI Operating System, 36 sections plus the pipeline and setup notes |
| `skills/prompt-library.json` | 51 | YT Empire Builders Reusable Prompt Library, library rules plus 44 prompts |
| `skills/mastery-bundle.json` | 64 | CB YT AI Mastery Prompts Bundle (475 pages, read in full; notes in `docs/research/mastery-bundle-analysis.md`) |
| `skills/youtube-agent.json` | 14 | youtube-agent-skill (MIT): hook scoring and formulas, the first 15 seconds, writing voice, title/thumbnail pairing, chapters, Shorts, retention, outliers, comments, weekly plan, audit (0.14) |
| `skills/claude-video.json` | 5 | claude-video (MIT): watch before a verdict, frame budgets, narration cue frames, clean stock-clip windows, no silent engine switch (0.14.1) |
| `skills/motion-craft.json` | 14 | motionmaxxing (Apache-2.0): measured motion curves, oversize arrivals, word cadence, no dead frame, counters, one accent, carried cuts, script cues, metaphors, importance and energy, the machine-look check, transitions, type (0.39) |
| `skills/film-craft.json` | 14 | lemo-opuscar (MIT): subject, goal and turn, three structures, shot reasons, sound layers and silence, pacing for the viewer, colour by role, the style-brief anatomy, evidence grammar, signature moves, failures, not the reference, two registers, medium transitions, chart honesty (0.39) |
| `skills/channel-grammar.json` | 23 | the 2026-10-18 study of twelve channels: 11 general skills (hooks, one visual system, receipts, maps, networks, cut rate, narration modes, length, three structures) and 12 channel-like profiles that are pin-only (0.39) |
| `skills/studio-craft.json` | 20 | the 2026-10-19 study of eight repositories (p5.brush, video-use, Remotion and its skills, watch-video, caption-ai, claude-code-video-toolkit, skill-creator): word colour by role, see-then-hear, one new idea, dim and reveal, perceptual zoom, easing, stepped cadence, motion blur, cut overlays, self-check cuts, grade by looking, caption chunking, effects on the frame, pace band, coarse-to-fine watching, evidence labels, testing a skill, writing with why, natural media, fonts that exist |
| `skills/hyperframes.json` | 17 | HyperFrames (Apache-2.0): value-first story spine, explainer structures, hook strategies, clarity techniques, beat arc, spoken numbers, motion doctrine, seams, caption rail and grouping, keep-out band, voiceover carve, mix by symptom (0.14) |
| `docs/research/editing-brain/om-creative.json` | 49 | How a professional editor decides |
| `docs/research/editing-brain/om-meta.json` | 41 | Orchestration, reviewer rubric, the lesson loop |
| `docs/research/editing-brain/motion.json` | 35 | Motion graphics, 2D animation, the owner's title-card prompt |
| `docs/research/editing-brain/timeline.json` | 35 | Timeline model, cuts, captions, FFmpeg render graph |

The owner's source documents are private course material and stay **outside** this folder and
outside GitHub. No long passage from any of them is reproduced; each skill carries a `source` note saying
which section it restates. `tests/skills.test.js` asserts that every skill ID the build brief maps
in its section 8 exists in the seeded library, so nothing from the documents was dropped.

Seeding is idempotent and additive. An ID that already exists is left alone, so editing a pack file
can never silently replace a skill you approved.

## 3. Skill shape

```
id          hooks.universal-3-hook      stable, namespaced area.kebab-name
title       Three-hook generator ...
rooms       [hooks]                     where it belongs
tasks       [script.hooks, ...]         where it is applied; defaults from the rooms
kind        principle | procedure | checklist | ruleset | formula | template | algorithm
when        one sentence: when it applies
summary     one or two sentences
steps/do/avoid/checks   the operating content
numbers     reference values; strings, numbers, booleans, ranges or small tables
tags, source, priority
pinOnly     optional; true = applies only where the owner pins it (channel and niche profiles)
```

`numbers` keeps its JSON shape, because the editing-brain packs rely on ranges and per-style tables.
A skill must carry at least one step, do rule, avoid rule or check, so a room always has something
concrete to act on.

## 4. How a skill reaches a prompt

1. **Selection** (`select`): approved revisions whose `tasks` include the task key. A family **pin**
   lifts a skill to the front even where its own bindings do not reach; a **block** removes it, and a
   block always beats a pin. Order: pinned, then owner > learned > builtin, then (0.73) skills whose first task is
   this job, then priority, then ID, so a script job fills its room with script skills before general ones.
   A **pin-only** skill (`pinOnly: true`) is never selected by default, even when approved: it
   reaches a brief only where it is pinned, usually to one family. All niche profiles and the
   format-specific script, visual and editing templates of the mastery bundle are pin-only, so a
   sleep-history rule can never leak into a true-crime family's prompt.
2. **Compilation** (`brief`): a compact brief of `id, title, when, do, avoid, numbers, checks` plus
   the source-of-truth order, and the family's open project state. Long prose fields are left out,
   except that a skill without `do` rules sends its `steps`, and one with neither sends its `summary`
   (0.71: 75 such skills had reached prompts with only their avoid list and checks).
3. **Budget**: the brief is capped per job (`TASK_BRIEF_BYTES`, 0.73: script candidates 12,000 bytes, scene plans
   14,000, voice direction 8,000, the music score 6,000, the competitor analysis 4,000, motion templates 3,000, visual
   prompts 2,500, every other job 1,800). The script job's token limit grows by the brief, so a fuller brief never
   takes room from the script itself. A
   skill that does not fit is dropped **whole** and counted, never trimmed mid-rule. If the remaining
   room for a completion falls below the floor, the job is refused with a message naming the cause,
   rather than overspending.
4. **Injection**: `store.skillRuntime` is attached by `server.js`, following the same provider-hook
   pattern the competitor blueprint already uses. The brief enters `promptInput.skills`, and
   `hermes.js` tells the model to treat it as owner guidance, not as content to quote.
5. **Logging**: every use writes a `skill_usage` row with the exact revision IDs injected, the byte
   size and how many skills were dropped. The approved skill set is part of the job deduplication
   key, so changing the library produces a new job instead of reusing an old result.

**How the skills for one request are chosen (0.74, owner question 2026-10-31: "is it fixed to the same 19?").** Not a
fixed list. Each job passes what its request is about (`brief(task, familyId, {text, format, style})`): a script its
title, angle, hook, niche, audience and kind; a scene plan its subject plus its engine and looks; voice, music,
packaging, research, topic ideas, niches and editions their own words. `rankSkills` then weighs every approved skill
of the job: words it shares with the request (rarer words count more; generic words such as video, look, engine and
style do not count), whether it was written for this job, its priority, and its format. Areas are spread (each further
skill from an area already taken counts 8% less), so hooks, structure, retention, voice and the rest all get a place.
Templates are alternatives (a video follows one structure): the ones that fit the request go in, otherwise only the two
best. A Shorts-only skill never reaches a long video, a long-form-only one never a Short, and skills made for one engine
(`ENGINE_AREAS`: whiteboard, anime, cinematic, documentary footage, hybrid overlays) never reach another engine's plan.
The owner's pinned and own skills stay first. The result is deterministic (the same request picks the same skills) and
each job records why each skill was chosen (`skill_usage.reasons`, shown in Skills -> Usage). Example from the tests: a
mystery script gets `story.case-file-mystery` first (it matches unsolved, mystery, case, file) and not the countdown
structure; a "top 5" Short gets `story.counted-list` and none of the 14 long-form-only skills.

**How many skills reach a job (0.73).** Measured with every skill approved, before 0.73 a script job carried 3 of the
122 skills bound to it and a scene plan 13 of 140, because the old 1,800 and 9,000-byte briefs were full. Since 0.73 a
script job carries 21 (19 of them written for scripts), a scene plan 21, voice direction 12, the music score 7 and the
competitor analysis 6. Skills -> "Skills in every request" shows these numbers live for this PC. A skill is guidance
for the AI, not a guarantee: it makes the rules the owner approved part of every request (hooks, retention, pacing,
the 30/70 rule), and the checks in code (retention, craft, copy guards, QC) still decide what passes.

Wired: **script candidates** (`script.candidate`), **daily research briefs** (`research.brief`), **packaging titles**
(`packaging.title`), the **editing brain** (`editing.plan`, in code) and, since 0.39, the **scene planner and the story
director** (`scene.plan`, input `skills`, 9,000 bytes because plans are large) and **voice direction**
(`voice.direction`, 3,000 bytes). Since 0.71 also the **competitor analysis** (`competitors.blueprint`; dropped last when
the competitor data does not fit the analysis limit), the **music score** (`audio.mix`) and **niche suggestions**
(`niche.discover`). Each records a `skill_usage` row with the exact revisions it used.

**Pack approval (0.39).** Owner review 2026-10-18 found all 349 drafts still unapproved, so no skill had ever reached a
video. Skills -> Packs lists every pack with what is in use; "Review & approve the pack" shows every draft of the pack
(open any to read its rules) and approves exactly those revisions in one named review with the three confirmations.
If any of them changed after the dialog opened, nothing is approved. Each revision keeps its own approval record
(reviewer, time, pack), and any single skill can still be retired.

## 5. Deterministic rules

Numbers that must not drift are applied in code, not left to a model. `RULES` in `skills.js`:

| Rule | Value |
|---|---|
| `imageCount` | one visual per 10-15 spoken words, 12 by default |
| `beatCount` | duration ÷ seconds per visual (720 s at 5 s = 144 beats) |
| `textDwellSeconds` | `max(1.2, 0.35 + words / 3.2)` seconds |
| `captionIssues` | 42 characters a line, 2 lines, 20 characters a second, 7 s a cue |
| `titleIssues` | 50-70 characters, plus the banned-phrase scan |
| `bannedPhraseIssues` | "stay tuned", "in this video", "delve", "dive into", and the documentary clichés |
| `placeholderIssues` | a raw `[PLACEHOLDER]` blocks the prompt and the artifact |
| `sentenceLengthIssues` | 25 words per narration sentence |
| `loudnessIssues` | −14 LUFS ±1, true peak ≤ −1.5 dBTP |
| `wordsForMinutes` | runtime × 150-170 words a minute, 155 by default |
| `wordAllocationIssues` | sections must add up to their chapter and chapters to the target, exactly |
| `paragraphImageCount` | per-style paragraph tiers: standard 3/6, oil-sketch 3/5/15, renaissance 5/ask/15 |
| `imageIntervalSeconds` | narration seconds ÷ image count, the zero-decision assembly hold |
| `titleVariationIssues` | no opening three times in a row; no opening on more than a quarter of 8+ titles |

The last five are ready for the script outline step and the Editing Room; no room calls them yet.

Each has unit tests covering both the passing and the failing side.

## 6. The learning loop

The program learns from its own work, and every lesson is a **proposal**.

1. **Capture.** Three real review paths raise candidates today: the script quality gate blocking a
   candidate, a scene plan rejected at review, and a style proof returned for changes. Each records
   the finding, the evidence references, the skill it would change and the proposed rule. Capture is
   rule-based, never automatic retries, and never edits a skill. A repeat for the same source
   reference is ignored.
2. **Review.** You approve or reject by name, with a reason.
3. **Approving writes a DRAFT.** A new draft revision of the skill (or a new `learned` draft skill).
   That draft still needs the normal skill approval before any room uses it, so no lesson reaches
   runtime on a single decision.
4. **Rejecting** records the finding under the family's REJECTED project state, so the same idea is
   not proposed again.
5. **Measure.** `effect(skillId)` counts recorded uses and their outcomes. It reports what was
   logged; it does not infer that a skill helped.

Capture is best-effort bookkeeping wrapped around a real review decision: a malformed candidate can
never roll back the review that produced it.

## 7. Project state (Precision OS section 32)

Per family: LOCKED, ACTIVE, OPEN, REJECTED. Locked entries are constraints and rejected entries are
prohibitions, and both are sent with that family's prompts. Entries are closed with a reason rather
than deleted.

## 8. Owner skills and packs

Add your own skill from the Skills page with every schema field. It is saved as a draft and approved
like any other. An import of a JSON pack creates new drafts for new IDs and **new draft revisions**
for IDs that already exist; nothing is overwritten and nothing is approved automatically. Export
returns the approved set by default.

**Pack updates (0.71).** When a program update changes a builtin skill (its source note says so), the new text is added
as a **draft** revision beside the approved one at the next start. The approved revision stays in use until the owner
approves the update (Skills -> Packs shows it as a draft). A skill whose newest revision the owner wrote is never
touched, and an older pack never adds its old text back. The claude-youtube pack (`skills/youtube-growth.json`, 46
drafts) and seven updated skills arrived this way; see research/claude-youtube.md.

**Built-in skills come approved (owner decision 2026-10-30, 0.73).** The owner approved every pack and asked that the
program's skills go with it to any PC. So the built-in skills are approved with the program: when a pack is seeded or
updated, the newest built-in draft of each skill is approved (`approveBuiltins`, reviewer "Built into the program",
`builtin: true`), and the revision it replaces is superseded. A skill the owner retired stays retired, and a skill whose
newest revision the owner wrote is never touched. The owner's own skills (added on the Skills page, imported or
learned) stay in this PC's database and its backups, are never part of the program's files, and still need the owner's
named approval. The Skills page shows Built in (packs, folded), My skills and Browse all. Tests that check the review
mechanics build the engine with `builtinApproved: false`.

## 9. Policy decisions carried into the library

- The library holds both hype-led packaging prompts and the authenticity-first operating system.
  Both are stored; the family's approved packaging policy chooses. The authenticity-first rule is the
  default, because generic inauthentic output is a monetisation risk.
- "Rewrite a competitor transcript" skills carry the 30/70 rule and the copy guards in their own
  `avoid` and `checks` lines.
- "Verified stock only" matches what the Scene Room already enforces: stock comes from provider
  search results on the providers' own media hosts.
- Outreach drafting, uploads and paid generation stay owner actions.
- From the mastery bundle, these were **not** adopted: invented authority ("a spy agency used this",
  "scientists baffled" without a source), title formulas built on ethnicity or immigration status,
  religion "lies exposed" outrage titles, AI video of real people, realistic fake CCTV, film clips and
  YouTube downloads as visuals, franchise retellings, deleting and re-uploading the same videos, and
  device, network, account or AdSense-identity tactics to get around YouTube enforcement. Where a
  prompt relied on one of these, the skill keeps the useful technique and says what replaced it.
- Prompts that named outside tools are mapped to the capabilities this program actually has, or
  reported as not implemented.

## 10. Data model

`skills`, `skill_revisions` (immutable and undeletable by SQLite trigger), `skill_bindings`,
`skill_usage`, `skill_lessons`, `family_project_state`.

Default task bindings are derived from the approved revision's own `tasks` field rather than stored
as rows, so a new revision cannot drift out of step with its bindings. `skill_bindings` holds only
the owner's pins and blocks.

## 11. What is not done

- Only `script.candidate` and `research.brief` are injected today. The other 23 task keys are
  selectable and tested but are wired as their rooms are built (P06 onwards).
- The optional bounded Hermes call that drafts a skill from a pasted prompt ("convert to skill") is
  not built. Owner skills are entered through the form.
- No live provider call was made while building this milestone; the runtime injection is verified
  against the assembled prompt and the recorded usage rows, not against a paid Hermes response.
- Skill effectiveness is counted from recorded outcomes only. Retention and click-through cannot be
  measured until analytics (A01) exists.

## 12. How a skill could be better (0.41)

After anthropics/skills skill-creator (Apache-2.0), every skill revision carries `quality`: plain advice shown when a skill is
opened in the Skills room. It is never a gate. `skillQuality` notes:
- a summary that gives no reason (a rule with its reason is applied well beyond the cases it names);
- rules in capitals;
- skills over 2,500 bytes (a big share of a planning brief);
- a vague "when";
- a skill that only says what to avoid.

Of the 420 builtin skills, 101 have no stated reason and 58 are long. The studio-craft pack passes. Testing a skill with and
without it against a blind judge (skill-creator's evaluation loop) is the next step and needs the owner's go-ahead on token cost.

## How each use ended, and the skills of each video (0.79)

The owner asked (2026-11-02) why some uses said "completed" and others "pending". Only script jobs and language checks
wrote an outcome on their skill-use record, so every other room's records said "pending" for good. Each record now
reads its own job (`SkillsEngine.jobOf`, `USAGE_JOBS`: scripts, research, competitor analyses, storyboards, music scores,
voice directions, niche suggestions, language jobs; edits through their timeline) and says in words how it ended
(used, failed, stopped half-way, not usable, waiting, running, set aside) and which video it was for. Content Studio
shows on each draft "Skills chosen for this video", job by job: the skills are chosen again for every job of every
video from what that job is about (0.74 `rankSkills`), never fixed per channel.

## Skills at every drawing step, and the five new packs (0.89)

Owner request 2026-11-04: the skills must lead the program at every step. Four packs were added from five
repositories (research/five-repos-2026-11-04.md): `skills/drawing-craft.json` (claude-drawing-skill, MIT, 33),
`skills/anidoodle-craft.json` (anidoodle, Apache-2.0, 38), `skills/ghost-editor.json` (ghost-editor, MIT, 25) and
`skills/motion-clone.json` (two MotionClone repositories, ideas only, 4): 599 built-in skills, approved with the
program like the others.

Three steps that drew without skills now receive them, each recorded in `skill_usage` with its plan job: the
Motion Graphics frame worker (`motion.template`, 6,000 bytes, chosen for the video's subject and finishes), Claude's
pictures, ChatGPT's painting prompts and the art director's check (`visuals.prompt`, 4,000 bytes; the paintings get
the rules as one short line, the art director the checks), and the continuity review (the planner's own `scene.plan`
skills). Edit commands and Polish choose their `editing.plan` skills with the video's engine as well. The scene
planner's brief is 16,000 bytes and the editor's 10,000.

Skills written for one medium or finish reach only videos in it (`ENGINE_AREAS`: pixel, collage, riso, woodcut,
engraving, newsprint, blueprint, deco, screenprint, noir, storybook, cartoon, besides whiteboard, anime and the
footage engines), and a skill written for the video's own engine, look or finish now scores higher (`rankSkills`
`onEngine`, shown as `engine` in its reasons). The style words include the Motion Graphics finishes, film looks and
the picture type (`scene-room.js` `skillStyle`).

## Fifteen repositories and directed reviews (0.96)

Owner request 2026-11-09 (research/fifteen-repos-2026-11-09.md). Six packs restated in our own words: `skills/anthropic-design.json` (anthropics/skills, Apache-2.0, 13), `skills/content-strategy.json` (claude-skills, MIT, 12), `skills/animation-craft.json` (ClaudeAnimationBase, MIT, with one idea each from Synfig, OpenToonz and PixiJS, 16), `skills/sound-craft.json` (earshot, MIT, 8), `skills/film-gauntlet.json` (motion-video-kit, MIT, 11) and `skills/explainer-craft.json` (video-talkcraft and Remotion as ideas only, autoclip, ffmpeg-skill and threejs-skills, 12): 671 built-in skills, approved with the program like the others.

Two review jobs that ran without skills now receive them as directives: Claude's or ChatGPT's frame scan (`qc.review`, 4,000 bytes, chosen by the video's title, angle and niche, recorded with the scan in `frame_scans`) and the second writer's review of a script written together (`script.review`, 4,000 bytes; the writer's directives come first with the same codes, then the review skills not already among them; recorded with the script job). The codes each cites are stored in `skill_usage.applied` and shown like the others.

### Skills added from a folder or .zip, and the gate (0.96)

`skill-import.js` (pure; reads a .zip in memory with `zlib.inflateRawSync`, never writes or runs anything): `keepFile` decides what is kept, `fromFiles` turns SKILL.md files, their references, text notes and JSON packs into skills (one per section, at most 8 rules each, avoid-rules and checks recognised, code blocks and housekeeping sections left out), `jobsFor` assigns the jobs by their words (a section keeps to its document's jobs; a reference is judged by its own words). `SkillsEngine.readFiles` (`POST /api/skills/read-files`, 56 MB for a 40 MB .zip) returns the skills, the kept files and the thrown-out files with reasons; `importPack` takes `pack` (named "Imported: <name>") and `approve` {approvedBy, three confirmations} to approve the new revisions in the same step. Imported skill IDs are `<area>.own-<name>`, so the area follows the first job.

`SkillsEngine.gate()` gives `Ai` (server.js `ai.skills`) the brief of a job for a request that arrives without skills, and records its use (room `program`, outcome `answered`, job id `request:<uuid>`).

## Fit and need (0.97)

`rankSkills` keeps only pinned skills in a fixed place. Owner and learned skills join the open ranking with a lift of `0.1 + 0.3 × fit` (fit = the request's weighted word match against the best match), so a fitting one rises and an unfitting one does not crowd the brief. `relatedSkills(taskKey, selected, {familyId, context})` ranks the approved skills of other jobs (never pin-only, never blocked for this job, never off format or engine) against the request and keeps those with three or more matched words, four at most; `brief` places them after the job's six leading skills, and their reason names the job they were written for (`why.related`). Skill words are cached per revision (`skillStems`), since every request scans the library (about 40 ms). Budgets: `BRIEF_BYTE_BUDGET` 6,000; `TASK_BRIEF_BYTES` script 16,000, scene 24,000, editing 16,000, voice 12,000, audio 10,000, motion 10,000, competitors 8,000, pictures 8,000, QC 8,000, script review 8,000 (owner decision 2026-11-10: quality first).


## No skill may lower the quality (0.108)

Owner rule 2026-11-11: "not any skill that degrades the output quality; no compromise on quality". `skills.js` `qualityRisk(skill)` reads what a skill tells the model (when, summary, steps, do rules, numbers) for wording that lowers quality: saving tokens or cost, a cheap result, keeping drawings simple, minimal or basic, minimal props, simple backgrounds, basic shapes, no facial features, fewer pictures, skipping the review or the pictures, "good enough", lower or draft quality. Such a skill is never chosen for any job (`select`), and the Skills room says why ("Held back from every job because ..."). Its avoid list and checks are not read, since "avoid basic shapes" is the opposite of the problem.

Eight built-in skills used such wording and were rewritten for full quality (each with a new source note, so it re-seeds as a new revision): `motion.stick-figure-scene-breakdown` (rich props, a background with depth, faces that carry the feeling), `strategy.weekly-plan-anchor`, `strategy.cadence-consistency`, `review.frame-budget`, `competitors.watch-coarse-to-fine`, `layout.element-budget` (hierarchy, details in back layers), `reference.video-dna-extraction` and `timeline.clip-schema-and-invariants`. The visual rules of three looks no longer ask for "few things" or "simple backgrounds" (`visual-dna.js` MOODS). A test fails when any built-in skill is flagged. How skills are chosen did not change: pins first, the rest by fit and need for each request (0.97), with nothing fixed per channel or engine.
