# The OpenMontage "editing brain", restated for an automated faceless-documentary editor

**What this is.** A narrative distillation of how OpenMontage's creative and core skill files think about editing: cutting, pacing, hooks, B-roll, sound, text, colour, stitching and QC. Everything here is restated in my own words. The source is AGPL-3.0, so only ideas are taken and no text or code is copied. The machine-readable companion, `om-creative.json`, holds **49 skill objects** with steps, do/avoid lists, numbers and checks.

**Read in full:** all 24 requested files plus `INDEX.md`, and the editing-relevant extras the index points to: the documentary-montage pipeline, the explainer and cinematic directors, the clip-factory/hybrid/talking-head edit directors, `screen-recording`, `diagram-gen-usage`, `video-understand-usage`, and the meta skills `reviewer`, `taste-direction`, `voice-performance-director` and `video-reference-analyst`. I also skimmed the thresholds in `lib/slideshow_risk.py`, `lib/variation_checker.py` and `lib/delivery_promise.py`, which the reviewer skill relies on.

---

## 1. The core mental model

Seven ideas run through the whole repository. Together they are the editor's worldview.

1. **The edit is where the thinking happens, and the enemy is the slideshow.** Good clips played back to back at equal length with no sound design still fail. The repo treats "it feels like a slideshow" as a failed edit whatever the asset quality, and it scores slideshow risk on purpose before rendering.

2. **Rhythm is designed, never defaulted.** Shot length is the main energy dial. Each style has an average-shot-length band (action 2–4 s, documentary 6–12 s, montage 1–3 s), and each emotional register has a base/min/max hold table (elegiac 4 s base, urgent 1.2 s). Holds then vary around the average in a breathing pattern: long, medium, short, short, very long. Three equal lengths in a row count as a defect.

3. **Every frame must earn its place.** Every cut gets a one-line reason. Shots are described as photographable images (subject, action, place, light, era), never as feelings. Mood words like "epic", "moody" or "cinematic" are banned as instructions and must be turned into concrete choices: aspect ratio, grade, hold length, lighting and music behaviour.

4. **Sound leads and sound binds.** Audio reaches the brain slightly before picture, so SFX start 10–20 ms early. J/L cuts and carried ambience weld shots together better than any visual transition. The music bed is a timing grid you cut *to*, not a sweetener added afterwards, and one deliberate silence at the emotional centre does more than any effect.

5. **Restraint is the house style.** The hard cut is the default. Every other transition carries a meaning (crossfade = topic change or passing time, fade-to-black = section break, wipe = next step, zoom = go deeper), and a video uses 2–3 types, 4 at most. Glitches, RGB splits, light leaks and zoom blurs break documentary register and never fix a boring sequence; better shots and pacing do.

6. **Unify at the end.** Mixed sources (modern stock, archive film, AI clips) become one film only through one canvas, one aspect treatment, one frame rate, one grade applied to the whole timeline and one mix pass. Per-clip grading is slower *and* less consistent.

7. **Measure; don't trust.** Measured TTS length per section feeds back into script and plan. Every render is probed, re-transcribed against the script, frame-sampled at each cut and checked for image and loudness metrics; a "successful" render that is silent or cut off is worse than a failure.

---

## 2. The decision flow, from script to finished cut

The order an OpenMontage editor follows, merged across its pipelines and adapted to a narrated, faceless, stock-plus-AI documentary:

**Stage 0: Style contract (per channel).** Write a one-sentence *design read* (audience, promise, subject) and set three 1–10 dials (visual variance, motion intensity, information density) that drive transition variety, cut rhythm, holds and callout density. Tear down any reference videos: measure average shot length, classify each scene as motion clip, animated still or static, keep what works and change at least one major element. Prove the direction with a 10–15 s sample before full production.

