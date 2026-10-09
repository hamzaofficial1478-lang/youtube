# Drawn scenes: the stickman, hand-drawn and motion-graphics engines (P06c 0.19, P06d 0.20)

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
