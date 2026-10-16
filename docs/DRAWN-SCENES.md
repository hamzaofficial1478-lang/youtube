# Drawn scenes: the stickman, hand-drawn, motion-graphics and atelier engines and the story director (P06c 0.19 to P06i 0.26)

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

## 13. The story director: every engine in one long video (P06i, 0.26.0)

Owner request (2026-10-10): "combine all of them, so in a long video all editing styles are used with scene building: where the stickman, where hand-drawn, where atelier, where motion graphics, with a well structured and hooked video; 8 to 10 minute videos in one style bore the viewer."

- **Story Mix style** (launch library v5, adapter `story-mix`): no engine leads. A shot without a named engine is drawn as stickman (the cast's home).
- **The map (`director.js`).** Before a long script's plan parts, one Claude answer reads the whole script (`D.mapMessages`): the structure, one art direction, chapters (title, job, home engine, re-hook) and beats (one to four sentences, the engine that carries them and why). The doctrine is reasoning, not rules: stickman for people and feelings, hand-drawn for how things work, history and journeys, atelier for the beats that must land, motion graphics for lists, comparisons and recaps, footage for the real thing; a fast hook, a home engine per chapter, a change of engine at least every 45-75 s and at every chapter start, no engine switch on every shot outside the hook, the strongest engine for the payoff.
- **Repair (`D.validateMap`).** Chapters and beats are made to cover every sentence once; an engine the video cannot use is replaced and named; atelier beats past the budget become motion graphics, named.
- **Parts follow the map.** Each plan part reads only its slice (`D.slice`) and the map's art direction; a shot leaves its beat's engine only with a reason in its notes. The map is kept with the job, so a retry never pays for it twice. Only multi-part (long) scripts get a map; a one-part plan reads the doctrine directly in the mix style. Settings: "Story director" (on) in Room 04.
- **Designed-shot budget.** "Designed shots per minute" (default 2) caps atelier shots when atelier is a guest engine; the composing step designs the first ones within the budget and draws the rest from their words. An atelier-style video has no cap (every shot is designed).
- **The mix, measured for free (`D.measureMix`).** Seconds and share per engine, the longest stretch in one engine and engine switches per minute; in videos of 3 minutes and more, a stretch over 90 s in one engine and more than five engine changes in 20 s outside the hook are named as plan warnings. Room 04 shows a "Story & engines" strip coloured by engine with chapter marks, the shares and the chapters.
- **One designed shot per atelier beat.** The plan parts are told that an atelier beat gets one designed shot (the moment that must land) and its other shots use another engine; when designs still exceed the budget, the budget goes to the first designed shot of each scene so designs spread across the video (live 0.26 run: the parts made 41 designed shots for 17 atelier beats).
- **"Draw them with Claude" (Room 04).** Shots planned as designed shots that were not designed (past the budget, or their design failed its checks) get real drawings in one Claude answer per group of eight scenes (`redrawUndesigned`, a plan job with `scope.redraw`, the continuity review pointed at `drawNow`), instead of the drawing made from their words; every other shot keeps its ID, drawing and visual. Live: 24 shots for 50,621 tokens.
- **Animated shots may run a little long.** A drawn or designed shot up to 25% over the style's shot limit is a warning, not an issue (sentence times are estimates; one 6.3 s shot blocked an 8-minute plan); a still held too long stays an issue.
- **Faces are never covered** (`drawn-scene/8`). A loose prop placed on a character's head moves above it, or beside it towards the open side (a live plan put a target pin on the hero's face).
- **Sets that are easy to misread are described.** The drawing guide says `ocean` is under water; ships, sailors and the sea surface go on `beach` or `storm` with ship and waves props (a live plan stood a sailor on the sea floor).
- **A stalled browser is tried again.** Drawing is local and free: a Room 04 drawing whose browser stalls is drawn again on a fresh browser, and a render restarts that browser and draws the shot again, instead of failing (a live 8-minute render failed after 3.6 hours on one stalled screenshot while the laptop was throttling on a low battery).

