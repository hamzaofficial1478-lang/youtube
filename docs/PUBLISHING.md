# Room 11: Publishing: private upload, attachments and schedule (Y01 0.46.0, Y02 0.47.0)

Phase 05 of the plan is controlled publishing. Y01 is built here:
- each family language is connected to one YouTube channel;
- the approved video is uploaded **privately**;
- an upload that stops is resumed;
- an upload whose outcome is unknown is reconciled before anything is sent again.

Y02 adds the thumbnail, the captions and the schedule that makes the video public (0.47.0, below). Y03 (unattended operation)
is not built.

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

**Not tested:**
- a real Google sign-in, a real upload, real attachments or a real schedule on the owner's channel (needs the owner's OAuth
  client, a phone-verified channel for thumbnails, YouTube's audit for going public, and the owner's go-ahead);
- YouTube's real processing times;
- a large file over a slow line.

**Known limits:**
- An edition's description is its adapted description: it does not repeat the main package's chapters and visual credits.
- Only one caption track (the video's own language) is attached; other languages' captions belong to their own editions.
