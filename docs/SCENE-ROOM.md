# Scene & Visual Room (Room 04)

Version 0.9 makes Room 04 of the Production Panel live. It turns one approved script, its approved narration and the family's assigned style into an immutable, revisioned **scene plan**, then finds one rights-recorded visual for every shot from stock libraries (Pexels, Pixabay) or AI image generation (OpenAI). A named human approves the plan and, later, the complete visual board. Only an approved board is handed to the Editing Room.

## Inputs (all three must be ready)

| Input | Comes from | Locked into the plan |
|---|---|---|
| Approved script revision | Content Studio | Script revision and its numbered sentences |
| Approved narration | Voice Room handoff | Approval ID and real narration duration |
| Family style | Style Library handoff | Exact style revision and spec hash |

If any of them changes later, the plan shows **out of date** and nothing can be sourced or approved until you refresh it. **Refresh for current narration and style** keeps every scene and shot ID (and their chosen visuals) and only re-times and re-checks the plan. A changed script needs a new plan.

## Planning

- **Split narration (free).** No provider call. Whole sentences are grouped toward the middle of the style's scene length; each scene gets enough shots to respect the style's shot limits; stock search words are taken from the narration.
- **Plan with Hermes.** The tool-free Hermes profile receives the numbered sentences with estimated seconds, the style limits, the executable sources and any approved competitor technique guidance. Tokens are reserved from the family's monthly limit (scene planner limit 8,000-120,000, default 40,000). Plans that break the structure (missing or out-of-order sentences, unknown sources or camera moves) are blocked; plans that only break timing or originality rules are saved as drafts with issues to fix.

**Timing** is estimated by word share: each sentence gets narration time in proportion to its words. Caption alignment (Room 06) will measure exact timing later.

**Checks on every revision** (issues block approval; warnings are shown):

- every sentence covered once, in order;
- scene length within the style's shortest and longest scene (a single very long sentence is only a warning);
- shot length within the style's shot limits (a static image also respects the longest static hold);
- on-screen text within the style's word limit;
- sources limited to what the style allows **and** this milestone can execute (stock video, stock images, AI images);
- prompts and search words may not name a competitor or ask for "the style of" another creator.

**Editing.** Edit a scene (purpose, direction, on-screen text), edit a shot (source, camera move, search words, prompt, notes), add or remove shots, split a scene at a sentence, or merge it with the next. Every edit creates a new immutable revision (SQLite triggers refuse changes and deletes). Untouched shots keep their IDs, so their chosen visuals carry over: this is single-scene repair.

**Plan approval** needs two confirmations: coverage and original direction. AI images can only be generated for an approved plan revision.

## Sourcing visuals

| Capability | Provider | What it does | Cost and limits |
|---|---|---|---|
| `pexels-photo`, `pexels-video` | Pexels API | Search photos or videos in the family's orientation; videos use the smallest MP4 at or above the family resolution | Free; 200 requests/hour and 20,000/month by default. Your hourly cap (default 150) is reserved before each search. |
| `pixabay-photo`, `pixabay-video` | Pixabay API | Safe-search photos or videos | Free; 100 requests per 60 seconds. Photos are at most 1280 px wide without full API access. Your hourly cap (default 1,000) applies. |
| `openai-image` | OpenAI Images API | Text-to-image, 1536×1024 (long-form) or 1024×1536 (Shorts), low/medium/high quality | Paid. Your price per image (by quality) is reserved from the family's monthly AI image budget before the request. |

Every capability has a versioned registry entry (settings, media roles, output limits, license or terms, synthetic flag, cost note) and every job stores a snapshot of it.

