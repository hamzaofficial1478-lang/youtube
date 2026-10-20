# Room 06: language editions (L01 0.43.0, L02 0.44.0, L03 0.45.0)

A family can have up to 10 languages (Studio). The first is the primary language: every room before this one works on it.
Each other language gets an **edition** of a finished video. L01 adapts its words; L02 narrates them and times the scenes to
that voice; L03 renders the edition's own video and thumbnail and records its release decision.

## When an edition can start

Only from a locked primary video: its final master must be approved in Room 10 and still current
(`LocalizationRoom.approvedMaster`). This follows the blueprint: "localization begins only after the primary master is locked."

## What is adapted

`localize.js` (pure) collects everything the viewer hears or reads. `L.source` turns it into one source with a fingerprint.

| Part | Where it comes from | Key |
|---|---|---|
| Narration | the approved script, split into sentences numbered like the scene plan (`sentencesOf`), each with its paragraph | `n` |
| On-screen words of drawn shots | the master's drawings: `text`, `label`, `title`, `banner`, `headline`, `line`, `source`, `name`, `value`, `unit`, `caption` and `labels` lists (`L.VISIBLE`), anything with two letters or more | `d:<clip><JSON pointer>` |
| On-screen words of graphics | the edit's accepted graphics: title and lines | `g:<graphic>/title`, `g:<graphic>/lines/<k>` |
| Package | the approved package: chosen title, description, tags, chosen thumbnail's words and accent | `package` |
| Designed (atelier) shots | their words are inside the design; they are listed, not adapted | `designed` |

Numbers, poses, props, colours and ids are vocabulary, not words, and are never sent.

## Claude's adaptation

On the owner's click (`queueDraft`), inside a token reservation of kind `localization` (AI task `localization`, main model),
never retried by itself:

- The prompt (`L.messages`) asks for adaptation, not word-for-word translation. Meaning, facts, numbers, dates, names and
  story order are kept. The locale's own spelling and number format are used. Units are converted only where the market
  expects it. Idioms become local equivalents.
- **Spoken length:** each sentence should take about as long to say as the source (within about 15% of its syllables),
  so the picture can be reused in L02.
- On-screen words stay short (each has a maximum length). The title keeps the original promise.
- Approved skills for `localization.check` are added and recorded in `skill_usage`.
- Long scripts go in parts of 150 sentences. Words on screen and the package go with the first part.
  - Each finished part is kept in the job (`edition_jobs.parts`).
  - A retry after a failure or a stop asks only the parts still missing, and reserves tokens only for them.
- Claude's answer is checked leniently (`L.normalise`): over-long text is shortened at a word, and unknown ids are dropped.
  Each repair is named in the revision's notes.

## Checks (`L.check`)

- **Critical** (blocks approval):
  - a sentence or on-screen text without an adaptation;
  - a figure written in digits that disappeared (separators are ignored, so 40,000 and 40.000 are the same figure);
  - a missing title;
  - missing thumbnail words.
- **Suggestions:** spoken length is estimated from syllables and each language's measured speech rate (`L.RATE`, Pellegrino,
  Coupé & Marsico 2011: Spanish uses more syllables than English but says them faster). The estimate is rough, so a sentence
  is flagged only against the edition's own typical sentence.
  - a sentence that takes 30% longer to say than the edition's typical sentence;
  - a complete narration that takes more than 20% longer to say than the original;
  - a sentence identical to the source;
  - a designed shot that keeps the primary language.

## Revisions, edits and approval

- Each language has immutable revisions (`edition_revisions`). Each revision stores the source it was made from and the
  source's hash.
- The owner edits every line in Room 06. The edit is checked strictly and saved as the next revision.
- **When the primary video's words change** (script, drawings, graphics or package), the edition shows "Main video changed".
  The next adaptation keeps the wording of every unchanged sentence and on-screen text (`L.carry`) and asks only what
  changed. The kept wording is given to Claude so the new sentences use the same terms.
- **Approval** (`approve`) is by name, with four confirmations:
  - a speaker read the whole narration;
  - names, numbers, dates and units are right;
  - on-screen words read naturally and fit;
  - the title and thumbnail words promise only what the video shows.
