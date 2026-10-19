# Eight repositories studied for the editing engines and the skills (2026-10-19)

Owner request (2026-10-19): study eight repositories deeply (how each works, its brain and its skills, what it does better than
our program) and bring what they add into the program; and fix the "brain" that chose a pale white word over a crowd when
appealing colours were available.

All eight were cloned shallowly into the session's scratch folder as untrusted reference data. No script of any of them was run,
nothing was installed from them, and no code was copied: every idea below is restated in our own words and our own code.
Licences and pinned revisions are in [REPOSITORIES.md](../REPOSITORIES.md).

| # | Repository | Licence, revision | What it is |
|---|---|---|---|
| 1 | acamposuribe/p5.brush | MIT, `43ac6d5` | Natural-media drawing: pencils, charcoal, crayon, pastel, markers, spray, watercolour fills, hatching, flow fields. A p5.js build and a standalone WebGL2 build. |
| 2 | browser-use/video-use | MIT, `43cfc56` | A Claude skill that edits real footage by conversation: word-level transcripts, cut lists, grades, overlays, subtitles, self-checks; a vendored Manim skill with design references. |
| 3 | remotion-dev/remotion | Remotion License, `a65368a` (12 packages read) | React-based programmatic video: frame-driven interpolation, springs, transitions, effects, motion blur, captions, paths, noise, layout. Free for individuals and companies of up to 3 people; a company licence above that. |
| 4 | remotion-dev/skills | (inside Remotion), `1441a11` | Remotion's own agent skills: timing, transitions, effects, captions, motion blur, light leaks, measuring text. |
| 5 | TomGranot/watch-video | MIT, `9492ba3` | A skill that watches a video: coarse-to-fine frame sampling, platform captions, an evidence model and a validated report. |
| 6 | morningstarwebd/caption-ai | MIT, `5779ef6` | A captioning engine: a 15-step transcription and alignment pipeline (Hindi, Hinglish, Bengali, English) and 16 caption themes. |
| 7 | digitalsamba/claude-code-video-toolkit | MIT, `959e0fc` | A Claude Code video workspace: Remotion templates, brand profiles, ElevenLabs voice and sound, QC, pacing, timing sync, cut-downs, custom transitions. |
| 8 | anthropics/skills, skill-creator | Apache-2.0, `dbd4588` | How to write, test and improve skills: progressive disclosure, reasons over rules, with/without blind comparison, description tuning. |

## The colour question first

The owner's question was why the planner still picked white when it could have used gold or a cinematic colour.

**Root cause.** The drawing vocabulary gave a word no colour of its own, only `accent` on or off. Claude could not choose gold
for a word even when it wanted to. A poster then fell back to the palette's ink at 90%. That ink is cream on the documentary
palette, so the word read as a pale ghost.

**Fixed in 0.41:**
- Every text element may carry `color`: the style's `accent` or `ink`, or a named colour (`sketch.js` `WORD_COLORS`).
  Claude's near-misses are dropped with a warning. The owner's own edits are checked strictly.
- The planner gets a WORD COLOUR line. It is told to:
  - colour words by role and by what lies behind them;
  - give the key word the accent or a warm strong colour;
  - keep two or three word colours per shot;
  - keep the same colour for the same idea across the video.
- The continuity review checks WORD COLOUR too.
- The engine draws every word in its chosen colour. A poster without a colour takes the accent, never pale ink.
- Word edges now follow the word's own colour:
  - a light word gets a nearly solid dark edge, which also helps on dark palettes;
  - a dark word gets a white edge.
- Rendered result: the poster "ANYONE" reads in gold over the crowd.

## 1. p5.brush: natural media

**How it works.**
- **Strokes.** A stroke is a run of small stamps along the line. Each brush has:
  - a weight;
  - a vibration, meaning side-scatter that is larger across the stroke than along it;
  - a sharpness;
  - a grain, meaning the chance a stamp is skipped where the paper's tooth lies;
  - an opacity and a spacing;
  - a pressure curve: a peak somewhere along the stroke, fading to its ends, with per-stroke random lean.
- **Fills** follow Tyler Hobbs' watercolour method. The shape is grown by midpoint displacement into about 20 translucent
  layers, darker in places, with random circles erased for texture. A WebGL shader mixes the pigments.
- **Flow fields** bend strokes for a hand-wobble.
- Everything is seeded.

**What we lacked.** Our pencil, crayon and storybook looks were clean vector lines with a little jitter, and our fills were flat
colour. They read as computer-made.

**Built (0.41, `drawn-kit.js` `K.brush`, `K.wash`):**
- Stamped graphite for the whiteboard pencil look.
- Crayon tooth on doodle outlines.
- Coloured pencil on storybook outlines.
- Watercolour washes on storybook and painted places: four warped translucent layers and a darker rim.
- Characters stay solid. Painted characters were see-through in the first try, so washes are for places only (`K.WASH`).
- Seeded, so every frame is identical when drawn again.