## 14. Every story builds its own world, and the voice stays in sync (0.27.0)

Owner review of the 8-minute Story Mix video (2026-10-11): "from 2:03 the visuals came 4-5 seconds before the voice"; "the sailor was under water"; "where the script says you came out of a train there was no train, just a home door"; "the characters should not be the same in each story: a stone-age script needs stone-age characters and scenes, built by reasoning, following physics, and adapted to each niche".

- **Sync over the whole narration (`editing-brain.js` `alignSentences`).** Sentence starts were snapped one by one to the nearest pause around a word-count estimate; once the estimate drifted past its window, comma pauses were taken for sentence ends and the pictures ran up to 6 s ahead. Now one pass places every sentence: each is expected to take time in proportion to its spoken weight (numbers weigh what they take to say, `Cap.weight`), measured from where the sentence before it really started, longer pauses (sentence ends) are preferred over comma pauses, and a boundary without a pause is placed by weight between its neighbours. On the GPS narration: before, 79 of 104 sentence starts were more than 1 s off (worst 6.1 s early); after, none (every scene cut within 0.1 s of the voice).
- **The world kit (`kit.js`, P06j).** The story director designs what the drawing vocabulary lacks - objects, places and costumes - as up to 16 kit items made of simple shapes (SVG path data, circles, ellipses, rectangles, lines, points) on small grids; `Kit.validateKit` turns them into point lists in Node (nothing Claude writes is run as code). Drawings reference them as `kit:<id>` (props, held props, sets, scene settings, cast outfits) and carry the items they use (`sketch.kit`, checked again by `Kit.embedded`), so Room 04, the edit, the render and the sound effects draw the same thing. Every engine draws kit items through the shared renderer in its own finish (`K.propOf`, `K.kitShapes`; kit sets fill the frame with the ground at 80.5%; kit outfits follow the torso).
- **The story's world (director map).** Besides the chapters and engines, the map now carries `world` (era from `D.ERAS`, place, up to eight rules of the world and its physics), a `cast` dressed for that world and the `kit`. Plan parts read the world, the cast and the kit names (not the shapes, to save tokens) and draw inside them; a one-part plan designs its own world and kit. The director also reads the niche's competitor guidance (techniques only, 30/70).
- **Physics and era checks (`Sk.worldNotes`, `Sk.worldMend`).** People on the ocean set (the sea floor) are named unless the words are about diving, and moved to the beach if the review leaves them there; modern props, outfits and places in a prehistoric, ancient or medieval story are named unless the line is about today. The notes go to Claude's continuity review, which now has a fifth check, WORLD.
- **Live check:** one Claude answer (17,740 tokens) built a stone-age world for a 19-sentence hunt script: era prehistoric, an ice-age valley, eight rules (fur and hide, stone and bone tools, firelight, people walk on the snow surface, the mammoth keeps its size), a cast of four in a kit fur tunic, and a kit of a spear, a flint point, a woolly mammoth, a campfire, a cave interior, a snowy valley and a gully - all drawn correctly by the three engines.

## 15. Hand-drawn engine v2, and the HyperFrames editing tools (0.28.0)

Owner request (2026-10-11): "the stick man is almost done, now we will proceed to next editing engine; check again the HyperFrames, it is also the most advanced tool for editing, as the OpenMontage; grab its most advanced tools and build them into our editing engine." The next engine in his order is hand-drawn ("in handdrawn I loved how it was drawing the scenes").

