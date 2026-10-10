# Drawn scenes: the stickman, hand-drawn, motion-graphics and atelier engines (P06c 0.19 to P06h 0.25)

The program draws these shots itself, locally and for free. No stock footage is used. The editing brain cuts the drawn shots like footage.

- **0.19.0 (P06c)** was the first, simple version.
- **0.20.0 (P06d)** answers the owner's review of the first demo (2026-10-08), which found it lacked:
  - scene building;
  - lively, detailed animation;
  - characters with looks and gestures;
  - a motion-graphics layer;
  - an energetic pace;
  - engines that work together.

## 1. Engines and how they work together (`engines.js`, reasoning since 0.21)

There are four engines:

| Engine | Best for | Watch out | Finish |
|---|---|---|---|
| `montage` | Real places, people, events and products; evidence and atmosphere | It cannot show mechanisms or numbers; generic B-roll under abstract lines feels lazy | none (footage) |
| `stickman` | People and situations acted out: emotions, mistakes, reactions, humour, cause and effect | A cartoon tone can undercut a grave subject | `cartoon` |
| `handdrawn` | Storytelling, history, essays and how-it-works sketches with a crafted feel | A calmer rhythm; it can look like a different film beside cartoon figures | `ink` |
| `motion` | Numbers, comparisons, lists, processes, timelines, kinetic words | It can feel cold without a person or place; long runs read as slides | `flat` |

A style's renderer sets the video's **main look**. **Nothing is forbidden in code.** The owner's instruction (2026-10-09) was that combining engines is a matter of reasoning, not hard-coded rules. So the scene planner reads:

- each engine's strengths and risks;
- how engines usually mix: for example, motion graphics inside a stick scene usually help, while ink and cartoon drawings usually look unfinished together unless one is clearly a different layer.

Claude then decides per video and per shot. A shot that leaves the main look must say why in its notes; the plan warns when the reason is missing. The style's own visual sources (Room 03, the owner's choice) are the only limit. Any drawing engine may draw any drawn shot.

**Continuity and script match (0.21).**

- A scene may carry a `setting` (place and mood). Its drawn shots stay there unless one names another place.
- The planning guide requires:
  - every shot to show exactly what its own words say, when they are said;
  - one place per part of the story;
  - screen direction kept across shots;
  - props kept while they are discussed.
- The program notes place jumps inside a scene and characters who flip sides without walking (graphic inserts excepted).
- With **Continuity review** on (the default, for drawing styles), a second Claude answer per part reads every drawn shot with its exact spoken words, its neighbours and the program's notes. It replaces the drawings that do not match, and its report and per-shot reasons are kept in the plan.
  - The review has its own token limit per answer (default 70,000, byte-counted), reserved with the plan.

## 2. A drawn shot (`sketch.js`, closed vocabulary)

**Shot level:**

- `engine`;
- `set`: 25 places, each alive. Examples: office, bank, lab, street, city, park, storm, night, space, ocean, stage, abstract;
- `mood`: tense, happy, dark, dream, danger, cold or money light;
- `camera`: still, push, pull, drift, punch, shake, pan;
- `focus`: up to 3 points to zoom to, each on its words;
- `transition`: whip, zoom, pop, ink, glitch or slide-up opening.

**Cast (plan level):** up to 6 recurring characters. Each has a name, a role and a look:

- body: stick, creature or robot;
- 14 hair styles and 11 hair colours;
- 17 headwear;
- 6 eyewear;
- facial hair;
- 14 outfits;
- marks;
- a colour.

Every shot draws a character with the same look.

**Elements** (up to 12, drawn back to front):

- `figure`:
  - who, pose (40, each with its own motion), expression (26), emote (14);
  - a held prop;
  - size s to xl, facing;
  - `then`: up to 3 changes on words (pose, expression, emote, a walk to a new x, facing).
