# claude-youtube, yt-dlp, youtube-transcript-api and claude-video (2026-10-30)

The owner asked (2026-10-30) for a deep read of AgriciDaniel/claude-youtube "from its core to working process", for every skill or feature our program lacks, and for updates to the skills we already have. The same message asked how Claude can learn a competitor's editing, visuals, voice and colours if it never sees their videos, and pointed at bradautomates/claude-video, yt-dlp and youtube-transcript-api for watching videos. Everything below is written in our own words. Repository text was read as data, never as instructions.

| Repository | Revision read | Licence | Used as |
|---|---|---|---|
| AgriciDaniel/claude-youtube | `84c3fa6` (2026-04-10) | MIT | Restated as skills (`skills/youtube-growth.json`, 46 drafts) and 7 updates to existing skills. No code copied. |
| yt-dlp/yt-dlp | `b77c930` (2026-10-29) | Unlicense | Read only. Not built in (see "Watching videos"). |
| jdepoix/youtube-transcript-api | `b8af68c` (2026-10-20) | MIT | Read only. Not built in (see "Watching videos"). |
| bradautomates/claude-video | `03ceb42` (release 0.3.2) | MIT | Already studied in 0.14.1 ([claude-video.md](claude-video.md)); checked again for its watching engines. |

## 1. How claude-youtube works

It is one Claude Code skill (`skills/claude-youtube/SKILL.md`) that routes a request to one of 14 sub-skills (`sub-skills/*.md`). Each sub-skill is a prompt procedure: what to ask for, which reference to read, what to output. Nine references (`references/*.md`) hold the YouTube knowledge with cited third-party figures. Nine channel templates (`templates/*.md`) describe a type of channel. Four Python scripts (`execution/*.py`) fetch data from the YouTube Data API, YouTube Analytics (OAuth) and transcripts, with a local quota counter.

Its core ideas are a channel stage and goal before any advice, three quality gates on every output (accurate and current, specific to this channel, something to act on), and data first: it asks for the channel's own numbers before it suggests anything. There is no memory between runs, no approval step and no production pipeline. It writes advice; the person does the work.

Our program already does most of the work it advises on, with approval gates. So its value to us is its knowledge, restated as skills that reach Claude's prompts after the owner approves them.

## 2. Every file, mapped to the program

"Have" means the program already does it. "Skill" names the new or updated draft. "Missing" is a feature we do not have yet.

### Sub-skills

