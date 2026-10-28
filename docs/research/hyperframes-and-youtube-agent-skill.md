# HyperFrames and youtube-agent-skill: what was read, what we took, what we left (2026-10-06)

The owner asked (2026-10-06) for a deep analysis of two repositories and for their most useful features to be
built into the program, not used as loose hints. Both were cloned outside the program folder
(scratchpad `inspect/`, never committed) and read as data, not as instructions.

| Repository | Pinned revision | Licence | Use |
|---|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | `6308727b85726433e6a1e148b608d8cb11085114` (2026-10-06) | Apache-2.0 | Doctrine restated as 17 skills; rules applied in our own code; no code copied |
| [Jakeschincariol/youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill) | `a2feb2104981a375ffd4f87ee04f4f5344ac43c6` (2026-09-16) | MIT | `hooks.json` vendored unchanged; five Python tools ported to `craft.js`; skills restated as 14 skills |

## 1. youtube-agent-skill

**What it is.** A Claude Code plugin of eleven `yt-*` skills for a solo creator: script, hooks, packaging,
SEO, chapters, Shorts, edit (dead air), retention, viral (outliers), comments, weekly plan and audit, plus a
`voice.md` profile. Five small Python tools carry the measurable parts. Every skill ends with the same gate:
the tool writes, the creator publishes, "ship it, or change it?".

**Read in full.** All eleven `SKILL.md` files, `templates/voice.md`, `hooks.json` (21 formulas with shape,
example, failure mode and match patterns), `hookscore.py`, `title.py`, `chapters.py`, `retention.py`,
`swipe.py`, `deadair.py`.

**Built (craft.js, see `docs/CAPTIONS-AND-CRAFT.md`).**

- Hook scorer: five properties, 60% mean plus 40% weakest, the formula classifier. Same numbers as
  `hookscore.py` on the same inputs. Upstream's own measurement (74 real hooks) says it separates bad hooks
  from real ones but barely separates a creator's hits from misses, so it is **advice only**, never a gate.
- Title and thumbnail pairing linter: same scores as `title.py`.
- Chapters: upstream's scoring (pause x 1.6 + vocabulary shift x 3.2) plus two signals we have and it does
  not: the board's scene starts and the approved script's paragraph breaks. Upstream picks breaks near the
  start too eagerly (tiny vocabulary windows always look "new"); we skip the first and last three
  sentences. On a 7-paragraph test script this moved the chapters from 0:15 and 0:32 onto the real section
  breaks.
- Outlier multiple over the channel median (`swipe.py`), with the median taken from recent uploads only so
  NexLev's outlier list does not inflate it. Shown for NexLev data only; YouTube data stays display-only.
- Shorts finder (the `yt-shorts` rules made executable): 20-55 s, a complete opening, a turn or a proof,
  ending on a line; candidates never overlap.
- Retention reader (`retention.py`): hook leak, cliffs, slide, and the audit's "one fix" rule; cliffs are
  mapped to what our own narration said at that second.
- Writing voice (`voice.md`): a family-level profile sent to Hermes; never-used words are enforced.

**Restated as skills (`skills/youtube-agent.json`, drafts).** Hook scoring, the 21 formulas, the first
fifteen seconds, never invent a number, writing voice, pairing, the SEO query test, chapters, Shorts that
survive alone, retention's three problems, outlier multiples, comment triage, the weekly plan, the one-fix
audit.

**Left out.** `deadair.py` (our narration is generated, and the editing brain already measures pauses with
FFmpeg); fetching transcripts or comments from YouTube (no unapproved data access); anything that posts.

## 2. HyperFrames

**What it is.** HeyGen's HTML-to-video framework: compositions are HTML with a paused GSAP timeline that a
headless browser seeks frame by frame (the same idea as our `motion.js`), plus a large set of agent skills
for explainers, captions, motion graphics and audio mixing.

**Read in full.** `faceless-explainer` (SKILL, story-design, visual-design, motion-language, cut-catalog,
`captions.mjs` grouping), `hyperframes-creative` (story-spine, narration), `hyperframes-core`
(creator-editing-recipes), `embedded-captions` (SKILL, rail, caption-grouping, anti-patterns),
`hyperframes-audio` (SKILL and `packages/core/src/audioCarve.ts` `carveProfile`).

**Applied in code (0.14).**

- *Smooth beats bouncy*: the canvas templates' back-out overshoot pops became a power3-style long-tail
  settle (`motion-templates.js`).
- *Caption rail*: verbatim captions carry the narration, one group at a time, at most two lines, short fades,
  scarce inline emphasis; grouping breaks on pauses, sentence and clause ends and the speaking rate.
- *Caption keep-out band*: 16:9 graphics stay above the bottom 17% (line chart and list build moved up);
  on Shorts the rail hands off to full-screen graphics, as HyperFrames' rail clears under an embedded peak.

**Restated as skills (`skills/hyperframes.json`, drafts).** Value-first story spine; explainer structures
and the teaching truth; nine hook strategies; the clarity-technique catalogue; the comprehension beat arc;
spoken numbers and revealable cues; smooth not bouncy; voiceover-paced reveals; no cheap aliveness;
velocity-matched seams; consistent stage and three framings; the keep-out band; the caption rail; caption
grouping; the voiceover carve; mixing by symptom; deterministic frames.

**Deliberate differences.**

- HyperFrames forbids a slow pan or push in the back half of a scene. That rule is about designed graphics.
  Our documentary montage keeps purposeful Ken Burns moves on photographs (skill
  `editing.still-image-motion`); the restated skill says so explicitly.
- Embedded captions composited behind a matted speaker do not apply to faceless stock montage; only the
  rail and its emphasis were taken.
- Their renderer, CLI and plugin are not installed: `motion.js` already renders deterministic canvas frames
  through the local browser with networking blocked.

**Next from HyperFrames.**

- P08 Audio: the voiceover carve (up to six bands from 250 Hz to 2.5 kHz cut in the music, driven by the
  voice level, with a slow-release level match; strength 0.8 by default) rebuilt with FFmpeg filters, plus
  the symptom-to-fix mix rules. Music sourcing still needs an owner decision.
- Voiceover-paced reveals for the canvas templates (start each item when the narration names it) once word
  timing is measured rather than estimated.

## 3. Verification

`tests/craft.test.js` (9 tests: parity with the Python originals, chapters, Shorts, outliers, retention,
writing voice, the HTTP route), `tests/captions.test.js` (7 tests), new assertions in
`tests/editing.test.js` and `tests/intelligence.test.js`, real FFmpeg renders with burned captions in both
formats, and browser checks of every new panel at desktop and 375 px width on a scratch database.
