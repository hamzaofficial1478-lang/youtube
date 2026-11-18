# The channel brain (0.110)

Owner request 2026-11-18, with a survival niche as the example (titles such as "Six Survivors. One Damaged Raft. No Land in Sight" and a character sheet of the survivor who appears in every video): the program had no place where the owner says what the niche is, what they want from it, what ideas they already have and which pictures to use. Research briefs are for facts and passing ideas; this is the channel's own brain, and every job reads it.

## What the owner keeps per channel

On the channel page, under **Channel brain** (also a step of the channel's setup road):

- **Niche brief** (`niche_briefs`, one per channel, revisioned): what the niche is about, what every video gives the viewer, how the channel is different from its competitors, the owner's ideas, example titles (one a line) and what the channel never does. `creative.js` `validateBrief`.
- **Files** (`brain_files`): PDF, Word (.docx) or text, read to text on this PC by `documents.js` (nothing in them is run); up to 30 per channel. A video's own **idea files** (`content_id` set) are attached in the draft window or on the draft's "Your idea" fold (10 per video).
- **Reference pictures** (`brain_images`, the file in `<data>/brain-images/<sha256>.<ext>`): PNG, JPEG or WebP checked by their bytes, up to 10 MB, 24 per channel; each has a name, what it is (`character`, `place`, `style`, `object`, `other`) and how to use it. On a click (or with the upload) Claude or ChatGPT looks at the picture once and writes what it shows (`describeImage`, task `illustrate`, reservation `brain_describe`); the owner may correct the description.
- **Your idea and thoughts** on each draft (`content.idea`, up to 8,000 characters).

## Where it goes

`ChannelBrain.context(familyId, {contentId, bytes})` builds one JSON block (`creative.js` `context`, sized to a byte budget: the brief, the references, the playbook and the memory first, then this video's idea files, then the channel's files, each trimmed to share what is left). `store.brainProvider` hands it to:

- **The script writers** (`store.scriptJobScope`): `promptInput.channel`, and `content.idea`; the writer gets the CHANNEL BRAIN line and the OWNER IDEA line (the idea is the backbone: keep every point, never replace it), the second writer flags every point of the idea the draft dropped and judges it against the brain. Skill choice reads the idea too (`scriptSkillContext`). The job's token limit grows by the brain and the idea.
- **The story director and the shot planner** (`scene-room.js`, `director.js`): the CHANNEL BRAIN and REFERENCE CHARACTERS lines. A character from the owner's picture is cast with `ref` (the picture's id; `Sk.validateCast` keeps only a real id) and a look matching its description.
- **The painter**: every ChatGPT painting of a cast member with `ref` has the owner's picture attached after the style reference (`store.brainReferenceFiles`, at most two, four attachments in all), and `Il.paintPrompt` `owned` tells it to paint that person exactly as there, in the picture's medium. Drawn engines use the description through the cast's look.
- **The editor** (`editing-room.js` `commandMessages`): the brain with the CHANNEL BRAIN line.

## The creative director

- **Ask anything, any time** (`ask`, `creative_asks`): Claude, ChatGPT, or both (Claude answers, ChatGPT gets Claude's answer as PARTNER_ANSWER and challenges it). It reads the brain, what the program learned from the competitors (`learned`: the approved competitor roadmap of 0.107, up to eight watched-video studies with where to beat them, the competitor blueprint) and the channel's videos. Task `niche`, the `niche.discover` skills as directives, one reservation per answer (`creative_ask`), never retried by itself.
- **Memory**: "Keep in memory" stores the answer's one-line lesson (`kept`); every job of the channel reads the kept lessons (the newest twelve). "Forget" takes one out.
- **The playbook** (`playbook`, `creative_playbooks`): what the competitors all do, what nobody serves, the channel's signature (story, character, visuals, editing, sound, titles, thumbnails), rules for script, storyboard, editing, sound and packaging, what it never does, experiments to test and series ideas. Approved by name with three confirmations (`reviewPlaybook`), each process becomes a pin-only skill of this channel (`playbook.f<id>-<process>`, priority 96) pinned to its jobs, so it leads them as directives; a newer approved playbook supersedes the older and unpins a process it dropped. This is how the program learns: watched competitor videos → studies → the approved roadmap (0.107) → the creative director's playbook and the owner's kept lessons → pinned skills and context in every job.

## Adopting the style of a video

`matchStyle` sends a YouTube link to Gemini (the 0.107 connection; nothing is downloaded; one unit of the `gemini` hourly cap) with the program's engines and their looks (`creative.js` `catalogue`). The answer (`readStyleMatch`: only an engine the program has; look, picture type, how the scenes are made, confidence, reasons, whether AI video clips would suit it better, and what none of the engines does) is kept in `style_matches`. "Use the … engine" opens the channel's style window with that engine, look and picture type ticked, for the owner to confirm and approve as before.

## Not done

- A channel deleted with "delete everything" leaves its reference pictures in `brain-images` (they are stored by checksum).
- The playbook does not yet learn from the channel's own published videos (analytics, A01, waits for published videos).
- Muse AI video is 0.111.