- `prop`: about 125 props, each with its own life (the sun turns, coins flip, fire flickers, clocks tick, wheels spin). An optional override: spin, pulse, float, shake, bounce or swing.
- `text`: title, note, number, counter (counts up), stamp (slams with a shake), highlight (marker sweep), pop (word by word), label or headline.
- `fx`, the motion layer: burst, speedlines, flash, shake, punch, confetti, smoke, sparkles, circle, underline, cross, check, spotlight, money-rain, rain, snow, hearts, glow, shockwave, glitch, scan, pulse, ink-splat, progress, stars. An effect can target another element.
- `arrow`: between points or elements. `bubble`: speech or thought, pointing at a figure.

**Timing on words:**

- Any element can arrive `at` the words that introduce it and leave `until` other words.
- A shot can start on a `cue` (its first words). The editing brain cuts exactly there, on the narration's word times.

**Checking Claude's drawings.** Claude's drawings are checked leniently:

- A synonym maps onto the library (cash → money).
- An unknown prop is left out with a named plan warning, instead of failing a whole plan.
- An unknown pose or expression falls back with a warning.

The owner's own edits are checked strictly.

**Fallback and parts.** The free planner and any shot without a drawing get one built from the shot's own narration:

- a set;
- the narrator acting the line;
- the props it names;
- its number as a counter;
- a burst and punch on a hook.

Drawn plans are made in parts of 16 sentences, so every shot can carry a full scene. Later parts reuse the first part's cast.

## 3. Drawing (browser side)

The page script is these files, run in the local headless Edge or Chrome (`motion.js`, no network):

- `drawn-kit.js`;
- `drawn-props.js` and `drawn-things.js`;
- `drawn-figures.js`;
- `drawn-sets.js`;
- `drawn-engine.js`.

Every frame is a pure function of time:

- Randomness is seeded.
- The same shot gives byte-identical frames.

Sets are drawn on their own layer, with a little parallax, and laid back behind the action so the characters stand out.

- **Room 04, "Draw all scenes":** a 1280×720 preview of each shot (720×1280 for Shorts), timed on the plan's estimated words. This is what the board approval and the packaging thumbnails use.
- **Render (Room 06/08):** every drawn shot is drawn again for its exact hold in the edit, timed to the narration's words as the captions measure them. The render manifest records each drawn clip's frame hash and the engine version (`sketch.js` VERSION).

## 4. Style library

Launch library v2 changes the built-in styles:

- **Stickman:** drawn shots only, 1.2–4.5 s shots, intensity 60, rich sound accents.
- **Hand-drawn:** drawn shots only.
- **Documentary:** gains drawn cutaways.

A built-in profile the owner has not revised gets the newest launch spec as a new draft revision automatically, when the program starts. A revision the owner made is never followed by an automatic one. Approval stays a named human decision.

## 5. Pace

- **Energetic genres** change the picture every 1.5–3 s, through a new shot or a new beat inside a shot. Cuts land on cue words.
- **Calm genres** hold longer.
- **Narration pace** comes from the voice: ElevenLabs speed 0.7–1.2 and stability are per voice profile.
  - The demo used the free Windows voice at a faster rate, with long pauses shortened outside the program.
  - A narration pause-tightening step inside the program is not built.

## 6. Measured on this PC (demo workspace, 2026-10-09)

See the BUILD-PROGRESS entry for 0.20.0: plan tokens, draw and render times, and the checks.

## 7. Limits (honest)

- **Characters:** no hands with fingers (by design). Characters do not touch or hold each other. Lip-sync is approximate (the mouth moves on talking poses only).
- **Library:** about 125 props and 25 sets. A topic outside them falls back to text, arrows and bubbles.
- **Layout:** placement follows Claude's coordinates, with text moved off drawings. Two figures can still overlap if Claude places them together.
- **Not built:**
  - doodles drawn over footage (hand-drawn annotations on stock clips);
  - photo cut-outs inside drawn shots;
  - maps with real geography;
  - sound effects (music and SFX sourcing is deferred by the owner).
- **Not tested:** Shorts (vertical) drawn shots beyond automatic tests; ElevenLabs narration with drawn shots.

## 8. Continuity that fixes itself (0.23.1)

