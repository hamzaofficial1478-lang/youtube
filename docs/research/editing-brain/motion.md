# Motion-graphics brain for the Editing Room

Sources: **flick** (MIT; Remotion scene director plus 14 saved scene components), **alesha-tools / hand-drawn-canvas-animation** (MIT; Canvas2D film runtime, headless renderer, verifier) and **OpenMontage** (AGPL-3.0). From OpenMontage I took ideas only and restated them in my own words; no text or code was copied. The companion file `motion.json` holds 35 skills. Every number below is either from those sources, from the owner's brief, or computed for this report.

---

## 1. How a pro motion designer thinks

1. **Each graphic has to prove a sentence.** Before choosing a style, ask what the line says that the viewer can't see. Footage proves that something *exists or happened* and carries emotion. A graphic *explains*: mechanisms, quantities, places, sequences, structure. Flick's rule is "transcript line → visual proof". Abstract patterns or generic motion that could fit any script are not allowed.
2. **Source order: owned material, then animated owned material, then an original metaphor, then text.** A text-only card is the last resort. Use it only when the words themselves are the image, as in a punchline or chapter title.
3. **Attention is a budget.** Each screen has one idea and one accent. Count: no more than 3–4 new elements at once. Everything should be on screen by about 70% of the shot, so the last 30% is held or used for the payoff.
4. **Timing is reading time plus motion.** Holds are computed from word counts and never shortened to keep the pace up. If the text doesn't fit the beat, cut the text or split the beat.
5. **Motion has a role, and easing shows it.** Entrances slow down into place, exits speed up away, cameras ease gently and data never overshoots. A spring is for something with mass that arrives.
6. **Variety comes from composition, consistency from grammar.** Keep one template per idea type and fixed colour meanings for the whole video. Neighbouring scenes still need a different primary subject, scale or layout. A "signature device" appears in at most two beats. OpenMontage calls a single hero visual reused under every line "branded slides".
7. **Every frame is a pure function of time.** If a frame can't be re-rendered identically after seeking, it can't be repaired scene by scene, cached or verified.
8. **Review in layers.** The order is: settled stills, then a grid contact sheet, then consecutive-frame strips, then the encoded file at normal speed. Report what was actually checked.

## 2. Which graphic for which beat

| The beat says… | Use | Hard limits |
|---|---|---|
| Real place, person, event, product | **Footage / photo** (stock, archival, CC0 museum, owned) + overlay if it names something | No decorative B-roll under abstract claims |
| One number matters | **Stat reveal** | Fewer than 3 data points: never a chart |
| Two states or options | **Comparison split** | Same scale both sides; ≤3 attributes per side |
| 3–9 values by category | **Bar chart** (horizontal if labels are longer than 2 words) | 5–7 bars ideal, 9 max; axis from 0 |
| Trend over time | **Line chart** | 5–12 points; label start, end and peaks only |
| Share of a whole | **Donut** | 3–5 slices, 6 max |
| Several headline metrics | **KPI grid** | 3–6 cards |
| Process, cause, system | **Diagram build** or **metaphor animation** | 15–20 nodes at 1080p (10–12 vertical); 3–5 words per node |
| When / in what order | **Timeline** | 5–7 labelled events per screen; honest scale |
| Where / movement | **Map route** | One route at a time; north up |
| Enumerated points | **List build** | 3–6 items, ≤5 words each |
| Who is speaking | **Lower third** | Name and role ≤32 characters each |
| Someone said X | **Quote card** | Verbatim, attributed, ≤3–4 lines |
| The line is the punch / chapter | **Title card / kinetic type** | 1–6 words per card |
| One word in text or a screenshot | **Keyword highlight** | One per screen |
| Story-led, illustrative, or no footage can exist | **Hand-drawn reveal / doodle on photo** | All drawn by 70% of the shot |

