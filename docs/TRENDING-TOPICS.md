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

## YouTube's data rules

YouTube data about other channels is **display-only** and **deleted after 30 days** (AGENTS.md):
- after 30 days a scan keeps only its keywords, so it can be scanned again;
- topic jobs drop the trend data they were given;
- Claude's own topic ideas stay.

**Worked-out numbers and Claude's topic ideas** need the owner's recorded YouTube approval for derived use (Trending
topics → Settings: date, reference, name). The worked-out numbers are views a day since publishing and views per
subscriber. Until that approval is recorded, the list is for reading only.

## Topic ideas with Claude (after the approval)

From a scan, the owner picks a family and a number (5-20). Claude reads the 60 most-viewed videos of the scan and
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