**Stage 1: Script.** Pick an arc scaled to length. A 5-minute video gets about a 10 s hook, 30 s of tension, a 3-minute core of 5–8 concepts, about 50 s of proof and a 20 s close. Longer videos become 2–4 minute chapters. Choose a hook archetype (contrarian, outcome, mystery, stakes). Link sections with "but" and "therefore", never "and then". Open with the misconception. Allow at most one new concept per 30–45 s. Plant an open loop before 60 s, deliver a first payoff before 2:00 and write re-hook lines at about 2:00 and every 3–4 minutes after. Embed a visual cue at least every 8–10 s of narration. Budget words so narration fills 85–90% of runtime. Give each section at least two concrete delivery cues: pace, energy, emphasis words, pause lengths.

**Stage 2: Shot plan.** For every sentence decide **literal**, **metaphorical** or **diagram**: concrete nouns (places, objects, people, events) get real footage, abstract mechanisms get diagrams or progressive builds, abstract qualities (growth, connection) get metaphors or generated images. Write each need as who/what, doing what, where, what light, what period. Mark 2–3 hero slots (opening, turn, final image) for longer holds and bigger candidate pools, and assign holds from the register table.

**Stage 3: Sourcing.** Write 2–3 short queries per slot (literal, lateral, associative), led by the subject and tagged with a point-of-view term (aerial, macro, top-down, handheld, timelapse). Score candidates 1–5 and reject anything under 3. A wrong point of view is worth re-querying rather than cropping. Similarity scores are evidence, not the decision: a top-scoring bright clip can still be wrong for a sombre register. Keep a rejected-picks log and never reuse a clip across slots. Run at most two extra search passes per weak slot before changing the slot.

**Stage 4: Voice.** Approve a TTS sample from the hardest section to perform. Process narration (high-pass, mud cut, presence lift, firm compression, de-ess, limiter). Measure each section; rewrite any that overrun their slot by more than 15%, or stretch visuals when only modestly over.

**Stage 5: Assembly.**
1. Lay the rhythm grid (holds per register, breathing variation, hero holds longest).
2. Trim each clip to its single best moment. Exit before the action finishes, keep 4–6 frames of handle and never freeze-frame.
3. Snap cuts and overlays to narration word timestamps. Picture and voice must agree within about ±0.5 s.
4. Snap hero cuts to music downbeats. Place one silence window (about 2 s) before the emotional peak and fade the music under the last 3–5 s.
5. Choose transitions from the small vocabulary. Add L-cuts or J-cuts on the 3–4 hardest joins.
6. Schedule pattern interrupts: minor every 20–30 s, major every 60–90 s, a burst of 5–10 quick cuts every 2–3 minutes.
7. Give every still a purposeful camera move and vary moves between neighbours.
8. Run the adjacent-diversity pass: no neighbours that share subject and scale, palette runs broken every 4 cuts, no repeated pan direction.

**Stage 6: Text layers.** Captions are mandatory. Use 6–8 words per cue and up to 42 characters per line horizontally, 3–4 words vertically, 2 lines at most. Overlays follow the dwell formula of at least characters/13 seconds once settled. Everything stays inside the safe area. Captions never echo an on-screen headline the narrator is reading. No more than captions plus one other text block appear at once.

**Stage 7: Finish.** Conform canvas, fps and aspect. Apply one grade or LUT at about 0.6–0.8 strength across the whole timeline. Mix narration, a music bed 18–20 dB under it (sidechain-ducked, with a notch in the 2–4 kHz speech band), a low ambient bed and selective SFX. Loudness-normalise to −14 LUFS with true peak at or below −1.5 dBTP. Encode H.264 at CRF 18–20 as yuv420p with faststart.

**Stage 8: QC.** Pre-render: assets exist, narration fits, music covers the runtime, slideshow-risk lint passes. Post-render: streams, duration, frames at every cut, audio re-transcript, blur/brightness/contrast, loudness, silence gaps. Route each defect to its owning stage; after two or three rounds, pass with recorded warnings.

---

## 3. Hook and retention playbook

**The first 3 seconds** (decisive for Shorts and still critical for long-form):
- Frame 1 shows the most compelling *moving* image in the video. No black, no logo, no greeting, no "in this video we will...".
- Text is on screen within 0.5 s, because muted viewers read before they listen.
- Narration and music start immediately, with no silent build-up.
- In long-form, the opening must deliver what the thumbnail promised.
- Hook archetypes: contrarian ("what you were taught is wrong"), outcome ("by the end you'll understand..."), mystery (a dated, impossible-sounding event), stakes (the cost of a common mistake). Short-form adds result-first, bold claim text, a direct question and a pure visual pattern interrupt.