For the owner's **Stone-Age history** channel this table points to maps, timelines, CC0 museum artifact photos with doodles, and clearly stylised reconstructions. Never pass AI imagery off as evidence. For **finance**, numbers go to stat reveals and chart builds, and mechanisms (compounding, inflation) go to metaphor animations. To find a metaphor: concept → one physical verb → one low-tech object → an agent performs it. If you can delete the performer and the image still works, it is decoration.

## 3. Timing and easing cheat-sheet

**Reading time** is measured from the moment text stops moving until it starts to exit.

| Context | Formula / value |
|---|---|
| Owner title card | `max(1.2, 0.35 + words/3.2)` s. The floor applies up to 2.72 words, so 1–2 word cards always get 1.2 s |
| Sentence overlay | 0.3 s/word, min 1.2 s; short label 0.8 s |
| Dense text, no voiceover | 13 chars/s (a 30-char line needs ≥2.3 s; rule of thumb: 3 s per 63 chars) |
| Captions echoing voiceover | 21 chars/s, 1–7 s per block, 2 lines × 42 chars, 2-frame gaps |
| Chart | Build 2–4 s, then hold ≥3–5 s; chart scene ≥5 s |

**Durations.** Fade 0.3–0.5 s. Slide/scale 0.5–1.0 s. Exits 0.25–0.5 s, about half the entrance. Travel 16–40 px at 1080p. Scale-in from 0.82–0.90. Opacity reaches 1 in 8–10 frames at 30 fps. Stagger related items 0.2–0.4 s apart, letters 3 frames, bars 0.1 s. Labels take 0.2–0.3 s. A highlight starts ≥0.3–0.5 s after the text settles; flick's marker sweep is 24 frames (0.8 s).

**Shot norms.** Establishing shot 2–2.5 s. Interlude 0.6–1.2 s. Action 1.5–3 s. Montage card 0.25 s. Graphic explainer scene 4–6 s, about 8–10 per 45–50 s. Wait 1–2 s after a key reveal. At 120 bpm one beat is 0.5 s. Never put two transition devices in a row, and use at most two flashes per film.

**Easing by role** (cubic-bezier constants are the standard values):

| Role | Curve |
|---|---|
| Entrance (default) | easeOutCubic `0.33,1,0.68,1` (reaches 0.875 at half time) |
| Snappier kinetic type | easeOutQuart `0.25,1,0.5,1` |
| Exit | easeInCubic `0.32,0,0.67,0` |
| Layout move / scale | easeInOutCubic `0.65,0,0.35,1` |
| Camera / drift | easeInOutSine `0.37,0,0.63,1` |
| Count-up landing / snap | easeOutExpo `0.16,1,0.3,1` |
| Pop (pins, badges, nodes) | easeOutBack `0.34,1.56,0.64,1` |
| Particles, tickers, real-time progress | linear |

**Springs** use the closed form, a pure function of t. These presets are computed:

- **snap**: ζ 1, 2.5 Hz. 95% at 0.30 s, no overshoot.
- **settle**: ζ 0.75, 1.6 Hz. 2.8% overshoot, within 2% at 0.57 s.
- **pop**: ζ 0.5, 2 Hz. 16% overshoot.

**Trap in flick's configs:** Remotion springs with damping 150–200 are heavily overdamped (ζ 6–10). `{damping:200, stiffness:100}` only reaches 95% after **~6 s**. Flick gets away with it because it pairs these with a separate 8–10 frame opacity ramp. Port the pattern, not the numbers. Its letter drop `{82, 340}` (ζ 2.2) reaches 95% in 0.70 s.

**Camera.** Make one move per beat and hold still while the key action happens:

- Establishing push: zoom 1.15→1.30 over 2–2.5 s.
- Subtle push: 1.0→1.055 over about 6 s.
- Follow camera: `CX + (p−CX)·0.35` with a 120 px lead.
- Whip pan: 0.17 s out plus 0.17 s in, about 520 px.
- Crossfade: 15 frames.
- Blot or iris: 0.6–0.8 s.

