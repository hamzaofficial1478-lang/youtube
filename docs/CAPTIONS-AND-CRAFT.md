# Captions (P07) and the YouTube craft engine (S02) - v0.14.0

Two pieces arrived together in 0.14. Both are local, free and deterministic: no provider call, no clock,
no randomness. Both only advise or draft; nothing here publishes.

- `captions.js`: the caption track of every edit (word timing, groups, emphasis, the burned-in rail, SRT, checks).
- `craft.js`: YouTube craft checks ported from youtube-agent-skill (hook score, title/thumbnail pairing,
  chapters, Shorts spans, outlier multiples, retention reading, the family writing voice).

The research behind both is in `docs/research/hyperframes-and-youtube-agent-skill.md`.

## 1. Captions

### Where they live

Captions are part of the **edit revision** (`timeline.captions`, schema `ytprod.captions/1`). The editing
brain builds them in `autoEdit` from the approved script's sentences and the narration's measured pauses.
They follow the narration, not the clips: cutting, reordering, scene repair and graphics decisions never
move them. They are rebuilt only by **Draft a fresh edit**. Edits drafted before 0.14 have no captions; the
room says so and offers a fresh edit.

### Timing

1. Each sentence window is measured: the edit already moves sentence starts onto the real pauses
   (`alignSentences`, FFmpeg `silencedetect -35dB 0.18s`).
2. Inside a window, the trailing pause before the next sentence is silence, not speech.
3. Every pause measured inside the sentence is anchored at the nearest clause break (comma, colon, dash)
   within 0.8 s of its estimated time, otherwise at the nearest word break.
4. Between anchors, words share the time by spoken weight (letters; digits and symbols count as said aloud).

So sentence starts and clause pauses are **measured**; word times inside a phrase are **estimated**. The room
says exactly that. Measured word timing (ElevenLabs character timestamps, or local forced alignment) is a
later upgrade.

### Grouping (skills `captions.voice-grouping`, `timeline.auto-caption-segmentation`)

- A phrase ends at a sentence end, a pause of 0.18 s or more, or a clause break.
- A phrase over the limits is split into the **fewest, most even** captions (dynamic programming over word
  breaks). Ending a caption on a weak word ("the", "of", "did", "who") costs extra, so does a lone word; a
  caption may take one word over the cap rather than end on a weak word.
- Limits: long-form 12 words, two lines of 42 characters, 4.5 s; Shorts 4 words (3 above 2.5 words a
  second, 2 above 3.5), two lines of 22 characters, 2 s.
- A lone word or a flash under 0.5 s joins a neighbour from its own sentence, never across a measured pause
  or a clause break.
- A caption appears 0.08 s before its first word and stays up to 0.6 s after its last, always 0.05 s clear
  of the next one, and at least 0.5 s on screen.
- Lines break where the two lines are most even, preferring a clause break and never leaving a weak word at
  the end of line one.

### Emphasis (skill `captions.rail-and-emphasis`)

At most one word per caption, never in two captions in a row: figures first (any digit), then negations and
limits (never, nobody, nothing, only, not, no, zero …). The word lists are English; other languages only
lift figures.

### Active-word highlight (0.28, HyperFrames caption DNA)