**The first 30 seconds (long-form):** 0–3 s visual hook → 3–8 s spoken hook → 8–15 s stakes → 15–30 s preview plus an open loop → an optional brand sting of 5 s at most, *after* the hook. Cut every 3–5 s in this window and narrate faster (160–170 WPM). The repo's data claims about half of all drop-off happens here, and that a pattern interrupt inside the first 5 s lifts average retention noticeably.

**The middle of the video:**
- *2:00–3:00 valley:* curiosity is spent. Pay something off before 2:00, interrupt at 1:45–2:00 and re-hook verbally around 2:00.
- *Re-hooks every 3–4 minutes:* concrete promises about what comes next ("the stranger part is still ahead").
- *Second exodus at 55–65% of runtime:* resolve an open loop and run a burst sequence.
- *Change cadence:* something visual or audible changes every 3–5 s, the frame changes substantively every 20–30 s, and nothing stays unchanged for more than 15 s.
- *Palette cleanser every 45–60 s:* a brief breather or "let that land" moment so working memory can catch up.
- *Silence:* 1–3 s after the key insight, and one music dropout at the emotional centre.

**The ending:** the strongest image goes last, because the last 5–10 s are remembered out of proportion. Fade to black, never freeze. Tease the next video instead of saying goodbye. Keep the final 20 s free of essential content for end-screen elements. A short thesis line (3–9 words, 5–8 s) can land over the final footage, timed so its fade-out matches the picture's.

**Benchmarks (5–10 min):** about 45% average view duration is good, about 60% excellent; any section projected under 30% needs an interrupt.

---

## 4. Master do / don't list

**Do**
- Vary shot lengths in a breathing pattern and give hero images the longest holds.
- Cut to the single best moment of each clip and leave on a look rather than a walk-off.
- Put the named thing on screen as the narrator says it, and build complex visuals piece by piece.
- Use literal footage for concrete nouns and diagrams or metaphors for abstract mechanisms.
- Treat the music as a cutting grid: land heroes on downbeats, use one silence and fade the tail.
- Default to hard cuts, use 2–3 meaningful transition types, and put L/J cuts on the hardest joins.
- Start SFX 10–20 ms before the visual change and keep them at least 6 dB under the voice.
- Duck music 18–20 dB under narration and notch 2–4 kHz on the bed.
- Keep a low ambient bed so pauses never fall into digital silence.
- Ease every motion (never linear), stagger multiple elements by 3–6 frames, and hold after each reveal.
- Give each still a purposeful, varied camera move, and mix in genuine motion clips.
- Apply one grade to the whole timeline at moderate strength, protecting skin and highlights.
- Caption everything, within the cue limits and inside safe zones.
- Measure TTS durations and send overruns back to the script.
- Lint the plan for slideshow risk, QC every render and log every decision with its reason.

**Don't** (the anti-patterns that make a video boring, lazy or amateur)
- Cut at a constant interval, or let three shots in a row share a length.
- Hold anything for more than 15 s with no change, or more than 3 s in short-form.
- Open with a logo, black frame, greeting or format announcement, or spend the best moment in second one.
- Use the first N seconds of a stock clip by default, or freeze the last frame to fill time.
- Put two near-identical shots (same subject and scale, same palette, same pan direction) side by side.
- Use wipes, push/slides, zoom blurs, RGB splits, light leaks or glitches in documentary register, or dissolve on every cut.
- Use the same Ken Burns move on every still, or move the camera without a reason.
- Leave raw stock-clip audio in, put lyrics under narration, or let music stop dead at a cut.
- Bake text into AI images (spellings get hallucinated), use more than two font families, or go under 40 px at 1080p.
- Have captions echo on-screen headlines, or show hook text, captions, watermark and lower third together.
- Grade each clip separately, run LUTs at 100%, or upscale low-res archive to full HD.
- Stretch footage to fix aspect, mix fps or VFR sources unconformed, or leave clicks at audio cuts.
- Describe shots with mood words ("stunning", "epic", "cinematic") instead of visual causes.
- Fix a weak edit by adding effects, graphics or narration instead of better shots and pacing.

