# Voice direction (P08b, 0.22.0)

The owner's request (2026-10-09): the narrator's voice should change with the script. Some lines are plain, some happy, sad, energetic or quiet. The script, the style and what competitors do well decide where.

## How it works

1. **Room 02 Voice Room → Direct the voice.** On a click, Claude (the production model) reads:
   - the approved script, sentence by sentence (the same split the scene planner uses);
   - the family's niche and audience;
   - the style's music moods and motion intensity;
   - any voice techniques from the family's competitor blueprint (techniques only, 30/70 rule, never imitating a person).

   For **every** sentence it marks:
   - an emotion: neutral, warm, happy, excited, curious, playful, sarcastic, serious, dramatic, tense, suspenseful, sad, somber, angry, awe, calm, whisper or urgent;
   - energy, 1–5;
   - pace: slow, normal or fast;
   - a pause after: none, short or long;
   - up to three stressed words that appear in the sentence;
   - an optional note.

   The prompt asks for an arc, not one flat tone and not overacting: most lines are neutral, warm or curious, with peaks where the story earns them. Tokens are reserved first, and nothing is retried by itself.
2. **Checking.** Claude's near-misses are repaired, with warnings kept on the direction. For example, an unknown emotion becomes neutral, and a stressed word missing from the sentence is dropped. The owner's own edits are checked strictly.
3. **Revisions.** Directions are immutable revisions tied to one script revision. **Open direction** shows every sentence with its marks; changing lines saves a new revision.
4. **Auditions perform the newest direction** (`delivery.segments`):
   - **ElevenLabs v3/v4 voices** (`eleven_v3…`, `eleven_v4…`):
     - inline audio tags when the emotion changes (`[excited]`, `[whispers]`, `[sadly]`…);
     - stressed words in capitals;
     - `[long pause]` after a long-pause line.
     - A change of pace starts a new request, with the voice speed 0.9× / 1× / 1.1× of the profile pace.
   - **Other ElevenLabs voices:** one request per change of delivery. Livelier lines get lower stability and more style.
   - **OpenAI voices:** one request per change of delivery, with written performance instructions.
   - Tags count as billed characters. Requests stay inside each model's size limit (Eleven v3: 4,500 characters).
   - The 3-paid-auditions limit applies per direction.
5. **The scene planner follows the voice.** When the approved narration was directed, every sentence reaches Claude with its emotion, energy and pace. Characters' expressions, moods, camera and beat speed are asked to follow it.

## Files

- `delivery.js` (pure): vocabulary, validation, tags, request segments, Claude's prompt.
- `voice-direction.js`: jobs, revisions and edits.
- `public/voice-direction.js`: the Voice Room panel.
- `store.js`: audition scope, direction checks, `voiceDirectionLines`.
- `voice.js`: performs the segments.

## Limits

- Live ElevenLabs v4 performance with tags has not been heard yet; it needs the owner's ElevenLabs key.
- Whether a tag is read as a direction or as a sound depends on the voice. ElevenLabs documents this, and descriptive tags are used where no documented tag exists.
- Word-level timing inside a tagged sentence is still estimated, as before.
