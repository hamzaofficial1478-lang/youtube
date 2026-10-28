# Skills Engine (v0.41.0)

The Skills Engine is the program's reusable operating knowledge: what to do, what to avoid, and the
exact numbers each room applies. It was built from `docs/SKILLS-ENGINE-PLAN.md`; this file records
what actually exists, what it may and may not do, and where it is wired in.

Open it in the app at **Skills** in the left navigation.

## 1. The boundary, in one paragraph

Every skill is a **draft** until a named human approves that exact revision. A draft is visible,
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
   block always beats a pin. Order: pinned, then owner > learned > builtin, then priority, then ID.
   A **pin-only** skill (`pinOnly: true`) is never selected by default, even when approved: it
   reaches a brief only where it is pinned, usually to one family. All niche profiles and the
   format-specific script, visual and editing templates of the mastery bundle are pin-only, so a
   sleep-history rule can never leak into a true-crime family's prompt.
2. **Compilation** (`brief`): a compact brief of `id, title, when, do, avoid, numbers, checks` plus
   the source-of-truth order, and the family's open project state. Long prose fields are left out.
3. **Budget**: the brief is capped at **1800 bytes**, taken out of the family's job token limit. A
   skill that does not fit is dropped **whole** and counted, never trimmed mid-rule. If the remaining
   room for a completion falls below the floor, the job is refused with a message naming the cause,
   rather than overspending.
4. **Injection**: `store.skillRuntime` is attached by `server.js`, following the same provider-hook
   pattern the competitor blueprint already uses. The brief enters `promptInput.skills`, and
   `hermes.js` tells the model to treat it as owner guidance, not as content to quote.
5. **Logging**: every use writes a `skill_usage` row with the exact revision IDs injected, the byte
   size and how many skills were dropped. The approved skill set is part of the job deduplication
   key, so changing the library produces a new job instead of reusing an old result.

Wired: **script candidates** (`script.candidate`), **daily research briefs** (`research.brief`), **packaging titles**
(`packaging.title`), the **editing brain** (`editing.plan`, in code) and, since 0.39, the **scene planner and the story
director** (`scene.plan`, input `skills`, 9,000 bytes because plans are large) and **voice direction**
(`voice.direction`, 3,000 bytes). Each records a `skill_usage` row with the exact revisions it used.

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
