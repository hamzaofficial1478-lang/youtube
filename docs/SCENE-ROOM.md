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
  retry started from the last kept part with the whole reservation held. (Since 0.103 it also goes on by itself once
  the program runs again; since 0.104 the pause says why the program stopped. See the last two sections.)
- **Weak or lost internet.** `ai.js` names lost connections (`networkError`: never reached = nothing used; dropped while
  answering = may count), before any sign-in check (an offline token refresh mentions OAuth). The program passes a free
  reachability check (`reachable`: the AI server's name is looked up; only a clear "not found" counts as offline) so no
  request is sent while offline. A storyboard that loses the connection, or whose AI plan reaches its usage limit,
  pauses instead of failing, with "Check my connection" (`GET /api/net-check`: a name lookup and a timed connection,
  information only) and Resume. Nothing retries by itself. (Changed in 0.84: a storyboard waits for the internet and
  goes on by itself; today's limits are in the 0.100 and 0.104 sections.)
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
presses Resume. The paused row says the program is waiting and until when (`pause.waitUntil`). (Today: an hour and at
most three times since 0.100, and time the PC was asleep does not count since 0.104.)


## Revoked visuals, building again, and two storyboards (0.86)

Owner review 2026-11-04, two screenshots: "Approve visuals" stayed clickable while the scenes were being drawn again; "Clear them" took away the row of the drawing in progress; revoked drawings could not be deleted or redone; "Build again" started at once, with no question about the storyboard already there.

- **Approve visuals waits for the drawings.** Step 4 of the road shows the button off, with the reason, while drawings are being made or any drawn shot has no drawing of today's sketch (`sceneDrawWait`); the Visual approval card says the same. `approveVisuals` refuses on the server too (`drawState`: active, missing or outdated).
- **Clear them only clears finished work.** Queued, running and paused jobs stay, and so does the job whose plan is still being drawn (`clearPlanJobs` skips the job whose `manifest_id` is the latest plan while draw jobs are waiting or running); that row shows "Drawing its scenes now: n of N".
- **Revoked visuals** (the Visual approval card, only while the last approval is revoked and not cleared):
  - *Delete the revoked drawings* (`deleteRevokedDrawings`, `POST /api/content/:id/revoked-drawings/delete`): the drawn assets of revoked approvals, and drawn assets no shot selects any more, leave the database (their selections too, logged as `deleted`) and their files and thumbnails leave the data folder (a file stays while another asset names it). A drawing that a current approval holds stays; footage and AI images are never touched. The revoked note leaves the page (`visual_approvals.cleared_at`). Refused while drawings are being made.
  - *Redo the scenes with Claude / ChatGPT* (`redoRevoked`, `POST /api/scene-manifests/:id/redo-revoked`): one redraw job of every drawn shot (purpose `redo`), the AI told the revoke reason; the drawings arrive as a new plan revision, then "Draw the remaining".
  - Skills are never touched, and the revoke reasons stay: the next storyboard of that script reads them (`ownerRejected`, the planner line THE OWNER REJECTED EARLIER VISUALS).
- **Building again asks first.** When a storyboard exists (not the rough free draft), "Build again" names it and asks: *keep it* (the default: the job carries `scope.keep`) or *replace it* (approved visuals are revoked now with the reason "Replaced: the storyboard is being built again."), plus a tick "Yes, I want a new storyboard".
- **Two storyboards** (`compareFor`, the "Two storyboards of this script" box at the top of the road): after a kept build, until the owner chooses (`chooseStoryboard`, `POST /api/scene-plan-jobs/:id/choose`, stored in `scene_plan_jobs.choice`):
  - *Use the new one*: nothing changes.
  - *Go back to revision N*: a new revision (source `choice`) with the earlier plan's scenes and shots exactly (same IDs, so its drawings count again).
  - *Merge the best of both with Claude / ChatGPT*: `mergeBlocks` finds the stretches of the script both storyboards split the same way; one AI answer (reserved first, kind `storyboard_merge`, never retried) picks the version of each stretch whose scenes show the words better (`mergeMessages`, `readPicks`; a stretch without a pick stays new); `mergePlans` builds one plan from those scenes, keeping shot IDs (their drawings carry over) and adding the earlier storyboard's characters to the cast (a clashing ID gets its own). Source `merge`.
  - Going back and merging need the same script and narration revision (`mergeable`). An owner edit, a merge and a return are never mended (`own` in `insertManifest`), so their drawings stay exactly as they were; the new revision needs the storyboard approval again.

## Drawing again, and storyboards planned with older rules (0.91)

Owner report 2026-11-04: after the 0.85 stone-age update the scenes were drawn again, and a fresh draft was made, but the places, clothes and objects stayed as before.

**Why.** "Draw them all again" draws the same storyboard with today's drawing engine. The story's world (places of the era, people in hides, objects of the time) is set when a storyboard is planned, and a storyboard planned before those rules never saw them. A fresh draft in the Editing Room starts from the same approved board.

**Now.**

- Every storyboard with drawn shots records the scene rules it was planned with (`payload.rules`, `SCENE_RULES`). Every revision carries the mark on: owner edits, pictures, redraws, merges and returns.
- One planned with older rules says so in step 1 of the road ("Planned with older scene rules") and offers **Update to today's rules**. That is a plan edit (`op: 'update-rules'`, source `rules-update`, free): the same scenes and shots, mended by today's world, era and clothing rules. The changed shots are then drawn in step 3.
- When everything is drawn, step 3 says that drawing again keeps the same scenes; to change one, use Change with words on its shot.
- `changeShots` is the several-shots form of Change with words, used by the Editing Room's editor.

## Detailing: the storyboard draws what the script names (0.93)

Owner report 2026-11-05: "the detailing sector is still too weak" - scenes missed objects the words named, places and expressions; the Room 04 tile said 77/77 while every scene was being drawn again; and each video and channel must keep its own data.

**What the program reads.** `Sk.breakdown(text, {kit})` lists what a sentence names that can be drawn: props by their name and safe synonyms (a table is the desk), the story's kit items, places and feelings. Figures of speech (a key idea, a heart, a target) and loose words ("food", "the world", "watch") ask for nothing. In "mammoth tusk" or "gold coin" only the last word is the thing.

**The planner** gets each sentence's `see` and the DETAILING line: every named thing in the shot where it is said, the place, faces and poses that act the feeling, and 2-4 details of the story's world laid out in depth with something alive.

**The continuity review** gets `detailNotes` (`Sk.detailNotes`): a scene whose words name a thing no shot shows (pebbles count for money in the stone age), a place no shot is in, a feeling with plain faces, or a story shot with fewer than three things (numbers, charts, maps, big words and pictures are fine on their own). It redraws those shots or says in notes why one stays simple. What is still missing after the review is listed on the plan as `Detail:` warnings (12 at most).

Detailing is the AI's work and advice, never a silent mend: drawing the same storyboard again draws it the same way. An older storyboard gains it when it is built again (or reviewed through Change with words or a redraw).

**Tiles.** Every Room 04 tile is the chosen video's own. "Shots ready (this video)" counts only drawings made with today's drawing and not being drawn again right now (`sceneShotsTile`, `drawState` `redrawing`), so a redraw counts up from 0 and says what the rest are: drawing now, drawn with older rules, or not drawn. The AI image tile is the channel's month and the stock tile every channel's hour, and they say so. **Locked inputs** folds (open while something blocks).

## Changing one shot, Resume, and skills that rotate (0.94)

Owner report 2026-11-05: Resume said "this one is running", a change of S18C said "1 of 7", the changed scenes kept the same objects and stickman, and the skills looked hard-coded.

**Resume.** While a storyboard waits for the internet the program checks every 30 seconds and goes on by itself. The page used to stop refreshing then, so it still showed "Paused" and Resume answered with an error. It now keeps looking, and Resume on a job that is already going on says so.

**One shot means one shot.** A painted picture (ChatGPT's) is finished, like a drawn one (Claude's). Before 0.94 the picture step took painted pictures for unfinished ones, so changing one shot painted the video's painted pictures again; that was the "1 of 7". A change now paints only the shots it drew, and the AI may change only the shots asked for. The board marks the shot: "Being drawn again", or "Redraw paused" while it waits.

**Drawn afresh.** The asked shot no longer reaches the AI as its old drawing to edit. It gets what the shot had as `rejected` (place, camera, mood, list of elements) and the DRAW AGAIN line: a new composition, staging, camera, set dressing, poses and expressions, more of the words, and a new painting from the new describe; cast and place stay unless the request or the words move them. The long-shot fix keeps its sketches (its new shots have nothing to reject).

**Skills rotate.** Skills are chosen for each job from everything approved, never a fixed list, but the same video always ranked the same ones first. Each time a skill was given to an earlier storyboard or redraw of this video, it counts 10% less for the next attempt (`triedSkills`, `rankSkills` `tried`): the job's core rules stay and about half of the rest is new. A change's own words help choose them. Skills → Usage says which skills were used on this video before.

## What the planner says, how the scenes are made, and waiting for the internet (0.98)

Owner report 2026-11-10, three screenshots: a video on the Motion Graphics engine with the HTML render (anime) finish, storyboard built with ChatGPT. "Is it building with HTML render, or painting the scenes?", "the storyboard step does not show which skills it used", "Interrupted · cost unknown ... Claude scene planning failed while ChatGPT was planning", and "retry by itself when the internet is back; do not ask me every time".

**How the scenes are made.** Room 04's storyboard card has "How this style makes the scenes" (`sceneHowMade`; `inputs.style.engine` and `inputs.style.atelier`). On the Motion Graphics engine the AI you press (Claude or ChatGPT) plans every scene and shot, then writes each designed shot as HTML in the style's finish: motion graphics, HTML render (cel anime: painted cels, drawings swapped on twos, the expensive shot), paper collage or pixel art. The program's safety gate checks that HTML (no randomness, clock, network, outside media, storage or code tricks) and "Draw the scenes" plays it frame by frame in this PC's own browser. So the HTML the owner saw on a drawing is that shot's composition. ChatGPT's paintings are a different job: the picture maker's pictures inside drawn shots of the other engines; designed shots are never painted. The live progress names it: "Writing S03A as an HTML render (cel anime ...) (3 of 12)".

**Skills shown at the storyboard.** "Skills used for this storyboard" lists the storyboard, designed-shot and picture jobs of this video with the skills each was given and ticks the ones the AI cited. The same fold is in the Voice Room, Room 07's score, the Editing Room, Room 08's frame scan, Packaging and Language editions (`skillsUsedFold` in public/app.js). Packaging's skills come from the AI gate, which now records them on the packaging job (`Ai.complete` `jobId`).

**The real error.** An error now names the AI that was working and the step: "ChatGPT, at "Planning scenes and shots, part 2 of 3": ...". Before 0.98 any fault of the program itself was written as "Claude scene planning failed", whichever AI was planning, and the job was marked interrupted with its cost unknown. Now such a fault pauses the storyboard (`pause.kind` `error`) with its real cause, the AI and the step, keeps every finished step and counts the answers that arrived as they are; Resume goes on from that step. It is not a lost connection, so the program never resumes it by itself. A story map the program cannot read is left out with a warning ("the parts were planned without its map"), never a reason to fail.

**Waiting for the internet.** A storyboard paused by a lost connection now waits a day for it (was 30 minutes) and goes on by itself up to 12 times. Every other AI job that failed because the connection was lost (scripts, voice direction, music score, frame scan, language editions, packaging, niche discovery, evaluations and suggestions, competitor scans and analyses, trend scans and topic ideas) is tried again by the program once the AI's server can be reached (`net-retry.js`): checked every 30 seconds, through the room's own retry with its usual limits, at most 6 times and for a day after it stopped, and written in the program's log as done by the program. "Working now" lists what waits for the internet. A failure for any other reason (a used-up plan, a refusal, a changed script) still waits for you. (0.100 changed the day to an hour and the tries to three; 0.104 adds work cut off by a restart and leaves out time the PC slept.)

## A picture never stalls the storyboard; an hour of waiting (0.100)

Owner report 2026-11-10: a ChatGPT storyboard drew every scene, reached "Picture 2 of 2", showed "Waiting for the first words" and failed, three times on the same spot; "retrying again and again consumes extra tokens"; "wait 1 hour, not 1 day".

**What happened.** A painting (ChatGPT's image tool) and the art director's check answer in one go, so the live line could only say "Waiting for the first words" the whole time. While it runs, Codex writes reconnect notices ("Reconnecting... 1/5 (stream disconnected ...)"); the program read any such notice as the run's outcome. So a slow painting that reached the program's 8-minute limit was reported as a lost internet connection, which paused the whole storyboard; the program then saw the internet was fine, went on by itself, and asked for the same picture again.

**Now.**
- Codex's reconnect notices are not the outcome (`ai.js` `CodexCli.run`): a run the program stopped at its time limit is a timeout (`kind: 'timeout'`, "ChatGPT did not finish within 8 minutes", with its last notice), a run that reconnected and answered is an answer, and only Codex giving up by itself is a lost connection.
- One picture's trouble never stops the storyboard (`illustrate`, `halts`): a painting, a check or a drawn picture that times out or loses its connection while this PC is online is tried once more, then the shot is drawn by the program and the plan's notes say why. The storyboard pauses only for your Stop, a PC that is really offline (`Ai.reach`), or the plan's own AI reaching its usage limit; ChatGPT's image allowance running out only means the picture is drawn instead.
- The live line names the work: "Picture 2 of 2: ChatGPT paints S05A" with "a painting sends no words while it is made (usually 1-3 minutes; the program stops it after 8)", and "... checks the painting of S05A" for the art director (`live.note` with a wait message).
- A paused storyboard shows the real message of its pause, not only for program faults.
- Waiting for the internet: storyboards and every other AI job go on as soon as the AI can be reached (checked every 30 seconds), and the program keeps watching for an hour after the stop (was a day), at most three automatic tries per job (were 12 for storyboards and 6 for other jobs), so a job that keeps failing cannot keep spending.

## Every step ticked, the storyboard so far, and the chosen picture maker (0.101)

Owner report 2026-11-10 with a screenshot: "Picture 2 of 10: ChatGPT draws S20A · Step 5 of 5 · running 11 min 40 s · Waiting for the first words", while the board still said "No scene plan yet" although 13-15 scenes were planned; "make it a step by step progress that gets marked when each step is finished".

- **Every step by name, ticked when done** (`live.js` `start` `plan`, `step` times, `progress`; public/app.js `liveSteps`): the live block lists all steps of the storyboard (the story map, each part, the continuity check, the designed shots, the pictures). Finished steps are ticked with how long they took ("kept from before" when a resumed run skipped them), the running one shows how far it is ("2 of 10 pictures done", "3 of 12 designed shots", parts of the check) with its own bar and every finished picture or designed shot marked by its label, and the steps still to come wait below. The main bar moves with that count.
- **The storyboard so far** (`live.board`, `boardOf`; public/scene-room.js `sceneEmptyPlan`): the storyboard is still saved as one piece when its last step finishes, so a half-made one can never be drawn or approved. Meanwhile the card that said "No scene plan yet" lists the scenes planned so far (number, sentences, purpose, shots, direction), marked "Being built · not saved yet".
- **The picture maker you chose draws the pictures** (`illustrate`: `drawer`): with "Claude (vector)" as the picture maker, the vector pictures were drawn by the storyboard's own AI, so a ChatGPT storyboard had ChatGPT write each picture in one long answer (no words show until it is done). Now the chosen picture maker draws them; the storyboard's AI draws them only when ChatGPT paints and a painting fails, or when no picture maker is set. A one-go answer says so on the live line instead of "Waiting for the first words".

## "Paints S17A again": a second try, aimed better (0.102)

Owner question 2026-11-10: "it says Picture 4 of 10: ChatGPT paints S17A again. Does it draw the same scene twice? That would cost double. The program must decide right the first time."

**What "again" is.** Each painting is looked at by the art director (the storyboard's own AI) before it is used. When the painting breaks the look's rules (the wrong medium, readable text or letters, something the look forbids, not what was asked, or one of the owner's craft checks), it is painted once more with the reasons; a second miss leaves the shot to the program's drawing. Since 0.100 a painting that ran out of time is also tried once more. The rejected painting is not used, and its painting counts against the ChatGPT plan, so a second try does cost one more painting.

**Why it happened, and what changed.** The painter was told the look's rules but not everything the art director judges by: the owner's craft checks went only to the art director. Now (`illustrate.js` `paintPrompt` `judged`, `lessons`):
- every painting is told exactly what it will be judged on (the same failures and the owner's craft checks), and asked to get it right the first time;
- whatever the art director sends back is told to every later painting of the storyboard ("Earlier paintings of this video were sent back for ..."), so the same mistake is not paid for twice;
- the live line says why a picture is painted again ("again (the art director sent the first back: ...)" or "the first try did not finish"), and the plan's picture notes start with how many paintings needed a second try.

The second try itself stays (quality first): it is the safety net that keeps a wrong-medium picture out of the video.

## Why one storyboard took all day, and what changed (0.103)

Owner report 2026-11-10: a Motion Graphics · HTML render storyboard started at about 8 am was still not finished hours later; it paused with "The program was closed while it was working ... Kept: the story map, 1 of 2 parts, 19 pictures", did not go on by itself, and had stalled before.

**The main bug: the last part was never saved.** Each part of a storyboard was kept as it arrived except the last one, which was kept only when a continuity check followed (the check runs only for engines that draw; Motion Graphics does not). So whenever the storyboard stopped after its last part (a restart, a lost connection, a fault), the next run planned the last part again; its shots then differed from before, so their designed shots were written again and their pictures painted again. Every resume repaid the slowest steps. Now every part, the last one too, is kept the moment it arrives, so a resume goes on exactly where it stopped. (A storyboard paused under an older version still has to plan its last part once more.)

**A restart is no longer a full stop.** A storyboard the program was closed on (Update Control Room restarts the program) now goes on by itself as soon as the program runs again (`resumeWhenOnline`: `closed` pauses, within a week, at most three times), as lost connections already did.

**Designed shots three at a time.** The Motion Graphics engine writes each designed shot as its own AI answer and checks it in the browser; they were written one after another, so a video with 30 designed shots waited for 30 answers in a row. Now three are written at once (`DESIGN_LANES`), each with its own AI lane (`Ai.complete` `lane`) and its own checking browser; a shot that pauses the storyboard lets the others finish theirs. Pictures stay one at a time, so every painting matches the first painting of the video.

**Where the time went.** Every run records each step's time (`scene_plan_jobs.timings`) and the job row shows it ("Where the time went: 2 h 40 min over 2 runs", step by step, "kept from before" for steps a resume skipped), so a slow step can be seen and fixed.

## "The program was closed", sleep, and timing that is the video's own (0.104)

Owner report 2026-11-10: the storyboard said the program was closed, but the owner had not closed it or shut the laptop down; the laptop may have gone to sleep. It also did not go on by itself, and the shots were held to "6 s as for the stickman".

**Where "closed" comes from.** That pause is written only when the program starts and finds a storyboard still marked as running, so the program really had stopped and started again: Stop Control Room, Update Control Room (it stops and starts the program), Windows restarting for an update, power loss or a crash. Sleep alone never wrote it: a sleeping PC freezes the program, which carries on where it was when the PC wakes. Until 0.104 the program could not tell which of these happened, and the launcher overwrote its own logs on every start, so the cause was lost. Now:

- Stop and Update leave a note (`data/last-stop.json`, also written when the program is stopped with Ctrl+C), and the running program writes a heartbeat every 30 seconds (`data/heartbeat.json`). At the next start the pause names the cause: "restarted for an update", "stopped with Stop Control Room", or "stopped unexpectedly around <time>: Windows restarted or shut down, the PC lost power, or the program crashed". (`SceneRoom` `stopped`, `stopMessage`.)
- The launcher keeps the previous run's logs as `server.previous.log` and `server-error.previous.log`, so a crash can be read afterwards.
- A storyboard paused this way goes on by itself as soon as the program runs again (since 0.103).

**Sleep.** While a storyboard, drawing, render, narration or any AI job runs, the program asks Windows not to sleep on its own (`keep-awake.js`: Windows' `SetThreadExecutionState`, system required; the screen may still turn off) and lets it sleep again when the work is done. The helper ends by itself if the program is gone, so it never keeps the PC awake for nothing. "Working now" says when the PC is being kept awake. Closing a laptop's lid or pressing its sleep button still sleeps it: that is Windows' power setting ("When I close the lid: Do nothing" keeps it working). When the PC does sleep, the program notices the gap on waking, logs it, and does not count the time asleep against the hour it waits for the internet (`awakeFor`), so a job that lost its connection just before the lid closed still goes on by itself after waking.

**Work cut off by a restart in other rooms.** Scripts, voice direction, music scores, frame scans, language editions, packaging and research jobs that were stopped by a restart ("the program stopped while ...") are now tried again by the program, like jobs that lost the internet (`net-retry.js` `RESTART`; an hour of awake time, at most three tries). An answer that was arriving when the program stopped may be counted again, so these stay within the same limits.

**A painting made just before a stop.** A painting that finished but was not yet checked by the art director when the storyboard stopped is now kept (`plan_pictures` `:unchecked-N`) and checked on resume instead of being painted again; a rejection is kept too, so the resume goes straight to the second try.

**Timing is the video's own.** The "6 s" in the earlier explanation came from a test's example, not from a stickman rule the AI was held to. The pace a part is checked against is the video's own: the AI's design for that video (adaptive styles, every engine) or, for a fixed style, that style's own shot length; no engine borrows another's. And a scene whose shots are longer than that pace no longer stops the storyboard: the part is asked once more, then kept as it is; the finished storyboard lists those shots and "Fix the long shots" splits them if you want. Only real rule breaks (a camera move or source the style does not allow, broken sentences) stop a part.

**How this style makes the scenes** (Room 04) was brought up to date: the continuity step is listed only for engines that draw, Motion Graphics says its designed shots are written three at a time and its pictures one at a time with an art director, and every finished step is said to be saved.

**Docs and the program.** The program takes its behaviour from its code, its skills and its prompts, not from these pages. Three kinds of document do reach the program: the Build page shows `docs/build-status.json` and BUILD-PROGRESS.md, the Production panel's "Architecture & safety" button opens PRODUCTION-ROOM.md, and the editing-brain skill packs are read from `docs/research/editing-brain/*.json` (data, approved like every built-in skill). Every release updates the first two; PRODUCTION-ROOM.md had not been touched since 0.10 and now opens with a map of today's document for each room. A test (`tests/docs.test.js`) now fails when the version in package.json, build-status.json, README, AGENTS, HANDOFF or BUILD-PROGRESS disagree, or a document a page opens is missing, so a release cannot be merged with its docs behind.

## "Set must be one of": a finished storyboard that could never be saved (0.105)

Owner report 2026-11-10 with a screenshot: a Motion Graphics (HTML render) ninja storyboard went through every step, then paused at the very end with "the program hit a problem of its own: Set must be one of: none, room, office, ..."; Resume did nothing visible, the scenes that had been shown while it was built disappeared, and it happened again and again all day.

**The cause, in the program.** When a designed shot fails its checks twice, the program draws that shot itself from its words (the fallback). The fallback took the scene's place from the storyboard, and the AI had placed that scene in a place of the video's own world kit (a set such as `kit:dojo` that the story's kit defines). The scene's place was checked with the kit and accepted; the fallback then checked it again strictly and without the kit, and refused it. That check runs only when the storyboard is put together at its last step, so everything before it finished and was kept, and every Resume went straight back to the same check and stopped again. It was not the engine, the style, the internet or the AI plan; any style whose story has a world kit and a failed designed shot could hit it.

**Fixed.**
- The fallback drawing (`Sk.fromText`) is given the video's kit and repairs instead of failing, like every other check on drawings the program makes: a kit place is drawn as that place, and an unknown one falls back to a plain backdrop with a named warning. A short line with nothing to draw on the motion engine (the fallback of Motion Graphics, Documentary and Cinematic) now shows its own words; before, it failed with "A drawn scene needs 1-12 elements".
- A storyboard stopped by a fault of the program records the program's version; after an update it goes on by itself once (the fault may be fixed), and on the same version it waits for Resume. The storyboard paused like this before 0.105 goes on by itself as soon as the updated program runs.
- A designed shot or a drawn picture that failed its checks twice is remembered (`plan_pictures` `...:failed`), so a Resume never pays for it again; rejected paintings were already remembered (0.104).
- A paused storyboard shows the scenes it keeps ("Kept · not saved yet") where the live list used to vanish when the run ended.

