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

## Live planning and "Change with words" (0.77)

A scene plan shows its work live above the plan jobs: the story director's map, each part of the plan, the continuity
review, each designed shot and each picture ("Picture 3 of 9"), with a bar, the running time, when it last showed a
sign of life and the plan text as it arrives. Nothing of this view is stored; the job and its results are.

Every drawn shot has **Change with words**: the owner types what should change ("show the caveman counting stones on a
flat rock, and make him look worried"), and Claude draws that one shot again with the request (`changeShot`, a redraw
job whose continuity review carries the request as `ownerAsks`; one answer inside the review limit). The new drawing is
checked like every drawing and arrives as a new plan revision; every other shot keeps its ID, drawing and visual, and
the owner approves the visuals as before. A designed shot keeps "Redesign"; a footage shot keeps "Edit" and "Change".

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

## Storyboard with Claude or ChatGPT, who makes the pictures, switching AI (0.79)

The owner's review of 2026-11-02: "Plan with Claude" showed while ChatGPT was connected too, the window said "Ask Claude
to direct the scenes" even when GPT was picked, and a ChatGPT plan ended "interrupted, cost unknown" with Codex's
"No such host is known".

- Room 04 shows one **Storyboard with …** button for each connected AI (Claude, ChatGPT), so the owner picks who builds
  it. The window says what the storyboard is (the plan of the whole video: scenes and shots, what is on screen in each,
  the camera and the cut, timed on the narration's words) and what comes next in the same job (drawn shots are drawn by
  the program's engine for free; the shots that deserve a detailed picture or painting get one from the picture AI).
  With both AIs connected, the window asks who makes the pictures (ChatGPT paints, Claude draws vector art); that is the
  AI team's picture setting (`/api/ai-roles`), so it also applies to later pictures.
- A storyboard that failed (a usage limit, no connection, an unusable answer) offers **Continue with <the other AI>**:
  nothing switches by itself, the owner's click is the permission. The job row names the AI that made it
  (`publicPlanJob.provider`).
- `ai.js` names the failures: a usage limit says so and suggests the other AI (`kind: 'limit'`); Codex's network
  failures ("No such host is known", DNS, refused connections) are "ChatGPT could not be reached from this PC" and used
  nothing (`kind: 'network'`, `nothingUsed`), so the job is a plain failure, not "interrupted, cost unknown".
- The other Room 04 windows ask "Which AI" instead of "Claude connector".

## A second storyboard, "over budget", clearing jobs, quality-first pictures (0.80)

The owner's review of 2026-11-02: a ChatGPT storyboard started while Claude was still building one for the same
script; two jobs said "over budget" although both AI plans had daily and weekly room left; the window's "GPT paints
them / Claude draws them" was unclear; the job messages took too much room; and "I do not want to compromise on
quality ... no matter if the whole video needs the model painted scenes".

- **A second storyboard needs a yes.** When a storyboard is waiting or being built for the script, the window says
  which AI is building it and that a second one starts after it and becomes the plan shown (the first stays in the
  plan's history). Only a ticked "also build this one" sends it (`alsoWhileRunning`); without it the server refuses
  with 409.
- **"Over budget" is the program's own limit, not the AI plan.** Each channel has a monthly AI token limit in the
  program ("Monthly LLM token limit", default 1,000,000). A storyboard holds its planner limit for every part (and the
  story map) plus the review's limit while it runs, and gives back what it did not use. The message now gives the
  numbers (`store.budgetMessage`: what the job holds, the limit, used this month, held by unfinished jobs or unknown
  answers) and says it is not the Claude or ChatGPT plan; the row offers "Raise the channel's limit". Script and voice
  direction jobs say the same. Jobs that never reached the AI (Codex: "No such host is known", os error 11001) were
  recorded before 0.79 as unknown charges and kept holding their tokens; `store.repairUnreachedJobs` turns them into
  plain failures and releases the hold at every start.
- **Who makes the pictures.** The storyboard AI plans the video; the pictures inside the shots are a second job. The
  window's choice reads "Detailed pictures inside the shots are made by: ChatGPT (painted, detailed images) / Claude
  (clean vector drawings)" and explains that the two can be different AIs.
- **Job history folds away.** The newest job shows; earlier attempts sit in a closed "Earlier attempts (n)" list.
  "Clear them" removes finished jobs from the list (`clearPlanJobs`, column `cleared_at`; nothing deleted, usage stays,
  waiting or running jobs untouched; `POST /api/content/:id/scene-plan-jobs/clear`).
- **Quality first.** The PICTURES planner line now says: never trade quality for savings; a picture for every shot
  whose free drawing would look poorer (a whole place or a dramatic moment, a person or a face up close, a complex
  object or machine, a crowd, an emotional beat, the hook and the payoff); free drawing only for words, numbers, charts, maps, timelines, diagrams,
  comparisons and simple stick-figure acting; the number is a ceiling, not a target; every shot's notes say why it has
  a picture or why the free drawing is enough. New defaults: 12 pictures and 15 natural paintings per minute at most.
  Visual settings saved earlier keep their own numbers; raise them in Visual settings.

## Stop, Resume, weak internet, and checks that keep finished work (0.81)

The owner's review of 2026-11-02 (five screenshots): a retry started again from part 1 although the job had reached the
last step; there was no way to stop a storyboard; two ChatGPT storyboards (about 100,000 tokens each) ended "Blocked by
checks: Scene 1 shot 1 uses a camera move the style does not allow"; a second storyboard could still be started while
one ran; and the questions of what happens when the internet drops or the program is closed.

- **Why the work was thrown away.** For a drawn-only style (Stickman) the planner was never told which camera moves
  are allowed, yet every shot had to name one and the final check refused unknown ones. Claude happened to guess an
  allowed one; ChatGPT did not. And a plan that failed the final check cleared every finished part (`parts=NULL`), so
  the retry began at part 1. Now the planner is told the moves (drawn shots get the default, since they move with
  `sketch.camera`), and `mendShots` brings an AI plan's moves and sources inside the style before the check (a drawn
  shot silently, a footage or image move to its nearest allowed one with a named warning; owner edits stay strict).
- **Each part is checked as it arrives** (`partFindings`: the same structural checks on that part alone, with the
  video's own scene numbers). A part that breaks the style's rules is asked once more with the findings (the way
  pictures and designed shots already are: `planMessages(input, {findings})`); a second miss stops the job with every
  earlier part kept, so a retry asks only that part again. If the finished plan still fails, the parts are kept: with a
  continuity review only the review runs again; without one only the part holding the named scene is asked again.
- **Stop and Resume.** "Stop" under the live progress ends the AI at once (`AbortSignal` through `Ai.complete` and
  `Ai.image` to Claude Code and Codex, whose process is killed, and to the SDK). The job becomes `paused` with
  everything finished kept: the story map, finished parts, the continuity review chunk by chunk (`reviewed.partial`)
  and finished pictures (`plan_pictures`). "Resume" (or "Resume with the other AI", which switches `scope.connector`)
  goes on from the next step on the same attempt (`runs` counts runs, `job.tag` keys each run's picture and frame
  records). A queued job can be stopped too. Retry stays for failed jobs.
- **Honest usage for a stopped run** (`endRun`, `spent` saved after every answer): the answers that arrived count as
  they are; an answer in flight may have used at most one answer's limit (`callLimit`), so only that is held as unknown.
  Before 0.81 the whole job's reservation (a 3-part storyboard: about 610,000 tokens) stayed held, which made later
  storyboards "over budget". A resumed run reserves only what is left (`planNeed`).
- **Closed program.** A storyboard running when the program closed is `paused` (`kind: 'closed'`) at the next start,
  with the same kept work and honest usage; Resume goes on from there. Before 0.81 it was "interrupted" and its
  retry started from the last kept part with the whole reservation held.
- **Weak or lost internet.** `ai.js` names lost connections (`networkError`: never reached = nothing used; dropped while
  answering = may count), before any sign-in check (an offline token refresh mentions OAuth). The program passes a free
  reachability check (`reachable`: the AI server's name is looked up; only a clear "not found" counts as offline) so no
  request is sent while offline. A storyboard that loses the connection, or whose AI plan reaches its usage limit,
  pauses instead of failing, with "Check my connection" (`GET /api/net-check`: a name lookup and a timed connection,
  information only) and Resume. Nothing retries by itself.
- **The screen.** While an AI builds, its button is off ("ChatGPT is building…") and a note says so; the other AI's
  button still works and its window warns in a coloured box and asks. The quiet message says what a quiet stretch
  means and the step's real time limit (`live` `who`, `limit`, `stoppable`). Job rows say when the storyboard was asked
  for and when it last ran; "Earlier attempts" stays open while the page refreshes (`keepOpen`). Clear never hides a
  paused job.

## From storyboard to editing: the road, drawing Stop and Resume, long shots (0.82)

The owner's review of 2026-11-02: the 34 scenes were built but could not be found on the page; the storyboard buttons
looked as if nothing was done; the "9 warnings" and "4 fixed before you saw it" lists closed by themselves; "Draw all
scenes" stayed after every scene was drawn, with no Stop; and there was no way on to editing, because the plan could not
be approved (drawn shots held far longer than the video's own pace) and nothing said so.

- **What happens next** (`sceneRoad`): five steps at the top of the room (the storyboard, approve it, draw the scenes,
  approve the visuals, edit the video), each with its state and the one button that moves it on; the last opens the
  Editing Room.
- **The storyboard** has its own heading above the board (`#scene-board`); "See the storyboard" in the inputs card and
  the road jumps there. Once a storyboard is built the card says so and the AI buttons read "Build again with …".
  Problems name their shots as links that jump to the scene.
- **Dropdowns** stay as the owner left them across every redraw of the page (`render` keeps each `details` open or
  closed by its key or its title without numbers; program-wide).
- **Drawing** (`drawState` in each script's state: drawn with today's drawing, out of date, missing, being drawn): the
  row says "Drawing now: 30 of 76 done", "Draw the remaining 46", "All 76 drawn ✓" or names out-of-date drawings.
  "Stop drawing" (`stopDrawing`, `POST /api/scene-manifests/:id/draw-stop`) stops the waiting drawings (status
  `cancelled`; the one being drawn finishes); "Draw the remaining" goes on from there, since a finished drawing is never
  drawn again; "Draw them all again" (`draw-all` with `again`) only when everything is drawn. Drawing is local and needs
  no internet.
- **Long shots.** For an adaptive style the planner was told shots may last 0.8-10 s while its own design then set a
  much shorter pace (3.3 s in the owner's video), and a drawn shot more than a quarter over the pace blocks approval.
  The planner is now told the design's pace is binding; `partFindings` flags a scene whose shots would each hold more
  than a quarter over the pace, so that part is asked again with it. For a plan that already has such problems, "Fix
  the long shots with …" (`fixLongShots`, `POST /api/scene-manifests/:id/fix-long-shots`) adds the shots each scene
  needs (edit `add-shots`: copies of the scene's last shot without its cue, one new revision) and queues one redraw job
  in which the AI draws only the new shots on their own words; every other shot keeps its ID, drawing and visual.

### The long-shot fix splits the shot itself; one button per step (0.82.1)

The owner's test of 2026-11-03: "Fix with ChatGPT" answered "Those scenes already have the most shots a scene can have
(8)" for S33A. S33's shots start on their own words (cues), and its second shot's cue came late, so the first shot held
6.5 s; the scene did not lack shots, and 0.82's fix only appended copies at the end of a scene.

- `fixLongShots` now works on the long shot itself. In a scene whose shots start on cues it inserts the shots needed
  right after the long one, each starting on its own words at even points of its span (a phrase of 2-4 words that is
  spoken first at that moment, checked with `Sk.matchPhrase` the way the plan check does); the shot after it keeps its
  cue. In a scene whose shots share it evenly it adds the shots the scene's length needs. Edit `add-shots` takes
  `afterShotId` and `cues`. A scene that really has 8 shots is named, with "split it into two scenes".
- One button per job (owner review 2026-11-03): the road holds every step's button: See the storyboard, Fix with
  Claude / ChatGPT and Show the problems, Draw the remaining / Stop drawing / Draw them all again, Approve visuals, Go to
  the Editing Room. The inputs card, the plan card, the drawing row and the approval card keep their facts and point to
  the road. The road's five steps sit in one row where there is room, each as tall as its content, with small buttons.
- "Story & engines" starts folded, and its chapter list is a dropdown of its own.

### The process tab as sketched; a stopped fix resumes where it was (0.82.2)

The owner's review of 2026-11-03 found the road "too generic and too ugly" and drew what it should be; the same day a
long-shot fix stopped at picture 2 of 5 started again at picture 1 on Resume.

- The road is four boxes: the storyboard (no button; "See the storyboard" is a link in its text); approve the
  storyboard ("Fix the long shots with" over Claude and ChatGPT side by side, or "Review and approve"; "Show the
  problems" is a link); draw the scenes (one centred button: Draw the remaining, Stop drawing or Draw them all again);
  approve the visuals, then edit (Approve visuals, then Go to the Editing Room). Three a row, each as tall as its row,
  with a Done / Next / Later chip and "n of 4 done" at the top; two a row in a narrow window, one on a phone.
- A redraw job (the long-shot fix, a change asked in words, undesigned shots) keeps the AI's drawings with the job before
  it asks for pictures, so a resume never asks for them again and finds the finished pictures by their words; a resumed
  job reserves nothing more for the drawings. A redraw that covers many scenes keeps its review chunk by chunk. Drawings
  are kept only when the AI drew something: a deliberate retry after "Claude returned no drawings" asks again. Designed frames are kept per job too, so a resumed compose never designs
  a finished shot twice. The job's row says what it is: "Drawing 4 new shots (long-shot fix)", "Changing S12B as you
  asked" or "Drawings for 3 undesigned shots".

### Waiting for the internet (0.84)

The owner's review of 2026-11-03: "the program can wait instead of cancelling the whole work, and when it goes on it should
start from the point it was left". A storyboard paused by a lost connection (since 0.81 it pauses instead of failing and
keeps every finished step) now waits: `SceneRoom.resumeWhenOnline` runs every 30 seconds from the server's timer, looks up
the AI's server name (`Ai.reach`, nothing is sent), and when it can be reached again the storyboard goes on by itself from
its last finished step on the same attempt (`resumePlan` with `auto`, counted in `pause.auto`). It waits 30 minutes after
each pause (`NET_WAIT_MINUTES`) and goes on by itself at most 5 times per storyboard (`NET_AUTO`); after that the owner
presses Resume. The paused row says the program is waiting and until when (`pause.waitUntil`).

