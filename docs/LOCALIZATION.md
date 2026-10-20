# Room 06: language editions (L01, 0.43.0)

A family can have up to 10 languages (Studio). The first is the primary language: every room before this one works on it.
Each other language gets an **edition** of a finished video. L01 adapts its words. L02 (narration and timing) and L03 (each
edition's render and release decision) are not built yet.

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

## Not built yet

- **L02:**
  - the edition's narration (ElevenLabs, on a click);
  - per-scene timing within 0.25 s at transitions (shorten wording or retime visuals, never unnatural speed);
  - captions in the edition's language.
- **L03:**
  - the edition's render, with its own words drawn into drawn shots and graphics;
  - the localized thumbnail image;
  - its own review and master approval.
- Redesigning atelier shots per language.
- A measured word timing for languages other than the primary.

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

Not tested: live Claude on a real video.