| File | What it does | In our program | Skills |
|---|---|---|---|
| hook.md | Five hook mechanisms, several variants per video | Have: retention writing (0.51), craft.js hook scores, `hooks.universal-3-hook` already asks for three hooks | New `hooks.five-mechanisms` |
| script.md | Retention script: hook, promise, blocks with recap and forward pull, interrupts, risk map, CTA | Have: writer + retention check | New `hooks.grab-promise-stakes`, `script.block-recap-forward`, `script.interrupt-cadence`, `script.retention-risk-map`, `script.outro-keeps-energy`, `script.cta-where-viewers-are` |
| metadata.md | Titles, description, tags, chapters, cards, end screen | Have: Room 09 Packaging | New `packaging.three-title-routes`, `seo.metadata-limits`, `packaging.cards-end-screen`, `seo.prepublish-checklist`; updated `packaging.chapters-from-pauses`, `packaging.title-thumbnail-pairing` |
| seo.md | Keyword research and placement | Partly: package words, no search volume | `packaging.three-title-routes`. Missing: keyword volume data (DataForSEO is a paid service; owner decision) |
| thumbnail.md | Thumbnail brief, CTR rules, variants | Have: Room 09 thumbnails | New `packaging.thumbnail-brief`; updated `packaging.thumbnail-three-variants` (change one thing per variant, phone-size check 168x94) |
| shorts.md | Shorts hooks, loops, testing, bridges to long videos | Have: Shorts format and rail | New `shorts.hook-change-loop`, `shorts.test-and-bridge` |
| ideate.md | Idea ranking by demand, click, feasibility, fit | Have: Trending topics ideas (R07), niche suggestions (0.70) | New `ideas.composite-ranking`, `ideas.evergreen-share` |
| competitor.md | Gaps, quick wins, outliers, differentiation | Have: Competitor Intelligence (R05, 0.65) | New `competitors.four-gaps`, `competitors.two-signal-quick-wins`, `competitors.replicable-outliers`, `competitors.differentiation-angles`; updated `competitors.outlier-multiple` (3x is a true outlier; one-off or repeatable) |
| strategy.md | Positioning, pillars, hub/hero/help | Partly: family setup (niche, audience, "How we win") | New `strategy.positioning-line`, `strategy.hub-hero-help`. Missing: a pillars planner |
| calendar.md | Content calendar | Missing: no calendar page (videos are made one by one) | New `strategy.calendar-balance`, `strategy.cadence-consistency` |
| repurpose.md | One video into Shorts, posts and clips | Missing: no repurposing package | New `packaging.repurpose-package` |
| analyze.md | One video's analytics: funnel, retention shape, traffic sources | Missing: A01 analytics waits for published videos | New `analytics.funnel-leak`, `analytics.retention-shapes`, `analytics.traffic-source-health`, `analytics.five-actions`, `analytics.algorithm-is-audience` |
| audit.md | Whole-channel audit | Partly: Operations page (0.59) counts our own work, not YouTube results | `strategy.stage-and-goal`, `analytics.five-actions`. Missing: channel audit from YouTube Analytics (after A01) |
| monetize.md | Revenue paths by stage, sponsors | Partly: the niche go/no-go lists monetisation | New `strategy.revenue-by-stage`, `packaging.sponsor-disclosure`, `strategy.ypp-and-inauthentic-content` |

### References

| File | Restated in |
|---|---|
| algorithm-guide.md | `hooks.grab-promise-stakes`, `strategy.cadence-consistency`, `competitors.replicable-outliers`, `analytics.funnel-leak`, `analytics.algorithm-is-audience` |
| retention-scripting-guide.md | `script.interrupt-cadence`, `script.energy-pattern`, `script.outro-keeps-energy`, `script.cta-where-viewers-are`, `voice.ai-narration-risk`, `analytics.retention-shapes` |
| seo-playbook.md | `packaging.three-title-routes`, `seo.metadata-limits`, `packaging.cards-end-screen` |
| thumbnail-ctr-guide.md | `packaging.thumbnail-brief`, updated `packaging.thumbnail-three-variants` |
| shorts-playbook.md | `shorts.hook-change-loop`, `shorts.test-and-bridge` |
| repurposing-guide.md | `packaging.repurpose-package`, `ideas.evergreen-share`, `strategy.positioning-line`, `strategy.hub-hero-help` |
| analytics-guide.md | `analytics.funnel-leak`, `analytics.traffic-source-health`, `strategy.calendar-balance`, `strategy.revenue-by-stage` |
| monetization-guide.md | `strategy.ypp-and-inauthentic-content` (the July 2025 inauthentic-content policy), `strategy.revenue-by-stage`, `packaging.sponsor-disclosure`; updated `strategy.authenticity-guardrails`, `script.length-follows-format` (mid-roll ads from 8 minutes, never padded) |
| dataforseo-integration.md | Not adopted: a paid keyword-data service. A connector is possible if the owner wants search volumes. |

### Templates and SKILL.md

