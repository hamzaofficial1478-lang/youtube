# Trending topics (R07, 0.49.0)

Owner request (2026-10-21): bring the owner's Streamlit scanner `mindstory.py` into the program. It takes niche keywords
and lists the most-viewed YouTube videos of the last 7 or 30 days, so the owner can see what is working right now in a
niche and for competitors, and turn it into topics.

The program never uses the key written inside `mindstory.py`. Scans run on the owner's own YouTube connector
(Connections, Windows-protected), like every other YouTube call.

## What a scan does (`trends.js`, page "Trending topics")

1. **The owner starts it** with 1-30 keywords, a look-back of 1, 3, 7, 14 or 30 days, 5-25 videos per keyword and an
   optional length (any, short under 4 minutes, medium 4-20, long over 20).
2. **Each keyword is one YouTube search** (`search.list`, ordered by views, published after the look-back date). Then
   the video numbers (`videos.list`) and the channel numbers (`channels.list`) are read 50 IDs at a time.
3. **Videos and channels are matched by ID.** `mindstory.py` paired channels with videos by position, which mixes them
   up whenever YouTube answers in a different order. A video found by several keywords is listed once, with each keyword.
4. **The list is sorted by views**, with likes, comments, the channel's subscribers ("hidden" when the channel hides
   them), length and the keywords that found it. The page filters by keyword, by channel size ("Small channels only
   (under 3,000)" is `mindstory.py`'s filter: many views on a small channel means the topic is in demand) and by length.

**Cost:** a search is 100 YouTube units, so a scan needs `keywords × 100 + 2 × ⌈keywords × videos ÷ 50⌉` units. The
program reserves that against the daily YouTube cap (Research data caps) before anything is sent. A scan of 30 keywords
needs about 3,000 units; Google's default allowance is 10,000 a day and the program's default cap is 2,000.

**No automatic retries:** the first refused search stops the scan, because the next ones would fail the same way (key,
quota or network) and each would cost 100 units. A stopped or failed scan can be retried by hand, 3 attempts at most;
an interrupted one needs a confirmation because its usage is unknown.

## Staying inside the niche and your channel's size (0.73)

Owner test review 2026-10-30: the topic ideas wandered outside the niche, because YouTube's search also returns videos
that only share a keyword with it. A scan now asks:

- **Which niche?** "The niche we are working on" (one of your channels; its niche text) or "Another niche" (typed in).
  **Niche words** are the words a video must name; left empty, they are the niche's own words without filler. A video
  is **kept** when its title or YouTube's short description excerpt names one of them (`onNiche`; endings are folded,
  so history also finds historical and histories). The description excerpt comes in the same search answer at no extra
  cost, is used for this match and is not stored.
- **Your channel's subscribers** (optional). Only channels of that size or smaller are kept, so the list shows what works
  for a channel like yours. Because the most-viewed videos mostly come from big channels, such a scan looks through 50
  videos per keyword (the most one search returns, still 100 units).

Everything else is **left out** with its reason (outside the niche, a bigger channel, a channel that hides its size).
The scan card names the niche, its words and the channel size, counts what was kept and left out, and "Show the N left
out" lists them greyed with their reason. Claude only ever reads the kept videos, and its instructions say every topic
must sit inside the niche and serve the family's audience; Reddit topic ideas carry the same rule with the family's
niche. A scan where nothing was kept cannot be sent to Claude. Older scans have no niche and keep working as before.

## A niche of subject and angle (0.76)

Owner test 2026-10-31: a stickman "stone age finance" channel scanned the keywords "stone age" and "finance" and got
"Global Finance Awards" and "Queens of the Stone Age". Two causes: each keyword is one YouTube search, so "finance" alone
finds every finance video and "stone age" alone the band; and the niche filter kept a video that named any one niche
word. Now:

- **Topic words** (what the videos are about: finance, money, economy, trade) and **angle words** (what makes the niche
  different: stone age, caveman, prehistoric). A video is kept only when its title or description names one of each;
  a phrase counts only whole ("stone age", never "stone" alone) (`nicheMatch`, `phraseIn`). Without angle words a topic
  word is enough. **Look words** (stickman, animation) mark videos "same look", with a Look filter on the card.
