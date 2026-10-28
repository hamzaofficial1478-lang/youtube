# The Cinematic engine (P06u, 0.40.0)

Owner request (2026-10-19): finish the remaining editing engine after a check of the completed ones. The Cinematic engine is the
style `cinematic-hybrid` (Style Library card "Cinematic"). It is the footage counterpart of the drawn engines: real moving
pictures, cut with film grammar and finished as one film. It draws nothing.

## What it does

| Part | Where | What |
|---|---|---|
| Engine | `engines.js` `ENGINES.cinema`, `PRIMARY_BY_ADAPTER['cinematic-hybrid']` | `engineScope` gives footage only (`drawn: []`, no frames, no film looks); `plannerSources` drops `generated-graphics`. |
| Planner guide | `engines.js` `CINEMA`, `promptGuide('cinema', {grade})` | SHOT GRAMMAR (stock queries written as size + subject + movement + light; wide, closer, insert, face, wide), CONTINUITY (screen direction, light, cut on motion, rhyme opening and ending), RHYTHM (hard cut on the first word, short shots for energy, long holds for awe, slow motion for an emotional beat), TITLES (place and date supers, the one number, chapter titles), TASTE. No drawing vocabulary and no motion layer. |
| Grades | `engines.js` `GRADES` (what each suits), `render.js` `GRADE_FILTERS` (FFmpeg) | natural, teal and orange, golden hour, bleach bypass, cold thriller, black and white, vintage film, moody. One grade for the whole video. |
| Style | `style.js` `cinema: {grade, grain, letterbox}` | `grade` is a key of `GRADES` or `choose`; `grain` 0-100; `letterbox` true/false. Style editor section "Cinematic engine features". |
| Claude chooses | `scene-room.js` | With `grade: 'choose'` the plan answer has a top-level `"grade"`; `aiScenes` keeps a known key and drops anything else, `mergeParts` keeps the first part's, `buildPayload` stores `payload.grade`, every later plan revision carries it. |
| Render | `render.js` `lookFilters`, `render-room.js` `lookOf` | Per segment, after the BT.709 tags: the grade, a conversion back to BT.709 TV range and the tags again, a vignette for bleach/noir/vintage/moody, seeded grain (`noise ... all_seed=1009+index`, so a render repeats byte for byte) and 2.39:1 bars on landscape frames (`drawbox`). Titles (ASS) and canvas graphics lie above. The render result records `look`. |
| Shot matching (0.41) | `render.js` `lookFilters` | Before the grade, each clip is levelled by a gentle, linked, temporally smoothed `normalize` (30% strength, colour balance kept), after video-use's per-clip correction, so footage from many cameras takes the grade alike. |
| Readiness | `render.js` `REQUIRED_FILTERS` | adds `colorbalance`, `curves`, `hue`, `noise`, `drawbox` and (0.41) `normalize`. |

The launch spec (launch library v11) uses stock video first, then stock and AI images, Bahnschrift titles in capitals, captions as
a sidecar file, camera moves static/ken-burns/pan/zoom, and `cinema: {grade: 'choose', grain: 30, letterbox: true}`. AI video is
not offered: no AI video adapter is built.

## Rules

- A Cinematic plan needs footage it can fetch: without a tested Pexels, Pixabay or OpenAI image connection the plan is refused
  with a plain message (there is no drawn fallback).
- Segments keep one colour profile (BT.709, TV range); the grade converts from RGB back explicitly, never by default matrix.
- Grain is seeded; renders stay deterministic.
- No bars on vertical Shorts.
- References are ideas: the grades are restated in our own words and no channel's look is copied.

## Tested

- `tests/render.test.js` "the cinematic finish ...": all 8 grades on a still and a clip with the pinned FFmpeg: bars at top and
  bottom, picture between, BT.709/TV tags on every segment, identical bytes when a segment is rendered twice, black and white has
  no colour left, 120 frames for 4 s after concat.
- `tests/engines.test.js`: scope, sources (no drawn shots), the guide offers every grade and no drawing vocabulary.
- `tests/scene.test.js`: the prompt asks for `"grade"` only when Claude chooses; unknown grades are dropped; the first part wins;
  the payload keeps the grade.
- Not yet tested: a live Cinematic plan with Claude and real stock footage (needs the owner's free Pexels or Pixabay key), and a
  full edit render with titles over a graded film.
