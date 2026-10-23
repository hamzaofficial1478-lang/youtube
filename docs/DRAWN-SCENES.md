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

## 19. Paid pictures inside drawn shots (0.33.0)

Owner request (2026-10-16): a 40-second video that shows every hand-drawn look, made for quality, showing the difference between free and paid pictures; the program must know where a paid picture is worth it. The owner has a ChatGPT subscription, not an OpenAI API key, and the program cannot use a ChatGPT subscription, so the paid picture is drawn by Claude on the owner's connected Claude subscription (paid in tokens). It suits whiteboard animation: the hand traces the picture's real outlines, the way whiteboard tools draw vector art.

- **Free and paid.** Everything the drawing vocabulary can show (people acting, objects, words, numbers, diagrams, effects) is drawn by the program for free. A shot that needs more (a whole place, a dramatic moment, a complex machine, a crowd, an emotional close-up) may carry one `picture` element: `describe` from the planner, and `art` drawn by the illustrator.
- **The planner decides.** It is told the video's picture budget (visual settings: pictures per minute, default 3, 0 turns them off) and when a picture is worth it, spreads them one per scene first, and says why in the shot's notes. The continuity review knows the element.
- **The illustrator** (`illustrate.js`, `scene-room.illustrate`): one Claude answer per picture, inside its own token reservation (`intelligence_usage` kind `picture`, picture token limit in visual settings), with the shot's words, its whiteboard look, the palette, the story's world and cast. The answer is data only: SVG path data (commands and numbers) and #hex colours, 6-220 shapes, checked in Node before anything draws it. A failed picture is asked again once with its findings; one that still fails, or is past the budget, is removed and the shot keeps the program's free drawing (a shot that was only its picture is drawn from its words). Redraws of planned shots illustrate their new pictures within what is left of the budget.
- **The engine** (`drawPicture`, `drawn-scene/16`): the picture's shapes are measured once per shot on hidden SVG paths; the hand traces every outline in the illustrator's order (a finished shape hides the lines behind it, as on paper) and each shape's colour washes in just behind the pen. Tracing takes 2.2-4.2 s but never more than 45% of the time the picture is on screen, so the finished picture holds for most of its shot (demo review: colour first arrived just before the cut). A background shape that fills the picture (sky, wall, ground) is laid down as colour without an outline, so a picture never reads as a card stuck on the board; an effect aimed at a picture keeps its own size instead of covering it. Black marker keeps it line art, pencil draws grey lines with pale colour, dry-erase colours the big shapes with marker strokes, colour cartoon and framed show full colour. A shot may name its own whiteboard look (`sketch.board`), so one video can change look where the story needs it.
- **Never paid twice (found in the demo, 2026-10-16).** A plan stopped mid-way (the session closed while four pictures were drawn) lost its finished pictures. A plan job now keeps its finished continuity review (`scene_plan_jobs.reviewed`) and each finished picture (`plan_pictures`), so a deliberate retry reuses them; the stopped picture's and frame's own reservations are marked unknown at restart instead of staying reserved.
- **Paid picture for one shot (Room 04).** The owner can upgrade any drawn shot: "Paid picture" asks for what it shows, its size and whether it replaces the other drawings (the shot's words stay). Claude draws it once inside its own reservation (`pictureForShot`, a plan job with `scope.picture`); every other shot keeps its ID and drawing; a picture that fails its checks twice changes nothing.
- **Over the reservation.** A plan whose reported use goes over its reservation is kept, with the real use settled and a warning on the job (raise the planner or review limit), never thrown away: the tokens are already spent (demo: a 139,503-token plan was lost to a 130,000-token reservation before this).
- **Room 04** lists a shot's picture (or "not drawn yet") and the visual settings have pictures per minute and the picture token limit.
- **Not built:** OpenAI images inside drawn shots (needs an API key; the montage `ai-image` source already generates OpenAI pictures with a key).

## 20. Mix of an engine's looks; paid pictures in every engine (0.34.0)

Owner request (2026-10-17): the paid-or-free judgement belongs in every editing engine, without making the video boring; and each engine with several editing styles gets a choice: one specific style, or Mix, where the program uses all of that engine's styles in one video.

- **Mix.** Stickman's look (`drawing.look`) and the hand-drawn engine's whiteboard look (`drawing.board`) both offer `mix`. Claude then names a look on each shot (`sketch.look` for stickman shots, `sketch.board` for hand-drawn shots) chosen for what the scene needs, and changes look only where the story changes (a chapter, a flashback, a story inside the story, a change of mood or place), keeping one look for a whole scene and saying why (`engines.js` MIX_RULE). A shot without its own look draws the classic look or the colour cartoon board. The Style Library cards list "Mix of all looks", and the style editor explains the choice.
- **Paid pictures everywhere.** The picture budget applies wherever drawn shots are allowed, also to drawn cutaways in a footage video. The illustrator is told the shot's engine and look: stickman pictures put the cast in as stick characters and follow the look (storybook warm and muted, doodle thick marker, whiteboard black line art, illustrated ink and pencil); motion pictures are flat vector design without outlines; whiteboard pictures follow the board. The engine shows them its own way: traced (with the hand when the style has one) and coloured per look, or, in motion graphics, built in shape by shape, each growing into place (`buildPicture`). The planner keeps the rhythm: a picture is followed by free shots that act, count or move, never a run of pictures.

## 21. Motion engine v2 (0.35.0)

Owner request (2026-10-17): after the hand-drawn engine, build the motion-graphics engine to the same depth; it works best together with the other engines, and motion graphics are needed in every engine, mostly documentary and montage; study more motion-graphics channels (owner links: MagnatesMedia, OverSimplified). Research: research/motion-graphics-references.md.

- **Five designs, or Mix** (style `drawing.design`, shot `sketch.design`, `engines.js` DESIGNS): **vector world** (gradient backdrop, glow, floating particles, flat people without outlines), **infographic cartoon** (bright sets, people with thin outlines, bubbles, ratings, dials, counters), **kinetic type** (sentences build word by word, key words on accent bars, big numbers, colour fields), **documentary collage** (cut-outs with a white sticker edge on a bold colour field with halftone and grain, giant poster words behind, stamps, particles), **data desk** (dark panels, titled charts, timelines, networks). Every design draws from the video's own palette, so a mix stays one film. Mix uses the same rule as the other engines (one design per scene, a change for a reason).
- **People** in motion shots are flat-design people (the whiteboard engine's people drawn without outlines, or with thin outlines in the infographic design), never stick figures; the stickman engine keeps its stick characters.
- **New tools for every engine** (the vocabulary is shared, so stickman, hand-drawn and documentary cutaways can use them too): `chart` (bar, line, area, pie, donut, rating; bars grow one after another, a line draws, a pie sweeps, stars fill; the planner may use only numbers the narration says), `timeline` (the bar draws, medallions pop, the current event in the accent), `network` (nodes pop in, links draw with a flowing pulse), text `statement` (a sentence of up to 90 characters, *key words* on accent bars) and text `poster` (giant words, listed before a cut-out so they sit behind it).
- **Planner room.** With the bigger vocabulary Claude thought for 31,000 tokens on a 47-second plan and the answer was cut off after 640 tokens. Plan answers now get up to 64,000 tokens, the default planner limit is 100,000, and an answer cut off while thinking says so and names the setting that fixes it.
- **Launch library v9:** the Motion Graphics launch style uses Mix of every design.
- **Not built:** maps (countries, territories, routes, pins on real geography) need country shapes from a public-domain data package (Natural Earth, through the `world-atlas` npm package); motion overlays on stock footage (the montage engine) need footage first (stock or AI keys); an OverSimplified-inspired stickman look (our own round-headed history-cartoon people, crowds and painted places) is the proposed next step for that style.

## 22. History cartoon, maps and crowds; what the motion demo taught (0.36.0)

Owner request (2026-10-17): explain why two paid pictures cost about 84,000 tokens; study more channels like OverSimplified and build that style; add maps (approved: "add that"); a 40-50 second demo of all styles at 720p with the focus on the hook and the quality of the pictures.

- **Where the tokens went.** The 84,000 were 36,078 for the scene plan with its continuity review (one answer decides every scene, design, transition and where paid pictures go; there is no separate step for that) and 47,938 for the two pictures (S06A 21,830, S02A 26,108). Each picture's drawing data is about 4,000 tokens; the rest was Claude thinking at high effort. The same picture drawn again: high 26,108 tokens, medium 13,149 with nearly the same detail, low 3,962 and plain. Pictures are now drawn at medium effort (`ai.js` TASK_EFFORT), which roughly halves their cost.
- **History cartoon** (stickman look `chronicle`, research/motion-graphics-references.md "History cartoons": OverSimplified, History Matters, Sam O'Nella Academy, Extra History): big round heads on short bodies (`drawPerson` with the `chibi` skeleton), skin tones, period costume (tricorn, bicorne, bowler, peaked cap, spiked helmet, turban, laurel; officer coats with epaulettes and a sash, armour, robes; handlebar moustaches), painted places at full strength with a warm wash. Its planning brief carries the method: the comedy is in the cut (straight line, then the visual punchline), name labels for every key person, the same costume all video, wide / medium / gag-insert rhythm, chapters opened by a card or a map, the voice decides the push and the snap. Our own drawings: no channel's characters or signature look.
- **Maps** (`maps.js`, element `map`, every engine): Natural Earth 1:110m country shapes from the pinned `world-atlas` package, decoded in our own code. Areas (an empire or an alliance is one area made of today's countries) colour in from their middle on their words with a darker edge; a country may wear an expression and react; routes sweep as thick arrows on a curve; pins drop; labels never pile up; views fit what is named or use a named region. Each finish has its own map: parchment for the storybook and history cartoon, outlines for whiteboards, flat dark or light for motion designs.
- **Crowds** (element `crowd`, every engine): 3-24 people in rows with varied looks or one uniform and helmet, one pose with each person's own rhythm, an optional banner held up.
- **Free plans** draw a map when a line names countries; each colours in as it is said and a character points at it.
- **Readability and layout** (motion demo review): chips, tags, callouts and sticky notes write dark on dark palettes (labels were unreadable); light words get a dark edge; motion designs draw their place at full strength (a bakery read as mud on the dark vector backdrop); side-by-side words share the width (two titles of a split sat on each other); a later text on the same spot replaces the earlier one; charts, networks and maps make room for words above them and step aside for a character beside them; a shot shows something within 0.35 s.
- **Checked twice, the same drawing**: a stored plan is checked again when it is drawn and rendered. A map now reads its own stored steps and view back, and network links keep their node numbers from 1 (0.35 shifted them on the second check, so the motion demo's two shops lost their link); a test checks every element kind twice.
- **The hook**: the planner is told the first 3-5 seconds decide whether the viewer stays - open on the most striking picture for the first words, something moves in the first second, the first cut within 1.5-2.5 s, the best visual (a paid picture, a map reveal, the boldest word) earns its cost there.
- **Not built**: historical borders (a map uses today's countries); motion overlays on stock footage (needs stock or AI keys).

## 23. One engine per style; motion graphics as a layer; the Documentary engine (0.37.0)

Owner review (2026-10-18) of the all-styles demo:
- Mix was misunderstood. The story mix of all engines is good and stays. But "mix" inside an engine must use only that engine's features (a stickman video with Mix uses only stickman looks).
- The owner must see clearly where each kind of mix is chosen.
- The pepper background repeated. The king stood in a room with a TV; he belongs on his throne, in his castle, shown like a film (the empire, then into the window, then the king thinking).
- The maps were too short.
- Motion graphics are not an engine with its own style. They are the motion layer every engine uses: typography, background animation, layering, maps.
- The documentaries belong in a Documentary engine: the cartoon documentary (OverSimplified), real footage with motion graphics (Vox, MagnatesMedia, Dhruv Rathee) and StickOrbit's painted history.

- **One engine per style** (`engines.js` `engineScope`):
  - A Stickman or Whiteboard style plans drawn shots of its own engine only: no footage, no atelier frames, no other drawing engine. Claude's other-engine shot is drawn in the style's engine with a named warning, and an owner edit is told plainly.
  - A Documentary style uses its footage (when a stock or image key is connected) and its drawn looks.
  - The Story Mix style mixes every engine, each in its own looks.
  - An atelier style keeps its guests: people stay in drawn engines.
- **Where the owner chooses**:
  - Each engine card says that its Mix uses only its own looks, and that the Story Mix style is the mix of every engine. The Story Mix card says "Mix of ALL engines".
  - The style editor of each engine starts its features with the same explanation. The look picker offers one look, or "Mix: every look of this engine".
- **Motion graphics** are a layer of every engine (`MOTION_LAYER`, in every planner brief): kinetic words, animated backgrounds and moods, layered depth, maps, charts, timelines, networks, crowds, effects and transitions, drawn in the engine's own look. The Motion Graphics launch style leaves the library (retired when the owner never used it); a style the owner made on it keeps working.
- **The Documentary engine** (the former Documentary Montage card, adapter `ffmpeg-montage`; the drawn shots keep the internal key `motion`). Looks in the style (`drawing.design`), or Mix of them:
  - **footage with motion graphics**: stock footage and photos with maps, kinetic headlines, number callouts, layered cut-outs and charts; needs a stock or image key, and Pexels and Pixabay keys are free.
  - **cartoon documentary**: the 0.36 history cartoon, moved from the stickman looks; finish `chron`.
  - **painted story**: warm, cinematic painted places, a recurring guide character, slow pushes, maps on tables and scrolls; finish `paint`. StickOrbit paints every scene with an AI image tool, so this look is closest to it with an image connection or many paid pictures.
  - **vector world**, **infographic**, **kinetic type**, **collage** and **data desk**, from 0.35.
- **Places of the past** (sets): throne (pillars, banners, a lit window, a red carpet, the throne), castle (a castle with a big lit window above its village and land), chamber (stone, a tapestry, a candle, a table), harbor (sailing ships, docks, crates), market (stalls under striped awnings, spices), village (cottages with smoke, a path), battlefield (smoke, banners). There is a new prop `galleon`, a sailing ship; the old `ship` is a steamship and counts as modern. A story of the past now moves a place of today (room, home, office, street, city and the rest) to its period place, unless the line is about today. `early-modern` counts as the past (the pepper demo's king stood in a room with a TV because 1497 was early-modern).
- **Scene building**: the planner's SCENE BUILDING line asks for film-like scenes. Show the place before the people, give a key person the place that says who they are, and keep abstract backdrops rare and never twice in a row. The abstract backdrop now picks one of six patterns per shot (stripes, glow and rings, halftone, soft shapes, grid, waves) from the shot's own seed.
- **Maps**: the planner's MAPS line asks for at least 3 seconds per map shot, and a shorter map shot is named in the plan's warnings. Maps fly in (the view settles over 1.4 s), and their steps without words wait for it.
- **Not built**: AI-painted scenes for the painted story (they need an image API key); motion graphics on real footage (they need a stock or image key); further motion-layer upgrades (typography and background animations), which the owner wants next.

## 24. The motion layer, upgraded (0.38.0)

Owner request (2026-10-18): "proceed to upgrade motion graphic animation". This means the motion layer that every engine uses (0.37): typography, background and layering animations as Vox, MagnatesMedia and Dhruv Rathee use them. Research: research/motion-graphics-references.md "Motion layer animation" (Vox and Dhruv Rathee storyboards; tutorial titles that name the techniques). Everything is in the shared vocabulary, so Stickman, Whiteboard, Documentary and the story mix all use it in their own look. Frames stay pure functions of time.

- **Words** (text `animate`; titles, notes, numbers, pops, keywords, highlights, statements and posters; handwritten finishes keep writing with the pen):
  - `rise`: words rise from a mask line, one after another;
  - `letters`: letters pop in with a little overshoot;
  - `typewriter`: typed at 24 letters a second with a blinking cursor;
  - `wipe`: a highlighter bar sweeps across and pulls back to leave the words;
  - `slam`: lands hard with motion trails and a camera shake;
  - `track`: a cinematic title whose letters close in;
  - `glitch`: red and cyan copies jitter, then settle;
  - `blur`: a focus pull;
  - `focus`: a statement builds, then its key words stay while the rest dims and softens, which is the word focus effect.
- **Textures** (shot `texture`), laid over the finished frame:
  - `grain`;
  - `film`: grain, flicker, dust and hairs, vignette;
  - `paper`;
  - `vhs`: scanlines, a colour shift and a moving noise band;
  - `duotone`: a two-colour archive tint;
  - `leak`: warm light leaks;
  - `grid`: grid paper behind everything else.
- **Depth** (element `layer`): the back layer moves at 0.8 of the camera and goes soft (more when the camera pushes in); the front layer moves at 1.25. With a camera move this gives 2.5D parallax. New entrances: `mask` (revealed through a growing circle), `swing` (swings in from its top), `blur` (focuses in) and `rise` (rises into place).
- **Maps**:
  - styles `atlas` (black land on grid paper, small-caps labels), `satellite`, `paper` and `night`;
  - area and pin `zoom` (the map camera flies to that country or pin on its words);
  - route `icon` (a traveller such as a sailing ship or a plane moves along a dashed trail);
  - pins send out pulse rings, and once an area lights up the rest of the land steps back.
- Key words: every word between the opening and the closing star lights up (before, "*redrew the map*" lit only its first and last words); words on the accent bar are drawn without the dark edge, and neighbouring key words share one bar.
- The planner's MOTION LAYER brief lists these and asks for one or two moves per shot, each on its words.
- **Not built**: footage cards and 3D globes (they need footage; the drawn engine is 2D).

## 25. Film looks, evidence tools, measured motion and skills that reach the video (0.39.0)

Owner request (2026-10-18): take the motion graphics skills of motionmaxxing, the 50+ film styles of lemo-opuscar and
what makes twelve named channels work, and make them part of how every video is made, not packs on a shelf. Research:
research/lemo-opuscar-and-motionmaxxing.md and research/channel-study-2026-10-18.md.

- **Measured motion** (`drawn-kit.js` `K.ease`, from motionmaxxing's measured curves, Apache-2.0 notice in
  vendor/motionmaxxing): a pop leans about 8% past its size, late, instead of bouncing; slides do most of their travel in
  the first frames and settle; growth and rises land softly; leaving is quicker than arriving and accelerates away.
  New entrance `land` (arrives oversized and soft, settles). Counters, gauges and range lines roll one value per frame
  and land (`rolled`). A still camera stays still: a held, still read is a choice the planner may make.
- **Film looks** (`engines.js` FILMS, `drawFilm`): how a medium prints the finished drawn frame, for every engine:
  `silent` (1920s silver, amber whites, flicker, gate weave, scratches, rounded gate), `noir`, `sepia` (albumen print,
  hand-tinted hero), `selective` (black and white, one colour), `newsprint` (halftone dots, spot plate), `riso` (two
  inks), `blueprint`, `woodcut`, `kinescope` (1950s TV), `technicolor`, `album` (1970s snapshot with a white border),
  `screenprint`, `engraving` (lines that swell in the darks, hand colouring), `deco` (gold bands on black). Where the
  medium allows it, what is drawn in the accent colour keeps its colour (the hero); skin is never taken for it. Words,
  documents and charts print solid over the halftone and engraved looks, so they stay readable.
  - The style chooses (Style Library, "Film look"): none, one look for every drawn shot, or "Claude chooses" one per
    video. A shot may name another look (or `none`) only for a change of register, with the reason in its notes. A
    style without a film look keeps its engine's own finish (a film named by Claude is left out with a warning).
  - Footage keeps its own grade for now.
- **Evidence and measuring tools** (shared vocabulary, every engine): `quote` (the speaker's portrait in the cast look,
  name tag, words at a speaking pace, key words lit), `document` (newspaper, letter, report or post; the source the
  narration names, a headline, grey lines, one real line that lights up), `gauge` (a reading whose needle leans past
  its mark and settles, or a list position such as 3/7), `loupe` (a lens that shows a spot of the shot magnified, with a
  leader), `ruler` (a range line from A to B with ticks and a reading that rolls and lands), chart type `units` (an
  isotype of identical marks with the part lit, "1 in 100"), text animation `redact` (black bars lift word by word, key
  words last). Words and numbers on them come from the narration.
- **Planner**: SCRIPT CUES, EVIDENCE and RHYTHM lines in every scene plan; the FILM LOOK line when the style has one.
- **Skills reach the video**: the scene planner, the story director and voice direction receive the owner's approved
  skills (input `skills`) and every job records which ones it used. Skills -> Packs approves a whole pack in one named
  review. New packs: motion-craft (14), film-craft (14), channel-grammar (11 general skills and 12 channel-like
  profiles that reach only a family they are pinned to). `drawn-scene/22`.
- **Not built**: film looks for footage clips, real satellite, LiDAR or microscope data, 3D scenes.

## 26. Engine audit: planner, free planner and a live Claude plan (0.40.0)

Owner request (2026-10-19): check the completed engines - bugs, the brain that builds scenes, animation and originality - before
building the next engine (the Cinematic engine, docs/CINEMATIC-ENGINE.md).

- **Planner prompts** (read for every launch style): frames and art direction were offered to one-engine styles; "neighbouring
  shots never share their primary subject" fought continuity (now: never repeat the same composition; a character may carry a
  run of shots); "a held, still read" fought "something alive" (now: a held shot keeps something small alive); the footage camera
  list was applied to drawn shots (now only footage and images; drawn shots move with `sketch.camera`); the MOTION SHOTS line
  reached engines without motion; "text in the top third" contradicted centred statements, quotes, documents, charts and maps.
- **Free planner** (`Sk.fromText`, rendered for stickman, whiteboard and three documentary looks): a year counted up from 0 (now
  it lands as a `number`; an amount beats a year and counts); "lost at sea" put a person under water (now `storm`; ships, sailors
  and seas are a `harbor`; `ocean` is under water only); documentary shots were always abstract (now they use places too);
  the most relevant prop was skipped on odd shots and the fallback prop repeated (now the best prop always, fallbacks rotate);
  "wipe out profit" showed `chart-up`; the whiteboard pen wrote the key number last (now right after the figure); many people
  get a `crowd`; a turn word (but, however, yet, instead) makes the shot tense with a punch and a worried face. Pops start at
  half size.
- **Live Claude plan** (documentary-montage, 12-sentence business-history script, throwaway workspace, fake narration;
  13,668 read + 5,937 answer + 14,728 thinking tokens, 3.6 minutes): varied and story-led (map with a route, a chart that
  grows to 60x, a ledger document with one line lit, a crowd of 40,000, a timeline of the fall, a recurring governor). Its
  frames showed readability bugs, all fixed in the engine: a shot's mood (light rays, dark grade, vignette) was painted over
  the words, so words now draw above the mood (posters and back-layer words stay in the picture); keywords and timeline labels
  had no edge on dark palettes and vanished on a light place, so they keep a nearly solid dark edge; back-layer words blurred
  out of reading (now only a hint of softness); the word focus effect dimmed the other words to a third (now about half); a
  corner keyword ran into a character's name chip (name chips now count as drawings, and a keyword stops short of one).
- `drawn-scene/23`.

## 27. Word colour, natural media, motion blur and the study of eight repositories (0.41.0)

Owner review (2026-10-19): a poster word was drawn pale white behind a crowd. Why white, when the program could have chosen gold
or a cinematic colour? The owner also asked for a deep study of eight repositories (research/eight-repos-2026-10-19.md).

- **Word colour.** Text elements may carry `color` (`sketch.js` `WORD_COLORS`: accent, ink or a named colour). Claude's near
  misses are dropped with a warning; owner edits are strict.
  - The planner has a WORD COLOUR line, and the continuity review checks WORD COLOUR.
  - A poster without a colour takes the accent, never a pale ink ghost.
  - Word edges follow the word's own colour: light words get a nearly solid dark edge, dark words a white edge (`K.text`).
- **Natural media** (after p5.brush, MIT; `vendor/p5brush/NOTICE`):
  - `K.brush` stamps pencil, crayon and coloured-pencil strokes, with pressure along the stroke, paper grain and side-scatter.
  - `K.wash` washes storybook and painted places in like watercolour: warped translucent layers and a darker rim.
  - Only places are washed (`K.WASH`); characters stay solid.
  - Whiteboard pencil is graphite, doodle outlines get crayon tooth, storybook outlines are coloured pencil. All seeded.
- **Motion.**
  - Zooms grow the area evenly (`K.zlerp`, after Remotion's perceptual scale).
  - Fast moments get a film camera's motion blur: samples across half a frame, more for faster motion, and only while the camera
    moves fast or something slides, drops, swings, lands or slams.
  - Blur is on by default for the Documentary engine's designed shots and off for hand-made looks (photographic blur on thin
    outlines read as ghost copies); style option `drawing.motionBlur`.
  - Style option `drawing.cadence` 'twos' or 'threes' holds each drawing for two or three frames (hand-made or stop-motion
    feel).
- **Fonts.** `fonts.js` reads the installed families. Missing style fonts are drawn in chosen look-alikes. The Style Library
  warns about them. Launch library v12 uses fonts Windows ships with.
- Typed notes grow from a fixed left edge (they slid while typing).
- `drawn-scene/24`.

## 28. The owner's line-by-line review: scene building, lip sync, night and the narrator (0.52.0)

The owner reviewed a 63-second test video line by line (2026-10-21) and rejected it as plain, boring and
unmatched to the script. That video came from the **free rules planner**, which had been used only to test the
machinery end to end. The same script was then planned twice with **Claude's planner**: once as it was, once
with the fixes below. Each result was checked against the owner's 16 points.

**What caused the problems:**
- **The free planner:**
  - it mapped words to stock symbols ("private" became a lock, "year" a calendar, "minutes" a clock, "Earth" a globe, "because" a lightbulb);
  - it put a rotating symbol in shots where nothing was named;
  - it used one generic figure for everyone;
  - it gave a smiling face by default.
- **The engine:** the talking mouth opened on a random rhythm, not on the voice.
- **The world check:**
  - it treated the modern narrator as out of era;
  - it moved the viewer's room ("Tonight, take a pen") into an ancient chamber.
- **Continuity:**
  - `Sk.mend` kept a scene's place without carrying that place's kit drawing, so two shots rendered on a blank backdrop;
  - it called a move between the viewer's world and the story a mistake.
- **Captions:** word times that ran past the narration stopped the edit, instead of falling back to the estimate.

**Fixed:**
- **The owner's standard for Claude** (`Sk.promptGuide`, read by the planner, the story director and the review):
  - WHO IS ON SCREEN: a named person is drawn as that person in their era and place; a narrator or "you" character appears only on lines that address the viewer; only a speaker uses a talking pose; every cast member has a role.
  - KEY WORDS ON SCREEN: the promise, turns, emotions and numbers become animated words; at least one in every two shots.
  - HOLD: about 3.5 s at most without something new; no repeated compositions.
  - LIVING CHARACTERS: turn toward what appears; the face is the emotion of the line, never a smile on anger or mystery.
  - TIME OF DAY: night words show night (the night set or mood, or `nightfall`).
  - ERA AND PLACE: objects, uniforms and arms of the era; places the narration names are drawn; no stock symbol for a concrete word.
- **The continuity review** adds "(7) OWNER STANDARD", the same points as checks on every shot, including white or empty backdrops where the story has a place.
- **Lip sync:**
  - every drawn shot receives its words with start and end at render (`speech`);
  - a talking figure's mouth moves only while words are spoken and rests in pauses;
  - previews without word times keep the old rhythm.
- **`nightfall`** (a new backdrop effect; `drawn-scene/25`):
  - from its word, over about 3 s, the sky darkens more than the ground (so a set's daytime sun disappears and people stay readable);
  - outdoors, the sun sets, the moon rises with a glow and stars come out one by one and twinkle;
  - indoors, the room only darkens.
- **World and continuity:**
  - a line that speaks to the viewer ("you", "your", "tonight", "this video") happens today, so the era check no longer flags or moves it;
  - a move between such a line and the story is not a continuity slip;
  - `Sk.mend` carries the kit item of the place it keeps.
- **Captions:** measured word times that end more than 0.5 s after the narration are not trusted (the labelled estimate is used); a small overshoot is trimmed.
- **The free draft** (labelled in Room 04 as "Rough free draft (test only)", with a warning on every such plan):
  - no stock symbols for words that do not name them;
  - the line's own key word on screen when nothing is named;
  - the face from the emotion words (anger, strange, fear, sad, shock);
  - `nightfall` on night words;
  - the hook's burst behind its key word.

**Checked:**
- **The first Claude plan** (58,114 tokens, 27 shots) had era props, a map, a painted picture and kinetic words. It also had a lock, question marks, a smile on a question, two blank backdrops (the kit bug), and the narrator inside Marcus's room.
- **The second Claude plan** (56,024 tokens, 26 shots, with these fixes) had:
  - a cast with roles (Marcus Aurelius, a modern "You" only on "you" lines, the General, a Young Soldier);
  - helmeted soldiers at the Danube camp;
  - "By the end of this video, *you will know*" as an animated statement;
  - "Marcus Aurelius" as a title in a spotlight;
  - "ANGER" slammed with a fist;
  - a painted picture of Marcus shouting at his soldiers, with "TEMPER";
  - the wax tablet with "private" (no lock);
  - "STRANGER" with a suspicious face;
  - "NEVER MEANT FOR READERS" with the readers crossed out;
  - nightfall three times, "5 minutes" and "19 years" counting.
- **Tests:**
  - sketch tests: the free draft's new choices on the owner's lines, and night and hook;
  - caption tests: times past the narration;
  - drawing, world and scene tests.
- **A test drawing:** nightfall outdoors and indoors, and the mouth open on words and closed in the pause.

**Not built:** rivers on maps (the map data has countries only; a river the narration names is drawn in the scene or a picture).

**Found while proving the fixes (render):**
- A master whose edit has a **dissolve** transition could never be approved: FFmpeg's dissolve draws new random noise at every size, so those frames never match the preview, and "matches the approved preview" cannot be accepted away. `R.previewMatch` now skips frames of dissolve transitions (`exempt`, the join's window ± 0.1 s) and still checks everything else. The real 1080p master of this test then matched: 0.979 on average, lowest 0.934, 43 dissolve frames skipped.
- An unexpected render error now names its cause and goes to the program's error log, instead of only "The render failed.".
- An interrupted master resumed from its kept parts after the program stopped.

## 29. Visual rules per look: pictures that belong to their engine and style (0.56.0)

Owner review 2026-10-22: a painted Roman camp behind a stick figure looked real while the figure is a cartoon, "that
combo will never resonate". Every image, place, background and object has to be made in the engine's and style's own
look; real photos belong to the footage documentary (Vox, MagnatesMedia), not to a stickman cartoon.

- **`visual-dna.js`** holds the visual rules of every look: the five Stickman looks, the five whiteboard looks, the
  Documentary looks (footage, cartoon, painted, vector, infographic, kinetic, collage, data), the atelier and the
  Cinematic engine. Each says what kind of pictures it uses (drawn in the look, real photos, or photo cut-outs), how
  its places, objects and people are made, how its scenes move and what never belongs in it (for the classic Stickman
  look: flat 2D cartoon with outlines as thick as the figures' limbs, a stage-like set, no photographic detail, no
  realistic light, no 3D, no painterly texture).
- **The planner** receives the rules of the style's look (every look for a mix; the footage look beside the designed
  looks for a documentary) as VISUAL RULES lines, so places and pictures are described in that look from the start.
- **Painted pictures** (`Il.paintPrompt`) carry the rules, the film look the frame is printed in afterwards, and the
  video's **style key**: the first painting that passes is attached to every later painting of the plan, so one video
  keeps one style (`plan_pictures` key `paint:style-key`; Codex receives it as an attached image).
- **The art director**: each painting is shown to the plan's AI (Claude) with the rules before it is used
  (`Dna.checkMessages`, its own reservation `CHECK_TOKENS` 12,000, answer `{fits, problems}`). A painting in the
  wrong medium is painted once more with what was wrong; a second miss leaves a picture card to Claude's drawing and
  leaves a backdrop out. A check that cannot run keeps the painting with a note to look at it in Room 04.
- **Claude's own vector pictures** (`Il.messages`) carry the same rules.
- **The Style Library** shows the rules of each style's look ("Visual rules of this look").

Live check (2026-10-22, one picture on the owner's ChatGPT plan, about 15,000 tokens, and one art-director answer on
the Claude plan, about 3,300 tokens): the same Roman camp, painted under the classic Stickman rules, is a flat cartoon
with bold outlines that matches the stick figure; the art director passed it. Not built: footage-look AI photos for
montage shots through ChatGPT (montage `ai-image` still needs an OpenAI key); images taken from websites, social media
or YouTube (they need licences; see the owner question in BUILD-PROGRESS.md).

### 29b. Footage painted by ChatGPT, the real-world rule and 720p previews (0.57)

- Without a stock connection, a documentary drawn shot may use the footage look (`"design": "footage"`): its place is a
  photo-real picture with `"backdrop": true` painted by ChatGPT under the footage rules (an editorial documentary
  photograph), with the motion layer over it. The planner is offered it in the Documentary mix when ChatGPT paints.
- REAL WORLD (owner standard 2026-10-22): every scene obeys physics and nature inside its own look (things rest on
  something, true sizes, water, smoke, fire and daylight behave, people and animals move as they really move, every
  picture shows exactly what the words say). It is a planner line and a review check.
- Previews can render at 720p (`R.PRESETS.proxy720`, render scope `resolution: 720`, "Preview size" in the render
  dialog); masters stay 1080p and compare against a preview of any size.

## 30. Fixes from the documentary test (0.58.0)

The 69-second documentary test of 0.57 showed four faults in its frames. Each one was traced to its cause in the
drawing engine and redrawn from the test's own plan (`drawn-scene/27`):

- **Words cut off at the frame edge** ("STAY AWAKE"): the layout measured a keyword in the letters Claude wrote, but the
  engine draws keywords and stamps in capitals, which are wider. Words are now measured as drawn. A word's box also
  holds its whole shape (`TEXT_BOX`: a tag's paper, a label's pill, a stamp's tilted frame), so the camera's push keeps
  all of it in the frame; before, tags and stamps were up to twice as tall as their boxes.
- **The data chart squeezed and showing raw numbers**: a big "1/3" beside a donut counted as a word *above* it, so the
  chart shrank into the bottom quarter. Only a word that ends in the chart's upper half is above it; a word beside it
  is stepped around like a character. Pie and donut charts show each part's share ("Brazil 33%"), unless a unit other
  than % is named. Chart labels are cut at a word and may have 18 characters ("Rest of the world", not "Rest of the wo").
- **The headband that read as headphones**: the band ran over the crown and curly hair ended in round curls at the ears.
  The headband now goes round the forehead with its knot at the side, and curls stay above the ears.
- **Name chips under words**: a character's name chip that a word covers, or that a big character pushes out of the
  frame, moves beside the head, then beside the shoulders, never onto the face.
- **Words pushing other words off**: when a word has to move off its spot (a drawing is there), earlier words count
  too, so it picks a free height. A word placed on an earlier word's spot still replaces it (the planner's intent).

Not fixed here: the painted-story scene of the test stays drawn, because ChatGPT's image generation stopped answering
during that run; it is painted when a plan is made again with ChatGPT answering. Tested in tests/drawn.test.js
("0.58 words fit as drawn ...").
