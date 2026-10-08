# Review & QC Room (P09, 0.16.0)

Room 08 in the Production panel. It reviews one finished render, puts everything the other rooms already
measured about it into one list with times, links each issue to the place where it is fixed, and hosts
the style-proof verdict. **That verdict is still the one approval.** P09 adds no second approval chain: the
Editing Room and the Audio Room now send you here to record it.

## 1. New checks on every render

Added to the render worker (`render-room.js`, helpers in `render.js`). They run on the real output file:

| Check | Rule |
|---|---|
| Full decode | `ffmpeg -v error -i proxy.mp4 -map 0 -f null -` must exit cleanly with no error line. Damaged frames or a truncated tail fail, even when ffprobe can still read the header. |
| Audio/video alignment | From ffprobe: audio and picture must start within one frame of each other and end within one frame + 50 ms. |
| Audio clipping | Only when the edit has no narration finish (the finish has its own true-peak check): true peak at or below −0.1 dBTP. |
| Hook sheet | A second contact sheet: every second of the first 15 s (long-form) or every half second of a Short's first 5 s. |
| Sheet geometry | Both sheets record columns, rows and tile size, so the page labels each frame with its time. |

Black frames, frozen picture and unplanned cuts now also record their time spans. Renders made before 0.16
lack these checks. The review blocks them with "render it again" (local, no cost).

## 2. The review (`review.js`, pure)

`GET /api/renders/:id/qc` recomputes the review from the render's immutable record, its file checksums and
the current state of its inputs. `review.js` has no I/O, clock or randomness.

**Blockers** (cannot be accepted away):
- the script, narration, visuals or edit changed after the render (out of date);
- a render file (video, sheets, manifest, finished narration) is missing or changed;
- the file did not decode cleanly, or the render predates the decode check.

**Issues, in time order**:
- failed render checks, one entry per measured moment, each naming its clip;
- the editor's critic findings with their own fixes;
- caption checks caption by caption. The critic's caption summaries are replaced by these per-caption entries. With the narration's sentences, the review also proves every narrated word is captioned exactly once.

Every issue carries a repair link. Depending on the issue it opens one of these:
- the clip editor;
- the caption correction;
- the graphic editor;
- the critic's one-click fix;
- the Audio Room levels.

**Aligned read**: one row per narration sentence, showing:
- a frame thumbnail from the contact sheet;
- the time (click to jump the player there);
- the words;
- the captions shown with them;
- the clips and cuts under them;
- any accepted graphic;
- the number of issues in that sentence.

**Status**: blocked → ready for your verdict → approved or changes requested. A passed verdict whose inputs
later change shows as blocked with "the earlier approval no longer applies".

**Not checked** (said on the page): text-safe areas are kept by the fixed layouts, not measured in pixels.
Facts, rights and how the narration sounds need your judgement. Word times inside a caption are estimated.
There is no AI look-over of the frames.

## 3. The verdict

Same endpoint and form as before (`POST /api/renders/:id/review`), now opened from Room 08. Passing needs:
- the review to have no blockers;
- the usual confirmations;
- explicit acceptance of the critical editor and caption findings, which now include the caption-coverage check;
- for a failed render check, `qcAccepted` as before.

The verdict records the review's counts it was given against.

## 4. Claude frame scan (0.17.0)

Room 08 → **Claude checks every frame first** (`frame-scan.js`). Claude looks at the finished render so that
you only check the moments it, the render checks, the editor and the caption checks flagged.

- **What it reads**:
  - a frame from the middle of every clip and every accepted graphic;
  - every half second of the first 5 seconds (the hook);
  - fill-in frames so no gap is longer than about 4 seconds;
  - the last frame.

  Frames are cut from the real render with the pinned FFmpeg into contact sheets of 16 (4×4, 320×180 tiles; 180×320 on Shorts). Each frame is listed with what the narration says, the caption on screen, the shot and any graphic there.
- **What it reports**: only concrete, visible problems:
  - picture (black, glitched, stretched, distorted AI images);
  - mismatch with the narration;
  - on-screen text;
  - captions;
  - graphics that disagree with the narration;
  - repeated shots;
  - rights (watermarks, logos, burned-in subtitles, real people).

  Each problem has a frame, a severity and a one-line fix. Taste is not reported. The narration and caption text is treated as untrusted data.
- **Cost and control**:
  - Six sheets (96 frames) go into one Claude answer, which reserves 23,200 tokens from the family's monthly limit before it starts; a 30-minute video is about six answers.
  - It uses the main model (Opus 5.5), on the subscription or the API key.
  - Nothing is retried by itself. A finished answer is kept, so a retry asks only for the missing ones.
  - Images go to the Claude Code app as one stream-json message, still with no tools.
- **Automatic**: the owner can switch on "scan every new render" per family, with a named setting. Each scan still reserves tokens and stops at the monthly limit.
- **In the review**: findings are listed as "Claude frame scan", with their frame thumbnail and a repair link (the clip, the caption or the graphic at that moment). They are notes to check, not an approval.
- **Verdict**: once a render has a completed scan, the owner may confirm "I checked every moment Claude and the checks flagged" instead of "I watched the whole render" (owner decision, 2026-10-08). The narration listening confirmation stays mandatory for a narration finish. Blockers still cannot be accepted.
