# Room 11: Publishing: private upload, attachments, schedule and unattended rules (Y01 0.46.0, Y02 0.47.0, Y03 0.48.0)

Phase 05 of the plan is controlled publishing. Y01 is built here:
- each family language is connected to one YouTube channel;
- the approved video is uploaded **privately**;
- an upload that stops is resumed;
- an upload whose outcome is unknown is reconciled before anything is sent again.

Y02 adds the thumbnail, the captions and the schedule that makes the video public (0.47.0, below). Y03 adds the rules,
the gate, the pauses and the alerts for unattended publishing (0.48.0, below).

The blueprint's rule (page 17): "A finished render, an uploaded video, a scheduled video and a published video are separate
states." Never blindly upload a second copy.

## Setting up Google access (the owner, once)

The program cannot do this for you: it needs your Google account.

1. In [Google Cloud Console](https://console.cloud.google.com/), choose your project and enable **YouTube Data API v3**. This
   can be the same project as the research key.
2. Open **Google Auth Platform** (OAuth consent screen):
   1. Choose the **External** audience and fill in the app name and your e-mail.
   2. Under **Audience**, add your own Google account as a **test user**.
   3. While the app is in **Testing**, Google ends the program's access after 7 days, and Room 11 then shows "Connect again".
      To avoid that, set the app to **In production**. Google shows you an "unverified app" warning when you sign in; that is
      expected for a program only you use.
3. Under **Clients**, create a client of type **Desktop app**. Copy its **client ID** and **client secret**.
4. In the program, open **Connections → Add connector → YouTube channel access (Google OAuth client)**, paste the ID and the
   secret, save, then select **Test**. The test only checks that both are saved; nothing goes to Google.
5. In **Production → Room 11**, select **Connect channel** for a language.
   - Google's sign-in page opens in a new tab. Choose the account and the channel (for a brand account, pick it on Google's
     channel picker) and allow the access.
   - Google sends you back to the program's page "Channel found".
   - Return to Room 11 and **Confirm this channel** by name.

YouTube keeps videos from Google projects it has not audited **private**. That is why Y01 uploads privately. Going public
needs YouTube's API audit, which Google decides (blueprint: "OAuth app verification, publishing audit ... are separate work
items").

## Channel connection (`publishing.js`, `publishing-room.js`)

- **Sign-in:** OAuth 2.0 for installed apps.
  - The redirect goes back to this program (`http://127.0.0.1:<port>/oauth/youtube/callback`), with a one-time `state` and
    PKCE (S256).
  - The pending sign-in is kept in memory for 15 minutes and works once.
  - The server accepts a cross-site request only on this return address, because the return comes from Google's page. Every
    other route still refuses cross-site requests.
- **Scopes:** `youtube.upload` (the upload) and `youtube.force-ssl`, which covers captions, schedule and reading the channel's
  own videos for Y02 and for the checks here. A sign-in that grants less is refused.
- **Pending first:** Google's answer becomes a *pending* connection showing the channel(s) it returned.
  - Nothing is bound until the owner confirms one channel by name for that language.
  - Confirming replaces an earlier connection of the same language, and its access is revoked at Google.
- **Secrets:**
  - The refresh token is encrypted with the same Windows protection as connector keys (`youtube_bindings.secret`). Access
    tokens live only in memory.
  - No token, client secret or upstream error body ever reaches the page, the logs or an error message (tested).
  - Every Google call goes to a fixed Google origin and follows no redirect.
- **Disconnect** revokes the access at Google and forgets the token.
- **Losing access:** when Google refuses the saved access (`invalid_grant`), that channel shows "Connect again" and its uploads
  pause. Other channels continue.

## What is uploaded (`deliverable`)

| Language | Video | Words |
|---|---|---|
| Main language | the final master approved in Room 10, while its approval is current | chosen title, composed description, tags from the approved package (Room 09) |
| Other language | the edition released in Room 06 (L03), while its release is current | the edition's title, description and tags |

YouTube receives:
- `privacyStatus: private` always;
- `selfDeclaredMadeForKids`: the owner answers it at every upload, with no default;
- `containsSyntheticMedia` from the package's disclosure;
- the category the owner chooses;
- `defaultLanguage` and `defaultAudioLanguage` set to the language.

Before the upload starts, these YouTube limits are checked: title 1-100 characters without `<` or `>`, description up to
5,000 bytes, tags up to 500 characters.

