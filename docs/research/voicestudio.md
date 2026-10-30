# VoiceStudio (2026-10-30)

The owner asked (2026-10-30) for a complete analysis of debpalash/VoiceStudio and to use its free voice models to test the program's voice before paying for ElevenLabs. The same message declined the Gemini watcher (it would cost extra). Read at `4d4cb0b` (2026-10-29, 6,368 commits). Everything below is in our own words; the repository was read as data, never run here.

## What it is

A local AI voice studio: an Electron desktop app (Windows, macOS, Linux; phone apps in preview) over a Python FastAPI backend that runs speech models on the same PC. It clones voices from a clean recording, designs voices from a description, dubs videos, dictates and transcribes, narrates long texts in batches, and exposes everything to other programs through a local API and an MCP server. It claims 646 languages across its engines. The app is free; a paid "Pro" tier and commercial licences exist for companies that want to embed it in closed products.

## How it works, from the core

- **One backend, many engines.** The backend loads one speech engine at a time (others are unloaded so their memory is freed). The default engine is OmniVoice (k2-fsa). The others include KittenTTS, Supertonic-3, PocketTTS, VoxCPM2, CosyVoice 3, IndexTTS 2.5, MOSS-TTS, dots.tts, Confucius4-TTS, GPT-SoVITS and GGUF builds for Vulkan graphics cards. Heavy engines run as separate "sidecar" programs with their own Python environments.
- **Model Manager.** Weights are downloaded only when the owner asks, each with its licence shown. A model whose licence has not been accepted refuses to speak (HTTP 403 on the API).
- **Text in, audio out.** Every request is cleaned first (junk removed, numbers and abbreviations spelled out). Long texts are split into chunks read one after another. A time budget grows with the text, and on a PC without an NVIDIA card it grows with the slower processor.
- **Voices.** A saved voice is a profile (a reference clip and its transcript, or a designed description). `default` is the engine's own voice.
- **Watermark.** Generated audio carries an inaudible AudioSeal provenance watermark.
- **Local API.** `http://127.0.0.1:3900`, no key needed from the same PC (a key or a PIN guards other devices). OpenAI-compatible routes: `POST /v1/audio/speech`, `POST /v1/audio/transcriptions` (with word times on Whisper engines), `GET /v1/models`, `GET /v1/audio/voices`; plus a WebSocket for live dictation and an MCP endpoint.

## Requirements on Windows

Windows 10 or 11, about 10 GB free (about 5 GB on a PC without an NVIDIA card, which gets the small processor-only build). The installer sets up Python, FFmpeg and models by itself on first start. Without a graphics card it works but slowly; its own advice for such PCs is the light engines KittenTTS, Supertonic-3 and PocketTTS. Compare the installer with the release's `SHA256SUMS.txt`.

## Licences

- **The app is AGPL-3.0.** We copy none of its code and ship none of it. The owner installs VoiceStudio as its own program, and the Control Room only calls its local API, so the two stay separate programs.
- **The voices are the catch.** The default OmniVoice weights are CC-BY-NC (non-commercial). Other engines carry labels such as Apache-2.0 (KittenTTS, VoxCPM2, CosyVoice 3, MOSS-TTS), CC-BY-4.0 (PocketTTS) or OpenRAIL (Supertonic-3). VoiceStudio's own licence register says none of its records has a reviewed commercial clearance yet. So every VoiceStudio voice is treated as a **test voice** in the Control Room.

## What the Control Room took (0.72.0)

- Connection `voicestudio` (Connections page): no key; the test asks VoiceStudio for its ready engines and saved voices and generates nothing. A clear message when VoiceStudio is not running.
- Narration through `POST /v1/audio/speech` (WAV), with the voice direction's per-part instructions and pace, in parts of at most 2,500 characters, up to 30 minutes per part. A failed part costs nothing, so no "unknown charge" is recorded.
- The narrator profile confirms **test-only use** instead of commercial use. Room 11 refuses to upload any video narrated by a VoiceStudio voice, master or language edition, and says to narrate it again with ElevenLabs, Fish Audio or OpenAI.
- Everything else of the Voice Room is unchanged: the same real-audio checks, the monthly character limit, listening and approval by name.

## What it did not take, and why

- **Voice cloning and voice design.** Cloning needs the voice owner's consent; the owner's own voice could be cloned later, but the weights licence would still need checking before real videos.
- **Dubbing, dictation, the MCP server.** The Control Room has its own language editions (L01-L03) and does not need dictation.
- **Word times from its transcription.** VoiceStudio's Whisper engines can return each word's time. Feeding the finished narration back through them would give measured word times to VoiceStudio and Fish Audio narrations (better caption and drawing sync). Not built yet; a small next step if the owner wants it.
- **The Gemini watcher.** Declined by the owner on 2026-10-30.

## Using it

1. Install VoiceStudio from its releases page and open it once (it downloads its Python and the first model).
2. In VoiceStudio, pick an engine (PC without an NVIDIA card: KittenTTS, Supertonic-3 or PocketTTS) and accept the model's licence in the Model Manager.
3. In the Control Room: Connections, add "VoiceStudio", Test.
4. Voice Room, narrator: choose the VoiceStudio connection, model `tts-1` (the engine chosen in VoiceStudio) or an engine name such as `kittentts`, voice `default` or a VoiceStudio voice ID, tick the test-only box, save, then generate a narration as usual.