- Approvals are immutable rows (`edition_approvals`). An approval is current only while all of these hold:
  - its revision is the newest for that language;
  - the source hash is unchanged;
  - a master is still approved.
- Languages are independent: one can be approved, adapted again or failing while the others continue.
- "Download text" gives the narration, the package and the on-screen words, for a reviewer or for L02.

## L02: the edition's narration and timing (0.44.0)

After a language's words are approved, its narrator reads them. Then every scene of the approved edit is measured in that
voice. The blueprint's rule is followed: shorten the wording or retime the visuals, never speed up the voice.

### The narrator (`saveVoice`, immutable `edition_voices`)

- An edition voice belongs to one family and one language. It copies the main narrator's (Voice Room) connection, rights and
  delivery, and records which profile revision it came from.
- The owner may give another voice ID and model for the language. ElevenLabs' multilingual models (for example
  `eleven_multilingual_v2`, `eleven_v3`) speak many languages with one voice.
- Saving needs the owner's name and the confirmation that the voice may narrate in that language for commercial use.
- The voice is usable only while its connection is still the tested revision (`store.voiceConnector`).

### The narration (`queueNarration`, `processNextNarration`, table `edition_narrations`)

- It needs the language's current approval (L01), a current narrator, and an approved master made from an edit.
- The script is `L.script`: the approved sentences in the source's paragraphs.
  - It is spoken in the same request chunks as the main narration (`V.chunkText`).
  - It goes through the same code: `V.speak` and `V.joinNarration` were taken out of the Voice Room runtime, which now uses
    them too.
  - The audio gets the same real-audio checks (decode, duration, silence, clipping, loudness, sample rate, channels) and the
    same words-per-minute pace.
- **Money:**
  - One click, never retried by itself, at most 3 paid narrations for the same words and voice.
  - The characters count against the family's monthly voice limit, shared with the main narration:
    - `claimNarration` adds the main narration's use;
    - the Voice Room's own claim adds the editions' use (`store.editionVoiceCharacters`).
- **Stops:**
  - A narration that stops after the voice service was asked is `interrupted`, with usage `unknown`. Its retry needs a
    confirmation, and a retry is a new attempt, so the old one's characters stay counted.
  - A program stop marks running narrations interrupted.
- The file is kept with its checksum in `voice-artifacts/<family>/<content>/<locale>-<id>.wav`. It is served with byte
  ranges, so it can be played and sought.

### Timing (`L.sync`, pure)

- **Sentence starts.** When the voice gives word times (ElevenLabs), each sentence starts at its first measured word: the
  words of the sentences are counted in order, and the counts must add up to exactly the words the voice returned.
  Otherwise the starts are spread by spoken length and labelled `estimated`.
- **Scenes.** Each scene of the approved edit starts where its first sentence starts in this language. The first scene starts
  where it did in the main video. The last scene keeps whatever the main video holds after its last word. Every scene change
  is put on the frame nearest those words.
  - `drift` is how far a change lands from its words. It must stay under 0.25 s (`L.DRIFT_LIMIT`); otherwise the narration
    cannot be approved.
- **How much a scene changes** (`L.NATURAL`):
  - `same`: within 0.25 s.
  - `retime`: 0.8-1.25 times its old length, or within 0.6 s.
  - `long` or `short`: beyond that. Its pictures are held much longer or run much faster. The warning names the sentences
    whose wording would keep the original rhythm.
- The timing is always computed against the master approved now. L03 uses it to retime the picture.

### Approval (`approveNarration`, immutable `edition_narration_approvals`)

- **Confirmations, by name:**
  - a speaker of the language listened to the whole narration;
  - names, numbers and places are pronounced right;
  - the scene timing list was read;
  - each scene outside the natural range was accepted, when there are any.
- **Refused when:** the audio failed a check, a scene change misses its words by 0.25 s or more, or the file changed.
- **Current only while all of these hold:**
  - it is the newest approval for that language;
  - the language's approved words and its narrator are unchanged;
  - the file is intact;
  - the same master is approved.
- `currentNarration(contentId, locale)` gives L03 the narration that stands.

### Room 06 on the page

