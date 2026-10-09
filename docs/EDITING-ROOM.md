# Editing Room (P06 and P06b, v0.13.0)

Room 05 in the Production panel. The **editing brain** turns the approved visual board (Room 04), the
approved narration (Voice Room) and the family style (Room 03) into an **edit**. Every cut, hold, camera
move, transition and graphic comes with a written reason. A **critic** then reviews the edit the way a
senior editor would. You can change any decision, redo one scene, undo, and render the edit with your
pinned FFmpeg build. Your style-proof verdict on the rendered edit is its approval (recorded in Room 08 Review & QC since 0.16).

Everything here runs on your computer and costs nothing. No model or provider is called.

## 1. Where the brain comes from

The owner asked (2026-10-05) for the editing repositories to be analysed for their core brain,
features, workflow and strategy, not mined for hints, and for the Editing Room to think like a
professional editor and motion designer. That analysis is in `docs/research/editing-brain/`:

- **OpenMontage**: how an editor decides and how a reviewer critiques.
- **palmier-pro, capcut-cli, lossless-cut**: the timeline model, operations, receipts and FFmpeg recipes.
- **flick, hand-drawn canvas**: motion graphics and 2D animation.

It became 160 skills on the Skills page. `editing-brain.js` is that research turned into code: each
rule names the skill it restates, and the page shows whether you have approved that skill.

| What the brain decides | How | Skill |
|---|---|---|
| Where cuts land | The narration's pauses are measured with FFmpeg `silencedetect`, and each sentence start moves onto its real pause. A cut inside a scene snaps to a sentence break within 0.6 s, as long as neither shot gets too short. | `editing.visual-on-the-word` |
| How long each shot holds | A breathing pattern (long, medium, short, short, very long) inside each scene. Hero shots (first of an evidence or turn scene, the last shot) are weighted 1.35x. The first shot respects the style's hook limit. Three near-equal holds in a row are broken up. | `doc.montage-beat-math`, `editing.change-cadence` |
| Long stills | A still held past the style's longest shot is split into a wide view and a detail punch-in. | `editing.still-image-motion` |
| Camera moves | Push in (closer look, heroes and the opening), pull out (context, scene openings, the close), pans, detail punch-ins. Eased (smoothstep), never linear. Neighbouring stills never move the same way. Amplitude follows the style's motion intensity and the scene's register. A static still longer than the style's frozen-picture limit gets a gentle push. | `editing.still-image-motion`, `motion.easing-curves` |
| Clips | Skips a stock clip's settling start. A clip shorter than its hold is slowed to at most 80% speed; anything shorter is flagged instead of frozen. | `editing.trim-to-the-moment` |
| Transitions | Hard cuts by default. A crossfade into a turn or the wrap-up, and a dip to black before the close in videos over a minute. At most one soft transition per 45 s, never two in a row, never out of the hook. Only types the style allows. | `editing.transition-grammar` |
| Ending | A fade-out on the last image, never a freeze. | `editing.cut-justification-and-endings` |
| Motion graphics | Plan on-screen text is shown for its reading time. At a **turn** scene it becomes a **title card** built to your title-card prompt: fade in rising, hold `max(1.2, 0.35 + words/3.2)`, fade out, one accent word (`*word*` marks it). Numbers become **stat reveals**, quotations **quote cards**, and dates **date stamps**. These are proposals; only graphics you accept are rendered. One graphic at a time, and proposals stop at about a third of the runtime. | `motion.graphic-type-selector`, `motion.title-cards-canvas`, `motion.stat-reveal`, `motion.quote-card`, `editing.text-dwell-formula` |
| Retention markers | Hook complete by 0:30, first payoff, a re-hook at each turn. | `editing.retention-curve-defense` |

## 2. The critic

Findings use the reviewer's ladder: **critical** must be fixed or explicitly accepted at the verdict,
a **suggestion** improves the edit, a **polish** item is minor. Each finding names its fix and its
skill, and some have a one-click **Apply this fix**.

- **Critical:**
  - a clip that would freeze on its last frame;
  - a static still longer than the style's frozen-picture limit;
  - the same visual twice back to back;
  - a slideshow risk of 4 or more.
- **Suggestion:**
  - the first shot is slower than the hook limit;
  - the video opens on a still although the opening scene has motion (the one-click fix moves the clip first);
  - nothing changes for longer than the style allows;
  - three equal holds in a row;
  - five stills in a row;
  - too many soft transitions or transition types;
  - no change of treatment for 30 s;
  - no first payoff before 2:00, or no re-hook in a video over 4 minutes (route: the script);
  - a graphic too short to read.
