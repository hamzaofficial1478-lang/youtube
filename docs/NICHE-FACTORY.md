# Niche Factory (R06, R08)

Version 0.8 adds the **Niche Factory** page. It combines your own niche ideas with NexLev discovery data, has Hermes rate each idea against the blueprint rubric, computes the score in code, and lets you decide which niche becomes a new channel family.

## Flow

1. **Add a niche idea.** Title, description, audience, target countries, formats (long-form and/or Shorts), up to 5 search keywords, up to 5 seed channels (@handle, UC… channel ID or channel link) and notes. Every edit is a new revision; ideas can be archived and restored.
2. **Run discovery (NexLev).** Started only by you, with a NexLev connector (and optionally YouTube, only to resolve @handles). For each seed channel: NexLev niche overview and similar channels (depth 1 or 2). For the first 3 keywords: a NexLev thumbnail/title search (10-50 results). Channels found are merged and counted by how many sources found them; the top N (0-5, default 3) get NexLev channel analytics, labelled as **NexLev estimates**. Planned requests are reserved against the shared NexLev cap first; no automatic retries; 3 attempts at most.
3. **Evaluate with Hermes.** Hermes receives the idea and the current discovery (if any; otherwise confidence will be low) and returns ratings, hard filters, 20 episode ideas, 3 reasons to reject, recommended competitors, a recommended launch style and a draft family. Every rating cites evidence (`IDEA`, `S#` seed overview, `C#` channel, `K#` keyword search, `A#` analytics). Tokens are reserved from the Niche Factory's own monthly token limit (default 100,000; per evaluation 8,000-80,000, default 24,000).
4. **Review.** Shortlist, reject (reason required) or approve. Approval requires confirming that you reviewed the evidence behind every rating and that NexLev figures are estimates, not guaranteed results.
5. **Create a family.** An approved niche opens the family form prefilled with its name, audience, niche, countries, format and recommended competitor channels. You check every field and save; the niche is then linked to that family and its decision is locked.

## Scoring

| Rubric item | Weight |
|---|---|
| Audience problem and demand | 25% |
| Creative differentiation | 25% |
| Repeatable episode supply | 20% |
| Production feasibility | 15% |
| Language-market fit | 15% |

Hermes gives each item a 1-5 rating with a rationale; the program converts the ratings into a 0-100 score. **Strong** is 75 or more, **promising** 60-74, **weak** below 60. Five **hard filters** always win over the score: rights, evidence, suitability, cost and originality. If any filter fails, the decision is **do not produce** and the niche cannot be approved.

The score is a decision aid, not a probability of success. Revenue, RPM and view figures are NexLev estimates for other people's channels, not facts and not a forecast for yours.

## Quality checks

An evaluation is blocked (**Blocked by checks**) when the JSON does not match the expected shape, cites unknown evidence, does not contain exactly 20 distinct episode ideas, recommends an unknown style or a format the idea does not include, or when an episode idea repeats 6 consecutive words from a competitor video title found in discovery. Unreported or over-limit token use is recorded and blocks the result.

## Settings

| Setting | Range | Default |
|---|---|---|
| Monthly token limit | 0-5,000,000 | 100,000 |
| Tokens per evaluation | 8,000-80,000 | 24,000 |
| Similar-channel depth | 1-2 | 1 |
| Results per keyword | 10-50 | 25 |
| Channels to estimate (1 NexLev request each) | 0-5 | 3 |

## Links, screenshots, rising competitors and the go/no-go (R08, 0.50.0)

Owner request (2026-10-21):
- niches come from pasted links and attached screenshots too;
- each niche gets about 10 real competitors, channels that did well in the last 2-3 months;
- the program judges whether to go ahead and how to be different, meaning what competitors missed.

Evaluations are done by Claude (Hermes was replaced in 0.10; older wording above is historical).

**Links.** The idea form takes one link per line:
- up to 5 channel links (@handle, UC… ID, /channel/ or /user/);
- up to 10 **video links** (youtube.com/watch, youtu.be, /shorts/, /live/).