---

## 5. Numeric cheat sheet

| Area | Value |
|---|---|
| Average shot length | action 2–4 s; cinematic 4–8 s; documentary 6–12 s; contemplative 10–20 s; montage 1–3 s |
| Cuts per minute | action 15–30; cinematic 8–15; documentary 5–10; montage and short-form 20–40 |
| Register hold tables (base/min/max) | elegiac 4.0/2.5/7.0; reverent 3.5/2.0/6.0; dreamlike 3.0/1.5/5.5; wry 2.0/1.0/4.0; urgent 1.2/0.5/2.5 s |
| Change cadence | micro change 3–5 s; substantive change 20–30 s; 15 s hard ceiling; image absorbed in about 3 s |
| Long-form primary cut interval | hook 3–5 s; 0:30–3:00 10–15 s; 3:00–7:00 15–25 s; later calm stretches plus bursts |
| Interrupts | minor 20–30 s; major 60–90 s; burst of 5–10 cuts in 10–15 s every 2–3 min; short-form every 2–4 s |
| Narration pace | explainer 150–160 WPM; hook 160–170; key insight 140–150; cinematic 140–150; short-form 180–200 |
| Word budget | narration fills 85–90% of runtime at 2.0–2.5 words/s (documentary); rewrite a section that overruns its slot by more than 15% |
| Concept density | one new idea per 30–45 s; signpost every 30–45 s; 1–3 s silence after the key insight |
| Transitions | hard cut 0 ms; crossfade 0.5–1.0 s (topic change) or 1.0–1.5 s (time or mood); fade-to-black 0.5–1.0 s each side; 2–3 types, 4 at most |
| J/L cuts | voice offset 0.3–0.5 s; ambience carried 0.5–1.5 s |
| Trims | handles of 4–6 frames; slow-down to 0.5–0.75x only on static shots without faces |
| Audio levels | dialogue −12 dB peak; music bed 18–20 dB under speech (duck 6–12 dB, up to 22); ambience −30 to −24 dB; SFX −18 to −12 dB |
| Sidechain duck | threshold 0.02, ratio 9, attack 200 ms, release 500 ms |
| SFX | whoosh 400–500 ms starting 10–20 ms early; pop under 200 ms; riser 1–3 s; impact under 300 ms at −12 to −6 dB |
| Loudness | YouTube −14 LUFS, −1.5 dBTP; TikTok and Reels −14 LUFS, −1 dBTP; chapters within 2 LU of each other |
| Music | explainer 90–110 BPM (calm 60–80); cinematic 60–90 BPM; tempo within ±10 BPM across the video; section crossfades 2–3 s |
| Text sizes (1080p) | title 60–90 px; body 40–60 px; minimum 40 px; captions 42 px or more |
| Safe areas | title-safe 80% (192/108 px margins); action-safe 90%; universal vertical box 900×1400; vertical bottom dead zone about 300–320 px |
| Text dwell | at least characters/13 s once settled; title card 3–6 s; overlay 2–5 s; chart builds in 2–4 s and holds 3–5 s |
| Captions | horizontal 6–8 words and up to 42 characters per line; vertical 3–4 words; 2 lines max; cue on screen 1 s to 5–7 s; 2-frame gap; ~200 ms tail; sync within 3 frames |
| Easing | entrances ease-out cubic; exits ease-in cubic; moves ease-in-out cubic; anticipation 2–3 frames; overshoot 10–15% |
| Still motion | 2–3 stills per scene; 1.00→1.02 bump to mask jump cuts; detail zoom 1.5–2x over ~0.8 s; hold at least 3 s before the next pan |
| Grade | start at strength 0.8; LUT at 0.6–0.8; generated imagery 0.5–0.6; saturation 1.2 or less with people; adjust in ±0.05 steps |
| Letterbox at 1080p | 2.39:1 → 138 px bars; 2.35:1 → about 131–140 px; 1.85:1 → 21 px |
| Footage scoring | keep 3 or higher on a 1–5 scale; CLIP cosine 0.30 or more is strong, under 0.22 means search again; candidate pool 8–12x the slot count |
| QC | duration within ±5%; transcript at least 80% of script words; blur variance under 100 fails; mean brightness 50–200; contrast std-dev above 30; silence gaps 1 s or less; A/V sync ±0.5 s |
| Slideshow score | average below 2 is strong, below 3 acceptable, below 4 revise, 4 or above fail |

