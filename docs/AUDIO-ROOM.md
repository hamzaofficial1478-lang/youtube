# Audio Room — narration-only finish (0.15.0)

The owner chose narration-only first on 2026-10-07. This is P08a, not the completion of licensed music, SFX or the final master pipeline. It makes the current edit's narration measurable and reviewable without changing its approved source.

## Use it

1. Approve a primary-locale script, narration and visual board; draft its edit in Room 05.
2. Run the updated FFmpeg readiness check and pin that build in Room 05. Audio requires `aformat`, `loudnorm`, `silencedetect` and the `pcm_s24le` encoder in addition to existing render requirements.
3. Open Production → Room 07 Audio. Choose the script and **Set audio levels**. Enter your name, choose normalized narration or original levels, and save.
4. **Render audio preview** creates both a WAV and a video proxy using the current edit. Inspect the encoded audio measurements, listen to the narration, and watch its timing against the video.
5. Record the existing style-proof verdict (Room 08 Review & QC since 0.16) with the additional listening confirmation. Failed audio checks block approval even if other technical findings are accepted.

Settings edits and undo create new immutable edit revisions. Earlier source files, edits, renders and verdicts remain historical. A new revision needs its own render and review. A changed board, script, narration or style also invalidates the current handoff through the existing dependency checks.

## Processing contract

`audio.js` contains only pure settings, argument construction and measurement/QC helpers. `editing-brain.js` accepts a bounded `set-audio` operation. `editing-room.js` validates the render requirements. The existing `render-room.js` worker owns process execution, cancellation, recovery and files. There is no second job queue or independent audio approval database.

The worker verifies the approved narration checksum, converts its layout to 48 kHz stereo before measuring, measures the whole track, and writes a 24-bit PCM WAV. Normalized mode supplies measured values to FFmpeg's second loudness pass. FFmpeg may use dynamic normalization when a linear change cannot meet its constraints; the result is judged by measurements and human listening, not by assuming an inaudible adjustment. Original-level mode only converts layout/sample format. No automatic trim, pause removal, time stretching, speech rewrite, noise reduction or voice EQ is applied.

The WAV is muxed through the existing deterministic video plan. The actual encoded AAC stream is decoded and measured again. The manifest records source measurements, settings, output checks, artifact hashes and commands. Source, finished WAV and encoded AAC are distinct artifacts; the Audio Room states that its measurements describe the encoded video.

The original-level option preserves sample level rather than promising identical integrated loudness: mono-to-stereo conversion can change the integrated measurement. Existing edits with no `audio` settings retain their original rendering path.

## Validation limits

| Check | Rule |
|---|---|
| Settings | Only known fields; mode `source` or `normalize`; schema `ytprod.audio/1` |
| Loudness target | −24 to −14 LUFS, one decimal; default −16 |
| True-peak target | −6 to −1 dBTP, one decimal; default −2 |
| Encoded duration | Within 0.1 seconds of approved narration |
| Encoded format | AAC, 48 kHz, stereo |
| Normalized loudness | Within 1 LU of selected target |
| Normalized true peak | Target ceiling plus at most 0.3 dB encoding tolerance |
| Original-level checks | −35 to −5 LUFS, true peak at or below −0.1 dBTP |
| Silence | At most 35% below −50 dB, detected intervals of at least 0.25 seconds |
| Missing/non-finite evidence | Fails the applicable check; not assumed healthy |

These are conservative local production targets, not YouTube requirements. Silence detection does not establish intelligibility, pronunciation, emotional delivery or absence of audible artifacts. A reviewer must listen to real narration before approving real work.

Downloads and approval recheck SHA-256 for the video, contact sheet, manifest and, when present, finished narration. Same-size file corruption is rejected. Audio supports byte-range streaming. A superseded edit queued before another edit revision is saved is stopped before expensive rendering. Changes during a running render leave a historical output that cannot approve the current edit.

## Deferred work

Music sourcing, asset licenses, attribution, cue choices, ducking, fades, speech-frequency carve in music and SFX are not implemented. The HyperFrames carve recommendation applies to the music bed, not to the narration. There are no music provider calls or uploaded owner-media requirements. Map routes, stick-figure animation, full-resolution final masters, publishing and autopilot remain separate milestones.

For test evidence and known limitations, see [BUILD-PROGRESS.md](BUILD-PROGRESS.md) and [CONTINUATION-REVIEW.md](CONTINUATION-REVIEW.md). The processing reference is the official [FFmpeg loudnorm documentation](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).