- **Suggest words and keywords with AI** in the scan window: one small request (`suggestNiche`, family token
  reservation kind `trend_niche`, never retried) reads the channel's niche, audience and assigned style (`styleOf`) and
  fills the three word lists and 6-15 search phrases that join the subject and the angle ("history of money", "stone
  age economy", "how money was invented"). It reads only the owner's own words, no YouTube data. The owner can change
  everything before running the scan.
- The keywords hint says to search joined phrases, not single broad words.
- Claude's topic ideas get the topic, angle and look words and the channel's style: every idea must join the subject and
  the angle and suit the look.

## What counts as trending: views, proven demand, interest (0.84)

Owner review 2026-11-03: "trending means the title with many views, not a video with 57 views; viewership, growing
viewership and the audience's interest are the main thing". The page now says what counts, in three measures:

1. **Many views.** A scan keeps only videos with at least the views chosen (`minViews`; 10,000 by default in the form;
   any, 1,000, 10,000, 50,000, 100,000 or 1 million). Fewer is left out as "too few views" (`leftOut.views`). This filters
   YouTube's own numbers, so it needs no approval.
2. **Far above its channel's usual (proven demand).** With "Measure demand with NexLev" (a tested NexLev connector, about
   10 requests reserved from the monthly NexLev cap), the channels inside the niche (best views first, at most
   `DEMAND_CHANNELS` 10) are asked of NexLev for their outliers (`channelOutliers`, 2x and more). Outliers inside the niche
   with enough views are kept (at most 5 a channel, 40 in all, best first, refs D1...; `demandOf`, `result.demand`).
   These are NexLev's measure, not numbers worked out from YouTube's data, so Claude's topic ideas may use them without
   YouTube's derived-use approval: with 3 or more, "Topic ideas with Claude" works and Claude gets only the proven demand
   (`demandOnly`; YouTube's own list stays on the page). With the approval it gets both. The prompt tells Claude to weigh
   proven demand above videos that only match the niche (PROVEN DEMAND line, T# or D# refs).
3. **Rising fast and interest.** Views a day, views per subscriber and interest (likes and comments per 1,000 views) are
   worked out from YouTube's numbers, so they show only after the approval for derived use is recorded (Settings).

Measuring growth over days (the same videos read again later) would also be worked out from YouTube's data; it is not
built and would need the same approval.

## Searching inside a small niche (0.83)

Owner test 2026-11-03: a "stone age finance" scan of 14 days kept 2 of 24 videos (55 and 9 views), "money before coins"
found gold-coin and crypto videos, titles showed "I&#39;m", and the topic ideas strayed from the niche. Causes: each
keyword was searched with `order=viewCount`, which returns the most-viewed videos sharing any one word of the phrase;
a small niche has few new videos in a fortnight; and Claude was asked for ideas from two tiny videos.

- Searches use YouTube's relevance order (`YouTubePublicClient.search`); the scan still sorts by views. A scan with a
  niche (or a channel size) looks through 50 videos a keyword for the same 100 units.
- Look back up to a year (7, 14, 30, 90, 180 or 365 days in the form; 90 by default for a new scan).
- Titles, channel names and description excerpts from search come back readable (`htmlText`: the entities YouTube uses).
- Each keyword records how many of its videos fit the niche (`kept`), shown in the keyword filter. A scan with fewer
  than 5 videos inside the niche, or whose best has under 1,000 views, says "Not enough to call a trend", suggests 90 or
  180 days and names the phrases that found nothing inside the niche (they usually lack the angle).
- Topic ideas need at least 3 videos inside the niche (`MIN_TOPIC_VIDEOS`); fewer is refused before Claude is asked.
- An idea whose title, promise, angle and hook name neither the niche's subject and angle is marked "May be outside the
  niche" (`offNiche`), never hidden.
- The channel-size filter on the list is a dropdown (any size, under 1,000 ... under 1 million).

## Clearing and exporting (0.74)

Scans and topic ideas have tick boxes and a toolbar: delete the ticked rows or every row shown, and export them as PDF,
Word or CSV. Deleting a scan deletes its topic ideas too; anything waiting or running is kept, and the token usage of
topic ideas always stays. An export of a YouTube scan carries the note that YouTube's terms allow keeping its data for
at most 30 days; a CSV writes a cell that would start a formula as plain text. The same tools are on Content Studio,
Niche Factory and Research briefs (`manage.js`).

## YouTube's data rules

YouTube data about other channels is **display-only** and **deleted after 30 days** (AGENTS.md):
- after 30 days a scan keeps only its keywords, so it can be scanned again;
- topic jobs drop the trend data they were given;
- Claude's own topic ideas stay.

**Worked-out numbers and Claude's topic ideas** need the owner's recorded YouTube approval for derived use (Trending
topics → Settings: date, reference, name). The worked-out numbers are views a day since publishing and views per
subscriber. Until that approval is recorded, the list is for reading only.

## Topic ideas with Claude (after the approval)

From a scan, the owner picks a family and a number (5-20). Claude reads the 60 most-viewed kept videos of the scan and
answers in the family's language. Each topic idea has:
- a **title** of at most 60 characters;
- the **opening hook** (a specific curiosity gap, with no channel intro);
- the **promise** (what the viewer will know by the end);
- **why viewers would click it** over the similar trending video;
- **what we add**;
- the format;
- the trend videos (T#) that show the demand, and a confidence.

Claude also names the themes and what to avoid. The tokens are reserved from the family's monthly limit (Settings:
tokens per answer, default 16,000).

**Checks:**
- every cited video must be in the scan;
- topics must differ from each other;
- any 6 words in a row copied from a trending title blocks the answer (copy guard);
- 3 paid attempts at most.

**Start a draft** fills the Content Studio's draft form with the title, the hook and the angle (promise, what we add,
why viewers click). The owner checks the form and saves it.

## Checked

`tests/trends.test.js` (stand-in YouTube and Claude):
- **The scan:** it costs 202 units for 2 keywords; one search is made per keyword (ordered by views, the length filter
  passed); a video found twice is listed once with both keywords; channels arrive in reverse order and are still
  matched by ID; a hidden subscriber count stays unknown; the YouTube data expires after 30 days.
- **Refusals:** a scan over the daily cap is refused before any call; a refused search stops the scan (1 call, 100
  units); a deliberate retry is allowed; an expired scan keeps only its keywords.
- **Topic ideas:**
  - they are locked without the approval, and an approval without a reference is refused;
  - Claude was given the trending titles and the 60-character rule;
  - the answer cites the scan, and its tokens are settled on the family as `trend_topics`;
  - copied wording, an unknown T# and a 61-character title were each blocked, and a fourth paid attempt was refused.

Browser check on a throwaway workspace (stand-in YouTube and Claude):
- 6 keywords cost 602 units and found 40 videos, sorted by views;
- "Small channels only" showed only channels under 3,000 subscribers;
- the Claude button explained the lock;
- recording the approval added the two worked-out columns;
- 12 topic ideas came back, and "Start a draft" filled the draft form;
- the results table was moved to full width.

**Not tested:** a live YouTube search with the owner's key (it spends real quota; the owner's go-ahead is needed).