## 4. Template catalogue

Common layout for all templates: 1920×1080 with a 144 px safe margin, giving a 1632×792 content box. Inside it is a 12-column grid (114 px columns, 24 px gutters) on an 8 px baseline. Type sizes: hero 120–160 px, title 60–90 px, body 40–60 px, chart labels ≥24–28 px, citations 16–18 px. Text contrast must be ≥4.5:1, aiming for 7:1.

**Title card (owner brief).** *Purpose:* 1–6 word statements. *Inputs:* LINES with an `*accent*` marker, palette, font. *Layout:* 144 px Space Grotesk 700, shrinking to 96 px, at most 2 balanced lines, left on the margin, block centred vertically. *Timeline:* 0–0.5 s fade and 40 px rise (easeOutCubic); hold by formula; 0.25 s linear fade out; cards strictly sequential. *Rules:* exactly one accent word; nothing outside the content box. Full specification is in §5.

**Lower third.** *Inputs:* name, role. *Layout:* x = 144 px; accent bar 6–8 px; name 48–60 px bold, role 36–44 px muted; sits above the caption band. *Timeline:*

- 0–0.35 s: bar grows.
- 0.15–0.55 s: name rises 16 px.
- 0.25–0.65 s: role follows.
- Hold 3–6 s, at least the reading time.
- Exit in 0.4 s.

*Rules:* appears 0.5–1 s after the person starts speaking, never on a cut; once per person.

**Quote card.** *Inputs:* verbatim quote (≤30 words), attribution with year. *Layout:* 8 columns (1080 px) at 56–64 px with line height 1.25; quote mark 160–200 px at 30–40% opacity; attribution 34 px. *Timeline:* mark at 0–0.4 s; lines 0.4 s each, staggered 0.25 s (or synced to voiceover); attribution after; optional highlight 0.6–0.8 s after the text settles; hold for voiceover length plus 1 s. *Rules:* never paraphrase inside quotation marks; one highlight.

**Stat reveal.** *Inputs:* value in human scale (8.1 + " billion"), label, delta, source. *Layout:* number 200–280 px, label 44–52 px, source 18 px. *Timeline:* count-up 1.5–2 s with easeOutExpo; 0.3 s landing pulse (1→1.04→1) plus underline; delta badge 0.2–0.3 s later; hold 2–3 s. *Rules:* the last frame shows the exact target. Canvas has no tabular-figures switch, so place each digit in a fixed-width cell to stop jitter.

**Chart build.** *Inputs:* type, rows, title with units, source, highlight. *Timeline:* axes at 0–0.3 s; bars grow 0.6–0.8 s each with 0.1 s stagger, or the line draws by arc length over 1.5–2.5 s, or donut slices go clockwise from 12 o'clock with the largest first; built by 2–4 s; hold 3–5 s. For a narrative highlight, dim the others to 30% and scale the focus element 1.05. *Rules:* bars start at 0; no 3D or dual axes; round values; label directly; no overshoot on data.

**Comparison split.** Two 792 px panels with a 48 px gutter, on identical scales. *Timeline:*

- Divider draws in 0.5 s.
- Baseline side enters and holds 1–2 s.
- Other side enters.
- Delta badge (0.25 s).
- Hold 3–5 s.

The wipe variant runs 0.6–1.0 s. *Rules:* earlier or "before" goes on the left; only one side gets the accent.

**List build.** Items enter on their narration cues (or every 0.3–0.4 s) with a 0.35 s, 16–24 px rise. Earlier items dim to 55%. At the end, restore everything and hold the full set. *Rules:* ≤6 items, parallel grammar, no reveal before the item is mentioned.

**Timeline.** The axis draws left to right in 0.6–1.0 s at about 0.58 of the frame height. Each event: 0.3 s easeOutBack pop plus a label rise, ≥1.5–2 s apart. The camera pans with easeInOutSine, keeping the active event at about 40% of the width; past events dim to 50%. *Rules:* the scale is proportional, or a visible break or log scale is used. Deep time (3.3 Mya → 10,000 BCE) needs one of these.

