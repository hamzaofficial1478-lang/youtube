# lemo-opuscar and motionmaxxing: what we studied and what the program now does with it (0.39)

Owner request, 2026-10-18: analyse two repositories deeply (core brain, features, skills, styles), take what upgrades
the motion graphics and the program's styles, and turn the skills into rules the AI actually follows while it makes a
video. Both repositories were cloned as untrusted reference data into the session's scratch folder; none of their
scripts were run. Everything below is in our own words.

| Repository | Pinned revision | Licence | What it is |
|---|---|---|---|
| [Tejashmakwana/motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) | `8c8ec0f2a6f6c9a0da15cd24f7b1298ab298368c` | Apache-2.0 (NOTICE kept in `vendor/motionmaxxing/`) | A skill that makes AI-made motion films look human-made: measured curves, timing, type, transitions, judgment and a list of tells, from 53 measured recreations and 507 decoded moments of human-made films. |
| [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | `508848acb2b4930c4041fef4d594120da1525bff` | MIT | A library of 51 film styles, each a style guide (`STYLE.md`) plus a short film made entirely in code, a directing method (`DIRECTOR.md`), a build method (`TECHNIQUE.md`) and 98 reusable style prompts (OPUSCAR 98). |

## 1. motionmaxxing: the core brain

Read in full: `SKILL.md`, `references/motion.md`, `type.md`, `transitions.md`, `judgment.md`, `director.md`,
`slop.md`, the headings and rules of `world.md`, `layout.md`, `idea.md`, `close.md`, `sound-sync.md`, `taste/`,
`docs/KNOWN-LIMITS.md`, the 156 designer rules of `library/moments.jsonl` and the ease definitions of
`runtime/motion.js`. Most of its examples are product films (a UI, a cursor, a logo); we kept the rules that transfer to
narrated YouTube videos.

- **Motion has a curve per role.** Landings decelerate hard (60-72% of the travel in the first 4-5 frames, then a
  0.4-0.6 s tail), leavings accelerate and are quicker than arrivals, counters step one value per frame, drifts are
  linear, overshoot is rare (under 9% of moves) and small. Twelve curves were measured; their formulas are now
  `K.ease` in `drawn-kit.js`.
- **Arrival from oversize**, never growth from zero (enter `land`).
- **Words land on the voice**: whole words, 3-5 frame gaps, a longer gap before the key word, 0-2 frames ahead of the
  voice; no letter-by-letter headline typing.
- **No dead frame**; a true hold only after a payoff (0.5-1.0 s) or as a designed breath (0.6-1.5 s).
- **Script cues**: every number gets a visual built from it, every abstract word a concrete metaphor (once per film),
  every name a beat of its own, every contrast word a turn. The mute test.
- **Energy**: beats shorten toward the peak (60-75% of the piece), the last one lingers; at most a quarter of beats get
  the biggest treatment; every beat states what it buys the viewer.
- **Cuts**: hard cuts on a moving frame with a carried object; dark/light flips through a growing shape; no default
  crossfades.
- **The tells of machine-made video** (the slop list): corner chrome, chapter counters, deck layouts, stat slides,
  pinned elements, a technique showreel, premium pastiche, ghost decoratives, label chips, uniform staggers, frozen
  holds, one global ease, bounce on every pop, count-up tweens, exits that reverse entrances, fade-to-black endings.

## 2. lemo-opuscar: the core brain

Read in full: `AGENTS.md`, `DIRECTOR.md`, `TECHNIQUE.md`, `MAINTAINING.md`, the style template, all 51 `STYLE.md`
files (sections 1-9 and 11 of every style; section 10 only points at demo code) and all 98 OPUSCAR style prompts.

- **The director's method**: a film is judged by sound, rhythm, camera, then directing. One subject, one goal, one
  turn; a hook in 3 seconds; an ending that echoes the opening; one native move at the emotional peak; three candidate
  structures before choosing one; a shot list with the reason for every framing and move; a cue map; a sound table.
- **Sound**: three layers (ambience, foley, music), at least two real silences before the turn, sound as a transition
  at least twice, no generic piano and strings.
- **Pacing for the viewer**: hold text for letters / 15 + 1.5 s, a title card 4 s, a judgement 2.5 s.
- **Every style guide has the same eleven parts**: essence and what it is not, materials, colour logic, type, motion
  quality, camera grammar (a vocabulary, not a route), sound palette, native moves (each with "fits content like"),
  pitfalls of the medium, engine, variation space.
- **Every style prompt has the same anatomy**: the medium in a sentence; mark sizes as fractions of the frame; a
  palette by role in hex; one hero keeps the accent colour while everything else stays in the medium's neutrals (lamps
  stay grey); one light direction; the finish in plus-minus values; a default composition; a signature shot and camera
  moves with seconds; a cut rhythm; a reference for grammar only; three things to avoid.
- **The evidence films** (satellite, archive light table, briefing board, LiDAR, white model, data physicalisation,
  teardown, microscope): one finding per screen with its source; white means measured; colour returns where the story
  turns; the loupe as the camera's door; the range line; the judgement frame; the hole; the rising level.
- **Native moves** worth a whole film: redaction, the stamp, numbered exhibits, plates as narrative, palette re-ink,
  fold-cut-unfold, the lamp turns on, colouring is an action, wax resist, mist erase, one stroke, the handscroll,
  match cuts of shapes with shrinking intervals, stop-time.

## 3. What the program does with it now (0.39.0)

| In the program | From |
|---|---|
| `K.ease` gains the twelve measured curves; pop, slide, grow, rise, exits and counters use them (`drawn-engine.js`) | motionmaxxing `runtime/motion.js` (formulas re-implemented, Apache-2.0 notice kept) |
| New entrance `land` (oversize, blurred, settles) and text animation `redact` (bars lift word by word) | motionmaxxing; halftone-dossier |
| Counters, gauges and range lines roll one value per frame and land (`rolled`) | motionmaxxing counter rules |
| **Film looks** (`engines.js` FILMS, `drawFilm`): silent film, noir, 19th-century photograph, one-colour black and white, newspaper, risograph, blueprint, woodcut, 1950s TV, Technicolor, family album, silkscreen, engraving, art deco gold - for the drawn shots of every engine, chosen in the style (one look or "Claude chooses"), a shot may change register | lemo-opuscar styles and OPUSCAR prompts (the hero keeps the accent colour; type prints solid over halftone) |
| Evidence tools for every engine: `quote` (speaker portrait, name, words), `document` (headline, one line lit), `gauge` (a reading or "item 3 of 7"), `loupe` (two scales at once), `ruler` (range line with a landing reading), chart type `units` (isotype "1 in 100") | lemo-opuscar evidence films and channel study |
| Planner lines SCRIPT CUES, EVIDENCE and RHYTHM in every scene plan | motionmaxxing and lemo-opuscar |
| Skill packs `skills/motion-craft.json` (14) and `skills/film-craft.json` (14), drafts until approved | both |

Not taken: three.js scenes, real satellite, LiDAR or microscope data pipelines (they need licensed data and an owner
decision), the demo films' stories and designs, GSAP or any bundled third-party file, TTS and the sampler.

## 4. Next candidates

- Film looks for footage clips (FFmpeg filters per look in `render.js`), so a documentary's stock shots match its
  drawn shots.
- A `stamp`-style verdict with an evidence board (string between pinned exhibits).
- Lemo's two-register idea as a story-director option (present day in one look, memories in another).
