# Audio Room — narration finish (0.15.0), music and sound effects (0.23.0)

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

## Music and sound effects (P08c, 0.23.0)

0.41 (from video-use): an effect hits on its moment. At render, each effect file's attack is measured once: the end of its
opening quiet, found by silencedetect at 30 dB under the file's own peak (`music.js` `attackArgs`/`attackOf`). The file
then starts that much earlier, at most 2 s, so a whoosh or a riser lands its hit on the contact frame. Narration auditions
show their pace in words per minute: about 140-160 is comfortable, above 170 is flagged fast and below 110 slow
(`voice.js` `pace`, from claude-code-video-toolkit).

Owner request 2026-10-09: "add music and sfx build this room now all the related settings into the audio room". Music and effects are generated by ElevenLabs (the narration provider), so no stock-music licence or attribution is needed beyond the owner's ElevenLabs plan; the owner confirms once per family that the plan allows commercial use.

### Use it

1. Add and test an ElevenLabs connection (Connections). Open Room 07 and press **Soundtrack settings**: confirm commercial use, choose the music model (`music_v2_5` by default), set the monthly music seconds and sound-effect count, and the price estimates used for the cost confirmation.
2. **Ask Claude to score the video** (tokens reserved first) or make the **Free score** (one cue per story section, no cost). A score needs the approved narration and the approved current scene plan. Claude reads the scenes, each sentence's delivery (voice direction) and the style's music moods, and returns instrumental cues: start, end, mood, energy 1-5, a producer-style prompt, entry (fade, hit, cut), exit (fade, cut) and a reason. Gaps are deliberate silence.
3. **Generate the music**: every cue without a file is generated once (cost confirmed first). **Generate the library**: the family's 20 sound effects (whoosh, swoosh-up, pop, impact, stamp, boom, zap, thunder, ding, right, wrong, tick, riser, sparkle, cash, glitch, scribble, boing, heartbeat, typing) in the flavour of the family's main engine (cartoon for stick figures, organic for hand-drawn, clean UI for motion graphics, cinematic for montage). Listen to every file in the room.
4. **Change audio settings** on the current edit: music on (the current, fully generated score), its level under the voice (default -26 LUFS), ducking (off, light, medium, strong) and fades; sound effects on, density (none, subtle, accent, rich) and level (default -12 dB peak). This saves a new edit revision.
5. Render and listen in Room 08. The voice must stay clear over the music.

### Contract