Each language card has a **Narration** part:
- the narrator, with "Choose the narrator" or "Change narrator";
- "Narrate (N characters)", with the price estimate in the dialog;
- the player, the audio checks, words per minute and whether the word times are measured;
- the scene timing table (original length, this language, change);
- the approval;
- when the newest attempt is not the approved one, which attempt stands.

The page keeps itself up to date while a narration is being made.

## L03: each edition's video, thumbnail and release (0.45.0)

The blueprint's last localization step: review and render each edition on its own. One language can be released while
another is still being adapted, narrated or fixed.

### The render (`queueEditionRender`, render preset `edition`)

- It needs the language's approved narration (`currentNarration`) and timing that passes (`syncFor`).
- The edition is rendered from the approved master's own recipe: the same edit revision, visuals, music, style, pinned FFmpeg
  build and renderer. Four things change:
  - **The voice:** the edition's approved narration (its checksum is verified before rendering, like every input).
  - **The timing** (`L.editionTimeline`, pure): every scene of the edit is stretched or squeezed onto its span in the new voice
    (`L.retime`), so cuts, graphics and retention marks keep their place inside their scene.
    - Clips stay contiguous.
    - A footage clip that would run past the end of its source starts earlier, then slows down, never below half speed.
    - Transitions shrink to fit their shorter neighbour or become cuts.
    - The fade-out fits the last clip.
    - The retimed timeline must pass the editing brain's own `validateTimeline`.
  - **The words on screen:**
    - drawn shots get the edition's words at their JSON pointers (`L.editionDrawings`);
    - accepted graphics get their adapted title and lines.
  - **Captions:** built again from the edition's sentences on its voice: measured word times when the voice gave them,
    otherwise the estimate. The graphics and caption layer is written again (`B.graphicsAss`, with the fonts this PC has).
  - Music cues and sound effects keep their place inside their scene (`L.editionSoundtrack`).
- **The thumbnail:**
  - The approved package's chosen thumbnail is drawn again with the edition's thumbnail words and accent: same shot, frame
    and layout, the same content-addressed drawing as Room 09.
  - It is drawn only when the edition has thumbnail words.
- **Rendering:** the render worker treats an edition like a final master.
  - It uses the master preset (1080p, H.264 High, AAC 384 kb/s stereo, fast start).
  - It gets the same checks, including `delivery format`, but not `matches the approved preview`: an edition has no preview
    of its own.
  - It gets the same recovery from verified parts after a stop or failure, and the same retry and cancel.
  - It stays out of the previews of Rooms 05 and 08 and the masters of Room 10.
  - It is refused, or marked out of date before it starts, when the language's narration approval or the approved master
    changed.

### The release (`approveEditionRender`, immutable `edition_releases`)

- **Confirmations, by name:**
  - a speaker of the language watched the opening, a middle part and the ending at full quality;
  - the sound was heard;
  - the title, description and thumbnail words fit;
  - remaining check findings were accepted, when there are any.
- These checks can never be accepted away: full decode, audio/video alignment, duration, frame, narration audio, delivery
  format (`EDITION_BLOCKING`).
- **Current only while all of these hold:**
  - it is the newest release for that language;
  - the render still stands (same narration approval, same master);
  - the video file is intact.
- `currentRelease(contentId, locale)` is what publishing will take when it is built. Nothing is published now.

### Room 06 on the page

Each language card has a **Video** part:
- "Render the <language> video";
- live progress, with "Cancel" while it renders and "Retry from the finished parts" after a stop;
- the player and every check;
- the thumbnail, title and tags;
- downloads for the video, the thumbnail and the title, description and tags;
- "Approve for release";
- when the newest render is not the released one, which render stands.

## Not built yet

- Publishing (Y01-Y02) of the released master and editions.
- Redesigning atelier shots per language: designed shots keep the primary language's words.
- Voice direction (emotion per sentence) for editions. Editions are spoken with the narrator's base delivery.
- A drawn shot's word cues are the primary language's words, so in an edition its beats are spread by time instead.

## Tested

