# Packaging Room (P10, Room 09, 0.18.0)

Room 09 makes the title, thumbnail, description, chapters, tags and disclosure for one approved video, as
reviewable variants. The doctrine comes from the skills `packaging.title`, `packaging.thumbnail` and
`packaging.seo`: **the title asks, the thumbnail intensifies, the video answers**. Nothing is uploaded and no live
metadata changes. You download the package and paste it into YouTube Studio yourself; publishing is a later
milestone.

## Making a package

- **Start from the script (free)**:
  - the working title;
  - three thumbnail variants on the hook shot, a turn or evidence shot and the closing shot;
  - the draft chapters of the current edit;
  - the disclosure the visuals call for.

  You write the words.
- **Ask Claude for a package**: Claude (Opus 5.5) reads the approved script, the draft chapters and the shots on the approved board. It drafts:
  - 5 titles in different formulas;
  - 3 thumbnails that differ on purpose (shot, emotion or angle), each with 1–3 overlay words not taken from the title and one possible accent word;
  - a description;
  - chapter titles;
  - tags.

  Tokens are reserved first and nothing is retried by itself. The draft becomes a new revision for you to edit.
- **Edit package**: one form for every field. Each save is a new **immutable revision**, and only changed thumbnails are drawn again.

## Thumbnails

Drawn locally with the pinned FFmpeg from the approved visual itself, never from the 360p preview. A still is
used whole; a stock clip gives a frame at your chosen second. Each thumbnail is:

- filled to 1280×720, with a little saturation and contrast and a soft vignette;
- given the overlay words as a libass layer: big, bold, outlined, in the left or right third or along the bottom, one word in the style's accent colour, in the style's heading font.

Files are content-addressed, so the same shot, frame and words give the same file. The page shows each
thumbnail at full size and at phone size (168 px), because that is where the choice is decided. Thumbnails need
the `eq` and `vignette` filters, so run the readiness check again after updating to 0.18.

## Checks (critical blocks approval)

- **Honest figures**: every number in the chosen title and thumbnail must appear in the script, as digits or as English words ("5,000" ↔ "five thousand"). A figure in another variant is a suggestion.
- **YouTube limits**:
  - title up to 100 characters;
  - full description up to 5,000 characters (the text, then chapters, the AI note and the visual credits);
  - tags up to 500 characters;
  - thumbnail 1280×720 under 2 MB.
- **Title and thumbnail craft** (`craft.lintPackaging`): length and the mobile cut, shouting, vague words, a concrete figure, the subject up front. The thumbnail must not repeat the title's words, and should carry at most three of its own.
- **Writing voice**: words the channel never uses are critical in Claude's drafts and advice in yours.
- **Disclosure**:
  - AI images set to "always disclose" make YouTube's altered or synthetic content label mandatory;
  - other AI images and a cloned or custom voice ask for your decision;
  - an AI-assistance note is suggested whenever AI helped (never claim no AI was used).
- **Chapters**: 0:00 first, at least three, at least 10 seconds each.

## Approval

**Approve package** needs:
- the newest revision with no critical checks;
- the script unchanged;
- a render approved in Room 08;
- your name and four confirmations:
  - the title is paid off;
  - you judged the thumbnail at phone size;
  - the disclosure and AI note are right;
  - the credits are complete.

The approval goes **out of date** when a newer package is saved, the script changes, or the Room 08 approval changes.

**Download for YouTube Studio** gives the title, the full description, the tags, the synthetic-content choice and
which thumbnail to upload. The thumbnail JPEG downloads from its card.
