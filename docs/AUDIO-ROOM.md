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

## What the music supervisor reads (0.71)

Claude's score also receives what the family's **approved competitor study** learned about music and sound
(`competitorGuidance`: audio settings it proposed, observations about music, effects and silence, the patterns it
adopted, the channel's own contributions, its avoid list and the channels the owner picked for "music"). It uses the
techniques that fit the story and follows the avoid list; it never copies a track, an artist or a signature sound.
Nothing is sent while the blueprint is unapproved or outdated. Approved skills bound to `audio.mix` travel too and are
logged per score job.

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

### Freesound and Jamendo (0.61.0)

Owner request 2026-10-23: use the Freesound and Jamendo APIs for free licensed sounds and music.

- **Connections** (Connections page):
  - **Freesound**: sound effects, plus music and loops; an API key from freesound.org/apiv2/apply.
  - **Jamendo**: instrumental music; a client ID from devportal.jamendo.com, 8 characters.
  - The test runs one search; nothing is downloaded.
- **The platforms' API terms.** These are separate from the licences of the sounds:
  - Jamendo: "The API may be used freely for non-commercial uses ... For any other type of use including but not
    limited to commercial uses please contact our sales team at licensing@jamendo.com".
  - Freesound: commercial use of its API is "negotiated on a case by case basis".
  - So each connection records the owner's confirmation that the platform allows their use. A connection without it
    cannot search.
- **Only licences a monetized video may use** (`sound-online.js` `licenceOf`):
  - CC0, and CC BY with its credit line.
  - Out: NonCommercial (a monetized channel); ShareAlike and NoDerivatives (music synced to a moving image is an
    adaptation under CC 4.0); Sampling+.
  - Freesound is asked for CC0 and CC BY only. Jamendo answers are checked by their licence link; Jamendo tracks whose
    artist does not allow downloads are shown but cannot be added.
- **Find free sounds online** (Sound library page):
  - A search is one request inside the platform's hourly allowance (Freesound 60, Jamendo 60 by default).
  - Previews play through the program, only for results of the owner's own search.
  - **Add** downloads the sound into the library with its licence, author, page and credit line. Downloads come only
    from the platform's own servers; each redirect is checked.
  - CC BY credits reach the package description by themselves.
- **Fill empty slots from Freesound** (Room 07 effects card): a background job asks Freesound once per empty effect slot
  (best rated short CC0 or CC BY sound) and adds the first one, tagged with its slot. Progress shows on the Sound library
  page; nothing is retried by itself.

Note on Pixabay music: some Pixabay tracks are also registered with YouTube's Content ID by their artists. A claim on
such a track is usually released by showing the Pixabay licence; the YouTube Audio Library avoids claims.

### Deferred work

Owner-uploaded or stock music, per-cue manual edits in the page (the API accepts them as a new score revision), and a live listening proof with real ElevenLabs output are not done. There are no uploaded owner-media requirements. Map routes, stick-figure animation, full-resolution final masters, publishing and autopilot remain separate milestones.

For test evidence and known limitations, see [BUILD-PROGRESS.md](BUILD-PROGRESS.md) and [CONTINUATION-REVIEW.md](CONTINUATION-REVIEW.md). The processing reference is the official [FFmpeg loudnorm documentation](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).

### Freesound fills the library by itself (0.75.0)

Owner request 2026-10-31: "why do I have to find and add music and effects by hand?" With a tested Freesound connection:

- **Sound library -> "Fill my library from Freesound"** (one click). For every empty effect slot (whoosh, pop, impact,
  ding and the rest) the program adds the most downloaded CC0 or CC BY sound that fits it, and for every mood family the
  music picker uses (calm, tense, curious, dramatic, uplifting, sad, warm, light, punchy, focused, historical) it adds
  the most downloaded tracks of at least 45 seconds until the mood has two (`SoundOnline.queueFill` with `music: 'all'`,
  `moodCounts`, `M.moodFamilies`). One search per slot or mood (about 31) inside the Freesound hourly allowance; each
  file is downloaded once, checked and kept with its licence, author, page and credit line.
- **Audio room -> "Find music for this video on Freesound"** (on a current library score). The video's cue moods are
  read as mood families; each that has fewer than three tracks gets more, and when the fill is done the video's music is
  picked again from the fuller library (`SoundtrackRoom.repickTracks`: same cues and timing, a new score revision; no
  revision when no track would change).
- **Effects in the Audio room** need nothing more: the edit places the library's effects by their slot names. "Fill
  empty slots from Freesound (most used)" stays on the Sound effects card.

The program never searches by itself without the click (each fill is a job the owner starts) and never retries a failed
search on its own; a mood or slot with no usable result is listed under Imports.


## Real sources, named Freesound failures, filling by need (0.78)

- The soundtrack settings and the Audio Room name where the library's sounds really came from (`SoundLibrary.state`
  `bySource`, e.g. "Freesound: 9 tracks, 40 effects; my own: 3 effects"). ElevenLabs generation is offered only once an
  ElevenLabs connection is tested (or already chosen), and its fields show only when it is chosen.
