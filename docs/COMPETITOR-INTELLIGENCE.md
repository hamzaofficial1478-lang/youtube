# Competitor Intelligence (R05)

Version 0.8 adds the **Competitors** page. It studies each channel family's 3-10 competitor channels so the family can learn techniques (script structure, pacing, voice-over direction, editing style, visuals and packaging) while staying original: at most **30% reference patterns** and at least **70% original contribution**. Nothing it produces changes a channel until you approve it.

## The four steps

1. **Your competitors.** The list comes from the family form (Channel families → Edit). Fewer than 3 shows a warning. For each competitor you can save **observations** in your own words: editing style, voice-over, visuals, thumbnails and titles, script and structure, strengths, weaknesses. Every save is a new revision. No API watches the videos for you, so these notes are the strongest evidence about editing, voice and visual style.
2. **Collect data (scan).** A scan runs only when you start it, with the connectors you choose:
   - **NexLev research API**: channel profile, recent videos (10-50, default 30), outlier videos (optional) and up to 5 transcripts per channel (default 2). Planned use is at most `channels × (1 + outliers + transcripts)` requests.
   - **YouTube public data** (optional): channel title and statistics plus recent uploads. About 3 units per channel.
   Planned units are **reserved against your caps before anything is sent**, then settled with the real count. There are no automatic retries; a failed or interrupted scan can be retried deliberately (3 attempts at most). An interrupted attempt asks you to confirm because the provider may already have charged it.
3. **Hermes blueprint.** Hermes (tool-free profile) reads the latest scan and your observations and returns a structured blueprint: summary, positioning per competitor, script hooks/structure/pacing/call to action, voice tone/emotion/pace/energy, editing observations plus a recommended launch style and proposed setting adjustments, visual sources, packaging, opportunities, things to avoid, confidence and uncertainties. Each reference pattern must cite evidence (`C#` channel, `V#` video, `T#` transcript, `N#` your notes).
4. **Your review.** Approve or reject with your name. Approval requires three confirmations: techniques only (no wording, footage, thumbnails or channel identity copied), the 30/70 balance is acceptable, and every recommendation and its evidence was reviewed. Approving a new blueprint supersedes the previous approval; you can revoke an approval with a reason.

## Blend picks: what to keep from each channel (0.9)

Under every competitor link on the Competitors page you can tick what you like about that channel: **Voice-over**, **Narration**, **Editing**, **Thumbnails** and **Visuals**. Tick several on one link, and pick the same area on several links if you want to blend them (for example editing from A and C, voice-over and narration from B). **Save blend** stores the picks as a new revision with your name.

| Pick | Blueprint area | Where the result goes |
|---|---|---|
| Voice-over | voice | Voice Room narrator draft |
| Narration | script | Hermes script guidance |
| Editing | editing | New style draft in the Style Library |
| Thumbnails | packaging | Packaging brief (kept for the Packaging Room) |
| Visuals | visuals | Scene planner guidance (Room 04) |

The **blend recipe** under the list shows, for each area, which channels it learns from, or "100% your own" when nothing is picked. When picks exist, Hermes receives them and the program enforces them:

- an adopted pattern may only use an area that has picked channels, and every piece of evidence it cites must come from a channel picked for that area;
- areas without picks get original contributions only;
- **each area** keeps at most 30% reference (one adopted pattern needs at least three original contributions in the same area), in addition to the overall 30/70 rule.

With no picks at all, the analysis learns from every channel, as before. Saving new picks makes an approved blueprint **outdated** (guidance stops) until you analyze and approve again.

## Checks before you can review

A blueprint is blocked (status **Blocked by checks**) when:

- it is not valid JSON in the exact expected shape, or it cites evidence that was not supplied;
- **30/70 rule:** reference patterns are more than 30% of all patterns (`adopt × 7 > original × 3`);
- **copy guard:** any 8 consecutive words of the blueprint repeat a competitor title, transcript excerpt or your notes;
- the recommended style or an adjustment setting is not one the program knows.

Token use is reserved from the family's monthly token limit before the call (analysis limit 8,000-120,000, default 40,000). If the snapshot is too large, the program shortens descriptions, transcript excerpts and video lists step by step and refuses to send if it still does not fit. Usage that Hermes does not report, or that exceeds the limit, is recorded and blocks the result.