- **A hand draws the scene (`drawn-engine.js` `drawHand`, `drawn-kit.js` `K.penAt`/`K.TIP`).** In the ink finish, every stroke that is being drawn records where its pen is (device pixels); after the frame is drawn, a hand holding a marker (nib, barrel, a cap in the style's accent, fingers, sleeve) is drawn with its tip there, with a small working wobble. No hand when nothing is being drawn, and never in the stickman or motion finishes. Frames stay pure functions of time.
- **Handwriting.** Titles, labels and highlights are written out left to right by the pen at a writing pace (0.4-1.6 s by length), clipped behind the pen.
- **Colour washes in.** Ink fills wash in just after their outline is drawn, slightly off the line like watercolour, instead of popping in.
- `sketch.js` VERSION is `drawn-scene/9`, so old drawings are drawn again.

From HyperFrames (read again at `db845d9`, 2026-10-15; nothing copied, restated in our own code):

- **Transition brain (`editing-brain.js` `transitionPlan`, `sceneJoin`).** A transition says how two scenes relate. The style's motion intensity sets the energy (under 40 calm, under 70 medium, else high); the energy picks one primary transition for related scenes and one accent for a change of topic (another register) or the turn, inside the style's allowed list: calm = crossfade + wipe (0.6 s), medium = push/slide + zoom or wipe (0.4 s), high = zoom/whip-pan (0.25 s). The wind-down returns to a gentle crossfade, the outro is the slowest and simplest (dip to black when allowed). The hook still ends on a hard cut, cuts inside scenes stay, never two transitions in a row, at most about one every 20 s. A drawing that opens with its own move (whip, zoom, pop, ink, glitch, slide) is the transition, so the edit cuts into it. Every reason names the energy and the pair.
- **Every transition renders (`render.js` `XFADE`).** crossfade = `fade`, dip-to-black = `fadeblack`, push = `slideleft`, slide = `coverleft`, zoom = `zoomin`, whip-pan = `hblur` (motion blur), wipe = `wipeleft`; the proxy uses the style's default the same way. `match-cut` and `morph` stay unexecutable (refused by the edit op).
- **Active-word captions (`captions.js` `assParts`).** For styles with `activeWordHighlight`, words wait dimmed and light up as the narrator says them (ASS karaoke on the caption's word times, measured when ElevenLabs timed them); the hero word (the caption's one emphasis) lights in the accent with a 0.26 s pop. A caption the owner corrected to other words is shown whole.
- **Voice-over carve (`music.js` `mixGraph`).** The music makes room for the voice only where speech lives: it is split at 300 Hz and 4 kHz, the middle band is ducked under the voice (twice the duck ratio) and the bass and the top stay; the whole bed dips a little as well (a third of the ratio). Measured on pink noise under a 2.5 kHz voice (medium): the speech band drops 8.4 dB, the bass 3.1 dB. Readiness needs `acrossover`. One fixed speech band; HyperFrames analyses the voice's own bands (a later upgrade if a bed still masks).

Not taken: the HyperFrames caption themes as presets (our captions already follow the style's palette and ink), its registry blocks, LUT grading, shader transitions (FFmpeg's xfade set covers the catalog's push, cover, zoom, blur and wipe families).

## 16. Stickman looks and the drawing hand; hand-drawn as an illustrated explainer (0.29.0)

Owner review of 0.28 (2026-10-15): the hand that draws belongs to the **stickman** engine as an option, it looked broken and basic, the stickman engine gets the styles of two reference videos, and the **hand-drawn** engine must be its own style (a third reference) - every engine keeps its own visuals and its own editing. The references are analysed in [research/stickman-and-handdrawn-references.md](research/stickman-and-handdrawn-references.md).

- **Stickman looks (style `drawing.look`).** `classic` (the cartoon finish), `whiteboard` (finish `board`: black marker on a white board, places as line art with a touch of colour, everything drawn on one thing after another), `storybook` (finish `story`: warm paper with grain and a soft vignette, warm muted places, bean-bodied characters with bigger round heads, a `chapter` card text style for "Level 1: The Runner"), `doodle` (finish `doodle`: thick uneven marker, big round eyes, a faint place over a bold coloured ground). Each look has its own launch style (launch library v6: **Stickman · Whiteboard**, **Stickman · Storybook**, **Stickman · Doodle**) with its own pacing, transitions and palette, and its own planning brief for Claude (`engines.js` `LOOKS`, given to the plan, the continuity review and the story director when stick figures lead or mix). A style without `drawing` draws the classic look without the hand, as before.
- **The drawing hand (style `drawing.hand`; on in Stickman · Whiteboard).** A cartoon hand holding a marker, drawn from smooth outlines (back of the hand with the folded fingers' knuckles, the index finger along the marker, the thumb, nails, shading, a shirt cuff). Its physics are a pure function of the shot: `penTrack` draws the shot once on a throwaway canvas at 15 samples a second and keeps where the pen is; `handAt` brings the hand in from the corner before the first line, lifts it and carries it on an arc between strokes (bigger and with a farther shadow while lifted), lets it step back and rest during a long pause, and takes it out of the frame when the drawing is done. One pen draws one thing at a time (a drawing on a word waits at most 0.6 s for the one before it), places fade in under the pen so the hand only draws the action, and words are written letter by letter with the pen moving up and down through each letter. Never in the hand-drawn or motion engines.
- **Hand-drawn engine (finish `ink`, reworked).** An illustrator's clean ink line (no boil), flat colour with coloured-pencil shading on the side away from the light and a light hatch; white paper. Annotations as new text styles: `sticky` (a sticky note), `tag` (a price tag on its string) and `callout` (an arrow-shaped tag); a prop's `label` becomes handwritten capitals with a small curved arrow, placed on the side with fewer words; a text `label` is handwritten capitals; arrows may be `dashed` connectors; props may carry a cute `face`. People are cartoon people (a smaller head with a skin tone, a shirt on the body, sleeves and trousers as filled tubes, hands and shoes). No lit stage behind a lone object. The Hand-drawn Canvas launch style follows (launch library v6: white paper, 2-5.5 s shots, default cut) and the planner gets the hand-drawn brief (`ENGINES.handdrawn.plan`).
- `sketch.js` VERSION is `drawn-scene/10`.

Not done: the stickman looks have no look-specific sets (storybook relies on the story's kit places for fully illustrated places); faces on objects sit at the object's centre; the hand has one skin tone and sleeve.

## 17. One card per engine; the hand-drawn engine grows (0.31.0)

Owner review (2026-10-16): the stand-alone **hand-drawn engine** (illustrated objects, the Mr. Finance family) and the stick figure drawn by a hand (a **Stickman** feature) are two different things; the Style Library must show the main editing engines only, with each engine's features inside its own card; look for more hand-drawn styles; make a 30-second hand-drawn video.

- **Style Library.** The three separate launch styles of 0.29 (Stickman · Whiteboard, Storybook, Doodle) are gone from the launch library (v7). A copy the owner never approved, assigned or revised is retired automatically and leaves the list. Every card lists its engine's features (`RENDERERS[...].features`); a Stickman or Story Mix card also shows its stickman look and whether the hand draws. In the editor, the **Stickman engine features** section (only on stick-figure styles) picks the look and the hand; choosing a look fills in that look's recommended colours, shot lengths, transitions and motion (`LOOK_PRESETS`, `vocabulary.lookPresets`), which the owner can still change.
- **More hand-drawn styles** (research/stickman-and-handdrawn-references.md section 5: Mr. Finance's older keyword look, Sprouts/MinuteVideos ink whiteboard, MinuteEarth, Primate Economics). New in the engine: `keyword` (one big hand-lettered word in a top corner that names the beat, written out by the pen), `versus` (a divider drawn down the frame with its word in a circle, for side-by-side comparisons), the prop `head` (a head in profile to put a thought or a scene inside); the hand-drawn brief adds colour for meaning, corner chapter labels and one metaphor world per video. `drawn-scene/12`.
- **Render fix (found by the demo render, 2026-10-16).** A drawing browser restarted after a stall kept its "drawing code loaded" note and failed with "MOTION is not defined"; `start()` now resets the page state, so the restarted browser gets the drawing code again. Resetting the page after a designed (atelier) shot waits up to 10 s and counts as a stall when it never comes, so the existing restart-and-redraw handles it.
- **White paper first (demo review, 2026-10-16).** On the hand-drawn engine a place is faint line art with a touch of colour (60% of its usual strength), a mood is a light touch (35%), and a keyword keeps 5% of the frame from the edge so the camera push never cuts it. `drawn-scene/12`.

## 18. Whiteboard animation, the illustrated stickman look, and every transition for every engine (0.32.0)

Owner review (2026-10-16): taste must not be hard-coded (the colourful city of the demo was better than the plain paper the program forced); the illustrated food-truck video looked like coloured stick figures, so it belongs to **Stickman**; the **hand-drawn engine** is whiteboard animation (owner tutorials, research section 6) plus the After Skool dry-erase look (research section 7); every engine may use every transition, effect and cut, chosen by the program.

- **No hard-coded taste.** The 0.31 "white paper first" rule is gone: places and moods draw at full strength on every finish. Instead every planner brief carries the TASTE line (`engines.js` `promptGuide`): references are ideas, never rules; Claude chooses places, colour, composition, effects and transitions that make each scene appealing and catchy, and says why when it matters.
- **Stickman look `illustrated`.** The illustrated-explainer drawing of 0.29-0.31 (ink + coloured shading, handwritten labels, cartoon people) is the Stickman look `illustrated` (finish `ink`, `LOOKS.illustrated`, `LOOK_PRESETS.illustrated`).
- **Hand-drawn = whiteboard animation** (finish `wb`). People are drawn as people (`drawPerson`: proportioned body from tube outlines, shirt torso, collar and tie, belt, shoes, an oval head with ear and nose, mitten hands, outfits and hair from the cast), never stick figures. Words are handwritten, fills wash in after the line, and the drawing hand (style `drawing.hand`) works in this engine too. Five whiteboard looks (style `drawing.board`, editor "Whiteboard look", `engines.js` `BOARDS`): `cartoon` (colour cartoon, the default), `marker` (black marker, white inside the lines), `pencil` (grey graphite in two light passes, pale colour, the hand holds a pencil), `framed` (an aluminium board frame and marker tray), `dry-erase` (After Skool-style marker hatching and caricature heads). The launch style is "Hand-drawn Whiteboard" (launch library v8).
- **Every transition for every engine** (`transitions.js`): 43 transitions, each mapped to one of 39 FFmpeg xfade drawings the pinned build draws (a render test draws every one). Every renderer supports all of them and every launch style allows all of them. Claude may give each scene a `transition` in the plan (only names the style allows are offered, with what each one says); the editing brain uses Claude's choice first, then its own energy-based fallback. The brain no longer turns transitions into cuts by itself (`transition-variety` is gone; `transition-overuse` is listed only when nearly every change is a transition, with a one-click fix). Older names (`push`, `slide`, `zoom`, `wipe`) still work.
- **Bigger drawing vocabulary** (`drawn-scene/13`): 19 new expressions (panic, terrified, furious, exhausted, embarrassed, proud, skeptical, hopeful, awkward, relieved, curious, amazed, jealous, guilty, sick, dizzy, focused, shy, mischievous), 7 new moods (warm, sunset, night, mystery, calm, hope, retro), 6 new camera moves (tilt-up, tilt-down, crash-zoom, dolly-in, handheld, ken-burns), 10 new shot openings (whip-up, whip-down, zoom-out, slide-down/left/right, drop, iris, flash, shake) and 8 new effects (impact, lightning, explosion, fire, dust, wind, spiral, crack). Near-miss names map to the new real ones (`FACE_NEAR`, `FX_NEAR`). A browser test checks that every camera move, opening, effect and mood changes the picture.
- **Same place, no flash (demo review).** Under the drawing hand a shot's place used to fade in from white for 0.3 s at every cut, which flashed white between two shots on the same street. At render time `Sk.carry` marks a shot in the same place as the shot before (`holdSet`), and its place is on screen from the first frame; only a new place is drawn in.
- **Honest limit.** The owner's whiteboard references make their pictures with AI image/video models. The program draws its own (free, word-timed, consistent), so its people are simpler than an AI illustration. An AI picture revealed by the program's drawing hand is possible later; it needs an image provider key and costs per image, so it waits for the owner's decision.
