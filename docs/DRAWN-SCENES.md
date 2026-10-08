# Drawn scenes: stick figures, hand-drawn and motion graphics (P06c, 0.19.0)

Owner request (2026-10-08): test the Stickman, hand-drawn and motion-graphics styles without stock footage.
These styles existed as styles and skills, but no engine drew their shots. Now the program draws every shot
itself, locally and for free, and the editing brain edits those shots like any footage.

## How it works

1. **Style.** Stickman Sketch Explainer, Hand-drawn Canvas and Motion Graphics use the visual source
   `generated-graphics`. It is the Stickman style's first choice from 0.19 (new workspaces). In an existing
   workspace, save a new Stickman revision with *generated graphics* as the primary source in Room 03.
2. **Scene plan (Room 04).** Each drawn shot carries a **drawing** in a closed vocabulary (`sketch.js`):
   - stick **figures**: stand, point, think, shock, cheer, walk, run, sit, wave, shrug;
   - 25 **props**: sun, cloud, storm, bolt, tree, house, city, mountain, ground, globe, clock, thermometer,
     heart, coin, money, book, lightbulb, question, exclamation, flag, chart, magnifier, sand, glass, waves;
   - short **text** (title, note or number);
   - **arrows** and speech or thought **bubbles**;
   - optional labels and an accent colour;
   - a background and a camera (still, slow push or drift).

   Claude writes these drawings when it plans the scenes; every one is checked against the vocabulary, and a
   bad one fails the plan with the shot named. The free planner and any shot without a drawing get one built
   from the shot's own narration (a reacting figure, the props it mentions, its number).
3. **Draw all scenes (Room 04, free).** The program draws each shot in the local browser (Edge or Chrome),
   stroke by stroke, then encodes it with FFmpeg as a 1920×1080 clip (1080×1920 for Shorts):
   - the whole picture appears within about a third of the shot (0.8–1.8 s), like a quick hand;
   - afterwards it idles: figures breathe and wave, bolts flash, clocks tick, thermometers fill;
   - Stickman and Hand-drawn get a marker finish (doubled, slightly wobbly strokes on paper);
     Motion Graphics gets clean strokes on its dark palette;
   - words never leave the frame and move off any drawing they would cover;
   - a chalkboard background is used only on a dark style, so captions keep their contrast.

   Each clip is kept with its drawing and the engine version (`sketch.js` VERSION). A changed drawing, or a
   newer engine, is drawn again by "Draw all scenes"; unchanged shots are not.
4. **Edit and render.** The editing brain cuts the drawn clips on the narration's pauses and adds captions.
   Captions on light styles use the style's ink with a white edge. The plan's on-screen text, stats, dates
   and quotes are not laid over a drawn scene, because the drawing carries its own words. Full-screen chart,
   timeline, list, comparison and flow cutaways still apply. Drawn styles render through the montage
   assembler, with every Room 08 check and Claude's frame scan as usual.

## Measured (demo workspace on this PC, 2026-10-08)

The demo was a 62-second science explainer on lightning, in the Stickman style with the free Windows voice:

- Claude planned 17 drawn shots in 66 s, using 10,190 tokens on the subscription.
- One hook shot Claude gave to a paid AI image was switched to a drawing, as the owner would.
- Drawing all 17 shots at 1080p took 4–6 minutes.
- The edit was drafted in under 10 s with no critic findings.
- The render took about 70 s and passed every check (decode, alignment, duration, frame, black, frozen,
  cuts, clipping).

## Limits (honest)

- **Figures.** Stick figures have ten poses and simple faces, but no hands, objects in hand, or consistent
  named characters across shots.
- **Props.** 25 props cover explainers about science, money, places and time. Topics outside that set fall
  back to text, arrows and bubbles.
- **Layout.** Placement comes from Claude's coordinates, nudged off collisions. A crowded scene can still
  touch.
- **Narration.** The demo used the free Windows voice. Real narration is ElevenLabs.
- **Scope.** AI images in the stick-figure look (the original "ffmpeg-sketch" idea), maps and animated
  character rigs are not built.
