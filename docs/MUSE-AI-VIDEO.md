# AI video from Meta Muse (0.111)

Owner request 2026-11-18: the owner has a Meta Muse subscription and wants AI videos made with it, directed by the program and its skills: the program decides how each scene looks (detailing, direction), Muse delivers the scenes, and the program assembles, edits, scores and adds the sound, so fewer scenes have to be generated again.

## What Meta offers today (checked 2026-11-18)

- Meta previewed **Muse Video** on 7 July 2026 for creators and Meta AI ("coming soon").
- Meta's developer API (public preview, US) offers **Muse Spark** (text) and **Muse Image**, not video.
- The only way to drive a muse.ai account by program today is a third party (useapi.net) that signs in with the owner's Meta email and password and keeps the session. That hands a password to an outside company and automates a consumer app, against the program's rules (no secrets collected; the 0.96 decision on flow-mcp) and possibly Meta's terms. It is not built; the owner may decide otherwise after reading the risk.

So the program **directs and the owner generates**. When Meta opens a video API, the handoff is replaced by a connection without changing the rest.

## How it works

1. **The style.** In the channel's style window, the Cinematic and Documentary engines have "AI video clips (Meta Muse)": Off, Some shots (the AI chooses where a generated clip serves best) or Every shot. On, the style's sources include `ai-video`, AI disclosure is "always" and character consistency is on. (`public/style-room.js`.)
2. **The storyboard.** The planner gets the AI VIDEO line (`muse.js` `PLANNER_LINE`): one continuous moment per shot of at most 10 s, written as a film director's shot (who, what they do from first frame to last, the place and its details, time and weather, light, mood, lens, camera move, physical detail), the owner's reference character cast with `ref` (0.110), continuity from shot to shot, and coverage planned like a film. The owner's skills direct it as in every storyboard. An AI-video shot needs a direction of at least 20 characters.
3. **The direction.** Room 04 → open an AI-video shot: the program writes the complete direction for Muse (`muse.direction`: the shot's words, the reference character "exactly as in the attached reference", the world, the camera, colour and light, what comes before, the length and shape, what to avoid, no sound needed) and lists the reference pictures to attach (download links). "Copy the direction". The Batch sourcing card counts the Muse shots still waiting and opens the next one.
4. **The clip.** "Upload the clip from Muse" streams the file (MP4, MOV or WebM, up to 500 MB) to the data folder; `SceneRoom.attachClip` probes it with the pinned ffprobe, checks it (`muse.checkClip`: a video, at least 720p; a shorter clip or another shape is noted, never refused), keeps it as a synthetic `ai` video asset (capability `muse-video`, provider `meta-muse`, the direction it was made from, disclosure required), records an `upload` job and selects it for the shot. A shot planned for another source refuses a clip unless the owner ticks the exception.
5. **The rest is the program's.** The board is approved as always; the Editing Room cuts the clips with the engine's grammar (Cinematic: film grammar and one grade) and the effects of 0.109, the narration, music and sound effects are the program's (Muse's sound is dropped by the render), captions, Room 08, packaging (credits say "AI-generated video (Meta Muse)") and the master follow.

## Not done

- No automatic generation: there is no Muse video API. Clips are made by the owner in Muse.
- A dedicated skill pack for AI-video direction is not added; the planner line and the film skills that already reach `scene.plan` direct the shots.
- "Adopt the style of a video" (0.110) says when AI video would suit a style but does not switch Muse on by itself.