---

## 6. Where the sources disagree, and what to use

- **Vertical caption width:** 20 characters per line in one file, 30 in another. With 3–4 word cues and word highlighting, use about 20–26.
- **Reading speed:** 15 characters/s (subtitle skill) against 21 (typography skill). Use 15 for documentary and educational content and treat 21 as the ceiling.
- **Longest a caption cue may stay:** 5 s against 6–7 s. Use 5 s for narration-paced documentary.
- **Music under narration:** the stitching skill says to duck about 12 dB, while sound design says 18–20 dB below speech. The second is the better-justified target (accessibility guidance plus broadcast practice). The Remotion examples use linear 0.08–0.12, roughly −22 to −18 dB, which agrees.
- **Transition variety:** the explainer editor warns against using the same transition everywhere, while the documentary editor demands restraint. Reconcile it as hard cuts for the majority, with a few meaningful types kept for structural moments.
- **Long-form cut interval (10–25 s) against "new visual every 3–5 s":** the first is the *primary scene* interval for presenter-led video, the second is micro-change. In a faceless documentary the picture is all B-roll, so the practical answer is B-roll shots of about 3–8 s inside sections that change treatment every 15–25 s.
- **Documentary ASL (6–12 s) against the elegiac montage base (4 s):** the 6–12 s figure assumes continuous documentary footage. Short stock clips under narration sit better at 4–8 s.
- **Frame rate:** documentary montage renders at 24 fps, while web and animation defaults are 30. Pick per channel and conform everything. Never interpolate.

---

## 7. What matters most for an automated FFmpeg faceless-documentary editor

Ranked by impact for a Node.js program that assembles ElevenLabs narration, stock clips and AI visuals with FFmpeg into videos of roughly 5–7 minutes:

1. **Narration-first timing with a measured feedback loop.** Get word timestamps for the final narration (from TTS alignment data or a local Whisper pass). Snap cuts and overlays to them within ±0.5 s, and send overrunning sections back to the script stage. This is the biggest single difference between "synced" and "slideshow over audio".
2. **A rhythm engine instead of fixed durations.** Take holds from the register table and apply breathing variation, hero holds, a no-three-equal-lengths rule and a check that the longest unchanged stretch stays at or under 5 s. This is cheap to implement and changes the feel completely.
3. **Trim-to-the-moment.** Score motion inside each stock clip (frame-difference energy from FFmpeg) and centre the hold on the peak instead of taking the first seconds. Leave handles. Ban freeze frames, for example by checking for repeated frames.
4. **Adjacent-diversity pass.** Use perceptual hashes for near-duplicates, average hue for palette runs, a vision model for shot scale, and a never-reuse list. Break pairs that repeat subject and scale.
5. **Footage scoring with floors and a rejection log.** Combine query craft (subject first, point-of-view word, 2–3 queries per slot) with a 1–5 vision-model score and a hard floor. Grow the search at most twice before changing the slot.
6. **A small transition vocabulary and real J/L cuts.** Hard cuts by default, `xfade` limited to fade and fadeblack, and L/J cuts done as audio offsets plus `acrossfade` on the hardest joins. A documentary preset should treat flashy transitions as a lint error.
7. **Music as a grid plus a proper mix.** Snap hero cuts to beats (needs a beat tracker or BPM metadata). Automate one silence window and a 3–5 s tail fade with `afade`/`volume`. Duck with `sidechaincompress`, add an `equalizer` notch at 2–4 kHz on the bed, and finish with two-pass `loudnorm` to −14 LUFS / −1.5 dBTP.
8. **Purposeful still motion.** Use `zoompan` with eased (not linear) expressions, a different direction on each neighbour, 2–3 stills per beat and the 1.02 bump on jump cuts. Track the real-motion ratio so a "documentary" doesn't quietly turn into an animated slideshow.
9. **Captions done right.** Generate ASS with karaoke timing tags for word highlighting, respect cue limits, the full 8-digit ASS colour form and per-platform safe zones, and never duplicate on-screen headlines.
10. **One canvas, one grade.** Scale, pad or crop to a single canvas (pillarbox archive material, never upscale it), then apply `lut3d` blended at 0.6–0.8 strength across the whole timeline. Use one fps.
11. **Automatic post-render QC.** `ffprobe` checks for both streams, then `signalstats` (brightness), a blur measure, `ebur128` (loudness), `silencedetect` (gaps) and a transcript re-check against the script. Fail fast and route each issue to its stage.
12. **Pre-render slideshow-risk lint.** The six-dimension score plus the variation lint, run on the plan JSON before any render time is spent. It forces every scene to carry a stated purpose.
13. **A retention scheduler in the script room.** Open loop before 60 s, payoff before 2:00, re-hooks at about 2:00 and every 3–4 min, a burst every 2–3 min, a palette cleanser every 45–60 s. These become timeline markers the editor must honour.
14. **Reference teardown for competitor links.** Measure their shot lengths, classify motion type, then keep some elements and change others: learning from competitors without copying.
15. **Channel style as dials.** Three dials plus a design read and an anti-pattern list give each channel its own data-driven editing style.