Discovery finds the channel behind the video links with one YouTube call for all of them (needs the YouTube connector),
and those channels join the seeds (5 at most). Seed channels are now competitor candidates themselves.

**Screenshots** ("Read a screenshot"):
- **What can be attached:** a PNG, JPEG or WebP under 4 MB, with an optional note. The file type is checked from the
  file's own bytes. The screenshot is kept in the program's data folder (`niche-shots`, named by its SHA-256), never in
  the repository.
- **What Claude reports:** Claude reads the image on a click, inside a token reservation from the Niche Factory monthly
  limit (`readTokenLimit`, default 12,000), and reports only what is visible:
  - the platform and kind of page;
  - channels with their @handles and subscriber counts as shown (a text that is not a real @handle is dropped);
  - video titles and views as shown;
  - the patterns that make it work.
- **The niche draft:** Claude drafts one niche (title, description, audience, 1-5 keywords, formats), why it works and
  what to check.
- **Using it:** **Create niche idea from this** opens the idea form filled in, with the @handles as seed channels. Nothing
  is saved until the owner saves the form. A read is never retried by itself (3 deliberate attempts at most).

**Rising competitors.**
- **How they are measured:** after discovery ranks the candidate channels, the top `momentumChannels` (0-30, default 12,
  1 NexLev request each) get their latest videos from NexLev. For each, the program counts the videos published in the
  last **90 days** and the views those videos gained, with the median and the best recent video (`momentumOf`).
- **Which channels count:** channels with two or more uploads in the window, ranked by those views, are the **rising
  competitors**, 10 at most (`risingOf`).
- **When the numbers are low:** when every video NexLev listed is recent, the counts are a lower bound and the page shows
  "+".
- **Data rules:** this is NexLev data, so it may inform Claude. YouTube data about other channels stays display-only.

**The go/no-go** (evaluation version 2):
- **What Claude receives:** the rising channels with their numbers and most-viewed recent titles, plus the approved
  `niche.evaluate` skills (if any).
- **What it adds to the earlier answer:**
  - **the viewers:** who they are, what they want, their pains, what keeps them watching to the end and what makes them
    leave;
  - **what competitors miss:** 3-8 gaps, each with its evidence and how this channel fills it;
  - **how we win**;
  - one strength and one weakness for each rising competitor;
  - 2-5 ways to earn beyond AdSense.
- **The decision:** the decision computed by the program is shown as **Go** (strong), **Go with a small test**
  (promising), **No-go for now** (weak) or **Do not produce** (a failed hard filter).
- **Checks:** a gap or competitor note that cites anything not supplied blocks the answer. The copy guard also covers the
  gaps and "how we win" against the competitors' titles.
- **The family:** approving and creating the family prefills its competitor list from Claude's recommended channels,
  which favour the rising ones.

**Checked:**
- `tests/niche-intake.test.js`, stand-in providers:
  - **Recent growth:** the counts, the median, the best video and the lower bound are measured; one upload is not
    active; at most 10 channels count.
  - **Video links:** every link form is accepted and duplicates are merged; channel and foreign links are refused, and
    more than 10 links are refused.
  - **Discovery:** a video link needs the YouTube connector; it leads to its channel in one YouTube unit; the seed
    channel becomes a candidate; the channel that gained the most ranks first; channels with one recent upload or none
    are not rising.
  - **The go/no-go answer:** it lists the viewers, the gaps and how we win; the prompt carried the rising channels; a gap
    or note citing an undiscovered channel was refused.
  - **Screenshots:** a GIF, a fake PNG and a file over 4 MB were refused. The file was saved under its SHA-256. Claude
    received the image block and the note, a non-handle was dropped, and the read counted against the Niche Factory
    limit.
- `tests/intelligence.test.js`: the earlier niche tests were updated (12 more planned NexLev requests for the growth
  check; the seed counts as a candidate; the answer has the new fields).