- **Search** results and their small previews are kept for **24 hours** (Pixabay requires this caching) and then deleted. An identical search within 24 hours is served from the cache without a new request. Previews are downloaded and served locally, so the page never loads third-party images.
- **Use this** downloads the chosen file only from the provider's own media hosts (Pexels, Vimeo CDN for Pexels videos, Pixabay), with a size limit, checks the real file type, stores it immutably with its SHA-256, probes it with ffprobe (size, duration, codec) and makes a thumbnail. Its rights record keeps the license name and link, author, source page and download time.
- **Generate** sends one prompt to the chosen OpenAI image model, decodes the image locally, checks that it really is a PNG or JPEG, and stores it with model, size, quality, prompt, revised prompt and request ID. Every AI image is marked as synthetic media. A generated image fills an empty shot automatically; otherwise it goes to the gallery.
- **Batch actions** only touch shots without a visual: *Search all* (one request per stock shot, refused up front if it would pass your hourly cap), *Use top results* and *Generate all* (refused up front if it would pass the remaining budget).

There are **no automatic retries**. A failed job can be retried deliberately (3 attempts at most). An interrupted AI generation keeps its reservation counted and needs a confirmed retry, because the provider may already have charged it. A program restart marks running jobs as interrupted instead of replaying them.

## Visual approval and handoff

**Approve visuals** is possible when the latest plan revision is approved and current, and every shot has a visual whose file still matches its checksum. You confirm that you reviewed each visual's license and source and the sequence in narration order. Warnings must be accepted explicitly:

- a stock clip shorter than its shot (it will be slowed or held);
- a visual well below the frame resolution (under 75% of it);
- a visual whose orientation differs from the frame (it will be cropped);
- a shot planned as one source but filled from another.

**AI disclosure.** Documentary Montage and other styles with *always disclose* mark every AI image for YouTube's altered or synthetic content disclosure. Styles with *review per asset* ask you to decide for each AI image. The decision is stored with the approval.

The approval locks a snapshot (shot → asset → checksum → disclosure). Changing any shot's visual, approving a newer plan revision, or a change in the narration or style ends the approval and records it in the invalidation ledger. The handoff shown to the next room is ready only while the snapshot still matches the current selections and files.

## Settings (per family)

Monthly AI image budget (USD), OpenAI image model, default quality, image format (PNG or JPEG), your price per image for each quality, stock library order, results per search (3-30) and the scene planner token limit. The same dialog edits the shared Pexels and Pixabay hourly caps.

## Not included yet

- AI video, generated graphics, maps and diagrams, and public-domain archives are listed by the styles but have no adapter yet; plans cannot use them.
- No reference-image (image-to-image) generation; no character consistency across AI images.
- Video previews are thumbnails only; full playback arrives with the Editing Room.
- Live verification with real Pexels, Pixabay and OpenAI keys is still pending. All automated and browser checks used fake providers and real FFmpeg/ffprobe on generated test media.

## Wikimedia Commons: licensed real images (0.57)

Owner question 2026-10-22: "from where do others find the sources of the content?" History and documentary channels
use public-domain paintings, maps, archive photos and freely licensed images. The style source
`archival-public-domain` is now executable through Wikimedia Commons (capability `wikimedia-image`, connection
"Wikimedia Commons", no key):

- Only files that allow commercial use and changes are offered: public domain, CC0 and CC BY (`wikitextLicense` reads the
  licence templates of each file page; share-alike, non-commercial, no-derivatives, GFDL-only and unreadable licences
  are left out). Files under 800 px wide are left out.
- The owner's network resets `commons.wikimedia.org`, so searches use Wikimedia's API gateway
  (`api.wikimedia.org/core/v1/commons`: search, page source, file details) and downloads come from
  `upload.wikimedia.org`, always with a descriptive User-Agent. A search makes up to 1 + 2 requests per result; the
  `wikimedia` hourly allowance (default 480) counts every one.
- Each downloaded file keeps its licence, author, page and credit line (`rights.attribution`); the package description's
  visual credits print it with the licence link, which CC BY requires.
- Room 04 "Search all" has an "Archive images (Wikimedia Commons)" choice; the planner may plan archive shots once the
  connection passes its test.
- Not used: images from websites, social media or YouTube without a licence (copyright claims and strikes), Openverse
  (its search did not answer from this PC).
