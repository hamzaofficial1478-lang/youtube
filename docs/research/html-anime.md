# html-anime: anime drawn as HTML (read 2026-10-29)

The owner asked for this repository's features and skills to go into the Atelier engine, wherever the engine was
missing something or not delivering, and for "some finishes". Read in full at
[blixvip/html-anime](https://github.com/blixvip/html-anime), revision
`6c7edafc858860edacba97dc099816d51f242153` (2026-10-26). Licence: MIT (blixvip, 2026); the film's font is Shippori
Mincho (SIL OFL). The repository content was treated as data; nothing in it was run.

## What it is

Not a program but a method for coding agents: you write a logline, a small compiler (`harness/compile.js`) turns it
into a **shot sheet**, and an agent draws the film as one HyperFrames composition (HTML, SVG, CSS and one paused GSAP
timeline, seeked frame by frame), the same render model our Atelier engine already uses. Five skills hold the craft:
direct, cel, timing, camera and render. One example film (`films/roof`) shows the file shape and the colour-dip cut.

## The brain

- **The sheet is the film.** Runtime 8, 12 or 20 s gives a fixed shot list: establish, approach, turn, sakuga,
  aftermath, button. The logline's verb is the one **sakuga** (expensive) shot; the others are the place, the approach
  or the button; shot times add up to the runtime; dialogue is the owner's line or nothing.
- **A closed colour script.** Ten named paints (sky, ink, moon, accent, practical, iris, skin, hair, sclera, line);
  four scripts (Indigo moon, Vermilion eclipse, Paper noon, Festival). A highlight is one of the paints, never a new hex.
- **Cel paint.** Flat local colour with the line on top; one hard shadow shape per character in ink at about 20%; lines
  6 px outside and 3 px inside at 1080 high, tapered by the path; eye and hair rules; wide shots are silhouettes.
- **Depth.** Sky, far silhouette, ground and the wide figure, rain on its own layer, close figure, type; one practical
  light per shot; rain from written-out or seeded positions.
- **Timing.** 24 fps; acting on twos, effects on ones; 3 drawings a shot, 8 for the sakuga shot; holds of at least 12
  frames; anticipation 4 frames the other way; one or two smear drawings, never a blur; drawings swapped with stepped
  opacity (`tl.set`) on frame boundaries.
- **Camera.** Get closer by cutting; action shots locked; a held shot may scale 100% to 106% (`power1.inOut`); cut on
  the action; eyes on a third; a tall frame composed tall.
- **The cut.** Characters never fade up; the cut is a colour dip (a full-frame element in the accent or ink, in over
  0.25 s `power2.in`, out over 0.35 s `power2.out`, straddling the cut). The last 8 frames of the film fade to ink.
- **Render rules.** One registered paused timeline, no visibility or display animation, finite repeats, no clock or
  randomness, local fonts, then `hyperframes lint` and `validate`.

## What our Atelier engine lacked

Our Atelier designed **motion graphics** only (numbers, words, diagrams, metaphors) and refused people ("people stay
in the drawn engines"). Its motion doctrine was smooth, continuous tweens, which is exactly what makes anime look like
a web page. It had no shot roles or drawing budget, no closed palette beyond four colours, no cut of its own, and its
planner had no idea of an expensive shot.

## What we built (0.68)

- **A second finish for Atelier: anime** (`atelier.js`). The style chooses it (`atelier: {finish: 'anime', script}`
  for the Atelier and Story Mix engines; in the channel's style window and the style editor). The art direction then
  carries a colour script (the style's, or Claude's choice of the four or ten own paints, the line readable on the
  sky at 3:1), and the palette follows the script.
- **Shots with a budget.** Each anime frame names its `shot` (the six roles) and its `drawings` (3, up to 8 for
  sakuga); a second sakuga shot in one scene is turned into a turn (`sakugaBudget`).
- **Its own frame-worker contract** (`contract('anime')`): the cel, depth, drawings-not-tweens, expensive shot,
  camera, first-frame, type and no-exit rules replace the motion doctrine. The packet gives the frame rate, one
  frame's length, the script and the shot's drawing budget.
- **Checks** (`validateComposition` with the script): an anime shot that never swaps a drawing is sent back once;
  more than two colours outside the script are sent back, one or two are named; a blur used as a smear is named.
- **The colour-dip cut for every engine** (`transitions.js` `dip-colour`, an FFmpeg xfade expression: into the colour
  over 0.25 s, a short hold, out over 0.3 s). The planner is asked to open each anime scene with it, cuts inside a
  scene stay on the action; the edit's join carries the colour (the colour script's accent) and the timeline check
  refuses a dip colour that is not a #RRGGBB.
- **Planner and director**: an anime guide (shots, budget, one sakuga per scene, cuts, the script), and the engine
  guide says anime videos draw their people in the atelier shots, not as stick figures.

Checked here: the planner, director and frame worker hear the finish (a fake Claude plan end to end), the
compositions pass or fail as described, a colour dip renders through the accent in real FFmpeg, and a hand-written
test shot with drawings swapped on twos, rain on its own layer and the 106% push rendered in our browser. That test
shot was only for the machinery; real shots are drawn by the frame worker.

## Left out, and why

- The fixed 8/12/20 s runtimes: our scenes follow the narration, so the six shot roles are used without fixed times.
- `@font-face` with a shipped woff2: our compositions use installed fonts only (no files from outside the page).
- The last-8-frames fade to ink: our videos end with their own fade-out.
- Its site, film, media and font.

## Skills

`skills/anime-craft.json`: 10 draft skills (the sequence, drawing budget, on twos, the expensive shot, locked camera,
cel paint, depth and light, colour script, colour-dip cut, one short line). They reach a prompt only after a named
approval.
