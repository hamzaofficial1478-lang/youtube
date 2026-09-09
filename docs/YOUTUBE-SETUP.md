# YouTube research setup

Version 0.3 update: create a named **YouTube public research** slot using **Connections > Add connector**, save its key there, and select that slot in **Research connector**. Slots support edit, test and delete; see [CONNECTORS.md](CONNECTORS.md). The older key form described below appears only if a v0.2 key already exists. That key is preserved and remains usable.

This release adds a public channel lookup. It does not connect a channel owner account, read private analytics or upload content. The lookup code and error handling are tested with synthetic responses; a live Google project/key has not yet been supplied or tested.

## Start here

1. Run the application under your normal Windows account and open **Connections**.
2. In [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com), choose your project and enable **YouTube Data API v3**.
3. In [Credentials](https://console.cloud.google.com/apis/credentials), create an API key. Restrict it to YouTube Data API v3. If the server has a stable outbound IP, add that IP as an application restriction. Browser referrer restrictions do not match this server-side request.
4. Paste the key into **YouTube Data API key** in the local app and select **Save protected key**. Do not put keys in chat, source files, screenshots or GitHub.
5. Enter a public `@handle`, `UC...` channel ID, or plain `https://www.youtube.com/@handle` / `/channel/ID` URL. Select **Look up channel**.
6. Verify the returned channel ID, title and source link. Only a successful response changes the status to **Public lookup tested**. A saved key alone remains **Not tested**.

Each lookup makes one `channels.list` call with the snippet and statistics parts. The documented cost is one unit. Actual quota availability belongs to the Google project; this app does not claim to know its remaining quota. Requests are manual, limited to one in flight, time out after ten seconds and do not automatically retry. [YouTube method reference](https://developers.google.com/youtube/v3/docs/channels/list).

Totals are public data, not evidence of audience country, tier, retention, revenue or the reasons for ranking. Hidden/missing values are shown as unavailable. Large numeric counts remain strings to avoid JavaScript rounding. Results are kept only in the open page session; reloading clears them. No source-retention database or competitor scoring is implemented yet.

## How the key is handled

- Production storage is `data/youtube-key.dpapi`, encrypted by Windows DPAPI in CurrentUser scope. It is separate from the planning database. Windows protects the encryption key; the application has no embedded master password. Programs running as the same Windows user can still access that user's secrets. This is a local single-user design, not a multi-user secret service. [Microsoft ProtectedData reference](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata).
- The fixed, reviewed PowerShell helper receives input through stdin, not command arguments. Its child process runs hidden with a ten-second timeout. The process-scoped execution-policy option allows this project's helper to run; it does not change the machine's saved execution-policy settings.
- Only encrypted bytes go into the saved file. Replacement uses a temporary encrypted file and rename, so validation or encryption failure preserves the previous key. `.gitignore` excludes the data directory and DPAPI files even if moved elsewhere in the checkout.
- The browser clears the password field on submission and never receives the stored key back. The server only reports availability/check status. The key is sent to the fixed Google API origin in the `x-goog-api-key` header; redirects are rejected. Raw upstream error bodies are never returned or logged. [Google key-management guidance](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices).
- **Forget local key** removes this application's saved copy. Google Cloud revocation is separate. Backups may contain an older encrypted copy. Moving to a different machine/Windows account can require re-entering the key.
- Non-Windows machines can run planning, but this release does not provide a substitute secret store. It fails closed rather than storing plaintext.

## Validation and next work

`npm run check` and `npm test` validate the source and 29 automated cases. The Windows vault test uses a nonfunctional dummy key and exercises actual protection, reopen, replacement, corruption and removal. In restricted environments DPAPI may be unavailable: run this check under the normal Windows account; do not skip it and claim success. No paid service or Google call is made by the tests.

For repeatable browser QA, `node tests/browser-fixture.js` runs a separate in-memory fixture at port 3457. It uses a fake vault and fake provider. The handle `@denied` returns a simulated denial; other valid identifiers return conspicuously labeled test data. Never enter a real key there. The normal `npm start` command cannot enable this fixture. Browser checks cover phone-width key save/lookup/error/forget flows and desktop layout; actual encryption is checked separately by the automated Windows test.

Next: supply a restricted key and verify one real public lookup; then build per-channel OAuth with state/PKCE, verified destination identity, refresh/revocation and separate EN/ES/IT bindings. The project API key is for public research and must never become an upload credential. After that, add recent-video collection, permitted evidence storage and differentiated topic briefs. Owner analytics require separate authorization.

References checked 2026-09-08. R01 and R02 remain in progress until their account isolation and live verification requirements are met.