- A Freesound search that fails says why: slower than 60 seconds (its searches sorted by downloads can be slow), not
  reachable, throttled (HTTP 429: a free key allows 60 requests a minute and 2,000 a day) or a problem on Freesound's
  side. The owner's fill of 2026-10-31 lost six music searches to the old 30-second limit, not to a Freesound limit.
  A fill now asks at most one search a second, music searches ask for 25 results instead of 40, and a slow, throttled
  or failed-on-their-side search is tried once more after a pause; each try counts against the hourly allowance.
- **Filling by need.** When a library family's video gets a new score (free or Claude's), `SoundtrackRoom.scored`
  calls `SoundOnline.autoFill`: if a Freesound connection is tested and confirmed, the score's moods that have fewer than
  three tracks and every empty effect slot are looked for on Freesound by themselves (the import is named "Program
  (automatic)"), and the video's music is picked again when it is done. Nothing happens without a Freesound connection
  or while another import runs; the buttons stay for filling the whole library or one video by hand.

## The program fetches a video's music and story sounds by itself (0.87)

Owner question 2026-11-04: "the free sound is connected, so will the program search and add the music from Freesound as needed, or do I have to fill the library? The program must fetch the sfx and music, beats, effects, tracks by itself as per the video and script, matching its tone, its characters and the edit."

Before 0.87 a new score already asked Freesound for its moods and for every empty effect slot, but three things were missing: the edit never switched the new music on, the effects were only twenty generic cartoon sounds, and the music searches ignored the story's world.

- **Story sounds.** Ten more effect kinds (`music.js` `STORY_SFX`): fire, animal (a large animal's call), waves, rain, wind, crowd, birds, drum, clash (swords), stone (a stone tool's knock). A drawn prop makes its own sound (`PROP_SFX`: campfire and candle crackle, a mammoth calls, a ship or the waves wash, rain and storms, swords clash, a stone axe or spear knocks), a crowd murmurs, and a new place is heard once as the story arrives there (`SET_SFX`: the cave's fire, the stone-age land's wind, birds in nature, parks and villages, waves at the sea, a crowd in markets and cities, clashing swords on a battlefield). A place sound is a bed under the moment, so it never pushes out an effect (`bed`). A story sound the library lacks is left out at render (`soundtrackFor` `skipped`); the other effects stay required as before.
- **Only what this video needs.** When a score is made, `SoundtrackRoom.needs` reads the video's drawings (`M.neededEffects` at the style's density) and its world, and Freesound is asked only for those effect kinds and for the score's moods (`SoundOnline.autoFill(contentId, cues, {kinds, flavour})`). "Fill my library from Freesound" still fills every slot.
- **Music of the story's world.** The plan's era sets a flavour (`ERA_MUSIC`: prehistoric tribal, ancient, medieval, early-modern orchestral, future futuristic): the free score writes it into every cue, Freesound is searched for "<mood> <flavour> music" first and then "<mood> music", and fetched tracks are tagged with their mood and flavour so the cues pick them.
- **The edit follows by itself.** After a new score, or when Freesound has added what this video needed, `EditingRoom.refreshAutoAudio` switches the music on (or onto the newer score) and the effects on, as a new edit revision by the program, while the edit's audio is still what the program set (`meta.autoAudioSettings`); an owner's own mix is never overridden. A fill that found nothing does not ask again (`autoAudio(..., {ask: false})`).
- **Who scores the music.** The channel's soundtrack setting `autoScore` (Room 07 → Soundtrack settings): `free` (default: the program's score from the story's sections and world) or `ai` (when an edit is drafted, Claude or ChatGPT scores the music from the script by itself, using tokens from the channel's limit; the music switches on when that score and its tracks are ready).

## Music and effects you can hear; Freesound searched for each video (0.90)