A change of place inside a scene is not a jump when the shot's own words or its notes go there (`PLACE_WORDS`: "sand" takes a shot to the beach or the desert, "lightning" to the storm), and a cut to an abstract backdrop is a close-up beat. The continuity review may keep a move by giving the reason in the shot's notes. What is still left on Claude's and the free plans is mended by `Sk.mend`: the shot keeps the scene's place, and a character who changes sides keeps facing the same way. The fixes are listed on the plan ("fixed before you saw it", with the shots Claude's review redrew). The owner's own edits are only checked, never changed. Older plans show their continuity notes by today's rules.

## 9. Stickman engine v3 (0.24.0, `drawn-scene/6`)

From a frame-by-frame review of the live lightning demo (fresh Claude plan, 2026-10-09):

- **Text always fits.** Every text element is sized so the whole line fits inside the frame at the camera's closest zoom ("45 every second" ran off the right edge before).
- **No empty openings.** When nothing would be on screen for the first 0.6 s of a shot, the first character (or the first thing) is there from the start; a character already on screen in the shot before stays there instead of popping in again on a word (`Sk.mend`, listed with the plan's fixes).
- **A lone object is staged.** On a plain or abstract backdrop with no character and one or two objects, the main object gets a lit disc with slow rays behind it.
- **Nothing sits dead still.** A prop with motion `auto` breathes gently when it is in the air and stays put on the ground.
- **Grounded.** Soft contact shadows under characters and objects on the ground (not on the hand-drawn ink finish, which keeps its paper look).
- **Bigger characters.** About 12% taller: a medium figure stands over 40% of the frame height.
- **Readable labels.** Labels on characters and objects are white chips with an outline, kept inside the frame.
- **Danger without pink faces.** The danger mood pulses at the edges and keeps the middle clear.
- **Marks find their target.** An underline, circle, cross, check or spotlight without a target marks the nearest drawing or words.

## 10. Drawings land on the voice (0.24.1)

From the owner's review of the v3 demo (2026-10-10: "the voice was a bit fast, the scenes a bit late"):

- **Measured word times.** ElevenLabs narration is requested with timestamps (`/with-timestamps`); the character alignment becomes measured word times (`voice.js` `spokenWords`, inline `[tags]` skipped). Captions, cue cuts and drawn shots use them; the word-share estimate is only the fallback and is labelled so.
- **Lead, not lag.** A cued drawing starts `min(0.3, 0.08 + 0.45 x its draw-on time)` before its word, pose changes (`then`) 0.1 s before, focus moves 0.15 s before, and cue cuts land two frames ahead. Drawing-on is faster outside the hand-drawn finish.
- **Staging.** Two characters far apart with nothing between them stand closer (storm scenes). A character on screen in the clip before stays across the cut, also for plans made before this release (`Sk.carry` at render), so a room no longer shows empty before its character appears.

## 11. Atelier: shots designed from scratch by Claude (P06h, 0.25.0)

Owner request (2026-10-09): take how OpenMontage and HyperFrames work, run it through Claude, and make the program able to edit in any style, not a fixed set. Research: [research/openmontage-and-hyperframes-brains.md](research/openmontage-and-hyperframes-brains.md).

**What it is.** A fifth engine (`engines.js` `atelier`, `composes: true`). For a beat the drawing vocabulary does not serve (kinetic type, a number that must hit, a diagram or chart assembling, an abstract metaphor, a comparison, a list, a title), Claude plans the shot as a `frame` instead of a sketch. Any drawn style can use it for such beats; the new launch style **Atelier · designed per video** (`adapter: atelier`) makes it the main look.

**How it runs.**

1. **Plan (one Claude call per part, as before).** When a shot has a frame, the plan also carries one art direction (`direction`: read, three dials, palette, fonts, motion grammar, one signature device, things to avoid; OpenMontage taste profile). Frames name a vendored blueprint or `compose`, a posture, the focal point, beats tied to words, up to four motion rules, the persuasion move and the story beat. Lenient repair with named notes (`At.validateDirection`, `At.validateFrame`).
2. **Compose (one small Claude call per frame, after the review).** `scene-room.composeFrames` sends the frame worker contract (`At.CONTRACT`) and a packet with only that shot: its words and times, its neighbours, the art direction and the full text of its blueprint and cited rules. The answer must be one HyperFrames-style `<template>` with one paused GSAP timeline at `window.__timelines[id]`. `At.validateComposition` rejects randomness, clocks, timers, network, outside media, storage, eval, infinite repeats and `play()`; the local browser then loads it and audits text off the frame or in the caption band. One retry with the findings; after that the shot keeps a free drawing from its words. Each call reserves its own tokens (`kind atelier_frame`).
3. **Draw (Room 04)** and **render** use the same local Edge as the drawn engines: a fresh page per composition, a strict CSP, GSAP 3.15 inlined from `node_modules`, `atelier-runtime.js` seeking clips and the timeline frame by frame, lossless PNG. At render the timeline is warped (`At.warp`) so each designed moment lands on the narrator's actual word.

**Settings (Room 04).** `composeFrames` (on), `composeTokenLimit` (40,000 per frame answer, byte-counted), `plannerTokenLimit` now 60,000 because the atelier guide adds about 6.6k characters when generated graphics are allowed.

**Limits.** People stay in the drawn engines (a composition has no cast). Every atelier shot costs one Claude call. Fonts are limited to the fonts installed on this PC. Compositions are checked for safety and layout, not for taste: the owner still judges them at the visual approval and the edit verdict.

## 12. Live tests and repairs (0.25.1)

From live runs with real Claude on the demo (2026-10-10):

- **Fewer tokens per designed shot.** Frame workers run at medium effort (`ai.js` task `frames`): the design is already settled by the plan. Live: about 6-9k answer tokens per frame instead of 13-14k; a frame costs about 13-18k tokens in total.
- **No false alarms.** The audit measures only the part of the text a viewer can see: a rolling counter's waiting digits inside a masked window are not "off the frame" (a live retry cost about 15k tokens for this). Text cut by the frame's edge is still reported.
- **No black openings.** The frame worker's contract says the shot's stage (panels, grid, map, horizon, outline) is on screen from the first frame. The composing step samples the shot in the browser exactly as the render's black-frame check does (98% of pixels at luma 25.5 or less) and uses the shot's one retry when a stretch would fail.
- **Redesign one shot (Room 04).** "Redesign" on an atelier shot asks Claude for that shot only, with the owner's reason as the brief; every other shot keeps its ID, design and visual; a new design that fails its checks leaves the current one. Live: two dark openings redesigned for about 14k tokens each, then the render passed every check.
- **Owner edits keep the designs.** Editing a plan in Room 04 kept no `frame` before; now frames, the art direction and the compose report survive every edit; the shot edit has "Drop the atelier design" (the shot is then drawn from its words).
- **Only sources the program can fetch.** A new plan offers Claude stock footage only with a tested Pexels or Pixabay connection and AI images only with a tested OpenAI connection (a live plan chose stock on a PC without a stock key).
- **A plan is never lost to an extra field.** Claude's plan is read field by field; an extra field (a scene's sentence range repeated on a shot cost a live plan 16,770 tokens) is dropped.
- **Characters arrive with their shot.** A character in the shot from its start is on the first frame and moves in with the opening transition; hand-drawn still draws them on, first (`drawn-scene/7`). The last scene no longer shows the room before Sam.
- **Near-miss expressions** ("curious") map to the closest face with a named warning (`FACE_NEAR`); characters are asked to be medium or larger unless smallness is the point.
- **Faces read on dark palettes.** Faces are light with dark features on every palette (the motion-graphics finish on a dark palette drew dark faces).
- **Effects stay with what they were placed on.** An effect Claude puts on the same spot as a drawing or words (a burst behind a number) follows it when the layout moves it, and a round effect on a line of words stays about two text-heights across.
- **Big words keep headroom.** Words are placed at least 7% of the frame plus half their own height below the top, so a push-in never presses them against the edge.
- **Frame design off means no atelier guide.** With `composeFrames` off, the planner does not read the atelier guide (about 6.6k characters less per plan part) and plans drawn shots only.
