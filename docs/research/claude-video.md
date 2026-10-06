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
