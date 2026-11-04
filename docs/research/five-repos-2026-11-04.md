# Five repositories for drawing, motion and editing (2026-11-04, 0.89)

The owner sent five repositories and asked for their brains to become skills that the program uses at every step
(script, scenes, drawing, editing), and for two of their styles, paper collage and pixel art, to be added to the
Motion Graphics engine. This note records what each repository is, how it works, what we took and what we did not.

## 1. cloveric/claude-drawing-skill (MIT, `4886ed8`)

**What it is.** A Claude Code skill and a Python painting library (numpy and Pillow): 77 styles, each a module
that simulates a real medium (ink wash, watercolour, paper collage, coloured pencil, anime, risograph, impasto oil,
woodblock, pixel art, clay, cyanotype and so on). No image model is used: every mark is computed.

**Its brain.** `SKILL.md` (626 KB, Chinese) has five parts: the styles with their examples, the process every
picture follows, the interface of each module, a list of real failures per medium with their fixes, and how to make
a picture that draws itself in stages. The process is: plan the composition (depth layers, one focal point, breathing
space, the accent in one or two places, where the words sit, a picture that illustrates the idea), write the scene,
render it, look at it against the medium's failure list, fix the most visible problem, two to four rounds.

**What we took.** `skills/drawing-craft.json`, 33 skills: the composition plan, the look-and-fix rounds, drawing in
stages, and the failure lists of the media the program can use (paper collage, newspaper collage, stickers and
receipts, notebook pencil, chalkboard, pixel art and the low-resolution game frame, watercolour, coloured pencil,
pen and wash and gouache, the hand-drawn cartoon frame, isometric, one-line art, shape morphs, risograph, woodblock
and linocut, poster print, art deco, blueprint, 1930s rubber hose, flat vector, cave painting, rock carving, tomb
painting, mosaic, stained glass, manuscripts and inventors' notebooks, silhouettes and shadow puppets, ballpoint and
graphite, children's crayon). The paper collage finish draws its paper the way `lib/papercut.py` does (torn edges,
a white fibrous rim on parts of the edge, a depth shadow, kraft, newsprint, notebook and crayon papers), and the pixel
finish works like `lib/pixelart.py` (a small grid, a closed palette, ordered dithering, a 3x5 bitmap font, nearest
upscaling), both written again for the browser.

**What we did not take.** The Python library itself: the program runs on Node and a browser, and the owner's PCs do
not have Python with numpy. Media that no engine of ours draws (soft 3D, cyberpunk neon, thermal camera, x-ray, CRT
terminal and a few others) were read but not turned into skills. The GIF palette notes are about GIF files.

## 2. alexgreensh/anidoodle (Apache-2.0, `9c20e77`)

**What it is.** A skill for code-drawn stills, films and motion graphics in 32 styles, with a TypeScript engine,
music, narration and a long list of checks. Its value is the craft doctrine in its references, each rule "paid for"
on a real film.

**Its brain.** Seven laws (every piece has a point; state the realism; a style is a way of making marks; prove the
look on one still; a pure deterministic contract; music gets a plan; one directs, one builds). The craft bar (would a
proud illustrator ship this?), the detail pass, no dead air, the story as a transformation with a turn and a token
that returns, storyboard rows that are actions, realism as written departures from the icon, anatomy checks, one
character module posed in every shot, styles chosen for the job, the six seam mechanisms, cuts that carry motion,
refused effects (glitch, light sweep, fade-in, particle burst, cross dissolve, lens flare) with what to make instead,
one camera with log-scale zoom, the 46-card motion deck (openings, seams, camera moves, reveals, type, acting,
emphasis, endings), machines that explain ideas, the fresh critic with four readings, severity and a scorecard,
narration timing, sound design and music planning.

**What we took.** `skills/anidoodle-craft.json`, 38 skills covering all of the above. The paper collage finish moves
like its toy theatre (stop-motion on twos, pieces held above the stack, a landing jiggle); the pixel finish holds cels
on threes as its pixel recipe does.

**What we did not take.** The engine, three.js, the sound pack, the tools and the example film. Its "fresh critic
subagent" is a working habit for a coding agent; our review stays the continuity review and Room 08.