`tests/localization.test.js`:
- what is collected, figures, sentence paragraphs, strict and lenient checks, carry-forward;
- refused before Room 10, unknown language refused, one job per language;
- the reservation is settled;
- revisions are immutable;
- approval needs every confirmation and goes stale when the package changes;
- the second adaptation asks no unchanged sentence and keeps the owner's wording;
- languages are independent;
- a 200-sentence script goes in 2 parts, stops after part 1, and the confirmed retry asks only part 2.

Browser check on a throwaway workspace: a real 20-s master with a fixture Spanish answer.
- The side-by-side table showed only the deliberately padded sentence as long to say. Before the speech-rate calibration,
  all 12 sentences had been flagged.
- Approval was refused with one confirmation and recorded with all four.
- "Write it myself" for Italian saved r1 with its missing lines listed as critical.
- "Download text" returned the narration and package.

L02 (`tests/localization.test.js`, two tests with a stand-in ElevenLabs that returns real FFmpeg audio and character timing):
- the narrator needs the main narrator, the language confirmation and one of the family's languages;
- edition voices are immutable;
- refused before the words are approved, one narration at a time;
- the request goes to the chosen voice with timestamps;
- the audio passes its checks, the timing is measured and every scene change is within 0.25 s;
- a scene 40% short of its words is named `long` with its sentences;
- the characters count in the family voice limit;
- approval needs every confirmation and the explicit acceptance of the long scene;
- approvals are immutable and go stale when the language's words change;
- a narration stopped after the request is interrupted with usage unknown, its retry needs a confirmation and is attempt 2;
- a program stop marks a running narration interrupted.

L02 browser check on a throwaway workspace: a 55-s master, Spanish words approved in the page, a stand-in voice service.
- "Choose the narrator" was refused without the language confirmation, then saved.
- The narration was made: 61.7 s, every audio check passed, 182 words a minute, measured word times.
- The scene table showed 6 scenes: 1 the same, 4 retimed and 1 much longer. The long scene was the one holding the
  deliberately padded sentence. Scene changes landed within 0.01 s of their words.
- Approval was refused until the long scene was accepted, then recorded.
- The audio played with byte ranges.
- A second attempt updated the page without a reload, and the card said that attempt 1 is the approved one.
- Fixed on the way:
  - the page did not refresh while narrating;
  - the character count in the button was 2 short (paragraph breaks);
  - the scene table was cut off on narrow windows.

L03 retiming (`tests/localization.test.js`, pure):
- clips keep their spans inside each stretched scene;
- graphics and marks move with their scene;
- the graphics speak the edition;
- a 6-s footage clip asked for 7.5 s starts at 0 and plays at 79%;
- drawn-shot words land at their pointers, labels included, and designed shots stay untouched;
- music and effects move with their scene.

L03 (`tests/editing.test.js` "L03: a language edition renders...", real FFmpeg):
- a real preview, package with thumbnail words and master;
- the Spanish words, a stand-in OpenAI voice without word times (estimated timing) and the narration approval;
- the render is refused before the narration is approved;
- the edition scope:
  - every scene starts on its frame from the timing;
  - clips stay contiguous;
  - accepted graphics speak Spanish;
  - captions follow the Spanish voice;
  - the thumbnail is drawn again with the Spanish words at 1280x720;
- the rendered 1080x1920 edition passes delivery format and duration, has no preview-match check, and its length follows the
  Spanish narration;
- editions stay out of the Room 05/08/10 lists;
- the release needs every confirmation, is immutable, and goes out of date when the Spanish words change.

L03 browser check on the same throwaway workspace (55-s master, approved Spanish narration):
- "Render the Latin American Spanish video" showed live progress ("rendering S02A").
- The 61.7-s 1920x1080 edition passed all 10 checks in 5:22.
- A frame at 12 s shows the Spanish caption with its accents.
- The video plays with seeking, and the Spanish title and tags were shown.
- No thumbnail was drawn: this demo's Spanish adaptation had no thumbnail words, and the page said so.
- The release was refused with a confirmation missing, then recorded as "Released".

Not tested:
- live Claude or live ElevenLabs on a real video;
- an ElevenLabs voice speaking a language other than English;
- an edition of a long video or of a drawn-engine style (drawn shots are drawn again with the edition's words, which only
  the unit checks cover).