---

## 8. Ideas that depend on tools we probably don't have (and substitutes)

- **Remotion / HyperFrames** (animated charts, word-highlight captions, alpha-channel end-tag overlay, spring transitions). Substitutes: ASS karaoke captions, `drawtext` with alpha expressions for end tags, or pre-rendered PNG/WebM overlays from a Node canvas library, composited with `overlay`.
- **CLIP retrieval corpus** (embedding index, rank-for-slot, diversify, find-similar). Substitutes: a vision-LLM score on thumbnails, or a local CLIP model via ONNX if needed. The score floors (0.22/0.30) apply only to CLIP ViT-B/32 cosine values.
- **PySceneDetect.** Substitute: FFmpeg `scdet` or `select='gt(scene,x)'`. The scale is 0–1, so the repo's 0–255 thresholds must be recalibrated.
- **WhisperX alignment.** Substitutes: faster-whisper or whisper.cpp word timestamps, or the timing data some TTS APIs can return alongside the audio.
- **Video-understanding models** (BLIP-2/LLaVA). Substitute: a vision LLM on sampled frames; blur and brightness need no model.
- **Beat tracking.** FFmpeg has none; use a small library or BPM metadata.
- **AI video generators** (Seedance, Veo, Sora, LTX, Kling). Only if keys exist; the seam and prompting rules still apply.
- **Music generation, face enhancement, lip-sync, avatars, Manim, animated drawings, 3D worlds.** Mostly irrelevant here; Mermaid diagrams can be rendered from Node if wanted.
- **Archive sources** (Archive.org Prelinger, NARA, Library of Congress, NASA/ESA/NOAA). Valuable for history and science documentaries, but each needs its own adapter. The repo routes vintage briefs heavily toward archives (60%+ of picks).
- **Vectorscope skin checks.** Approximate them with hue statistics on face regions, only if people appear.

---

## 9. Caveats

- Many audience statistics in the source (for example "AI-generated video shows 70% lower retention", the 3-second reach multipliers, "+23% from an interrupt in the first 5 s", "L-cuts feel 50% more coherent") are stated without verifiable citations. Treat them as directional heuristics. Encode them as tunable defaults, not guarantees.
- The repository's own governance (human approval gates, decision logs, "never silently downgrade motion to stills") is worth keeping: surface a changed delivery promise to the user instead of quietly shipping something lesser.
- License: OpenMontage is AGPL-3.0. Only ideas and widely known numeric conventions (loudness targets, easing curves, safe-area sizes, caption limits) are reflected here, restated in my own words. No code or prose was copied.