Owner report 2026-11-04, with two screenshots (the timeline's Music and Sound effects rows, and the levels at "Keep original levels", music -20.5 LUFS, medium ducking, rich effects at -12 dB): "the music and sound effects are added but I cannot hear any of them". Also: simpler volume controls with a default button, Freesound searched according to the video rather than a few library tracks, a cleaner Audio Room, and every description in the program short or a dropdown.

**Why nothing was heard.** Two causes.

- The live player in the Editing Room (0.83) played only the narration. Music and effects came only with a render.
- In a render the 0.28 voice-over carve and duck (`acrossover` at 300 Hz and 4 kHz, then `sidechaincompress` with a fixed threshold of 0.02 and ratios up to 20 on the speech band and up to 3 on the whole bed) pushed a -20.5 LUFS bed down to about -36 LUFS under a -16 LUFS voice: 20 dB under the narration, which is inaudible on laptop speakers. With "Keep original levels" a quiet narration made it worse, because the music's level ignored the voice's real loudness.

**The mix now** (`music.js` `DUCK`, `mixGains`, `mixGraph`).

- The ducking is a few dB. The compressor's threshold sits just under the narration's own loudness (`voiceLufs` + `rel`), and each choice has a gentle ratio for the whole bed and the speech band: light (bed 1.6, carve 1.4), medium (bed 3, carve 2), strong (8 dB lower threshold, bed 4, carve 2). Measured with a 1 kHz tone at -16 LUFS over pink noise, medium dips about 3 dB, strong about 6 dB (tests/soundtrack.test.js "0.90"). Between lines the music plays at its level.
- Levels follow the narration's real loudness: the render passes the measured loudness when the narration is kept as it is, and the target when it is evened out, so "Music normal" means the same distance under the voice on every channel.
- The default music level is -22 LUFS (was -26), 6 dB under a -16 LUFS voice.

**The live player plays them.** `EditingRoom.player` sends the music cues and effects exactly as the render takes them (`soundtrackFor`, with the gains of `M.mixGains`), and the page plays each cue from its in-point with its fades, a little lower while the narrator speaks, and each effect on its moment. Files are served only when the edit's own soundtrack names them (`GET /api/edit-revisions/:id/sound/:sha256`). The render still evens out the narration and carves the music, so the final mix sounds a little cleaner than the player.

**Simple controls.** The Levels window has plain steps: music volume (Very quiet, Quiet, Normal, Loud, Louder: 14, 10, 6, 3 and 0 dB under the voice), how much the music drops while the narrator speaks (No, A little, Some, A lot), effects volume and how many effects (Few, Some, Many), and **Reset to defaults**. The exact numbers stay under "Advanced". Room 07 shows the saved levels in words ("Music normal, lower under the voice · Effects normal, some").

**Freesound searched for each video** (`sound-online.js` `cueSearch`, `subjectQueries`, `rankFound`; `music.js` `storySubjects`, `subjectEffect`).

- Each music cue is searched by its own words: the story's world (tribal for the stone age) and the instruments and style its prompt names (pizzicato, marimba, taiko, brass), then by fewer of them, then by its mood. Words about the topic (the niche, the title) are never searched, because they do not describe music.
- Each story sound is searched for the thing on screen that makes it (`SUBJECT_QUERY`: the campfire crackles, the mammoth trumpets, the harbour has gulls and water), then for its kind. Each event of the edit names its thing (`subject`), and the render plays the sound found for that thing rather than any sound of its kind, unless the owner chose the slot's sound.
- Results are ranked by how well their tags and name match the words wanted, then by downloads and rating, Freesound's relevance order breaking ties (the old fill took the most downloaded result whatever it was).
- A track that a recent video of the channel used is never taken again for a new video, so each video gets its own music. Each cue keeps the track found for it (`repickTracks(contentId, by, picks)`, while the cue's prompt is unchanged), and found files are tagged with the words they were found by.
- Nothing is searched twice: a cue the library already answers (a track tagged with its words, not used by a recent video) and a thing that already has its sound are skipped. At most 12 cues and 12 things per video, one search a second, inside the hourly allowance.
- "Find sounds for this video" in Room 07 (`POST /api/content/:id/freesound`) does the same on a click and says why nothing was queued.
- CC BY effects are credited in the video description too (before, only music was).

**A cleaner room.** The Audio Room has a short header, the Levels card first, the score with three buttons (Score with Claude, Free score, Find sounds for this video), and one Sound library card with the effect slots folded inside. Program-wide, a paragraph longer than about two lines shows its first sentence and "More" (`foldLong` in public/app.js; warnings, errors and paragraphs with controls stay as they are), and stays open across refreshes like every dropdown.
