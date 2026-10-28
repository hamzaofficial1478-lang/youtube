# Video length (0.17.0)

The owner chooses each long-form video's length. Nothing in the pipeline is sized for one length.

| Stage | How it scales |
|---|---|
| Draft | **Target length (minutes)**, 1–180, on each draft. Empty keeps the standard length (600–1,200 words). Shorts keep their own policy. |
| Script (Claude) | About 150 spoken words a minute. A 30-minute draft asks for 3,375–5,625 words (target 4,050–4,950) and at least 30 paragraphs. Claude gets room for 2 tokens a word plus 8,000, at least 16,000. The job's token limit grows with the length (answer room + 12,000), and the family's monthly limit still applies. The review gate checks the chosen length. |
| Long answers | Answers above 16,000 tokens are streamed on the API key path. The subscription path gets 40 ms per allowed token, at least 15 minutes. |
| Scene plan (Claude) | Scripts longer than 60 sentences are planned in parts of 60 (about six minutes), one answer each. Each part sees its neighbouring sentences for continuity. A part that covers the wrong sentences is not kept, so a retry asks only for the missing parts. The planner token limit applies per part. Plans may hold up to 2,000 scenes and 6,000 shots (sanity bounds). The free narration split has no length limit. |
| Narration | The script is already sent in pieces that fit the provider (ElevenLabs 9,000 characters, OpenAI 4,000) and joined. Each request now gets 5 minutes. Audio checks take as long as the narration needs. Per-narration character limit up to 2,000,000 (a 30-minute narration is about 27,000 characters). |
| Edit, captions, render | No length caps. Pause analysis and every render step scale their time limits with the narration and frame count. FFmpeg output capture holds 4 MiB, so cut, pause and loudness lines of a multi-hour video are not dropped. |
| Review & QC | The whole-video contact sheet holds up to 300 frames. On a 25-minute video that is about one every five seconds; above 60 frames it is folded on the page. Claude's frame scan reads about 500 frames for 30 minutes. |

## Measured on this PC (scratch workspace, synthetic media, 2026-10-08)

The 25.5-minute edit (1,529 s) had 276 clips, 562 captions, 42 graphics and 7 valid chapters:

- Drafting the edit took 89 s, including the seed's setup and the FFmpeg readiness check.
- The page state with the edit was 517 KB.
- The 360p render took 393 s and produced a 198.5 MB file. All nine checks passed: full decode, alignment +0/−9 ms, duration, frame, audio, black frames, frozen picture, 273 cuts all planned, and clipping at −12.5 dBTP.
- The Review & QC report took 1.1 s, including checksums of the files.

Not measured yet: real narration and stock media at that length, a 60-minute or longer video, and final 1080p masters (P11).
