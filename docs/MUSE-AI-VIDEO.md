# AI video from Meta Muse (0.111, connected in 0.112)

Owner request 2026-11-18: the owner has a Meta Muse subscription and wants AI videos made with it, directed by the program and its skills: the program decides how each scene looks (detailing, direction), Muse delivers the scenes, and the program assembles, edits, scores and adds the sound, so fewer scenes have to be generated again.

## What Meta offers today (checked 2026-11-18)

- Meta previewed **Muse Video** on 7 July 2026 for creators and Meta AI ("coming soon").
- Meta's developer API (public preview, US) offers **Muse Spark** (text) and **Muse Image**, not video.
- The only way to drive a muse.ai account by program today is a third party (useapi.net) that signs in with the owner's Meta email and password and keeps the session. That hands a password to an outside company and automates a consumer app, against the program's rules (no secrets collected; the 0.96 decision on flow-mcp) and possibly Meta's terms. It was not built in 0.111; in 0.112 the owner chose it (see below), with the program keeping only a useapi.net token, never the Meta password.

So the program **directs and the owner generates**. When Meta opens a video API, the handoff is replaced by a connection without changing the rest.

## How it works

1. **The style.** In the channel's style window, the Cinematic and Documentary engines have "AI video clips (Meta Muse)": Off, Some shots (the AI chooses where a generated clip serves best) or Every shot. On, the style's sources include `ai-video`, AI disclosure is "always" and character consistency is on. (`public/style-room.js`.)
2. **The storyboard.** The planner gets the AI VIDEO line (`muse.js` `PLANNER_LINE`): one continuous moment per shot of at most 10 s, written as a film director's shot (who, what they do from first frame to last, the place and its details, time and weather, light, mood, lens, camera move, physical detail), the owner's reference character cast with `ref` (0.110), continuity from shot to shot, and coverage planned like a film. The owner's skills direct it as in every storyboard. An AI-video shot needs a direction of at least 20 characters.
3. **The direction.** Room 04 → open an AI-video shot: the program writes the complete direction for Muse (`muse.direction`: the shot's words, the reference character "exactly as in the attached reference", the world, the camera, colour and light, what comes before, the length and shape, what to avoid, no sound needed) and lists the reference pictures to attach (download links). "Copy the direction". The Batch sourcing card counts the Muse shots still waiting and opens the next one.
4. **The clip.** "Upload the clip from Muse" streams the file (MP4, MOV or WebM, up to 500 MB) to the data folder; `SceneRoom.attachClip` probes it with the pinned ffprobe, checks it (`muse.checkClip`: a video, at least 720p; a shorter clip or another shape is noted, never refused), keeps it as a synthetic `ai` video asset (capability `muse-video`, provider `meta-muse`, the direction it was made from, disclosure required), records an `upload` job and selects it for the shot. A shot planned for another source refuses a clip unless the owner ticks the exception.
5. **The rest is the program's.** The board is approved as always; the Editing Room cuts the clips with the engine's grammar (Cinematic: film grammar and one grade) and the effects of 0.109, the narration, music and sound effects are the program's (Muse's sound is dropped by the render), captions, Room 08, packaging (credits say "AI-generated video (Meta Muse)") and the master follow.

## 0.112: Muse connected like Claude and ChatGPT

Owner decision 2026-11-18: "I'm not asking for the API, I'm asking for the subscription, like Claude and ChatGPT; I checked that the Muse subscription can be connected to Claude." What the owner saw is useapi.net's Muse connector (an independent service, not Meta), which runs Muse on the owner's own muse.ai account and its weekly allowance. The program now uses the same service directly, by the owner's choice:

