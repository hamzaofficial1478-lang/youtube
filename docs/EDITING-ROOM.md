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

## The timeline editor: full control (0.54)

Owner request 2026-10-22: the Editing Room works like an editing program; everything the edit applies is shown and
can be changed by hand or by typing what to change.

**Tracks.** One timeline with a ruler and zoom (1-16x, scrolls sideways): scenes, picture (drawn shots, stills,
footage, designed frames; a drawing changed in this edit is orange), transitions (cuts and soft transitions with their
length), drawing beats (one dot per drawn element at the moment it arrives on the narrator's words), graphics,
captions and audio (narration, music, sound effects). Clicking an item selects it and moves the playhead there; the
newest render of the edit plays in step with the playhead.

**Inspector.** For any clip: why it is there, its hold, camera move or source window, and the transition after it
(changed through the clip dialog). For a drawn shot: every field of the drawing, as lists where the drawing vocabulary
has one: the shot's set, mood, camera, opening transition, film look, texture and look/board/design; and every
element (kind, words, style, text animation, entrance, effect, pose, expression, prop, colour, position, size, "at",
"until", "then", nested fields as JSON), with move up/down, remove, add (text, figure, prop, effect, arrow, bubble) and
the whole drawing as JSON. Changes are an unsaved draft until "Save drawing", which makes one new revision; since 0.83 the
live player shows the draft as it is typed (below). Graphics and captions open their own editors.

**The edit's own drawings.** `set-drawing` (editing-brain `applyOp` with the room's `checkDrawing`) keeps a changed
drawing in the revision (`timeline.drawings[clipId]`), checked strictly against the board's cast, kit, engines and
film looks; `null` goes back to the board's drawing. Footage, stills and designed frames are refused. The render, the
sound effects placed on drawn moments and the language editions all use the edit's drawing.