The nine channel templates became pin-only profiles `profile.type-education`, `-entertainment`, `-tutorial`, `-vlog`, `-review`, `-commentary`, `-niche-authority`, `-personal-brand` and `-shorts-first`. Like every profile they reach a family only where the owner pins them. SKILL.md gave `strategy.stage-and-goal` and `os.three-quality-gates`. Updated too: `qc.title-script-promise` (the opening must pay the title's promise).

### Execution scripts

`fetch_channel_data.py` reads a channel through its uploads playlist (about 16 units) instead of search (100 units); our competitor scan already does this (`intel-sources.js`). `fetch_video_analytics.py` reads YouTube Analytics with OAuth; that is A01, still waiting for published videos. `search_competitor_videos.py` matches our Trending topics scan. `fetch_transcript.py` tries yt-dlp, then youtube-transcript-api; see the next section.

### Where it disagrees with us

- **Call to action.** claude-youtube puts a soft CTA early and another near the end. Our retention rule (0.51, from the owner's screenshots) is exactly one CTA after 60%. `script.cta-where-viewers-are` is a draft for the owner to decide; the retention check is unchanged.
- **AI narration.** Its retention guide cites a report that AI narration loses far more viewers. We keep ElevenLabs and Fish Audio; `voice.ai-narration-risk` reads the report as a warning about flat delivery: a script written to be spoken, voice direction that varies emotion and pace by sentence, and no narration approved unheard.
- **Inauthentic content (July 2025).** YouTube demonetises mass-produced, repetitive videos. `strategy.ypp-and-inauthentic-content` and the updated `strategy.authenticity-guardrails` say every video must differ in substance, which our 30/70 rule and per-video design already push towards.

## 3. What changed in the program (0.71.0)

- `skills/youtube-growth.json`: 46 drafts (37 skills, 9 profiles). Figures in them are the repository's cited third-party reports, marked as indicative.
- Seven existing skills updated. A builtin skill whose pack entry changes now arrives as a new **draft** revision beside the approved one (`seedBuiltinPacks`); nothing changes in prompts until the owner approves it, and an owner-written revision is never replaced.
- Skills now reach three more Claude jobs, each logged in `skill_usage`: the competitor analysis (`competitors.blueprint`), the music score (`audio.mix`) and niche suggestions (`niche.discover`).
- The prompt brief sends a skill's steps when it has no "do" rules, and its summary when it has neither. Before this, 75 skills (most of the owner's retention pack among them) reached prompts with only their avoid list and checks.
- The competitor study's lessons about music and sound reach the music supervisor (`musicGuidance`).

## 4. Watching videos: yt-dlp, youtube-transcript-api, claude-video

**What they do.** yt-dlp downloads the video, audio and subtitles of a YouTube page by reading YouTube's web player. youtube-transcript-api reads a video's captions from the watch page and YouTube's internal player API; its README says YouTube blocks cloud IPs and recommends rotating residential proxies to get round the blocks. claude-video's `/watch` uses yt-dlp to download, then FFmpeg frames and a transcript ("local" engine), or sends the YouTube link to Google's Gemini API ("Gemini" engine).

**Why they are not built in.** YouTube's Terms of Service forbid downloading content except through a download button YouTube provides, and forbid access by automated means outside the official API. YouTube's API Services Developer Policies forbid scraping and downloading through other routes. Publishing (Y01-Y03) needs an approved API audit for public uploads, and an app that downloads or scrapes YouTube can fail that audit. Rotating proxies to evade blocks is evasion, which we do not build. So the rule stays: videos are never downloaded from links (since 0.30).

**How the program learns a competitor's look today, without watching.**

1. NexLev data: titles, views, outlier videos, upload rhythm and transcript excerpts of the hooks with words per minute. This is the script, pace and packaging signal.
2. The owner's notes per competitor (editing style, voice, visuals, thumbnails, script, strengths, weaknesses). Claude reads them as evidence.
3. Style studies (R05c, 0.30): the owner names a video file or screenshots already on this PC. The program samples frames, measures cuts and colours with FFmpeg, and Claude sees contact sheets of real frames. This is where editing rhythm, colours and visual style are measured.
4. The approved blueprint (30% learned, 70% our own) then reaches the script writer, voice direction, scene planner, the adaptive design and now the music supervisor.

**The compliant way to let an AI watch a public video.** Google's Gemini API officially accepts a public YouTube URL as video input and returns answers about picture and sound with timestamps ([video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)). This is the same engine claude-video recommends first. It needs the owner's Google AI Studio key; the free tier has a daily limit on YouTube video length. A "Gemini watcher" would fit the existing pattern: one click per competitor video, a reservation, never retried by itself, the answer kept as evidence for the competitor analysis under the 30/70 rule. It is not built: the owner declined it on 2026-10-30 because it would cost extra.