**Map route.** Muted basemap (for example public-domain Natural Earth data) with pins that pop in 0.3 s. The route draws over 1.5–3 s by **arc length**, so speed is constant, with eased overall progress. The camera follows with a 120 px lead, then holds 1–2 s at the destination. *Rules:* dashed lines for uncertain routes; one route at a time.

**Keyword highlight.** A marker sweep (0.6–0.8 s) drawn **behind** the text, an underline draw (0.4–0.6 s) or a circle (0.5–0.7 s). Rough edges are seeded once, never per frame. Text on the highlight switches to the background colour. One per screen.

**Diagram build.** Precompute the layout. Each step: node pops (0.3 s, scale 0.86→1), edge draws (0.3–0.5 s), arrowhead lands. Stagger 0.15–0.2 s. The current step is accent, completed steps are ink, upcoming steps sit at 30–50% opacity. Hold the finished diagram 2–3 s. TD for processes, LR for pipelines.

**Hand-drawn reveal.**

- Strokes are authored point lists.
- Draw-on uses `setLineDash([L·p, 2L])` with L = path length × 1.03.
- Several pens work in parallel.
- Everything is on the page by 70% of the shot; characters take 0.6–1 s to draw.
- Output is 24 fps with drawings held on twos.
- Doodle-on-photo uses CC0 objects with drawings attached in object (u, v) coordinates.
- Between looks, use drawn transitions (blot, iris, torn edge) or hard cuts.

## 5. The owner's title-card brief, analysed

The brief is solid: a pure `renderFrame(t)`, READY gated on fonts, stills before the full render, and a fixed encode command. The analysis found three gaps; the skill closes all of them (`motion.title-cards-canvas`).

1. **The 15–20 s target can't be met by the formula alone.** Card length = 0.75 + hold:

   | Words | Card length |
   |---|---|
   | 1–2 | 1.95 s |
   | 3 | 2.04 s |
   | 4 | 2.35 s |
   | 5 | 2.66 s |
   | 6 | 2.98 s |

   A full sequence therefore runs **7.8–17.85 s**. Five four-word cards give only 11.75 s. The skill adds a fit rule: if the natural total is under 15 s, stretch the holds only, by s = (15 − 0.75n)/Σhold. The 0.5 s and 0.25 s motion is never stretched. If s > 1.6, warn and suggest more lines.
2. **The accent is a hue-only distinction.** #c8ff3d against the ink #f4f2ec is **1.05:1**, while both are about 17:1 against the background. That works for emphasis, but colour can't be the only carrier of meaning.
3. **Unspecified details** now have defaults:
   - Easing: easeOutCubic on opacity and y for the entrance; linear opacity for the exit.
   - Accent marking: `*word*` syntax; if a line has no marker, the fallback is the last non-stopword, which needs approval.
   - Line breaking: balanced two-line breaks, shrinking from 144 px to 96 px.
   - Accent drawing: cumulative `measureText(prefix)` offsets, drawn as three `fillText` calls so the accent colour never bleeds.
   - Frame naming: zero-based `f%05d`, with staged frame folders so stale frames can't lengthen a re-render.

   QA spot check: at entry + 0.25 s the card shows opacity 0.875 and a 5 px offset.

## 6. Render contract and harness for a zero-dependency Node app

**Contract.** The page exposes `DURATION`, `FPS`, `READY` and `renderFrame(t)`. The harness sends an integer frame index and the page computes `t = i/FPS`.

- Each frame resets the canvas state and paints an opaque background.
- Banned: `Math.random`, `Date`/`performance.now`, timers, rAF, CSS animation, infinite tweens.
- Randomness uses a PRNG seeded per object.
- Only pure precomputation is cached (layout, path lengths).
- Simulations run on a fixed step from t = 0, with checkpoints.
- Assets are same-origin over http or data URLs, because a tainted canvas can't `toDataURL`.
- Fonts are confirmed loaded with `document.fonts.load`/`check` plus a fallback-width test.
- Pixels come from the canvas, never from screenshots.