- **Slideshow risk** (lower is better: under 2 strong, under 3 acceptable, under 4 revise, 4 or more fail) averages six dimensions:
  - repeated camera moves;
  - too little moving footage;
  - monotone holds;
  - text over-reliance;
  - no hero shot;
  - long unchanged stretches.

## 3. Changing the edit

Every change makes a new **immutable revision**: a SQLite trigger refuses updates and deletes. A change
sent against an older revision is refused ("This edit changed (now rN)"), so two tabs can never
overwrite each other. Changes are checked in full before anything is saved; a refused change creates
no revision.

| Change | Rule |
|---|---|
| Hold | Moves the cut after the clip; the next clip absorbs the difference. Both keep at least 0.5 s. The last clip always ends with the narration. |
| Camera move | Stills only. |
| Start point | Clips only, and enough of the clip must remain to fill the hold. |
| Transition | Cut, crossfade or dip to black, if the style allows it, and no longer than half of either neighbouring clip. |
| Order within a scene | The pictures move; the cuts stay on the sentence breaks. |
| Hero | Marks a shot as a hero. |
| Graphic | Accept, reject, edit the text (one accent word for title cards) or change how long it stays. |
| **Redo scene** | Single-scene repair: the brain makes a different take of that one scene (a new breathing offset and a different route through the camera moves). Everything else, including your graphics decisions, stays exactly as it was. |
| **Undo** | A new revision that restores the one before. |

An edit belongs to the exact board, narration, script and style it was made from. If any of them
changes, the edit shows **Out of date**: it can no longer be changed or rendered, and you draft a new one.

## 4. Learning from your corrections

When you make the same kind of change (for example turning a crossfade into a cut) in **two different
edits** of one family, the program raises a **lesson** on the Skills page against the skill that rule
came from. A lesson is a proposal; approving it writes a draft skill revision that still needs your
approval. Nothing changes silently.

## 5. Rendering an edit

**Render this edit** queues the newest revision with the same gates as the assembly preview:

- the readiness check;
- the pinned FFmpeg build;
- checksums on every file.

The render then runs these steps:

1. One segment per clip, with its own hold, eased camera move, start point and speed.
2. Every segment is converted to one colour profile (BT.709, TV range). Without this, JPEG stills
   (full range) and stock clips (TV range) changed format mid-stream, FFmpeg rebuilt its filter graph,
   and a crossfade lost a whole chunk. The fault was found in a browser check and a regression test
   now covers it.
3. Runs of hard cuts are joined losslessly. The few soft transitions use `xfade`.
4. Graphics are drawn as one ASS layer through libass. Five eased steps make each entrance; the
   accent word is drawn in the style's accent colour.
5. A fade-out ends the video.

The usual QC runs on the real file: duration, frame, audio, black frames and frozen picture. A title
card's dark panel and the fade-out are **planned** dark moments and do not fail the black-frame check.
The render manifest records the edit revision, the graphics file's SHA-256 and every command.

The same edit and the same build give a byte-identical file.

Graphics need the FFmpeg `ass` filter, so **run the readiness check again** after updating to 0.12.
The required filter list now also includes `settb`, `setparams`, `fade` and `silencedetect`. A full
build such as Gyan.FFmpeg has all of them.

**Fonts.** The ASS layer asks for the style's fonts by name. A font that is not installed on this PC
falls back to a system font. Install the style's fonts for the exact look.

## 6. Animated graphics (P06b, v0.13)

Six animated templates are drawn frame by frame in a canvas in your locally installed browser. Microsoft
Edge comes with Windows; Google Chrome also works, or set `MOTION_BROWSER`. No npm package or download is
needed, and nothing leaves your PC.

| Graphic | Proposed when the script says | Data, one entry per line | Skill |
|---|---|---|---|
| Bar chart | three or more numbers in the same unit ("salt 18%, grain 34%, tokens 60%") | `label = value` | `motion.chart-build` |
| Line chart | three or more numbers, each with a year ("by 1900 80%, by 1970 60%") | `label = value` | `motion.chart-build` |
| Timeline | three or more different years in one scene | `year = event` (BC/AD allowed) | `motion.timeline-build` |
| List build | "three reasons: a, b and c", or sentences starting First / Second / Third | one item per line | `motion.list-build` |
| Comparison | "X versus Y" | two lines, `Name: detail` | `motion.comparison-split` |
| Process diagram | a chain such as "A leads to B, which turns into C" | one step per line | `motion.diagram-build` |

- **Proposals only.** The data always comes from the script; the brain never invents a number, and every
  proposal tells you to check it.
