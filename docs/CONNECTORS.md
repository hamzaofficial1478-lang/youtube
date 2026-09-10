# Connector slots - version 0.4

Open Connections and choose **Add connector**. Give the slot a unique name, choose a provider, and optionally enter its API key. Save, then select **Test** on the card. Saving does not contact a provider.

| Provider | Current test | Still not enabled |
|---|---|---|
| YouTube public research | Public channel lookup; card Test uses @GoogleDevelopers. The research form accepts another channel. | Owner OAuth, private analytics, uploads |
| OpenAI | GET /v1/models, checking the response shape | Script generation, model-specific access and billing verification |
| ElevenLabs | GET /v2/voices?page_size=1, checking the response shape | Voice generation, rights verification and billing verification |
| Hermes reasoning engine | Authenticated, size-bounded GET `/v1/capabilities` and `/v1/toolsets` on fixed loopback `127.0.0.1:8642`; requires no enabled concrete tools | Live model quality, localization, voice, rendering and publishing |
| MCP server | Reports adapter not implemented, without a network call | Protocol handshake, tools and credentials |
| Reddit | Reports adapter not implemented, without a network call | OAuth, search and credentials |

MCP and Reddit can be recorded as setup slots with notes. Their key fields are disabled and the server rejects credentials for those types. A pending adapter never receives a green test result. No custom endpoint is fetched or shell command executed from setup notes.

**Edit** renames the slot or updates notes/key. Leave the key field empty to retain the existing key, or use the remove-key checkbox to clear it. Provider type is fixed after creation to prevent sending an old key to a new provider. Any edit clears the previous test result. Conflicting changes from another tab are rejected.

**Delete** removes the slot and its local saved credential after the UI confirmation. This does not revoke the key at the provider or erase earlier backups/SQLite history. Other slots and content records remain intact. A connector cannot be edited or deleted while its test is in flight.

Named slots are stored in the planning database's new `connectors` table. Credentials are Windows-DPAPI ciphertext in a separate BLOB column, never JSON metadata. The database, WAL, logs and keys remain excluded from GitHub. Status responses contain only metadata, key presence and the last test result. The existing v0.2 YouTube key remains in its original protected file and is offered as a legacy choice if present; it is not silently moved or overwritten.

Tests use fixed HTTPS provider origins, header credentials, a ten-second timeout and no automatic retries. No script, voice or video generation request is made. A successful metadata test does not prove all permissions or production readiness. No real provider key has been supplied for this release, so external behavior remains pending live verification.

Validation: 37 automated tests passed, including actual Windows encryption, slot isolation, CRUD, retained/cleared credentials, stale revisions, failure redaction, in-flight locks, pending adapters and HTTP token checks. Desktop browser fixtures verified create, test, edit, blank key on reopen, retained key and invalidation of the test result. Delete behavior is covered through the store and HTTP tests. These fixture checks do not constitute a live provider test.

Next in Phase 02: verify a real restricted research key, implement per-channel OAuth state/PKCE and refresh/revocation, then collect recent public videos and source evidence for competitor analysis. Slots are a completed substep; the whole Accounts and research phase remains in progress.

References checked 2026-09-09: [YouTube channels.list](https://developers.google.com/youtube/v3/docs/channels/list), [OpenAI models.list](https://developers.openai.com/api/reference/resources/models/methods/list), [ElevenLabs voice list](https://elevenlabs.io/docs/api-reference/voices/search).