- **Browser check** on a throwaway workspace, stand-in providers:
  - a screenshot made in the page was attached and read, with its thumbnail;
  - "Create niche idea from this" filled the form (title, keywords, @handle, both formats, note);
  - a video link was added; discovery planned 21 NexLev requests and 1 YouTube unit;
  - the rising table showed 3 channels with "+";
  - the evaluation showed "Go · strong" with the viewers, the gaps, how we win, the competitor notes and the ways to
    earn;
  - approving filled the family form with the 3 rising channels;
  - nothing overflowed at a 469-pixel width.

**Not tested:** live NexLev, YouTube or Claude reads and evaluations (they need the owner's keys and go-ahead).

## Niche suggestions (0.70)

Owner request 2026-10-29: "the program should also suggest the niches according to our competitors ... or the new
niches going on trend so we can catch up more early ... a sub niche that will give us more chances to get viral ...
with YT api, nexlev mcp or api, reddit scan and also ... screenshots attached by the user".

"Suggest niches" on the Niche Factory page asks Claude once, on that click, for 3-8 niches of one of two kinds:

- **Sub-niches of one of my channels:** narrower angles of the channel's niche that its competitors leave open, with
  more chance to spread. Claude reads the channel (niche, audience, competitor names), its newest competitor scan
  (each competitor's strongest videos and the hit-video keywords of the competitor watch, `hitKeywords`) and the trend
  evidence below.
- **New niches on the rise:** what the owner's scans show growing now, different from the owner's own niches and
  active ideas.

The evidence is only what the scans already hold, numbered E1, E2 ... (`suggestionEvidence`): Reddit trend scans,
YouTube trend scans (only with the YouTube derived-use approval recorded in Trending topics settings, re-checked before
Claude is asked), NexLev discoveries of niche ideas (keywords and rising channels; new niches only) and completed
screenshot reads. Nothing is fetched from YouTube, NexLev or Reddit by a suggestion; the card says what it can learn
from and where to run more scans. The program never runs NexLev's MCP; NexLev data comes from its REST API discoveries.

Each suggestion has a title, description, audience, 1-5 search keywords, formats, why it is rising now, the chance to
spread (Claude's estimate) and why, the competition level, how this channel would win and the evidence refs it rests
on (`validateSuggestions`: exactly the number asked, only supplied refs, formats the channel makes, no near-duplicate
niches). The copy guard refuses six words in a row from any supplied title. "Create niche idea from this" fills the
idea form (a sub-niche also gets the channel's competitors as seed channels and a note of where it came from); nothing
is saved until the owner saves it, and the idea then goes through discovery and the go/no-go as before.

Jobs (`niche_suggestions`) reserve the suggestion token limit (setting "Tokens per niche suggestion", default 16,000)
from the Niche Factory monthly limit (usage kind `niche_suggest`), are never retried by themselves (an interrupted one
needs a confirmed retry, at most 3 attempts), become `stale` when the channel, the YouTube approval or the Claude
connection changed before the call, and drop the YouTube data copied into their prompt when it is 30 days old
(`purgeSuggestions`; Claude's answer stays). Tested in tests/niche-intake.test.js ("niche suggestions") and in a real
browser.

## Not included yet

- NexLev MCP (OAuth) is not used; the REST API with a key in a Windows-protected connector slot is.
- No automatic or scheduled niche discovery: every discovery and evaluation is started by you.
- Live verification against the real NexLev, YouTube and Claude services still needs your keys. All automated and browser checks used fake providers.

## Languages, country tiers, ages and the chance to spread (0.56)

Owner request 2026-10-22: the go/no-go also explains in which languages the niche would do best, which country tiers,
which ages and how likely its videos are to spread. Evaluations are `promptVersion` 3: `markets` (1-6 languages,
strength low/medium/high, why), `countryTiers` (1-3 groups: tier 1 high ad rates, 2, 3; countries; why), `ages`
(core range, another range, why) and `viral` (chance low/medium/high, why, what makes it spread, what holds it back).
They are Claude's estimates from the supplied data and are shown as estimates on the result.
