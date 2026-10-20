# Room 11: Publishing, private upload and reconciliation (Y01, 0.46.0)

Phase 05 of the plan is controlled publishing. Y01 is built here:
- each family language is connected to one YouTube channel;
- the approved video is uploaded **privately**;
- an upload that stops is resumed;
- an upload whose outcome is unknown is reconciled before anything is sent again.

Y02 (thumbnail, captions, schedule, going public) and Y03 (unattended operation) are not built.

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

The page refreshes itself while an upload runs, and when you come back from Google's tab.

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

**Not tested:**
- a real Google sign-in and a real upload to the owner's channel (needs the owner's OAuth client and the owner's go-ahead);
- YouTube's real processing times;
- a large file over a slow line.