Styles with `activeWordHighlight` burn captions whose words wait dimmed and light up as the narrator says
them (ASS karaoke from the caption's word times); the emphasis word lights in the accent with a short pop.
A caption corrected to other words has no word times and is shown whole.

### On screen (skills `captions.keep-out-band`, `editing.caption-spec`)

- Burned in as the **top ASS layer** (above graphics and canvas overlays), white bold sans with a dark
  outline, family body font.
- 16:9: bottom band, 50 px in the 1080-line script space, 62 px above the bottom. Graphics stay above the
  bottom 17% (the line chart and list builds were moved up for this).
- 9:16 Shorts: 80 px, a lower-middle rail 620 px above the bottom, clear of the Shorts buttons. While a
  full-screen graphic that carries its own text holds (title card, quote, charts, timeline, list,
  comparison, diagram), the rail clears. The scene-text label moved to the upper third on Shorts so the
  captions stay up during the hook.
- Fades only around real gaps (more than 0.3 s), so back-to-back captions cut cleanly.

### Owner controls and checks

- `set-captions {enabled}` is an ordinary owner operation: a new immutable revision, undoable.
- `set-caption {groupId, text}` (0.15.1) corrects one caption's wording: a spelling, a figure written as
  digits. Timing never moves (it follows the narration). The group keeps the narration's own timed words, so
  coverage QC still compares the narration and `{groupId, reset: true}` restores them. `*word*` marks the one
  emphasised word (punctuation may sit outside the asterisks); no mark means no emphasis. Text is 1 to 84
  characters on long-form (44 on Shorts), without control characters, braces, backslashes or `-->`. In the
  Editing Room: **Read and correct the captions → Correct**.
- The critic adds: `captions-off` (suggestion, one-click fix), caption overlaps or missing words
  (critical), captions faster than 20 characters a second (nitpick), hand-corrected captions (nitpick: listen
  to them with the narration), and on Shorts a warning when
  full-screen graphics hide more than a quarter of the captions.
- `GET /api/edit-revisions/:id/captions.srt` and `.../captions.vtt` download SRT or WebVTT for YouTube
  (all captions; the platform player draws them, so nothing clears). WebVTT escapes `&`, `<` and `>`.
- The render manifest records the SHA-256 of the exact subtitle layer, captions included.

## 2. YouTube craft engine (`craft.js`)

Ported from youtube-agent-skill (MIT, revision a2feb21). `vendor/youtube-agent-skill/hooks.json` (the
21 hook formulas) is copied unchanged with its licence. The hook scorer and the title linter return the same
numbers as the Python originals on the same inputs (checked in `tests/craft.test.js`). The scorers read
English only and say so for other locales.

| Tool | What it does | Where it shows |
|---|---|---|
| `scoreHook` | Specificity, address, stakes, curiosity, length (0-100 each); verdict = 0.6 x mean + 0.4 x weakest; 72+ strong, 55+ workable; names the formula and the fix for the weakest property | Draft craft check; Claude candidate quality (advice, never a blocker); Shorts candidates' opening lines |
| `lintPackaging` | Title length (60 desktop, 40 mobile, 100 hard), shouting, vague words, a number/name/date, front-loading; thumbnail text at most about 3 words and sharing no word with the title | Draft craft check; **Check the pairing** button |
| `chapterize` | Pause x 1.6 + vocabulary shift x 3.2 + scene start 1 + script paragraph break 1.5; never in the first or last three sentences; 0:00 first, 3+ chapters, 10 s each | Editing Room, long-form only |
| `findShorts` | 20-55 s spans that open on a complete thought, contain a turn or a proof and end on a line; ranked by the opening line's hook score; top five without overlap; writing notes for each | Editing Room, long-form only |
| `outlierMultiples` | Views / channel median of recent uploads (4+ videos), plus the title's formula | Competitor scan table (NexLev data only; YouTube data stays display-only) |
| `analyseRetention` | Hook leak (first 30 s; under 25% healthy), the five steepest cliffs with what the narration said within 4 s, the slide; ends in ONE fix | Editing Room, paste a YouTube Studio CSV |
| `neverWordsUsed` | Words the family never uses | Blocks Hermes candidates; advice on drafts |

### The family writing voice

Families have an optional **writing voice** (youtube-agent-skill's `voice.md`): the one person a video
talks to, words the channel never uses (40 max), its own phrases (20), claims it refuses (20) and format
notes. It is part of the family revision. Hermes receives it in the script prompt (prompt version 3);
never-used words are enforced in the candidate quality gate. The owner's own draft only gets advice, so a
new never-used word can never undo an approval.

## 3. Not done

- Measured word timing; editable caption text; WebVTT; caption editions for additional locales (L01-L03).
- Not yet run on a real ElevenLabs narration (only on synthetic narration with real pauses and real FFmpeg).
- The chapter titles are topic words for the owner to rewrite. The Shorts finder only finds spans; writing
  each Short (new first line, on-screen text, loop point, vertical crop) is still the owner's or Hermes' job.