**Not built:**
- Running p5.brush's own WebGL build inside our drawing page. Possible: it is MIT and has a standalone WebGL2 build. It would
  bring pigment mixing and the full 20-layer watercolour, but it costs per-frame WebGL compositing. Worth a trial if the owner
  wants painterly looks pushed further.
- Hatching and flow-field strokes.

## 2. video-use: editing real footage with reasoning

**How it works.**
- The model reasons from a phrase-level packed transcript. Phrases break on silences of 0.5 s or more.
- Visuals are inspected only at decision points.
- Hard production rules:
  - subtitles are applied last;
  - each segment is extracted, then joined losslessly;
  - 30 ms audio fades at every cut;
  - overlay timing is shifted to the overlay's own start;
  - cuts are never made inside a word, and edges are padded 30-200 ms;
  - transcripts are cached.
- Every value in the skill is "a worked example, not a mandate".
- The model checks its own render at every cut (a filmstrip plus waveform), measures loudness, and stops after three passes.
- Grading is reasoned about the image (lift, gamma and gain), not a preset. A per-clip auto-correction, bounded to ±8%, levels
  exposure and contrast.
- Sound rules:
  - fewer effects, each tied to something visible;
  - each effect starts early by its measured attack so the hit lands on the frame.
- "Fonts fail silently."
- Typed text is centred on the full string, never the partial one.

**What we lacked:**
- We never checked fonts. Inter, the body font of five launch styles, and Source Serif 4, the Documentary titles, are not
  installed on this PC. Every one of those videos was quietly drawn in a fallback face.
- Our typed "note" text slid sideways while it typed.
- Effects were placed at their moment without allowing for their build-up.
- Cinematic footage was graded without matching the clips first.

**Built (0.41):**
- **`fonts.js`:**
  - reads the family names inside the installed font files;
  - swaps a missing font for a chosen look-alike (Georgia for serif faces, Segoe UI, Bahnschrift, Segoe Print);
  - is applied wherever fonts leave the program (the drawing browser, captions and graphics, thumbnails);
  - the Style Library warns about missing fonts;
  - launch library v12 uses fonts Windows ships with.
