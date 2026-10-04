# Niche Factory (R06)

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

## Not included yet

- NexLev MCP (OAuth) is not used; the REST API with a key in a Windows-protected connector slot is.
- No automatic or scheduled niche discovery: every discovery and evaluation is started by you.
- Live verification against the real NexLev and Hermes services still needs your keys. All automated and browser checks used fake providers.