## What an approved blueprint changes

| Output | Effect | Your remaining control |
|---|---|---|
| Hermes script guidance | New Hermes script candidates for this family receive the approved hook patterns, structure, pacing and avoid list as technique guidance, with the instruction to keep at least 70% original and never reuse competitor wording. | Revoke the approval to stop it. It turns off automatically (shown as **Outdated**) when the family's competitor list changes. |
| Narrator direction | "Use voice direction" opens the Voice Room narrator form prefilled with emotion, pace (slow 0.9, measured 1.0, brisk 1.08, fast 1.15), energy and delivery instructions. | Nothing is saved until you review the rights fields and save a new narrator profile revision. |
| Editing style | "Create style draft" copies the recommended style's latest approved revision, applies the proposed adjustments that pass the Style Library validation (invalid ones are skipped and listed) and saves a **new draft**. Its reference share is capped at 30%. | You still review, approve and assign it in Production panel → Style Library. |

## YouTube data policy

YouTube API data about other people's channels is **display-only** by default: it is shown in the scan detail but is not scored, used for statistics or sent to Hermes. It is deleted automatically **30 days** after retrieval. If YouTube approves your API project for derived metrics, you can record that approval (date, reference, your name) in Scan settings; only then is YouTube data used for statistics and analysis. Statistics such as median length, uploads per week, Shorts share, words per minute and top outlier come from NexLev data.

## Data caps

**Edit caps** sets the NexLev monthly request cap (default 150, counted per UTC month) and the YouTube daily unit cap (default 2,000, counted per Pacific-time day). Keep the NexLev cap at or below your NexLev plan's allowance. Caps are shared by Competitor Intelligence and the Niche Factory.

## Style studies: the program learns a look (0.30)

Owner review 2026-10-15: "the program should learn by itself ... analyze and adopt the competitors' style on every niche". On the Competitors page, **Style studies** → **Study a reference** lets the program study the look and editing of any video you like (a competitor's, or one you found):

1. **Your reference.** Paste a path on this PC: a video file, one screenshot or a folder of up to 12 screenshots (in File Explorer: Shift + right-click → Copy as path). Add a title, and optionally the channel, the link (kept for your record; nothing is downloaded from it) and what you like about it.
2. **Measured on this PC (free).** The pinned FFmpeg samples 18 frames into two contact sheets and, for a video, measures every cut (median shot length and the middle half) and the main colours.
3. **Claude studies it (one answer, ~8-16k tokens reserved from the family's monthly limit; never retried by itself).** It maps the look onto our engines and looks (stickman classic/whiteboard/storybook/doodle, hand-drawn, motion, atelier, montage) and returns the palette, shot lengths, transitions, people, places, words, camera, the techniques to learn, our own contributions, what never to copy, and a planning brief in our own words.
4. **Checks.** Only our vocabulary; colours as hex; the 30/70 rule (`learn x 7 <= ours x 3`); a copy guard (no six words in a row from the title or your notes, never the channel's name); the measured rhythm replaces Claude's guess. A failed check keeps the study as **Blocked by checks** with its reasons.
5. **Your review.** Approve by name with three confirmations (techniques only, the 30/70 balance, the whole study read), or reject with a reason.
6. **Style draft.** **Create style draft** starts from the launch style the study maps onto and applies its palette, shot lengths, transitions, look and planning brief (a change that fails the Style Library checks is skipped and listed). The brief reaches Claude's planner, continuity review and story director as "LEARNED LOOK". You still approve and assign the draft in the Style Library.

Live check (2026-10-15, our own 0.29 preview as the reference): 37 s, 7,757 tokens; Claude named the drawing hand, the storybook street, the doodle gag and the illustrated price tags, mapped it to Stickman · Whiteboard, and proposed 5 techniques, 12 of our own and 6 things never to copy.

## Not included yet

- No video downloading or audio analysis. Frames are studied only from files you point to (style studies); scans still take editing and voice evidence from your observations and transcripts.
- NexLev MCP (OAuth) is not used; the REST API with a key in a Windows-protected connector slot is.
- Live verification against the real NexLev, YouTube and Hermes services still needs your keys. All automated and browser checks used fake providers.
