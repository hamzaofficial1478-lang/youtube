# Operations report (A03, 0.59.0)

Phase 06 of the build plan asks to "measure 14-day reliability, quota, render capacity, cost and language review load;
validate each channel over its own 90-100 day period". The **Operations** page does the measuring. It only reads what
the rooms already record; it never starts, retries or changes anything (`operations.js`, `GET /api/operations?days=`).

## What it counts (last 7, 14, 30 or 90 days)

- **Reliability.** Every kind of work (script writing, research, scans, narrations, scene plans, pictures and drawings,
  music, renders, frame scans, packages, language editions, uploads, and each answer asked of Claude or ChatGPT inside
  a room) by how it ended:
  - finished well;
  - a problem: failed, stopped half-way, tried again, kept private, or ended with an unknown charge, even when a later
    try worked;
  - stopped by the owner's own limits (budget or quota);
  - running or waiting now.

  Reliability is finished-well divided by finished-well plus problems. The latest problems are listed with their error.
- **Render capacity.** The rendering time of finished renders on this PC, by kind (preview 360p/720p, master, language
  edition): minutes of rendering per minute of video, and minutes of video per hour of rendering.
- **What was used.**
  - Claude and ChatGPT in tokens: a subscription has no price per token here.
  - Narration characters, music and paid pictures in the cents each family's settings estimate.
  - Research data units by provider.
  - A charge that is unknown (an answer that never came back) is counted apart, with what was reserved for it as its
    upper limit.
  - Tokens and cents are also given per channel family.
- **Research and upload limits now.** Today's (or this hour's, or this month's) use against each cap.
- **Language review load.** Per language, the named reviews made in the window (adapted words, narration, release) and
  the adapted words still waiting for a review.
- **Each channel over its first 90-100 days.** Per family: public videos, uploads, failed uploads, and the days since its
  first video was seen public. The validation runs until 90 days have passed.

## What it does not do

- It does not fetch YouTube Analytics; that is A01, built when videos are published (views, watch time and
  measurement windows from the owner's own channel reports).
- It sets no alarms. The publishing autopilot keeps its own gate and alerts (PUBLISHING.md "Y03").
- Its numbers are only as complete as the records: work done before a room recorded its outcome is not counted.