- `music.js` is pure: score validation (ordered, non-overlapping cues of 3-600 s inside the narration; prompts that name an artist, song or "in the style of" are refused; Claude's answers are repaired leniently with named warnings), the free score, the Claude prompt, the ElevenLabs requests (`POST /v1/music` with `force_instrumental`, `POST /v1/sound-generation`), sound-effect placement and the mix graph.
- `soundtrack.js` owns the tables `soundtrack_settings`, `scores` and `audio_assets` (both immutable), `score_jobs`, `audio_jobs` and `audio_usage`. Every Claude or ElevenLabs call starts from an owner click, reserves tokens or monthly units first and is never retried by itself; an interrupted call is marked as possibly billed and needs a deliberate retry (3 attempts). The ElevenLabs client uses the fixed API origin, sends the key only in the header, refuses redirects and bounds the download at 60 MB.
- A generated file is measured (duration at least 80% of the request, not silent, loudness and peak) and kept with its checksum, request and rights record (`elevenlabs-generated`, synthetic, the owner's commercial-use confirmation). The same request is never generated twice; a new score revision only generates the cues that changed.
- Sound effects are placed by the edit, never invented: transitions that open a drawn shot (whip, zoom, pop, ink, glitch), stamps, counters, headline and number text, bursts, flashes, shockwaves, checks and crosses, props that drop or appear, at the time the drawing engine draws them. Each event needs a density; no two effects within 0.18 s (the more important one stays). Stock footage and stills get no effects.
- The edit revision's audio settings name the score. The render checks every music and effect file against its checksum, finishes the voice first, lays music cues at their times with fades and gains from their measured loudness, carves room for the voice (0.28: split at 300 Hz and 4 kHz, the speech band ducked under the voice by a sidechain compressor, the bass and the top kept, the whole bed dipped a little; the HyperFrames voice-over carve, applied to the music, never to the narration), adds the effects at gains from their measured peak, limits, then measures the whole mix and brings it back to the loudness target (two-pass) before encoding. The manifest records the cues, effects, graph checksum and measurements; the encoded audio is checked as before. When music or effects are on, the mix is always normalized, even if the voice was kept at its original level.

## The sound library (0.60.0)

Owner decision 2026-10-23: "we will use Pexels, Pixabay for the music, sfx and sounds, not ElevenLabs". ElevenLabs
charges for every track and effect, while free libraries hold thousands. Checked the same day:

- the Pexels API documents photos, videos and collections only;
- the Pixabay API documents images and videos only, and its rules forbid "systematic mass downloads", so its music and
  sound effects (free for commercial use, no attribution required) are downloaded by hand;
- Freesound has an API, but its terms negotiate commercial use of the API case by case, so it is not used.

### How it works

- **Sound library page** (`sound-library.js`, nav "Sound library"). The owner downloads tracks and effects into a folder
  (Music and SFX sub-folders; sub-folder names become tags) and presses **Import a folder**. The import:
  - takes every MP3/WAV/OGG/M4A/FLAC/AAC/Opus file of at most 60 MB;
  - measures it once (length, loudness, peak; silent or broken files are listed as not usable);
  - tags it from its file name and folders (Pixabay names files like `inspiring-cinematic-ambient-116199.mp3`);
  - stores it once by SHA-256 under `sound-library/` in the data folder, so backups include it and a render can prove
    the file is unchanged;
  - records the source and licence the owner chose: Pixabay, YouTube Audio Library, their own, or another library with
    its licence written out, after a confirmation that the licence allows monetized videos.

  Importing the same folder again adds only new files; an import stopped by a restart continues on a click. The owner
  can rename a sound, correct its kind and tags, add a credit line, or switch it off (left out of every pick).
- **The source per family** (Room 07 soundtrack settings): `library` (the default) or `elevenlabs`. ElevenLabs
  generation (`queueMusic`, `queueLibrary`) refuses unless the family is switched to it.
- **Scores with tracks** (`music.js`):
  - Every cue gets a library `track` (its SHA-256) and an optional `offset`. `assignTracks` fits tracks by the cue's
    mood words (with mood families such as curious: mystery, documentary, ambient), by energy (epic or action tags
    high, calm or piano tags low) and by length.
  - The same track is never used twice in a row, is used again in a score only when nothing else fits, and tracks the
    family used lately count a little less.
  - The free score gets its tracks at once. Claude's score receives a short catalogue (`catalogue`, up to 120 tracks
    as T1, T2...) and names a track per cue; an unknown name is reported and the best fitting track is used.
  - **Change track** in Room 07 saves a new score revision.
- **Effects**: the 20 effect slots are filled by `pickEffects`: the short library sound whose name says it (a file
  named "whoosh..." is the whoosh), or the owner's choice per slot (**Change**, kept in the family's soundtrack
  settings as `sfxPicks`). A slot without a sound plays nothing.
- **The render**:
  - checks every library file's SHA-256;
  - starts a track at its in-point;
  - loops a track shorter than its cue (`-stream_loop`, decided at render time from the track's length, so language
    editions that lengthen a cue loop too);
  - mixes everything as before (carve, ducking, loudness).
- **Credits**: a library track with a credit line (YouTube Audio Library "attribution required", CC BY) adds a
  **Music:** block to the package description.

Note on Pixabay music: some Pixabay tracks are also registered with YouTube's Content ID by their artists. A claim on
such a track is usually released by showing the Pixabay licence; the YouTube Audio Library avoids claims.

### Deferred work

Owner-uploaded or stock music, per-cue manual edits in the page (the API accepts them as a new score revision), and a live listening proof with real ElevenLabs output are not done. There are no uploaded owner-media requirements. Map routes, stick-figure animation, full-resolution final masters, publishing and autopilot remain separate milestones.

For test evidence and known limitations, see [BUILD-PROGRESS.md](BUILD-PROGRESS.md) and [CONTINUATION-REVIEW.md](CONTINUATION-REVIEW.md). The processing reference is the official [FFmpeg loudnorm documentation](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).
