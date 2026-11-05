# Room 10: Render & Recovery, the final master (P11, 0.42.0)

The master is the video the owner uploads. Every room before Room 10 renders a fast 360p preview (the "proxy"). Room 10 renders
the same video at full quality and makes the owner's approval of that file the last gate before publishing (publishing itself is
not built).

## The chain

1. **Room 08** approves a preview: the style-proof verdict.
2. **Room 09** approves the package (title, thumbnail, description) for that preview.
3. **Room 10** renders the master from exactly that preview's recorded inputs:
   - the same edit revision (cuts, graphics, captions, sound settings, score);
   - the same narration, visuals and style revision;
   - the same pinned FFmpeg build and renderer version.
4. **The owner** approves the master by name.

The master is refused when:
- the preview is not the newest approved one in Room 08 (`approvedPreview`);
- a different FFmpeg build is pinned now;
- the renderer changed since the preview.

## What is different from a preview

| | Preview (`proxy`) | Master (`master`) |
|---|---|---|
| Size | 640x360 / 360x640 (720p, 1080p or 1440p on request since 0.57/0.83) | 1920x1080 / 1080x1920 |
| Frame rate | the edit's, at most 30 | the edit's, at most 60 |
| Video | H.264, CRF 26, veryfast | H.264 High, CRF 17, slow, two B-frames, closed GOP of half the frame rate |
| Audio | AAC 128 kb/s | AAC-LC 384 kb/s, 48 kHz, stereo |
| Drawn shots and graphics | drawn at preview size | drawn again at full size |

All of it follows YouTube's recommended upload settings. Both kinds are BT.709 TV range with the moov box first ("fast start").

## Checks on the real master file

The master gets the preview's checks:
- full decode;
- audio/video alignment, duration and frame;
- the narration audio and its loudness checks;
- black and frozen frames;
- unplanned cuts.

It also gets two checks of its own:
- **delivery format** (`R.deliveryCheck`): H.264 High, yuv420p, BT.709, progressive, the expected size and frame rate,
  AAC 48 kHz stereo, and the moov box before the media (`R.atomOrder` reads the top-level boxes).
- **matches the approved preview** (`R.ssimArgs` and `R.previewMatch`): the master is scaled to the preview's size and compared
  frame by frame (SSIM).
  - The same picture at two sizes scores about 0.98; a different shot about 0.5.
  - The check fails on an average below 0.9, or on any run of frames below 0.8 lasting a quarter of a second.
  - It proves that the master shows what the owner approved.

Claude's frame scan is not run on a master: it is compared with the reviewed preview instead, and no tokens are spent.

## Recovery: resume only verified parts

A master can take hours (a long video, drawn shots at full size). Every finished part is recorded in `render_stages`:
- each drawn shot;
- each canvas graphic;
- each segment and each lossless join;
- the final file.

Each record holds the part's file, its SHA-256 and a hash of the command that made it. The command hash includes the drawing,
its words and size, and the engine version. For the final file it also includes the sound's checksum.

- **The program stops** (power cut, restart): a running master is marked *interrupted*. Its work folder and records are kept;
  everything else in the work area is cleared.
- **A master fails:** it keeps its parts too.
- **Retry** (at most 3 attempts) reuses a part only when its file is still there with the recorded checksum and the same command.
  - Anything that was being written when the program stopped has no record, so it is made again.
  - A part whose file changed is made again.
- Renders are deterministic: seeded drawing and grain, bit-exact encoder flags. A resumed master is therefore byte for byte the
  master made in one go (tested).
- **Cancelling** a master deletes its kept parts. A finished master leaves no work files or records.
- **Previews too (0.84, owner test 2026-11-03: a preview stopped at drawing 69 of 77 and started again at 1):** every render,
  preview or master, keeps its finished parts the same way. A stopped or failed preview says how many are kept, its button
  reads "Continue from the N finished parts", and the retry reuses them (a resumed preview is byte for byte the one made in
  one go, tested). Rendering runs on this PC and uses no internet: the "connection" that can drop is the program's link to the
  local browser that draws the shots. A browser that stops answering, crashes or drops that link is restarted for the shot
  up to three times (`BROWSER_LOST`) before the render stops; it used to be once. Starting a new preview of the same video
  lets go of the parts kept by its earlier stopped previews, so they never fill the disk.

## The approval and when it goes out of date

`approveMaster` records the owner's name, notes and confirmations:
- they watched the opening, a middle and the ending at full quality;
- they listened to the sound;
- the approved title and thumbnail fit;
- remaining check findings are accepted (only when there are any).