## The upload (`queueUpload`, `upload`, table `publications`)

1. **Queue.** A publication record is created with the exact render, its approval, the channel, the file's SHA-256 and size,
   and the metadata.
   - A language with an open record (anything but failed or discarded) cannot be queued again. "A second copy is never
     uploaded blindly."
2. **Claim.** The worker checks again:
   - the channel is still active;
   - the same render and approval are still the approved ones;
   - one of the day's uploads is reserved in YouTube's separate upload bucket (`youtube-upload`, 100 a day by default,
     midnight Pacific).
3. **Session.** The resumable session is started and saved, encrypted, **before the first byte**.
4. **Chunks.** The file goes in chunks of 8 MiB. Every chunk Google confirms is recorded (`sent`).
   - When a chunk's answer is lost, the program asks the session where it stopped (up to three times, after 2, 5 and 15 s)
     and continues exactly there.
5. **Uploaded.** When YouTube returns the video ID, the record becomes `uploaded`, the session is forgotten and the upload
   unit is settled.
6. **Processing.** The video is checked once a minute for up to two hours (`videos.list`, 1 unit each). It ends as
   `processed` (ready, private) or `failed`, with YouTube's reason. "Check now" asks at once.

## When something goes wrong

- **The PC or the program stops during an upload:** the record becomes `interrupted` and keeps its session. **Resume upload**
  asks Google where it stopped and continues. The same session is used, so there is no second copy. At most 5 attempts.
- **The network drops for good:** the same as a stop. The record keeps its session and progress.
- **Google no longer knows the session:** the record becomes `unknown`.
  - **Look for it on the channel** (`reconcile`, 2 units) reads the channel's 25 newest uploads.
  - It looks for the one video with the same title that appeared after the session started:
    - **One match:** the record takes that video ID.
    - **More than one:** the owner opens them in YouTube Studio and names the right one (`choose`).
    - **None:** only then can the record be discarded and the language uploaded again.
- **Nothing reached YouTube** (the session never started): the record fails, and the reserved upload is released, or marked
  unknown when the request may have arrived.
- **Quota used up:** the record waits with a plain message. Processing checks wait an hour.

## Y02: thumbnail, captions and the schedule (0.47.0)

The blueprint's sequence (page 17):
- "Upload privately; verify processing and attach the required thumbnail and captions. An attachment failure retries that
  attachment, not the entire video."
- "After all mandatory checks pass, set the schedule. YouTube's publishAt requires a private video that has not previously
  been published; a past time can publish immediately."
- "Poll conservatively for final processing and actual visibility. Store the observed result."

### Attachments (`assets`, `attachNext`, `runAttach`, `retryAttachment`)

- When a video becomes `processed`, its attachments are listed. A video processed before this version gets its list on the
  next round of the worker.
  - **Thumbnail:** the chosen thumbnail of the approved package (Room 09) for the main language, or the edition's own
    thumbnail with its words (L03). Its file is checked against its checksum.
  - **Captions:** the captions the edit made, written as SubRip, in the video's language and named after it. A master uses
    the edit's captions; an edition uses the captions built on its own voice.
  - An item the video does not have is shown as "none approved".
- **One try each, by themselves.** Each attachment is tried once by itself, then waits for the owner. A failed one is retried
  alone with "Retry the thumbnail" or "Retry the captions", never by uploading the video again.
- **The thumbnail** costs 50 units (`thumbnails.set`).
  - YouTube refuses custom thumbnails on a channel not verified by phone (HTTP 403). The message then says to verify at
    youtube.com/verify.
  - Setting the thumbnail again is harmless.
- **The captions** cost 400 units (`captions.insert`, `youtube.force-ssl`).
  - When the answer to an insert is lost, the attachment is `unknown`.
  - Its retry first reads the video's caption tracks (`captions.list`, 50 units). A track with the same language and name
    means the captions are there, and nothing is added again.
- **Quota.** YouTube charges a request it answered even when it refused it, so a refused attachment counts its units. A
  request that never left (a missing file, no access) costs nothing. A request with an unknown outcome stays counted.

### The schedule (`schedule`, `unschedule`)

