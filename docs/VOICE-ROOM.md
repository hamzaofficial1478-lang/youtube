# Voice Room

Version 0.6 adds the first fully controlled production room: primary-locale narration auditions. It does not enable localization, visual generation, editing, rendering, packaging, publishing, or an automatic voice fallback.

## Control contract

The Voice Room is scoped to one channel family and its current approved primary-locale script.

Inputs:

- current family revision and primary BCP 47 locale;
- exact approved script revision and SHA-256 snapshot;
- current immutable narrator-profile revision;
- current tested OpenAI or ElevenLabs connector revision;
- explicit voice ownership, consent, commercial-use, and terms-review evidence;
- delivery direction and a versioned pronunciation lexicon;
- monthly and per-audition character limits plus a recorded cost estimate.

Immutable results:

- provider, model, voice ID, voice version, connector revision, and request IDs;
- exact script/profile/lexicon scope;
- WAV artifact path, byte size, MIME type, and SHA-256 checksum;
- FFprobe/FFmpeg codec, duration, sample-rate, channels, silence, peak, and integrated-loudness evidence;
- paid-attempt and character-settlement ledger;
- human comparison, intelligibility approval, revocation, and downstream invalidation history.

Output:

- one current human-approved narration handoff per approved script revision;
- downstream rooms remain blocked until this handoff is ready.

## Operator workflow

1. In **Connections**, add an OpenAI or ElevenLabs slot and run its read-only test. Testing access does not authorize narration spending.
2. In **Production panel**, choose a channel family and open **Voice Room**.
3. Configure a narrator profile. Saving creates a new immutable profile and pronunciation-lexicon revision.
4. Review the approved script row and click **Generate audition**. This is the billable admission action. Nothing runs in the background merely because a connector exists.
5. Wait for the worker to create a WAV and run real-audio validation.
6. Listen to complete takes, compare them, record the decision, and confirm intelligibility.
7. Approve one exact audition. The room emits a typed narration handoff.
8. Revoke the approval if the take is no longer usable. Revocation blocks the handoff.

## Spending and retries

Admission occurs before provider contact. The store reserves the lexicon-expanded provider character count in the family-local calendar month. Known successful responses settle that count. Pre-request failures release it. A request that may have reached the provider is retained as `unknown`.

There are no automatic retries and no provider fallback. An unknown provider outcome requires explicit confirmation. Paid attempts are capped at three for one exact audition scope. A changed script, family locale, profile, or connector requires a fresh audition instead of disguising a new request as a retry.

## Real-audio gate

HTTP success is not success. Every generated result is merged to a PCM WAV and inspected locally. Validation checks:

- a decodable audio stream exists;
- duration is within a deliberately broad script/pace envelope;
- silence is no more than 35 percent;
- peak level is below clipping;
- integrated loudness is measurable and within the audition acceptance band;
- sample rate is at least 16 kHz;
- channel layout is mono or stereo.

A failed result remains immutable evidence and cannot be approved. Automated checks do not establish pronunciation, meaning, emotional fit, or intelligibility; those remain human decisions.

## Invalidation

Editing the approved script, changing family format or primary locale, archiving the family, saving a new narrator profile, selecting a different take, or revoking an approval blocks the old handoff. The dependency ledger records invalidation for:

- scene timing;
- captions;
- audio mix;
- review and QC;
- packaging;
- render.

Audition files and provenance are retained. The system revokes authority, not history.

## Provider boundaries

OpenAI requests use only `https://api.openai.com/v1/audio/speech`. ElevenLabs requests use only `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`. Credentials stay in Windows-protected connector storage and are never returned to the browser, persisted in audition metadata, logged, or sent to another origin.

Provider limits, availability, pricing, model behavior, and commercial terms can change. The operator must review current terms and record the evidence before using a profile. The application does not make a legal-rights determination.

## Local artifacts

Narration WAV files are stored under `data/voice-artifacts/`. Working chunks are temporary and removed after each job. Referenced artifacts are served only by audition ID through the local server, with byte-range support for the browser audio player. They are ignored by Git and must not be committed.

## Verification boundary

Automated coverage exercises profile revisioning, rights fields, approved-script admission, family-local character reservation, provider provenance, bounded retries, fixed endpoints, real FFmpeg analysis, human approval, revocation, migration, HTTP authorization, and downstream invalidation.

A live paid-provider audition still requires an operator-configured tested connector and an explicit generate click. Fixture and local FFmpeg checks do not pretend to be a live commercial-provider verification.

## Attaching your own voice-over, clearing attempts, live progress (0.78)

The owner's review of 2026-10-31 asked for three things in this room.

- **Attach my voice-over.** Each approved script has "Attach my voice-over" beside "Generate audition". The file (WAV,
  MP3, M4A, AAC, FLAC, OGG, Opus or WebM, up to 500 MB) is sent as the raw body to
  `POST /api/content/:id/narration-file` with the owner's name, the rights holder and the commercial-use confirmation
  in the address, streamed into the data folder, turned into the same WAV a generated take uses, and checked by the
  same real-audio checks, including the length against the script (a file far shorter or longer is the wrong file).
  `VoiceRuntime.attach` and `store.recordUploadedNarration` record it as a take (provider `upload`, no connection, no
  usage row, free) under the channel's narrator profile, so the narrator needs setting up once. It is approved like any
  take, stays current while the script stays the same whatever narrator comes later, and is never a test voice:
  `PublishingRoom.testVoice` reads the take's scope before the profile.
- **Clear them.** Finished attempts that went nowhere (failed, retried, stale, failed checks, blocked by budget,
  cancelled) can be cleared from the list (`clearVoiceJobs`, column `cleared_at`); nothing is deleted, an attempt with
  an unknown charge stays, and a cleared attempt no longer blocks a fresh one.
- **Live progress.** A narration shows each part as it is read ("Reading part 2 of 5 on this PC"), then joining and
  the audio checks, with how long the step has run (`live.js`, room `voice`). A local voice answers only when a part is
  finished, so the page explains a quiet stretch instead of calling it stuck.

Scenes are planned after a narration is approved: the Scene & Visual Room times every scene on the approved
narration's real words, so the approved take's card links straight there.
