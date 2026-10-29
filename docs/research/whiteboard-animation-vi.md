# whiteboard-animation-vi: how it draws a picture by hand (read 2026-10-29)

The owner found this repository "more accurate and more stable and more advanced" than our hand-drawn animation and
asked for its brain to go into the program. Read in full at
[letuandat131/whiteboard-animation-vi](https://github.com/letuandat131/whiteboard-animation-vi), revision
`c689bf7fd75fb4cb84f6ae2880a4dac6f40b92d0` (2026-10-13, "Initial release"). The repository content was treated as
data; nothing in it was run.

## What it is

A local Gradio app (Python, PyTorch, OpenCV, NVENC) that turns one still picture into a whiteboard video: a hand
draws the picture's lines, then colours it in, then the finished picture holds. It does not plan a story or edit
scenes; it is a very good single-picture renderer. Licence: its own code is CC0 1.0; `handdraw/grid_stream.py`
derives from SRT Whiteboard (MIT, notice kept); the subject model is SkyTNT ISNet (Apache-2.0); the hand images and
demo pictures carry no licence.

## The brain, step by step

1. **Line map** (`v181d_plan.build_v181d_ink_map`): grey, an edge-preserving bilateral filter (7, 12, 3), CLAHE
   local contrast (clip 2, 8x8 tiles), a second bilateral (5, 12, 2), then an adaptive Gaussian threshold (window
   15, C 10). A line is kept only where coarser copies of the picture (half and a third size, C 5 and 4, grown by 3
   pixels) also see it, and specks smaller than about 4 pixels or shorter than 8 (at 720 high) are dropped. This is
   why its lines are clean: textures and noise do not survive the multiscale check.
2. **Line order** (`grid_stream.py`): the picture is cut into 10-pixel cells and every cell with ink is active.
   Connected groups of cells are found; a group joined only by a thin bridge (a ground line linking two objects) is
   split at the broadest valley of its column profile; fragments of a few cells join the nearest big group. The
   largest group is the **subject** (drawn first), wide dense rows are **text** (written in bands four cells wide,
   left to right), the rest are **contours**. Groups whose boxes touch become one region (a label, its letters and
   its arrow) and a region is finished before the pen leaves it. Inside a contour the pen starts where the ink is
   densest and walks to the neighbour with the most ink left and the least turning; regions are joined nearest
   exit to nearest entry, turned round when the far end is nearer.
3. **Colour regions** (`_region_ids`, `v181d_cluster.py`, `v181d_palette.py`): a strong bilateral (9, 75, 75) in
   Lab, seeded k-means++ into up to 16 colours, regions cut by the lines (the ink grown by 3 pixels is a barrier),
   regions under 80 pixels dropped and refilled from their neighbours, then up to 8 palette colours over the regions'
   mean colours weighted by area.
4. **Subject** (`subject.py`): a segmentation model (ISNet) marks the foreground; it is coloured first.
5. **Colour route** (`v181d_subject_fill.py`): for the subject, then the background, each palette colour is taken
   from where it first appears from the top. Its pixels are cut into lanes 12 degrees off vertical, one brush wide
   (12% of the shorter side, 24-92 pixels); a lane splits where it would cross more than three quarters of a brush;
   short spans in one corridor merge. Three routes are tried (greedy, three-choice look-ahead, look-ahead to the
   next colour), each oriented by dynamic programming and improved by short block reversals, then compacted across
   colours; the one with the least travel wins.
6. **Timing**: every stroke gets a travel time (at 1.5 times the colouring speed) and a paint time by its length;
   the pen eases along a cosine, lifts on `sin(pi q)` while it travels, and every pixel's colour time is exactly
   when the eased nib reaches it (`acos(1 - 2p) / pi`). Lines take 45% of the drawing, colour 55%, and drawing is 70%
   of the video; the rest holds. Quick mode (`v181e_background_fill.py`) colours the background region by region
   from left to right after the subject.
7. **Render** (`pixels.py`, `render.py`): each frame is a threshold of two time maps (ink where the line time has
   passed, colour where the colour time has passed) on white paper, with a hand image rigged at the pen tip (separate
   drawing and colouring hands, wrist swing 11 degrees at 0.55 Hz, cast and contact shadows, a 12-pixel lift).

## What it had that we did not

Our hand-drawn engine draws vector elements and traces Claude's line pictures path by path, but a painted picture
(ChatGPT's) only wiped in as a card. We had no way to turn a raster picture into lines, no reasoned line order, no
colour route, and our hand never carried the colour it laid or lifted between strokes of one picture.

## What we took (0.67, `drawn-reveal.js`)

All of steps 1-3 and 5-7, ported to plain JavaScript on typed arrays, running in our drawing page and tested in Node
(`tests/reveal.test.js`). Our changes:

- **No segmentation model.** The subject is found by a border rule (`subjectOf`): large palette patches that touch the
  picture's border are background, the rest is subject; a picture that is nearly all one or the other has no subject
  phase. Weaker than ISNet on crowded pictures, but needs no model download or GPU.
- **White paper is the board.** Near-white, nearly grey pixels are neither drawn nor coloured (the original's visible
  mask), so no pale box shows round a picture on our board and the hand never brushes blank paper.
- **The pen for any moment.** Instead of sampling 4,097 pen points we keep the strokes and compute the pen at any
  time, so frames stay pure functions of time at any frame rate.
- **k-means** is seeded and fitted on at most 40,000 evenly spaced pixels.
- **Timing in a shot:** the reveal takes up to 60% of the picture's time on screen (at most 5 s, at least 1.2 s), and
  a painted place shown by the shot before is held, not drawn again (`Sk.carry` `holdBackdrop`).
- **Our own hand** (the program's drawn marker hand), now lifted on the reveal's hops and with the marker in the
  colour being laid.

Measured here: a 1024x768 picture plans in about 1.7 s in the drawing browser (once per picture, cached), and a frame
of the reveal costs about 2 ms.

## What we left out, and why

- ISNet and its weights, NVENC, CUDA batching, the Gradio interface, the hand images and the demo art (no licence,
  and the program draws its own hand).
- Its fit modes and per-video settings: our shots decide size and time.
- The original's background re-timing keeps the subject's times from the full plan; ours re-times all strokes
  together after the left-to-right reorder (simpler, same order).

## Skills

`skills/whiteboard-craft.json`: 7 draft skills (line order, colour after line, subject-first colour, brush lanes,
hand motion, pictures that draw well, a held place). Like every builtin skill they reach a prompt only after a named
approval.
