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

## The voice VoiceStudio uses (0.80)

The owner asked whether the program tells VoiceStudio what kind of voice to use. It sent the engine (`tts-1` =
VoiceStudio's chosen engine), the voice (`default`), the pace of each part and the voice direction's written
instructions. VoiceStudio's default engine, OmniVoice, keeps only a closed list of voice-design tags from those
instructions and drops prose, so the written direction never reached the voice: a narration came out in the engine's
own default voice at the profile's pace.

A VoiceStudio narrator profile now has "The voice VoiceStudio uses": gender, age, pitch and accent pickers with the
tags OmniVoice understands (`store.VOICE_DESIGN`, validated by `voiceDesignInput`: one per group, unknown tags
refused). They are saved as `voiceDesign` and sent first in every part's instructions, before the direction. Other
engines may ignore them; pace still applies. Measured word times are still not available from VoiceStudio.

## Finding a narrator like your competitors' on Fish Audio (0.115)

Owner request 2026-11-23: "when I connect the Fish Audio API, the program should read the competitors' voice and ask the connected API for the matching voice".

- **What is read**: the voice subject of the competitor videos the program watched (Competitors, step 3: Gemini hears the narration of a linked video and describes its pitch, pace, pauses, accent and age), the approved blueprint's voice lessons, and the channel's niche, audience and language. Nothing of a competitor's recording is ever sent anywhere.
- **The casting** (`voice-match.js`, Voice Room card "Find a voice like your competitors'"): "Find with Claude" or "Find with ChatGPT" asks the AI as a casting director (inside the channel's token reservation, led by the `voice.direction` skills, `MATCH_TOKENS` 4,000) for a description of qualities only (never a real person, never a competitor's own voice) and 2-5 search phrases with tags; "Find from the studies (free)" builds them from the studies' own words.
- **The search**: Fish Audio's voice library (`GET https://api.fish.audio/model`, the key in the Authorization header, `redirect: 'error'`; [Fish Audio's API](https://docs.fish.audio/api-reference/endpoint/model/list-models)), in the channel's language, Fish's own licensed voices only unless "Include community voices" is ticked (community voices may imitate real people: check the rights). Only trained voices with a safe ID are kept, sample clips only from Fish Audio's own https hosts, ranked by shared words, tags, the gender asked for, use count, licence and samples (`rank`).
- **Listening and choosing**: up to 8 voices with their sample clips (streamed through the program, at most 8 MB) and a link to each voice's page. "Use this voice" remembers the pick for the channel and opens the narrator profile window filled in (Fish Audio connection, voice ID, name, the voice's page as evidence); the rights are confirmed there as for any voice. The chosen voice in words also leads Muse when Muse speaks (MUSE-AI-VIDEO.md "0.115").
- **Never cloning**: Fish Audio can clone a voice from a recording ("references"); the program never uses that for competitors. It only searches voices already in the library.

Fish Audio's speech models (s2.1-pro, with a free tier s2.1-pro-free) bill per character of narration; searching the library is not billed ([pricing](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md)).

Not tested: a real Fish Audio key (the search, samples and choice were tested with a stand-in for Fish Audio's answers).

0.116: the description is saved before Fish Audio is searched, so when Fish fails or finds nothing, "Search again" repeats the search with the same description without asking the AI again (`find` with `again`); "Use this voice" switches the narrator window to the Fish connection with a Fish model (`s2.1-pro`). In a video made from Muse clips, the chosen voice also leads Muse's own voice (MUSE-AI-VIDEO.md "0.116").