Only a `processed` private video can be scheduled, and only when all of these hold:
- **Its channel is connected.**
- **The upload is still the approved one:** the same render and the same approval as when it was queued.
- **Every attachment is done**, or one that did not attach is waived by name in the dialog ("Schedule without the custom
  thumbnail: ...").
- **The time is right:**
  - The owner enters a date and time in a time zone they choose: the family's time zone by default, or any IANA name such as
    America/New_York.
  - `G.zonedToUtc` turns it into the exact moment (UTC), daylight saving included. A time skipped by a clock change is
    refused.
  - It must be at least 30 minutes ahead, because YouTube publishes a past time at once. It must also be within a year.
- **The owner confirms:**
  - the audience settings (made for kids, altered or synthetic content);
  - that YouTube has approved the Google project in its API audit. Without that audit, YouTube keeps uploads from the API
    private even at the scheduled time.

The program then:
1. reads the video's status (1 unit) and refuses if YouTube does not show it as private;
2. sends the status back with `publishAt` (`videos.update`, 50 units). Every other writable setting (licence, embeddable,
   public stats, made for kids, synthetic media) is sent back unchanged, because an update replaces the whole status;
3. records the schedule: the moment in UTC, the chosen time zone and wall clock, the family's wall clock, who set it, and
   anything waived.

**Cancel the schedule** removes `publishAt` before the time (51 units). The video stays private and can be scheduled again.

If the approved video or package changes after scheduling, the record says plainly that YouTube will still make this upload
public at its time, and offers the cancel.

### After the time (`observe`)

- **The first look** comes 5 minutes after the time (1 unit).
- **Public:** the record becomes `published`, with the watch link and the observed status.
- **The time was moved in YouTube Studio:** the record follows the new time and says so.
- **Still private:** the program looks again every 30 minutes. After six looks the record becomes `kept_private`, with the
  likely reason: the Google project is not yet approved in YouTube's API audit, or the schedule was removed in Studio.
- "Check now" looks at once.

## Y03: rules-based unattended publishing (0.48.0)

**The blueprint's gate** (page 25): "Require at least ten consecutive reviewed editions for a specific format with no material
factual, rights, language or destination error; a successful recovery drill; known per-pack cost; and no unresolved
account/access issue ... The user can then enable unattended publication for that format and budget only. New niches, new
voices, changed providers or materially different templates return to sampling and review. Keep a visible portfolio pause
and a per-family pause."

**What becomes unattended: publishing only.** The autopilot uploads, attaches and schedules videos the owner already
approved by name in Rooms 06-10 (final masters and released editions). Script, voice, visuals, review, package and master
approvals stay human. The autopilot never pays for anything: narration, Claude and music are still started by the owner's
clicks.

### The rules (`autopilot.js` `validatePolicy`, immutable `publishing_policies`)

Each family has revisioned rules, named by who saved them:
- **level:** review before publishing (the default) or unattended;
- **publication windows:** weekdays and times, such as Tue 18:00 and Thu 18:00, in an IANA time zone;
- **lead time:** the hours between the upload and going public (1-336);
- **limits:** uploads a day (1-20) and publications a week (1-100);
- **made for kids:** the answer YouTube requires, given once for the family's automatic uploads;
- **category**.

Rules can be saved at the review level at any time; they then change nothing.

### The gate (`gateFor`, `A.gate`), measured from the family's own records

1. **10 reviewed videos in a row.** Counted from the newest. Each must have:
   - gone public on YouTube (observed `published`);
   - been made with **today's recipe** for its language;
   - no reported error.

   The recipe (`currentRecipe`) is the family's format and niche, its assigned style revision, and the language's voice:
   the main narrator's profile revision, provider and model, or the edition voice. A new niche, voice, provider or style
   is a new recipe, so the earlier videos stop counting. The count also stops at a failed upload or a video YouTube kept
   private.
2. **A recovery drill:** at least one upload that needed more than one run (stopped, then resumed or reconciled) and ended
   uploaded without a second copy. The way to run one is to stop the program during a private upload, start it again and
   resume.
3. **Known cost per video:** no paid request of the family has an unknown outcome (Claude, narration, edition narration),
   and at least one video went public. The card shows narration dollars and Claude tokens per published video.
4. **No account or access problem:**
   - the Google client connection is tested;
   - at least one channel is connected;
   - no channel asks to be connected again;
   - no upload outcome is open (stopped or unknown).

**Switch on unattended publishing** is refused until all four pass. Switching on needs the owner's name and two
confirmations:
- the program may upload and schedule this family's approved videos by these rules without asking;
- YouTube has approved the Google project in its API audit.

### What the autopilot does (`autopilotNext`, one step per round)

The autopilot runs for a family only while all of these hold (`effective`); otherwise the family is in review, with the
reason shown:
- its rules say unattended;
- nothing is paused;
- the gate passes **now**.

It never retries an upload, never waives an attachment and never repeats a video.
1. **Upload.** It takes the next approved video of a connected language that has no upload record yet, within the day and
   week limits. It uploads it privately with the rules' made-for-kids answer and category. The record shows "Autopilot
   (rules rN of <name>)".
2. **Attach.** As under Y02: the thumbnail and captions, once each.
3. **Schedule.** When both are attached, it schedules the video into the next free window of its channel. That window is at
   least the lead time away, and an hour from any other scheduled video of the same channel (`A.nextWindow`, five weeks
   ahead, daylight saving included). It uses the owner's named audit confirmation from the rules.

### Exceptions come back to the control room (`publishing_alerts`)

An alert is raised once per family, video and kind, and stays until the owner acknowledges it. Alerts are raised when:
- an automatic upload failed, stopped, has an unknown outcome, or was kept private;
- an attachment did not go on (the autopilot never schedules without it);
- no window is free in five weeks;
- a channel asks to be connected again;
- a queue or schedule step failed;
- the family's rules say unattended but the gate no longer passes (the family is back in review);
- a material error is reported.

### Pauses (`publishing_controls`)

**Pause all publishing** (the portfolio) and **Pause this family** are always on the page, with a reason and a name.
A pause holds every level:
- nothing new starts, not even an upload queued by hand;
- a running upload stops between chunks and can resume later;
- nothing is attached or scheduled by itself.

Videos YouTube has already accepted keep their schedule. The card says so, and each one offers **Cancel the schedule** in
the Uploads list.

### Reporting a problem (`report`)

Any uploaded video can be marked with a material **factual, rights, language or destination** error and a note. That ends
the clean run, so unattended publishing goes back to review until ten more videos go out clean. It also raises an alert.
Fixing the video itself is done in YouTube Studio.

## Room 11 on the page

**Channels:** each language of the family shows its channel (link to YouTube, who confirmed it) or "Not connected", with
these actions:
- **Connect channel**, which opens Google's page in a new tab;
- **Confirm this channel**, for pending sign-ins;
- **Disconnect**.

The uploads used today and the YouTube units used today are shown.

**Uploads:** per language, what is ready (the master or the released edition) or why not, then the newest record. A record
shows:
- its status;
- a progress bar while uploading;
- private, made for kids yes/no;
- YouTube's processing state;
- the link to YouTube Studio;
- the actions it allows: Resume, Look for it on the channel, This one is the upload, Check now, Discard.

Y02 adds to each record:
- the thumbnail and captions status, with a retry for each;
- **Schedule going public**: date and time, time zone, confirmations, waivers;
- the time it goes public, in the chosen zone and the family's zone, and in UTC;
- **Cancel the schedule**;
- "Public on YouTube" with the watch link, or "YouTube kept it private" with the reason.

The page refreshes itself while an upload or an attachment runs, and when you come back from Google's tab.

## Tested

`tests/publishing.test.js`, against a stand-in Google that runs real resumable-session logic and checks every chunk starts
where Google stopped:
- **Sign-in:**
  - Other origins and other languages are refused.
  - The Google address carries the loopback redirect, S256 and offline access.
  - A forged state is refused, and a sign-in link works once.
  - Nothing is bound before the owner confirms; confirmation needs the tick and one of the returned channels.
  - The refresh token, the access token and the client secret never appear in what the page receives.
  - A second sign-in replaces the first and revokes it.
- **Upload:**
  - Refused without the made-for-kids answer or without an approved master.
  - A duplicate is refused while a record is open.
  - The answer to the second chunk is lost, and the upload still finishes with exactly the approved bytes.
  - The metadata is private, with synthetic media and the category.
  - The upload bucket is counted.
  - Processing goes from processing to processed (2 units), with the YouTube Studio link.
  - A refused renewal pauses the channel as "Connect again".
- **Recovery:**
  - The network goes down after a chunk: the record is interrupted with its session and progress.
  - A program restart marks a running upload interrupted.
  - Resume continues the same session (one session, one copy) and uploads the Spanish edition's words.
  - A forgotten session becomes unknown. Discarding is refused before reconciliation, and a new upload is refused while the
    outcome is unknown.
  - Two candidates after the start lead to the owner's choice (an older video is ignored).
  - No candidate allows the discard and a new upload.

Browser check on a throwaway workspace with a stand-in Google (nothing was sent to Google):
- **Room 11:**
  - It listed the three languages, the quota, the ready master and edition, and the Italian blocker.
  - The sign-in return page showed "Channel found".
  - The confirmation was refused without the tick, then recorded.
  - The upload was refused without the made-for-kids answer.
  - The 44-MB master uploaded with live progress (95% shown), was checked, and became "Ready on YouTube (private)" with its
    Studio link.
  - The quota showed 1 upload and 2 units.
- **The Connections form:**
  - It shows the client ID field and "OAuth client secret" for this connection.
  - The Claude model fields had been showing for every connection type: the form's style overrode `hidden`. Fixed for the
    whole program with `[hidden]{display:none !important}`.

Y02 (`tests/publishing.test.js`, stand-in YouTube):
- **Attachments:**
  - After processing, both attachments are pending.
  - The thumbnail is refused (channel not verified, with the hint), and the captions' answer is lost (unknown) although
    YouTube kept the track (the SubRip text is checked).
  - Scheduling is refused while the thumbnail failed and is not waived.
  - The thumbnail retry attaches it.
  - The captions retry finds the existing track, so there are no duplicate captions.
- **Scheduling:**
  - A time in the past, a missing audit confirmation and missing audience settings are refused.
  - 20:00 in Asia/Karachi becomes 15:00 UTC.
  - YouTube receives private plus `publishAt` with every other setting unchanged.
  - Cancelling removes `publishAt` and keeps the video private; scheduling again works.
- **After the time:** public becomes `published` with the watch link; private after six looks becomes `kept_private` with
  the audit reason.
- **Quota:** thumbnails (including the refused one), captions, the caption lookup and every schedule change are counted.

Y02 browser check on the same throwaway workspace (stand-in Google):
- The video processed under Y01 got its thumbnail and captions attached by itself after the update.
- The schedule was refused without the audit confirmation, with YouTube's rule explained.
- It was scheduled for 22 Oct 20:00 Asia/Karachi (15:00 UTC), with thumbnail and captions attached and 503 units shown.
- The cancel kept it private, with the reason recorded.
- The page footer still said publishing was locked; corrected.

Y03 (`tests/publishing.test.js`, stand-in YouTube; `autopilot.js` checked by it):
- **Locked with no evidence:** all four checks fail with their reasons. The Google client counts only once tested.
- **Review rules:** they can be saved without effect, and rules are immutable.
- **The pilot record:** 10 published videos with today's recipe and one recovered upload pass the gate, except while a
  paid request has an unknown outcome.
- **Switching on** needs the two confirmations.
- **The autopilot by itself:**
  - it queued the approved master ("Autopilot (rules r2 of Owner)", made for kids no);
  - uploaded it, waited for processing and attached both pieces;
  - scheduled it on a Tue or Thu 18:00 New York time at least 24 hours ahead;
  - then had nothing else to do.
- **The pause:** a portfolio pause held an upload queued by hand; resuming uploaded it.
- **A reported factual error:**
  - the family went back to review with the reason;
  - a second-kind (taste) report was refused;
  - the incident and gate alerts were raised once each, and acknowledging removed one.
- **A new voice profile** reset the count to 0 ("another niche, voice, provider or style").

Y03 browser check on the same throwaway workspace (stand-in Google):
- The Automation card showed the gate from the workspace's real records (0 of 10, no recovery, no cost yet, access in
  order), with no switch-on button.
- The rules were refused with a badly written window and without the made-for-kids answer, then saved as r1.
- Pause all publishing showed its banner, and resume restored it.
- A family pause showed "Paused" with the reason. While paused, a review-level family had still shown "Review before
  publishing"; fixed.
- "Report a problem" recorded a factual error and raised its alert.
- The short gate rows were pushed to the right; a style rule keeps the text next to its tick (checked in five other
  rooms, nothing overflowed).

**Not tested:**
- a real Google sign-in, a real upload, real attachments or a real schedule on the owner's channel (needs the owner's OAuth
  client, a phone-verified channel for thumbnails, YouTube's audit for going public, and the owner's go-ahead);
- YouTube's real processing times;
- a large file over a slow line.

**Known limits:**
- An edition's description is its adapted description: it does not repeat the main package's chapters and visual credits.
- Only one caption track (the video's own language) is attached; other languages' captions belong to their own editions.
