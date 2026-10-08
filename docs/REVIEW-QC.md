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