- **Connection** (Connections → "Meta Muse video (your Muse account, through useapi.net)"): the owner adds the muse.ai account on useapi.net once (Setup Muse) and pastes only the useapi.net API token here (stored encrypted like every key; the program never sees the Meta password). The owner confirms that useapi.net is not Meta, that Meta's terms may not allow automated use and that Meta could limit the account. The test lists the Muse accounts the token can use (`muse-api.js` `MuseClient.accounts`); nothing is generated.
- **Making a clip** (Room 04: "Make it with Muse" on an AI-video shot, "Make all with Muse" on the Batch sourcing card; the plan must be approved first): `SceneRoom.queueMuse`/`queueMuseAll` write a `muse` visual job with the shot's direction (the storyboard AI's shot, the reference character, the world, the camera, the grade, continuity, the channel's picture skills as craft lines, what to avoid) and the reference pictures named `image_1`... as the API asks. `runMuse` (its own lane, `processNextMuse`, so drawings and searches never wait) uploads the reference pictures (`POST /assets`, raw bytes), starts the job (`POST /jobs/video`, async), saves the Muse job id before waiting, polls `GET /jobs/{jobid}` every 10 s for up to 20 minutes, downloads the finished video (`GET /assets/{assetId}`), and keeps it like an upload (`keepClip`). A job Muse already started is looked at again on Retry (after a stop, a lost connection or a slow job), never made twice; a weekly-allowance or busy refusal is a hold (`blocked_quota`) with Muse's own words and its retry time; a failed job can be retried by the owner.
- **Keeping a clip** (`keepClip`, for uploads and made clips alike): probed with the pinned ffprobe, checked against its shot (720p or more; shorter or another shape noted), kept as it is when it is already H.264 MP4, otherwise converted to H.264 MP4 without sound (CRF 16), stored as a disclosed synthetic video with the prompt, references and Muse job id, and selected (a made clip fills an empty shot or replaces an earlier Muse clip, never the owner's own pick of something else).
- **Who leads Muse**: the connected models do. The storyboard is planned by Claude or ChatGPT with the owner's scene skills as directives and the AI VIDEO line; their shot description is the heart of every Muse prompt. The owner's picture skills (`visuals.prompt`) add craft lines; the use is recorded per Muse job in Skills → Usage.
- **Fixes to 0.111**: a shot planned for another source can take a Muse clip through a real tick in the shot window (before, the message named a tick that did not exist); AI-video shots are planned at 10 s or less even when the style allows longer shots; clips that are not H.264 MP4 are converted so the live player and the render read them alike; the grade is described in words.

Not tested: a real useapi.net account (a fake server stands in), a full render made of Muse clips, and the exact answer of `GET /accounts` (undocumented; the test reads either a list or an object of accounts).

## 0.113: four clips at once, and how long a Muse clip is

Owner request 2026-11-20: "make Muse clips in parallel to make the video process fast", and "Muse can make videos up to 1 hour".

- **Parallel**: `processNextMuse` runs up to four clips at once (`MUSE_LANES`, each its own Muse job; useapi.net allows 10 jobs per account by default). When Muse answers busy (HTTP 429) before a job started, nothing was made or charged: the clip goes back in the queue with "Muse is busy ... goes on by itself after HH:MM UTC" and every lane waits until Muse's own retry time (15 s to an hour), at most 6 times, then the owner's Retry. The channel's reference picture is uploaded once for all four lanes (`museUpload`, kept 6 hours) and an upload refused with 503 (the same file being uploaded) is asked once more after 5 s.
- **Length**: one Muse generation is a clip of about 10 seconds (useapi.net's job answer, Meta's preview and the reviews all say 10-15 s, and the API has no length setting). Pages that speak of long or one-hour Muse videos describe joining many clips, which is exactly what the program does: each shot of the storyboard is one clip of up to 10 s, and the Editing Room cuts them into a video of any length.

Not tested: four clips at once on a real account (how many Muse itself runs at the same time is not documented; the busy hold covers it).

## 0.115: who speaks over a Muse clip, and the voice it is led with

Owner request 2026-11-23: "when Muse is used the program should use Muse's voice-over automatically, but the program does the rest (editing, effects, music); give an option to use Muse's voice or the connected narrator's; and lead Muse's voice when it generates."

What Muse can do with sound, checked 2026-11-23: every clip comes with its own sound and speech can be written into the prompt, but there is no voice choice and no reference audio, so the voice can change from clip to clip and the lips may not match ([SmartScope](https://smartscope.blog/en/blog/muse-video-generation-audio-10-second-examples-known-2026/), [Meta's research blog](https://research.meta.ai/blog/bringing-your-muse-to-life), [Piclumen's review](https://www.piclumen.com/blog/muse-ai-video-generator-review/)). So the program leads Muse's voice in words.

- **The choice** is the style's `visuals.museSound` ("Voice over the Muse clips" in the channel style window, shown with the Muse setting): `narrator` (default: the program's narrator, Muse's sound dropped), `ambience` (the narrator, with Muse's natural sound under it) or `muse` (Muse speaks each shot's words itself).
- **The direction** (`Mu.direction` `sound`, `speech`; `Mu.soundLines`): with `muse` each shot gets "Spoken in this clip, word for word and nothing else" with its share of the scene's words (`Mu.shotWords`, by shot length), a Voice line (the chosen Fish voice in words and the narrator profile's voice design and delivery, `store.narratorVoice`) and the line's delivery from the voice direction (`store.voiceDirectionLines`), and "No music". With `ambience` only the place's natural sound is asked for; with `narrator` no speech or music.
- **The clip's sound is kept**: `keepClip` now keeps the audio track when it converts a clip (AAC 192 kb/s); the edit marks Muse clips that have sound (`inputs.assets[...].sound`).
- **The mix** (`audio.js` `clipSound` {mode off|ambience|voice, levelDb}, `EditingRoom.clipSoundFor`): a drafted edit takes the style's choice by itself. `voice` mutes the narration over each speaking clip and puts the clip's sound in its place (`music.js` `mixGraph` `clips`, a frame-accurate `volume` switch), so the music ducks under Muse's voice as under the narrator; `ambience` lays the clips' sound 14 dB down under the voice. Music, sound effects, transitions and picture effects stay the program's in every case. The render checks every clip file by checksum (`render-room.js`), the live player plays the clips' own sound and silences the narration where Muse speaks, and language editions drop the clips' sound (it speaks the main language).

Not tested: a real Muse clip that speaks (no generation was run here); the mix was checked with FFmpeg tones (the narration drops more than 20 dB over a speaking clip and comes back after it).

## Not done (0.111)

- (0.111) No automatic generation. Since 0.112 the Muse connection makes the clips; uploading your own stays possible.
- A dedicated skill pack for AI-video direction is not added; the planner line and the film skills that already reach `scene.plan` direct the shots.
- "Adopt the style of a video" (0.110) says when AI video would suit a style but does not switch Muse on by itself.