## Reddit scans (0.57)

Owner request 2026-10-22: Reddit is where people share stories and ask questions; the program reads it for topic
signals. `reddit.js` signs in as the owner's own Reddit app (application-only OAuth, client credentials) and reads top
posts; only `www.reddit.com/api/v1/access_token` and `oauth.reddit.com` are called, redirects are refused, adult posts
are dropped, and the User-Agent names the owner's Reddit account as Reddit asks.

- **Scan** ("+ Reddit scan" on Trending topics): 1-30 keywords, optional subreddits (up to 10), the last day, week, month
  or year, 5-25 posts per keyword. One sign-in and one search per keyword, reserved first in the `reddit` hourly
  allowance (default 300 requests), the first failed search stops the scan, never retried by itself. Posts are kept
  30 days, then deleted like YouTube data.
- **Topic ideas**: the same Claude topic ideas as a YouTube scan, with a Reddit prompt: posts are signals of demand,
  never content; Claude never retells one post's story, never copies its words and never names its author (the copy
  guard checks against the post titles). No YouTube approval is involved.
- **Setup (owner, once):** sign in at reddit.com, open https://www.reddit.com/prefs/apps, "create another app", choose
  **script**, any name (for example "control-room"), redirect URI `http://localhost:8080` (not used), create. In
  Connections add "Reddit (your Reddit app)": the app ID is the short code under the app name, the secret is "secret",
  and your Reddit username. The test signs in and runs one search; nothing is posted.
- Reddit's Data API terms allow free access for personal and non-commercial use; using Reddit data for a commercial
  channel may need Reddit's agreement. The program uses posts only as topic signals.