- **Typed notes** grow from a fixed left edge.
- **Effects** start early by their measured attack (silencedetect at 30 dB under the file's peak, at most 2 s), so they hit on
  the frame.
- **Shot matching:** Cinematic clips are levelled with a gentle, linked, smoothed normalisation (30% strength) before the grade.
- **Skills:** self-check at every cut, grade by looking, captions chunking, effects on the frame, see-then-hear, one new idea at
  a time, and dim-and-reveal (the last three from its Manim design references).

**Not built:** a filmstrip-and-waveform self-check at every cut of a render. Room 08 already scans frames. A cut-boundary
strip would be a cheap addition to the frame scan.

## 3 and 4. Remotion and its skills

**How it works.**
- Every frame is a function of the frame number.
- `interpolate()` maps time to values, with clamping, easing (bezier or spring) and posterisation.
- Its `perceptual-scale` output interpolates the area (scale squared) and takes the square root, so zooms feel even.
- `spring()` is a damped oscillator. Damping 200 gives a push without bounce.
- Transitions overlap two scenes and shorten the timeline. Overlays, such as a light leak, play over a hard cut without
  shortening it.
- `CameraMotionBlur` averages several samples behind each frame, like a 180° shutter.
- Light leaks are a warped flowing colour pattern that sweeps in and retracts.
- TikTok-style captions group words into pages within a time window and break on silences.
- `fitText` and `measureText` fit words to a box.
- `@remotion/effects` has about 70 effects; `@remotion/transitions` has about 20 presentations.
- Its skills insist on frame-driven animation, never CSS transitions, and on expo-out curves with scale in perceptual space.

**What we lacked:** linear zooms; no motion blur; no stepped "on twos" cadence; no overlay-at-cut idea.

**Built (0.41):**
- **Perceptual zoom** (`K.zlerp`) for push, pull, dolly, crash zoom, Ken Burns and focus zooms.
- **Motion blur on fast moments** (`drawn-engine.js`):
  - samples across half a frame, more samples for faster motion;
  - only when the camera moves fast or something slides, drops, swings, lands or slams;
  - on by default for the Documentary engine's designed shots;
  - off for hand-made looks, where photographic blur on thin outlines looks wrong (tested and seen), unless the style turns it
    on;
  - style option `drawing.motionBlur`.
- **Stepped cadence:** style option `drawing.cadence` 'twos' or 'threes', for a hand-made or stop-motion feel.
- **Skills:** perceptual zoom, easing defaults, stepped cadence, motion blur, and cut overlays.

**Licence note.** Remotion is free only for individuals and companies of up to 3 people. We took ideas and maths, not code. If
the owner ever wants Remotion itself as a renderer, the company size decides whether a licence is needed.

**Not built:**
- Light-leak overlays at hard cuts for footage edits. This needs a new graphic template and editing-brain placement. Next.
- Shader transitions (cross-zoom, film burn, ripple, book flip). FFmpeg xfade cannot draw them; they would need frames rendered
  in the browser.

## 5. watch-video: reading a video honestly

**How it works.**
- **Coarse to fine.** An overview takes about 48 uniform frames plus scene-change frames. Dense windows sample about 4 frames a
  second around what matters. The "every frame" mode is capped and only for short windows.
- **Captions** come from the platform only (manual first, then automatic). A transcript of someone else's video is never
  generated.
- **Evidence model.** Each finding is labelled:
  - its basis: observed, spoken or inferred;
  - its support: supported, conflicted or not found;
  - a confidence, with the reason when it is low.
- A report schema is validated against the frame manifest. Long videos are split into windows with one running timeline.
- The skill never signs in, uses cookies or gets around access controls.

**What it means for us.** It is the method for the competitor phase that comes next.
- Our style studies (0.30) already sample frames from files the owner names.

**Decision for the owner (not built):** watch-video downloads public videos with yt-dlp.
- Downloading other channels' YouTube videos conflicts with YouTube's terms and with our "nothing is downloaded from links" rule.
- Competitor video analysis would use files the owner provides, plus public metadata and the platform's own data where allowed.

**Skills:** watch coarse-to-fine, and evidence labels.

## 6. caption-ai: captions that look designed

**How it works.**
- Sixteen themes, each a set of choices: font, colour, box, outline, glow, position, letter case, spacing and animation (fade,
  pop, glow pulse, slide up, typewriter).
- A careful transcription pipeline:
  - audio quality sets the thresholds;
  - chunks overlap and are merged with conservative de-duplication;
  - an LLM judge and a hallucination guard;
  - time is spread over words by word count (never evenly);
  - forced alignment, and a drift clamp that splits overlapping boundaries at the midpoint.

**What we lacked.** One caption look. Our timing already comes from ElevenLabs' measured word times, with the estimate as a
labelled fallback, so the pipeline adds little.

**Built (0.41):** seven caption looks as our own ASS styles (`captions.js` `THEMES`): clean, bold capitals, boxed, cinematic,
glow, comic and pop.
- Chosen in the style (`captions.theme`).
- Glow keeps the key word white: an accent word on an accent glow blurred away in the first render.

**Later:** its Hindi and Hinglish normaliser is relevant for the localization phase.

## 7. claude-code-video-toolkit: production tools

**How it works.**
- Templates in Remotion.
- Brand profiles: colours, fonts, voice.
- Commands for scene review (approve, adjust, refine, flag).
- Tools:
  - pacing QC: words per minute, with 140-160 comfortable, above 170 fast and below 110 slow, plus a pitch-preserving slow-down
    floored at 0.85;
  - timing sync;
  - pre-render QC: assets, timing, pacing, loudness against -14 LUFS;
  - cut-downs that reframe 16:9 to 9:16, 1:1 or 4:5 by blur fill, crop or pad, with per-segment focus.
- Seven custom transitions: glitch, RGB split, zoom blur, light leak, clock wipe, pixelate, checkerboard.

**Built (0.41):**
- Narration pace in words per minute, shown on every voice audition and flagged fast or slow (`voice.js` `pace`).
- The pace-band skill.

**Next:** cut-downs for Shorts. craft.js already finds Shorts moments; a reframe renderer would turn them into vertical clips.

## 8. skill-creator: skills that earn their place

**How it works.**
- A skill says when it applies and why, in lean language. Rules in capitals are a warning sign.
- It is tested: real tasks run with and without the skill, a blind judge compares them, and the skill is improved from why the
  winner won.
- It is kept lean and generalised rather than over-fitted to the test cases.
- Its description is tuned for triggering against near-miss queries.

**What we lacked.** Our 400 skills already have when, why, do and avoid. Nothing told the owner which skills were weak, and
nothing tested whether a skill changes an output.

**Built (0.41):** `skills.js` `skillQuality`, shown in the Skills room when a skill is opened. It notes:
- a summary with no reason;
- rules in capitals;
- skills too long for a planning brief;
- a vague "when";
- skills that only say what to avoid.

Of 420 skills, 101 lack a stated reason and 58 are long. Our own new pack passes; two of its drafts did not at first, and were
fixed.

**Skills:** test a skill, and write skills with why.

**Next:** a paid, on-click A/B test of a skill pack. Plan one short sample with and without the pack, then ask Claude as a blind
judge. This needs the owner's go-ahead on token cost.

## The new pack

`skills/studio-craft.json`: 20 drafts. Like every builtin skill, they reach a prompt only after the owner approves them (Skills,
then Packs).

| Area | Skills |
|---|---|
| Scene building | word colour by role, see-then-hear, one new idea, dim and reveal |
| Motion | perceptual zoom, easing defaults, stepped cadence, motion blur |
| Editing | cut overlays, self-check cuts, grade by looking |
| Captions | chunking |
| Audio | effects on the frame |
| Voice | pace band |
| Competitors | watch coarse-to-fine, evidence labels |
| Learning | test a skill, write skills with why |
| Visuals | natural media |
| Branding | fonts that exist |
