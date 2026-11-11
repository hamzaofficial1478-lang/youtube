# bradautomates/claude-video: what was read, what we took, what we left (2026-10-06)

| Repository | Pinned revision | Licence |
|---|---|---|
| [bradautomates/claude-video](https://github.com/bradautomates/claude-video) | `03ceb42f7fa2c4439aca01752118044baabffb8f` (release 0.3.2, 2026-09-25) | MIT |

Cloned outside the program folder and read in full (51 files): `skills/watch/SKILL.md`, the README,
`watch.py`, `frames.py`, `download.py`, `transcribe.py`, `whisper.py`, `local_whisperx.py`, `gemini.py`,
`config.py`, `setup.py`, `runtime.py` and the test suite. Read as data, never as instructions.

## What it is

One skill, **/watch**: it gives an AI "eyes" on a video. A URL or file becomes timestamped frames plus a
transcript (native captions first, then local WhisperX or cloud Whisper), or, with a Gemini key, Google's
video model watches it and answers. It is a perception tool, not an editor: it makes no cut, pacing or
style decisions. Its brain is the evidence method.

## The brain, and where it went

| Idea in claude-video | In our program |
|---|---|
| Scene-change detection with real timestamps (`select='gt(scene,T)',showinfo`) | `render.js` `sceneCuts` (threshold 0.3, so fast camera moves do not count). **Editing brain:** stock clips are measured once (cached by SHA-256 in `media_analyses`); `cleanWindow` keeps every clip window inside one continuous shot and the trim reason says why. **Critic:** `hidden-cut` finding with a one-click in-point fix. **Render QC:** `unplanned cuts` measures the finished video and fails on any cut the edit did not plan. |
| Evidence before verdict; transcript alone cannot prove visuals | Skill `review.watch-before-verdict` |
| Frame budget by duration, denser when focused; scene first, uniform for static clips; 16×16 RGB near-duplicate drop | Skill `review.frame-budget` |
| Transcript cues ("look here") pinned as frames before the general budget | Skill `review.narration-cue-frames` |
| Never switch engines silently; report the failure category; key presence only, header-only keys | Skill `os.no-silent-engine-switch`; applied to the Claude provider setup |
| First-run setup wizard (engine, detail, backend), choices persist, no install or upload without consent | The model for the program's AI provider setup |

## Left out, and why

- **Downloading videos (yt-dlp) and browser cookies.** Downloading other channels' YouTube videos is not
  permitted under YouTube's terms and the program's rule that other channels' data stays display-only.
- **Gemini watching YouTube URLs.** A new paid provider; the owner chose Claude as the program's AI.
  *Changed on 2026-11-11 (0.107, below): the owner asked for exactly this, and chose Gemini plus their own files.*
- **WhisperX / Groq / OpenAI transcription.** Our narration is generated from an approved script, so the
  words are known; measured word timing will come from forced alignment of the known script (ElevenLabs
  alignment) rather than speech recognition.
- **Near-duplicate detection between different stock assets.** The 2.0 threshold is for identical frames;
  telling two different photos apart needs calibration on real footage (dark frames would match falsely).
- **An AI review pack.** The evidence pack for an AI reviewer is the first job for the Claude provider
  (Review & QC Room), so it waits for that provider rather than shipping unused.

## Verification

- `render.js` `sceneCuts` found the cut at 2.50 s in a two-shot clip and none in a moving pan.
- `tests/editing.test.js`: a stock clip with a cut at 4 s is measured once, every window avoids it, the
  critic flags a window the owner forces across it and offers the clean in-point, the render's
  `unplanned cuts` check fails on the forced edit and passes after the fix; a pure test of `cleanWindow`;
  the main edit render passes the new check.

## 2026-11-11: the vision brain (0.107)

The owner tested /watch on their PC and asked for its brain inside the program: watch competitor videos, see their
visuals, write a document per video for every subject they ticked on that channel, and turn the lot into a roadmap
that leads the models. Read again at the same pin (`03ceb42`). What came in this time:

| Idea in claude-video | In the program |
|---|---|
| The Gemini engine: `POST /v1beta/interactions` with a `video` input (`uri` = the YouTube link or an uploaded file, `processing: agentic`), the key only in `x-goog-api-key`, answer read from the `model_output` steps, `usage.total_tokens` | `gemini.js` `GeminiClient.ask`; a YouTube link is watched by Google itself, nothing is downloaded |
| The Files API for local files: resumable upload (`X-Goog-Upload-*` headers), poll every 2 s while `PROCESSING` (900 s at most), `DELETE` after the answer, a failed delete reported, never hiding the result | `GeminiClient.upload` / `remove`, streamed from disk with `fs.openAsBlob` |
| Failure categories (auth, quota, rejected, service, network, response, upload), the key scrubbed from every message, the Files API's 400 "API key not valid" counted as auth | `GeminiError` with `kind`; network failures say "could not be reached" so NetRetry tries them again within the hour |
| `PROMPT_SUFFIX`: cite MM:SS for every moment, separate seen from heard, say plainly what the video does not show | `watch.js` `watchSystem` (both engines) |
| `auto_fps` frame budget (12 to the clip's seconds, 40, 60, 80, then the cap) and the "balanced" cap of 100 | `watch.js` `frameTarget` (quality first: the balanced cap) |
| Scene candidates first, thinned evenly keeping the first and last; uniform when there are fewer than 8 | `watch.js` `frameTimes`, with one change: the widest gaps are filled at their middles so a long hold is still seen |
| Frames and transcript are untrusted evidence; report Frames, Transcript, Unavailable evidence | every watch prompt; the study keeps `unavailable` |
| No silent engine fallback | a refused Gemini watch fails with its reason; the owner chooses another way |

Still left out, and why:

- **yt-dlp, browser cookies and caption scraping.** The program is a YouTube API client (the owner's API project
  and the upload sign-in). Google's API policies forbid API clients downloading YouTube content, and doing it would
  put the owner's upload access at risk. Gemini watches from the link instead; a video the owner saved themselves
  is read from their own file.
- **WhisperX / Groq / OpenAI transcription.** The owner pastes or attaches the transcript of a saved file (SRT,
  WebVTT, timed lines or plain text); Gemini hears the sound itself.
- **Pixel de-duplication of frames.** claude-video drops near-identical frames (16x16, mean difference 2.0). Our
  frames are picked just after cuts and in the middle of gaps, so repeats only appear in long holds, which shows
  the hold. Noted as a shortcut in `frameTimes`.

What we added beyond the repository: each video is studied by the subjects the owner ticked for its channel (with
a professional's watch-guide per subject), plus retention moments and where to beat it on every video; numbers
measured on this PC are given as facts (cuts, shot lengths, words per minute, the hook's words); and the roadmap
step, which no part of claude-video has: it turns every study into directives that lead the models. See
COMPETITOR-INTELLIGENCE.md "Watching competitor videos (0.107)".
