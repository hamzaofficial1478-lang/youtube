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
| Size | 640x360 / 360x640 | 1920x1080 / 1080x1920 |
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
