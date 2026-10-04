# Render engine and assembly preview (P05)

Version 0.10 adds the first rendering stage, shown in the Production panel as **Room 05 · Editing Room → Assembly preview**. It lays the approved visual board (Room 04) on the approved narration (Voice Room) with the family's style and renders a low-resolution **proxy** with your pinned FFmpeg build. A human then records the **style-proof verdict**. The editable timeline (P06) comes next and will start from this assembly.

## 1. FFmpeg readiness

**Run readiness check** (local, no cost):

- finds `ffmpeg` and `ffprobe` (an absolute path from `FFMPEG_PATH`/`FFPROBE_PATH`, otherwise your PATH) and records their version, path, size and SHA-256;
- checks every filter and encoder the renderer uses: zoompan, xfade, tpad, trim, setpts, scale, crop, fps, setsar, format, concat, apad, blackdetect, freezedetect, tile, libx264 and aac;
- renders a 2-second fixture twice and requires byte-identical files (**deterministic**).

On Windows, a full build such as `winget install Gyan.FFmpeg` contains everything.

**Pin this build** records the exact FFmpeg and ffprobe binaries (by SHA-256) with your name and reason. Every render checks the files on disk against the pin before it starts. If FFmpeg was updated or replaced, rendering stops until you run the check again and pin the new build deliberately, so an update can never change a video silently.

## 2. What the proxy contains

| Part | How it is rendered |
|---|---|
| Frame | Proxy 360p: 640×360 for long-form, 360×640 for Shorts, at the style's frame rate (capped at 30 fps) |
| Timing | Each shot starts on the frame nearest its planned start; the picture always ends exactly with the narration |
| Stills | Ken Burns motion through FFmpeg `zoompan`, strength from the style's motion intensity. `ken-burns` cycles zoom in, zoom out, pan right and pan left; `zoom`, `pan` and `static` are drawn as named |
| Clips | Scaled and cropped to fill the frame, trimmed to the shot, and held on the last frame if the clip is shorter |
| Transitions | `cut` joins the segments losslessly; `crossfade` and `dip-to-black` use `xfade`, and each outgoing shot is rendered slightly longer so the overlap never shifts the narration |
| Sound | The approved narration WAV, encoded as AAC; music and effects arrive with the Audio Room |
| Not yet | On-screen text and captions (Captions Room), music (Audio Room), colour grading (Editing Room) |

Encoding uses libx264 with fixed settings and bit-exact flags, so the same inputs and the same pinned build give the same file. The automated test renders the same proxy twice and compares checksums.

Only styles whose renderer is **FFmpeg montage** can render in this milestone. That is Documentary Montage, chosen on 2026-10-04 as the first executable style. Other styles show which renderer they still need.

## 3. Checks on every proxy

Before rendering, the narration and every visual must still match the SHA-256 recorded when they were approved. After rendering, the program checks the real file:

| Check | Pass rule |
|---|---|
| Duration | Video length equals the narration within one frame plus 0.15 s |
| Frame | Proxy size and frame rate as planned |
| Narration audio | An AAC audio stream is present |
| Black frames | No black stretch longer than the style's limit (`blackdetect`) |
| Frozen picture | No still picture longer than the style's limit (`freezedetect`); findings name the shot |

A **contact sheet** (one frame every few seconds, per the style) helps you scan the whole video at a glance. The **render manifest** (`render-manifest.json`, linked on the page) lists the inputs and their checksums, the pinned FFmpeg build, every command line (local paths removed), per-shot frames and motion, the output checksum and probe, the QC results and the last lines of FFmpeg output for every step.

Renders run on your computer one at a time. You can cancel a queued or running render. A failed, cancelled or interrupted render can be retried (3 attempts); after a restart, a render that was running is marked interrupted and never resumes by itself. Completed results cannot be changed (SQLite trigger).

## 4. Style-proof verdict

**Record style-proof verdict** asks you to confirm that you watched the whole proxy with sound, that motion, pacing and transitions match the style, and that the visuals stay in step with the narration. QC findings must be accepted explicitly. "Needs changes" requires a note. A render becomes **out of date** as soon as the visual board, the narration or the script changes, and an out-of-date render cannot pass.

## Where files are kept

`data/renders/<family>/<script>/<render>/` holds `proxy.mp4`, `contact-sheet.jpg` and `render-manifest.json`. Working files are deleted after each render. Like the rest of `data/`, these stay on your computer and out of GitHub.

## Verification so far

Automated: real FFmpeg on generated media (frame-exact cut, crossfade and dip-to-black assemblies; byte-identical re-render; QC; cancellation; pin mismatch; restart recovery; HTTP range streaming). Browser: a 5-minute, 48-shot Documentary Montage proxy rendered in about a minute in the build sandbox, QC flagged the fixture's flat AI test images as frozen as intended, and the verdict was recorded. Your own PC, your FFmpeg build and real stock and AI images still need a first run.