**Frame preview.** `POST /api/edit-revisions/:id/frame` draws one frame of a drawn shot in the local browser
(an unsaved drawing too, checked first), or reads the source frame of footage or a still with the pinned FFmpeg (the
camera move, grade, captions and graphics are added at render). One preview at a time. Since 0.83 the page uses the
live player instead; this route checks the drawing against the style's rules and does not carry characters between
clips, so the player (which follows the render's own setup) is the closer view.

**Typed commands.** `POST /api/edit-revisions/:id/command`: the owner writes what to change, for the selected clip
or the whole edit. The team's Claude connection (Opus 5.5, task `editing`) answers, or ChatGPT when it is the only AI.
The request carries the operations, the style's allowed transitions and moves, the drawing guide, the edit as data and
the drawings of the selected clip and its neighbours (or as many as fit, 90 KB). It is reserved against the family's
monthly tokens first (`intelligence_usage` kind `edit_command`, 24,000 answer tokens), never retried by itself, and a
reservation left by a stop is marked unknown at the next start. The answer may use the edit operations and drawing
operations (`set-element`, `add-element`, `remove-element`, `set-shot`, `reset-drawing`); each is applied in order to a
copy and checked (drawings leniently, with named repairs), and the owner sees every step with a tick or the reason it
is not possible. Nothing changes until the owner presses Apply, which saves the checked operations as one revision
through the normal checks (a drawing changed twice is saved once, in its final form).

Tests: `tests/editing.test.js` "full control (0.54)" (strict owner checks, the render scope, frame previews of saved,
unsaved and stock shots, reset, a command answered by a stand-in AI with good and impossible steps, usage, apply, a
non-answer, a stale revision and no AI). Browser check on a scratch workspace: tracks, beats, the synced render, the
inspector, an unsaved change previewed and saved, a proposal shown with Apply.

## The live player and the road (0.83)

Owner review 2026-11-03: "no clear option where to start the render or the edit"; "which does the editing?"; "make it
like a real editor where we can play the timeline and see the video, with play and stop, and make changes, then render".

**The road.** Room 05 opens with the four-box road of Room 04 (`editRoad`): 1 Draft the edit (the editing brain, free,
no AI), 2 Watch it and change it ("▶ Play the edit"), 3 Render the video ("Render this edit", the only render button
once an edit exists; "Render plain assembly" shows only before), 4 Add music, then review (Audio Room and Review & QC).
The FFmpeg and inputs cards lead only while something there needs doing, otherwise they sit below the editor.
"Who made this edit, and how" (`editHow`) says who does what: the editing brain decides every cut, hold, move,
transition and graphic with a reason; the critic checks it; drawn shots come from the drawing engine; the owner changes
anything by hand or by typed command (the only AI step, it uses tokens); FFmpeg renders; Room 07 adds music.

**The live player.** The timeline editor has a viewer on top (16:9, or 9:16 for Shorts) with ■ Stop, ▶ Play / ❚❚ Pause,
frame steps and the clock; the inspector sits beside it and the timeline below. Space plays and pauses. Nothing is
rendered: `GET /api/edit-revisions/:id/player` (`EditingRoom.player`) gives every clip set up exactly as the render
sets it up (`Sk.carry` across clips, the drawing checked leniently on the primary engine, its words over its hold and
transition with `Sk.timing` and speech, duration hold + transition + 0.1 s; a test rebuilds a clip the render's way and
requires the same data), stills and footage with their source, in-point, speed and camera move, the joins, the
captions and the narration (`/narration`, byte ranges). The page loads the render's own drawing engine
(`GET /engine.js`: `motion.js` `pageScript`, the same files the render's browser runs) and draws each drawn clip on a
hidden `#stage` canvas, copied to the screen each frame; painted pictures come from `GET /api/art/<sha256>` (checked by
checksum). Stills get the render's eased move (`R.easedZoompan`), footage plays from its in-point at its speed, a soft
join dissolves from the last frame of the clip before, captions show plainly. The narration is the clock (when the
browser refuses sound the picture plays on the page clock). The playhead, clock and timeline scroll follow without a
page redraw; a redraw repaints the paused frame. An unsaved drawing in the inspector is sent to
`POST /api/edit-revisions/:id/player-clip` (checked strictly, like a save) and drawn as soon as it passes; a refusal is
shown on the screen. Designed (atelier) shots play Room 04's preview of the shot. The rendered video folds under the
viewer. What the player shows differently from the render: transitions as dissolves, captions in a plain look, no
music, sound effects or graphics overlays.

**Preview sizes.** A preview renders at 360p, 720p, 1080p or 1440p (`R.PRESETS.proxy1080`/`proxy1440`, `veryfast`,
CRF 21/20); the size shows on the render card. The final master's preview check now scales both sides to 360p, so a
720p, 1080p or 1440p preview can be compared (a 720p preview could not be compared before: FFmpeg's ssim needs the same
size).


## Asking Claude or ChatGPT (0.85)

Owner test, 2026-11-04: the editor answered "I can't add music or sound effects, because I have no audio operations, and there is no 'Stone Age' background", and there was no button to ask ChatGPT.

- The command box shows one button per connected AI: **Ask Claude** and **Ask ChatGPT** (`ai: 'claude' | 'chatgpt'` in `POST /api/edit-revisions/:id/command`). Without a choice Claude is asked first, as before. A missing connection is named.
- The editor can change the audio mix with `set-audio` (the same operation as Room 07's "Levels and mix"): narration loudness, music on or off with its level, ducking and fades, and sound effects with their density and level. It is sent the edit's current audio settings and the video's music score (id, revision, ready, current). Music plays only the video's current, ready score; when there is none, the dry run refuses the music with "score the music in Room 07 Audio first" and the sound effects can still be switched on (they come from the sound library and land on the drawings' moments).
- The plan's world and its own kit (`kit:<id>` items) are sent, and the new stone-age places, props and clothes are in the drawing guide, so "change the background to the stone age" is a `set-shot` with `set: "prehistoric"` or `"cave"`.
- A cast member's clothes come from the storyboard's cast and stay the same in every shot; the editor says so and points to building the storyboard again in Room 04 (the stone-age dressing happens there).

## Music and sound effects with the draft (0.86)

Owner request 2026-11-04: "the program will read the video by itself while editing and add music or sfx by itself". When the editing brain drafts an edit (`generate`), `autoAudio` gives it the family's sound library: when the video has no current score the free score is made from the story's sections (`SoundtrackRoom.rulesScore`, by "Program (automatic)"; no AI, nothing paid; Freesound fills missing tracks by itself when it is connected), the music is switched on when every cue has a track (ducked under the voice), and the effects when the library has effects, at the style's `sfxUsage` density (placed on the drawings' moments as before). A family on paid generation (ElevenLabs) is left to Room 07. What it did is kept in the revision's `meta.autoAudio` and shown in "Who made this edit, and how"; step 4 of the road says "Check the music, then review". The owner changes it in Levels and mix, the Audio row, or by asking the editor.

## Your changes carry on, the sound tracks, the polish, folded sections (0.88)

Owner review 2026-11-04 (three screenshots and nine questions).

- **A fresh draft carries your changes** (`carryForward`). An edit belongs to the exact approved visuals, narration, script and style (its scope); when one of them changes (for example the scenes were drawn again after an update and the visuals approved again) the edit is out of date and a fresh draft is needed. That draft now replays the owner's own changes of the newest earlier edit of the script, in order and without the ones undone, each checked again on the new inputs; a changed drawing comes along only while its shot's board drawing is the same; whatever no longer fits is listed. Shown in the revision note and "Who made this edit, and how".
- **Narration, Music and Sound effects rows** (`audioTracks`): each music cue with its mood and track, and each sound effect on its moment (the same `sfxEvents` the render uses) with the library sound it uses, or dashed when the library has none yet. A click shows what it is and why it is there, and opens Levels and mix. "Sound effects on drawn moments (rich)" means the density: subtle plays only the big moments, accent the main ones (each place and each object that makes a sound), rich every drawn moment.
- **Polish the whole edit with Claude / ChatGPT** (`command` with `polish: true`): one request reads the whole edit and proposes up to 40 changes (transitions per scene change, camera life, word animations and colours, effects where a line lands, drawings that match their words and the story's world), with the owner's approved editing skills (`editing.plan` brief, recorded in `skill_usage`) and the competitor lessons (`visualGuidance`); typed words are added to it. Every typed request now gets the skills and lessons too. Nothing changes until the owner applies.
- **Folded sections** (`editFold`): the critique, motion graphics, captions and YouTube craft start folded under their titles and stay as the owner leaves them.

## The editor that does what you ask (0.91)

Owner report 2026-11-04: Claude used tokens in the Editing Room and changed almost nothing; asked to add sound effects, it switched them all off; asked twice to change the same scenes, nothing happened, although the program could have had them drawn again.

**Why.** Three causes.

- With nothing selected, the editor sent the drawings in order until about 90 KB of data. In a long video, shots such as S18C, S20C and S21B never reached it, so it could only explain that it could not change them. A drawn picture's path data and the kit's shapes filled much of that room.
- It had no operation for one sound effect, the music's feel, or a shot drawn again. The only sound operation was the whole mix, so "add effects" could end as "effects off".
- A polish proposes up to 40 changes, but applying refused more than 20.

**Now.**

- The shots the instruction names come first (`namedClips`: shot labels like "S18C", whole scenes like "S20", "the end" and "the hook"), then the others in order while they fit in about 120 KB. Pictures and kit shapes stay in the program (`compactSketch`; an `art` or `kit` change from the editor is ignored). Shots that did not fit are listed by label, and the editor says so when it needs one.
- `add-sfx` {seconds, kind} and `remove-sfx` {seconds? kind?} are kept on the edit (`timeline.sfxEdits`, `M.applySfxEdits`). The render, the live player and the timeline's Sound effects row all use them. The editor sees the effects already in the edit (`AUDIO.effects`) and is told never to switch them off unless asked.
- `set-music` {feel} makes a free score in the owner's words when applied (`rulesScore` `feel`), and the edit's music plays it at the owner's levels. When the program later finds better tracks for the same cues, the owner's music follows them (`refreshAutoAudio`). Only the score changes; levels and effects stay as they are.
- `redraw-shot` {clipId, ask} goes to Room 04 when applied (`SceneRoom.changeShots`: one "change with words" job for several shots, each with its own words, on the newest storyboard). A painted picture is painted again. After it, the owner draws the changed shots, approves the visuals and makes a fresh draft; the edit's own changes come along (0.88).
- The prompt asks for every point of the instruction to become operations, or a line in "explain" saying why not.
- Applying takes up to 60 operations.

## Every change applies, however long the video (0.92)

Owner report 2026-11-05: "Apply 29 changes" was refused with "Send 1-20 edit operations", and a 10-15 minute video could need more than 100 fixes.

- The editor's answer carries up to two changes a shot for a polish (40 to 400) and one a shot for a request (20 to 200) (`opsCap`). The room for its answer grows with them, about 180 tokens a change, at most 64,000 (`answerTokens`).
- Applying takes up to 1,000 changes at once.
- A change of an element's kind (a prop that should be a figure) replaces the element in its place, keeping where and when it appears, instead of failing with "an element keeps its kind".

## Black HTML scenes in the player, the editor and designed shots, and three ways to edit (0.106)

Owner report 2026-11-10 with screenshots: every HTML render scene was black in the live player; asked to fix them, Claude proposed drawing all 18 again and every one was refused ("not a drawn shot that can be drawn again"), with only Discard to press after 32,994 tokens; "the program will not edit the video by itself: three options, by Claude, by ChatGPT or by the program".

**Why the HTML scenes were black.** The live player plays a designed (HTML) shot, and real footage, from the video Room 04 saved for it. The server refused to send any video file to the page ("Only images are shown in the browser in this room", a rule from 0.9 when Room 04 only showed pictures), so the player had nothing to draw and showed black. The rendered video was not affected: the render draws designed shots from their compositions. Videos are now served like the narration, with byte ranges (`SceneRoom.assetFile`). Checked in a browser: a saved video now plays in the player.

**The editor and designed shots.** The editor saw only black reported to it and guessed that the designs had failed, so it asked to draw them again; that operation existed only for drawn shots. Now:
- "Draw this shot again" on a designed shot designs it again, one new composition per shot, with the editor's or owner's reason (`redraw-shot` routes to `SceneRoom.redesignFrame`, which takes several shots in one job; a shot whose new design fails its checks keeps its current one and is named). Drawn shots still go to one "change with words" job; when both kinds are asked at once, the designed ones wait and are named, because one storyboard job runs at a time.
- The editor is told it cannot see the pictures and must never guess that a shot is black or broken.
- When none of the proposed changes can be made, the panel says so: there is nothing to apply, nothing in the edit changed, and only the editor's answer used tokens.

**Three ways to edit.** Step 1 of the road offers "Edit with Claude", "Edit with ChatGPT" (each when connected) and "Edit with the program (free)". The program's way is the editing brain as before: cuts on the narration's pauses, on this PC, without AI. An AI's way first has the brain cut the base for free, then that AI edits the whole video as a professional editor and motion designer, directed by the editing skills and the competitor lessons (the polish brief: transitions, camera, effects, word animations, music, sound), and every change that passes its checks is saved as one new revision signed "Claude for <you>" (`EditingRoom.editWith`, `POST /api/content/:id/edits` with `ai`). Undo goes back to the brain's cut. Shots the AI would draw again are listed, never drawn without the owner's click; a new music score that the sound library cannot fill is left out and named.


## What you asked and what was done, one task at a time, and redraws that wait for you (0.108)

Owner review 2026-11-11 with screenshots: the revision list was a good record but nothing in it could be opened; Ask Claude, Ask ChatGPT and the two Polish buttons could all be pressed while one of them was still working; and asking Claude for changes made the program draw scenes again by itself, which then failed, when the owner only wanted the changes and to choose who draws.

**Every request is kept.** Each Ask, Polish and Edit with is a row in `edit_commands` (who asked, which AI, the words of the ask, the base revision, the editor's answer, the changes it proposed, those refused with their reason, the tokens used, and when it was applied, discarded or went out of date). A proposal waiting under the timeline survives a page reload: the page restores it from the state (`content.command`). A proposal made on an older revision is marked out of date and cannot be applied.

**Revisions open.** Each row of the revision list is a fold: open it to read what was asked, the editor's answer, every change that was applied, the ones refused and why, and the shots sent to Room 04 (`revisionStory`, joined by `applied_revision_id`). Revisions made without the editor say what made them (the brain's draft, your own change).

**One task at a time.** One editing task runs per video. While the editor is answering, or while its proposal waits for Apply or Discard, the Ask, Polish and Edit with buttons are greyed out with a line saying which task holds them; the server refuses a second one with the same words (`assertIdle`, HTTP 409), so two tabs cannot start two. Drafting a fresh edit waits too. Discard (`POST /api/edit-commands/:id/discard`) frees the buttons. A request cut off by a restart is marked interrupted and asks to be sent again.

**Redraws wait in Room 04.** Applying a proposal no longer draws anything. Shots the editor wants drawn or designed again go to Room 04 with what it asked (`requestRedraws` → `SceneRoom.requestRedraw`); the panel says how many and has "Go to Room 04". There the owner chooses Redraw with ChatGPT (painted pictures) or Redraw with Claude (vector pictures), or sets them aside (SCENE-ROOM.md 0.108). A proposal with only redraws applies without a new revision. Music, sound effects, transitions, words and timing still apply here at once, because they are edit changes the owner can see and undo in the timeline.

## Effects over the shots, each engine's own editing, and the proposal that vanished (0.109)

Owner review 2026-11-12 with a screenshot: Claude's proposal never showed under the timeline, yet pressing Ask again said one was waiting; shots the editor wants drawn again should be visible on Room 04's storyboard; "each engine and each style must have its own editing style": the stickman video and the anime video were edited the same, plainly, "and it overrides the emotions".

**The proposal that vanished (a 0.108 bug).** The page does not refresh its copy of the program's state while the editor is answering. When the answer arrived, the page showed it, then on the next redraw compared it with that old state, which named no proposal yet, and threw it away as out of date. The server knew about the proposal, so the next Ask was refused. Now a proposal is replaced only when the state names a different request, the page refreshes its state after every answer or refusal, it also refreshes while a request runs in another tab, and an Apply that finds the proposal already applied, discarded or out of date clears it. A browser check reproduces the old behaviour and passes with the fix.

**Why the edits were plain and the same.** The editing brain had one rule table for every engine: cuts on the narration's pauses, a transition between scenes, camera moves for stills. Drawn and designed (HTML) shots, most of every video, got nothing laid over them, and the brain never read the narrator's performance, only each scene's purpose. So the anime video and the stickman video got the same cuts and the same few transitions.

**Effects over the shots** (`edit-fx.js`, pure): push (a slow push across a held shot), punch (a quick zoom on the word that lands), shake, flash, impact (two inverted frames on a hit), glitch, grade (a colour mood: cold, warm, moody, noir, vintage, danger, dream), vignette and letterbox. An effect belongs to its clip and is timed from the clip's start (`clip.fx`: kind, at, until, amount, grade, reason, skill). The render draws them in the clip's own FFmpeg segment (zoom and shake share one zoompan on a doubled picture; a pixel-art clip shakes by whole pixels and never zooms; the colour mood converts back to BT.709 TV range), so recovery, the render cache and the master's preview match work as before. Readiness also needs `negate` and `chromashift`. The live player draws the same effects with the same timing, the timeline has an Effects row (click one: what it is and why it is there), and the edit's facts say how many effects there are and which grammar they follow. Language editions stretch them with their clip.

**Each engine's editing grammar** (`GRAMMAR`): Stickman (comic punch-ins, a shake on every bump, light flashes on ideas), Whiteboard (quiet: gentle pushes and wipes, almost no shake), Documentary (slow pushes, letterbox and colour mood for reveals, glitch only for technology or deception), Motion graphics (kinetic punch-ins on numbers, glitch accents, whips), Anime / HTML render (impact frames and screen shake on every hit, white flashes, letterbox for the dramatic moment, colour moods for sorrow or rage), Paper collage (small stop-motion shakes, paper slides), Pixel art (screen shake, flashes, glitch; no smooth zooms) and Cinematic (rare, slow). Each grammar weights the effects it uses, caps the moment effects a minute and names the transitions its editor reaches for first (only those the style allows). Every clip edits by its own grammar: a designed shot by its finish, a drawn shot by its engine, so a Story Mix video changes grammar with its shots.

**Feeling first.** When the brain drafts an edit it reads the narrator's performance (the voice direction's emotion and energy per sentence, `deliveryFor`) and the words: a hit word gets an impact and shake (or a flash, by grammar), a reveal, a surprise or a number a punch-in, an idea a flash, technology or a lie a glitch, a laugh a small shake; a sad, tense, angry or memory line gets a colour mood and a vignette instead of a hit; the turn of the story or a dramatic high-energy line gets the letterbox (one per 90 s); a held drawn or designed shot whose drawing keeps a still camera gets a slow push. No two moment effects within 2 s, at most two on a clip. Each effect's reason names the word and the feeling.

**The AI editor** gets the effects, this video's editing grammar, each clip's grammar, the narrator's feeling on it ("feel") and the effects it already has, with the operations `add-fx` and `remove-fx`; the polish asks it to edit by grammar and feeling and to do what an experienced editor of this kind of video would do, not the plain default.

**Edits made before 0.109.** A current edit is not drafted again (0.95), so "Add effects by feeling (program, free)" beside the Polish buttons places the program's effects over every clip without effects as one revision (Undo takes it back); clips with the owner's or the editor's effects are left alone. A fresh draft that replays the owner's changes never doubles an effect (the same kind at the same moment replaces the earlier one).