These checks can never be accepted away: full decode, audio/video alignment, duration, frame, narration audio, delivery format,
and matches the approved preview. Approvals are immutable rows (`master_approvals`).

An approval is current only while all of these hold. Otherwise the room shows the reason.
- The master's preview is still the newest approved one in Room 08. That approval itself goes stale when the script, narration,
  visuals or edit change.
- The package approval it was given with is still the current one.
- No newer master has been approved.

## Room 10 on the page

- The gate shows the approved preview, the approved package and the pinned build, and offers "Render the final master".
- Each master shows its progress and how many finished parts are kept.
- An interrupted or failed master offers "Retry from the finished parts".
- A finished master shows the player, every check, the upload format, the match with the preview, the download link and the
  render manifest, then the approval or the reason it cannot be approved.

## Tested

- `tests/editing.test.js` "Room 10 renders the final master...", with real FFmpeg on fixture media. It covers:
  - refused before Room 08;
  - a 1080x1920 master that passes delivery format and the preview match (SSIM above 0.9);
  - no work files left after success;
  - masters kept apart from previews in Room 05 and Room 08;
  - approval needs every confirmation, is immutable, and goes stale when the package changes;
  - a failure after two parts keeps them;
  - a restart marks the master interrupted and keeps its work;
  - a corrupted kept part is made again while the other is reused;
  - the resumed master is byte-identical to the one made in one go;
  - a newer approved master supersedes the older.
- Not tested: a long real video, drawn engines at full size over many minutes, and the owner's own review of a master.

## Removing a render that did not finish (0.88)

A cancelled, failed, out-of-date or stopped render has a **Remove** button (`RenderRoom.remove`, `POST /api/renders/:id/remove`): it leaves the lists (`render_jobs.cleared_at`), and its kept parts (`render_stages`) and work and output folders leave this PC, so a later render starts from the beginning. Its record stays for the history and the Operations report. A finished render is never removed this way.

## How a render works, waiting for a slow PC, and parts reused by later renders (0.92)

Owner questions 2026-11-05, with a screenshot of a failed 1080p render ("The browser did not answer Runtime.evaluate in time", with three messages about S01A, S01B and S01C, three tries each): how does rendering happen, does a model render, why three different shots, and can the work be broken into packets like a download manager?

**How it works.** Rendering is free and local: no AI and no internet. The program's drawing engine runs in a hidden copy of Edge or Chrome on this PC and draws every drawn shot frame by frame from its drawing and the narrator's word times. FFmpeg encodes each shot, joins the shots with their transitions, lays the captions and graphics, mixes the narration, music and effects, and checks the result. Every drawn shot is already its own part (a packet): up to three browsers draw three shots side by side (that is why three shots were named), and every finished part is kept with its checksum, so a stop or a retry goes on from the parts already made.

**Why it failed.** A shot's first frame plans how the hand traces its painted pictures. On a 4-core test PC that took about 5 s; every later frame took about 0.1 s. Every request to the drawing browser had 30 s. On a busy laptop with three browsers sharing the processor, that first frame ran past 30 s, three times on each of the first three shots.

**Now.**

- A shot's setup and its first frame get minutes; each later frame gets two minutes (`MotionRenderer.render` `setupMs`, `frameMs`).
- Each retry of a stalled browser waits twice as long (`timeoutMs` doubles).
- After a stall, the other browsers finish their current shot and stop, so one browser has the processor for the rest.
- The message names the step ("while drawing frame 1 of 66", "while loading its painted pictures") and, after the last try, the shot.
- When nothing was finished yet, the card says so instead of "0 finished parts are kept".

**Parts reused by later renders.** A drawn shot is kept in `<data>/render-cache/drawn` under the exact recipe that made it: drawing, words, size, frame rate, drawing-engine version, encoder settings and the pinned FFmpeg build. A later render of any revision copies a shot with the same recipe instead of drawing it again, so after a change only the changed shots are drawn. The cache keeps the newest 8 GB (oldest out first). Backups leave it out because it is made again on demand. A third render of the same edit in the tests drew nothing and gave the same file, byte for byte.

**Not done, and why.** Rendering at low quality and then raising it would only enlarge the small picture (blurry lines and words), so it is not used for the video. For a quick look, the live player in the Editing Room plays the edit without any render, and the 360p and 720p previews render faster.

**Download.** A finished preview has **Download the video**, saved as `<title>-r<revision>-<height>p.mp4`. Masters and language editions already had their download links.

**Editing during a render.** Not locked. A render works on the revision it started from, so changes make a new revision and a running render carries on. The Editing Room's road says so. A render still waiting to start becomes out of date when the edit changes, and the road says that too.