**Option A: drive Chromium over CDP ourselves (recommended master path).**

1. Node ≥22 has a global `WebSocket`, so no npm packages are needed.
2. Serve the template folder with `node:http` on `127.0.0.1:0`.
3. Spawn Chrome with `--headless=new --remote-debugging-port=0 --user-data-dir=tmp --force-device-scale-factor=1 --force-color-profile=srgb`. On the owner's Windows PC, **Microsoft Edge is preinstalled and Chromium-based**, so rendering needs no install.
4. Read `DevToolsActivePort` and `/json/list`.
5. Call `Emulation.setDeviceMetricsOverride` to set 1920×1080 at device pixel ratio 1.
6. Poll READY.
7. For each frame, call `Runtime.evaluate("(renderFrame(i/FPS), c.toDataURL())")` and write the PNG, or pipe it into `ffmpeg -f image2pipe -c:v png -i -`.
8. Stage the output and publish atomically. Write a `render.json` sidecar with the browser version and font/input hashes.

Expect roughly 30–150 ms per 1080p frame, so about 1–2 minutes for 600 frames. Use one browser per job. Never launch one browser per frame or use per-frame `--screenshot` calls (alesha reports hangs). For Node versions below 22, a ~150-line RFC 6455 client is enough.

**Option B: pure FFmpeg.** Good for text-only templates.

- **libass/ASS** handles inline accent colours (`{\c&H3DFFC8&}`), `\fad(500,250)` and `\move`. Those are linear, but chaining 5 contiguous events approximates easeOutCubic within 1.1 px on a 40 px rise; 8 events bring it within 0.44 px.
- **drawtext** takes per-frame x/y/alpha expressions and can do `%{eif:…}` count-ups.
- **drawbox** can't animate over time on its own (its `t` means thickness), so boxes need `sendcmd` or overlay expressions.

Limits: no glyph-measured layout, no paths, charts, draw-on or springs, and FreeType rasterises glyphs differently from Chrome.

**Verdict:** use Canvas + CDP for every template. Add an FFmpeg/ASS fast path for lower thirds, captions, simple counters and plain cards over footage. Keep one renderer per template within a video.

## 7. QA checks

1. **Static:** purity grep for banned APIs; input validation (line and word counts, exactly one accent).
2. **Stills first:** one settled frame per scene, chosen when text is readable and the action is complete. The poster frame comes from the same kind of frame.
3. **Grid:** 24 evenly spaced frames, labelled with index and time.
4. **Strip:** 12–48 consecutive frames around fast actions and transitions.
5. **Full-size detail:** the densest frame, checked after 4:2:0 subsampling.
6. **Determinism:** hash frame k, render the last frame, render frame k again; the hash must match. Two renders must give identical bytes.
7. **Bounds and legibility:** glyph boxes at the extremes of each animation stay inside the safe box; minimum sizes are met; contrast is computed from tokens and sampled over footage.
8. **Encode gate:**
   - ffprobe: codec, size, 30/1 frame rate, `nb_frames = N`, duration within one frame, yuv420p, audio present only if intended, faststart.
   - `ffmpeg -v error -i out.mp4 -f null -` prints nothing.
   - blackdetect/freezedetect findings match the planned holds.
   - Contact sheet: `fps=2,scale=240:-2,tile=6xR`.
9. **Playback:** watch once at normal speed muted, once with sound.
10. **Honest report:** list automated checks and visual review separately.

**Repair loop:** each scene is its own render unit with a cache key (source + inputs + fonts + browser + format). Fix only the named scene, re-run its QA, and concat with `-c copy` (identical encode settings). Approved scenes go into the template library with *pattern / use-for / avoid-for* entries.