## 3. kurbaitaev/ghost-editor (MIT, `ce17272`)

**What it is.** A Claude Code skill that edits talking-head phone recordings into vertical reels: take selection,
pause trimming, captions around the face, motion scenes on the spoken word, sound mixed against the voice, and 18
named edit styles (Clean OS, RESULT, Whiteboard, Kinetic doc, Step Deck, Tactile paper, Data Story, Telestrator,
Halftone Dossier, Swiss Grid, Hologram HUD, News Package and others).

**Its brain.** Show what the speaker made the viewer imagine, on the word, and leave some sentences bare. Default to
restraint, measured on top reels (113 of 119 transitions were hard cuts, a median shot of about 3 s, 0.4-0.9 audible
effects per 10 s on graphics). Effects are levelled against this voice (interface -14 dB, whoosh -12, impact -8).
A style is a system: a thesis, invariants, a house look, content slots with a question that fills each, and a
catalogue of used components so the next video uses new ones. Every correction the owner makes is kept as taste in
their own words.

**What we took.** `skills/ghost-editor.json`, 25 skills, restated for narrated faceless videos: the beat rules,
restraint, one thing at a time, framed inserts, sound levels, style as a system, new components every video, taste,
caption readability, kinetic type devices, studying a reference from its frames, style prerequisites, and twelve
of its named styles as recipes (Tactile paper is a paper collage skill).

**What we did not take.** Its scripts (face tracking, take picking, Gemini B-roll checks, HyperFrames runner), memes
and sounds: they serve talking-head footage, which a faceless channel does not have. Its downloader (yt-dlp) is not
used, as before.

## 4 and 5. Two repositories called MotionClone

**LPengYang/MotionClone** (`8b3d937`, no licence file) is research code: training-free motion cloning for diffusion
video models (Stable Diffusion 1.5 and AnimateDiff on a GPU). It cannot run in the program and has no licence. Its
finding is useful as an idea: a few dominant components of a clip's motion carry the move; the rest is noise.

**blixvip/MotionClone** (`9873ef2`, no project-wide licence) is a different program: it rebuilds a reference clip as
an editable HyperFrames project with Codex. Its method: cut the clip into scenes at visual jumps, sample frames at the
start, the end and around every jump before filling evenly, rebuild each scene with absolute times, compare the
rebuild with the reference per colour channel, correct only the two worst scenes, and keep a correction only when it
improves the match.

**What we took.** `skills/motion-clone.json`, 4 skills: clone the dominant motion, split a reference at its visual
jumps, compare and keep only improvements, rebuild from layers and never replay the source. No code from either.

## Where the skills go now

Before 0.89 the approved skills reached the script writer, the scene planner and story director, voice direction,
the music score, the competitor blueprint, niche suggestions, topic ideas, packaging, language editions and (since
0.88) the edit commands and Polish. Three steps that draw had none. 0.89 adds them:

| Step | Skills (task) | Recorded as |
|---|---|---|
| Designed shots (Motion Graphics frame worker) | `motion.template`, chosen for the video's subject and finishes | the plan job, `motion.template` |
| Claude's pictures, ChatGPT's paintings and the art director's check | `visuals.prompt`, chosen for the subject and the look | the plan job, `visuals.prompt` |
| The continuity review | the planner's own `scene.plan` skills | with the plan's `scene.plan` record |
| Edit commands and Polish | `editing.plan`, now filtered by the video's engine | the edit revision |

Skills written for one medium or finish (pixel, paper collage, risograph, woodcut, storybook, cartoon and others)
reach only videos drawn in it, and come first there (`ENGINE_AREAS`, `rankSkills` `onEngine`). The era skills (cave
painting, tomb painting, mosaic, stained glass, manuscripts) are chosen by the words of the story.

## Paper collage and Pixel art in the Motion Graphics engine

Both are finishes of the engine, like HTML render, chosen in the channel's style window: `atelier.finish` collage or
pixel, or a mix of the finishes the owner ticks (`atelier.finishes`). Pixel art has a palette setting (Rainy dusk,
Meadow day, Desert noon, Arcade night, Handheld green, or Claude chooses). Details in DRAWN-SCENES.md section 37.