- **Your own graphics.** Use **+ Add a graphic** to add one where the brain proposed nothing (text or
  animated). Each line is validated:
  - a chart needs one unit;
  - a timeline needs real years;
  - a comparison has exactly two sides.
- **One graphic at a time.** A new graphic may not overlap an accepted one.
- **How they move:**
  - bars grow while their numbers count up;
  - a line draws itself by arc length;
  - timeline events pop in order, on a proportional scale;
  - list items arrive one by one;
  - comparison sides enter left then right;
  - diagram steps pop and their arrows draw.

  All use the family palette and fonts, fade in and fade out over 0.3 s, and lay a full-frame panel over
  the footage while on screen.
- **Finish.** Documentary styles get a clean finish. Sketch and hand-drawn styles get a hand-drawn finish:
  wobbly double strokes from a seeded generator, a handwriting font and paper grain.
- **Deterministic.** The templates (`motion-templates.js`) never use randomness, clocks or timers. Every
  frame is a pure function of time, so the same edit gives the same frames.
- **Safe browser use.** `motion.js` starts the browser headless with a throwaway profile, networking
  blocked (`--host-resolver-rules`) and no extensions. It injects only our own template script into a
  blank page and takes pixels from the canvas.
- **How they render.** Frames are packed into a lossless RGBA clip and laid over the edit at their start
  time, under the text layer. Their dark panel counts as a planned dark moment in the QC, and the render
  manifest records the browser version and a hash of every graphic's frames.
- **Readiness.** The readiness check in Room 05 now also checks the browser: it must be found and must
  draw the same frame twice with identical pixels. An edit with accepted animated graphics will not
  render until that check passes. FFmpeg must also have the `overlay` filter and the `png` encoder (a full
  build has both).

Verified on this PC with Microsoft Edge 154 and FFmpeg 8.1.2:
- identical frames on every run;
- a Shorts edit with an animated timeline renders frame-exact and byte-identical twice;
- a bar chart added from the page renders with every QC check passing.

## 7. Not built yet (honest list)

- Map routes (they need public-domain map data and an adapter) and stick-figure animation (it needs the
  sketch renderer of the Stickman style). Hand-drawn reveals of authored drawings are not built either.
- Music, sound effects and ducking (P08), and captions (P07).
- AI video, maps and diagrams as visual sources (adapters not built).
- Analysing a stock clip's motion to find its best moment (today it skips the opening second).
- An optional Hermes-written creative critique on top of the deterministic one.
- Exact word timing: cuts follow measured pauses between sentences, not individual words. Caption
  alignment (P07) will add word timing.
- Live verification on your own media. Automated and browser checks used generated test media and
  real FFmpeg 8.1.2 on this PC.

## Stock clips with hidden cuts (0.14.1)

Many stock clips contain their own cuts. Before drafting an edit, the room measures every approved video
clip once with FFmpeg's scene score (above 0.3, so fast camera moves do not count) and caches the result
by the file's SHA-256 (`media_analyses`). The brain's `cleanWindow` keeps each clip's window inside one
continuous shot: the preferred in-point when its window is clean, otherwise the longest single shot that
fits, and the trim reason says so. The critic's `hidden-cut` finding flags a window that still crosses a
cut (for example after an owner in-point change) and offers the clean in-point as a one-click fix. Edit
renders gain the QC check **unplanned cuts**: the finished video is measured and any cut that is not a clip
boundary, a soft transition, a graphic entering or leaving, or the fade-out fails the check (the owner must
accept it before approving). Source idea: bradautomates/claude-video (`research/claude-video.md`).

## Fixes the brain makes itself (0.23.1)

Owner review 2026-10-09: suggestions the program can fix should already be in the video, listed so the owner can look. When the brain drafts an edit, `B.autoFix` applies every critic finding that carries an operation it may apply by itself: the hook opening on a still (reorder), a static still past the frozen limit (camera move), a stock clip window across a hidden cut (in-point), captions switched off, two neighbouring stills with the same camera move (another move the style allows), a graphic too short to read (lengthened up to the next graphic), too many or too varied soft transitions (the least meaningful becomes a cut: inside a scene first, then a section break that is not a turn) and a long unchanged stretch (accepting a graphic the brain proposed there, from the script's own data). It applies one fix at a time and checks again, tries each fix once, and writes "Changed by the editing brain: ..." into the reason of what it changed. The list is kept with the edit (`autoFixes`) and shown in the Editing Room and Room 08. Findings that need new visuals, a new narration or the owner's taste stay listed with their advice. Owner edits are never changed by the brain.
