# Fifteen repositories, and where each brain went (2026-11-09)

Owner request 2026-11-09: analyse anthropics/skills and alirezarezvani/claude-skills and add their skills to the program (and to Claude Code itself); analyse thirteen more repositories deeply; re-read the earlier ones; take each repository's "brain" and give it to the engine or room it belongs to.

Every repository was downloaded at the revision below into a scratch folder, read as data and never run. Nothing was copied into the program except what is listed under "vendored". The skills are restated in our own words in six new packs (72 skills, 671 built-in in total). Since 0.95 a skill is not data the model may ignore: it reaches the model as a numbered directive in its instructions (DIRECTION.md), so these packs lead the jobs they are bound to.

| Repository | Revision | Licence | What we took |
|---|---|---|---|
| anthropics/skills | 2c5958e | Apache-2.0 per skill | 13 skills (anthropic-design pack); frontend-design vendored for Claude Code |
| alirezarezvani/claude-skills | 8f08254 | MIT | 12 skills (content-strategy pack) |
| zhouxiaoka/autoclip_mvp | ec75aa7 | MIT | 2 skills (explainer-craft) |
| remotion-dev/remotion | ba0fbf0 | Remotion licence (company licence above 3 people) | ideas only: 2 skills (explainer-craft) |
| Leonxlnx/earshot | 4ac3d2a | MIT | 8 skills (sound-craft) and the effect takes in code |
| pixijs/pixijs | f026bf8 | MIT | 1 skill (animation-craft) |
| echris6/motion-video-kit | e4b1c00 | MIT | 11 skills (film-gauntlet) |
| Vincentwei1021/video-talkcraft | 5017088 | PolyForm Noncommercial | ideas only: 6 skills restated (explainer-craft); no text or code |
| kajisho5/ffmpeg-skill | 6e42a79 | MIT | 1 skill (explainer-craft) |
| synfig/synfig | 25cff24 | GPL-3.0 | ideas only: 1 skill (animation-craft) |
| opentoonz/opentoonz | e2ed6e2 | BSD-3-Clause (with third-party parts) | ideas only: 1 skill (animation-craft) |
| CloudAI-X/threejs-skills | 0e18186 | MIT | 1 skill (explainer-craft) |
| kurbaitaev/ghost-editor | ce17272 | MIT | re-read; its 25 skills have been in `skills/ghost-editor.json` since 0.89 |
| JohnHeibel/ClaudeAnimationBase | 0ac8bf2 | MIT | 13 skills (animation-craft) |
| GTAI-1/flow-mcp | 1d17b7b | no licence | not integrated (below) |

## The two skill collections

**anthropics/skills.** Seventeen skills; most are about documents, Slack, MCP servers or web apps and have nothing to do with making a video. The ones with a brain for us are about visual design. `canvas-design` makes a design philosophy first and then expresses it, refines instead of adding, and hides a subtle reference to the subject in the work. `frontend-design` names the defaults that make generated work look generated (cream backgrounds with a clay accent, one acid accent on black, identical rounded cards, all-caps eyebrow labels), asks for a plan of colour, type and layout that is reviewed against the brief before building, and spends boldness in one place. `algorithmic-art` gives seeded variation, `theme-factory` named palettes, and `skill-creator` the advice that a skill should explain why, not shout rules. They became the `anthropic-design` pack: bound to the storyboard (`scene.plan`), the paintings and pictures (`visuals.prompt`) and the designed shots of the Motion Graphics engine (`motion.template`). The document skills (docx, pdf, pptx, xlsx) are not program skills; the program already writes Word and PDF files in its own way.

**alirezarezvani/claude-skills.** A very large collection for business, engineering and marketing. The parts that make better YouTube videos are in marketing: content-humanizer (the tells of AI writing, rhythm variation, specific over vague), video-content-strategist (long-form architecture, Shorts as hook-value-action, one keyword in four places), copywriting (the customer's own words), marketing-psychology (curiosity and loss aversion, used honestly) and content-production (a brief, then an outline, then the draft). They became the `content-strategy` pack, bound to the script writer and its review, hooks, titles and packaging, niche work and idea titles.

## The thirteen repositories

**earshot** gives coding agents ears: a bank of real sounds and the rules a sound designer follows. Its brain is a grammar of which picture events get a sound (most cuts get none; a contact gets one crisp sound on its frame; a camera move gets one swish at its fastest point; the turn gets the music's drop), the sync window (about 45 ms early or 75 ms late is wrong), and the cheap tells: the same file on every hit, whooshes on every cut, everything at one level. The `sound-craft` pack carries it to the music supervisor (`audio.mix`) and the editor (`editing.plan`). In code (0.96): when the library holds several fitting sounds for one effect slot, the program rotates up to three takes instead of playing the same file every time (`M.effectTakes`). Our measured attack (0.41) and meaning-based effects (0.91) already follow its sync and grammar rules.

**motion-video-kit** packages what was learned from 28 launch films and dozens of rounds of critique. Its brain is the Gauntlet: the builder never judges its own work, fresh critics review the actual render, every earlier finding is re-checked item by item, and the biggest gap is fixed first. Its motion grammar: one persistent actor carried through shots, the foreground as the transition, cause before effect, changes of speed, a subject that fills the frame, varied compositions, no frozen time and no text collisions. The `film-gauntlet` pack carries it to the storyboard, the designed shots, the editor and the reviews. The program already measures frozen time (render check, `freezedetect`) and text collisions (drawn-shot layout); the reviews now receive these as directives too (frame scan and script review, below). The second AI as the reviewer of the first is the next step, with the work on both AIs together (0.97).

**ClaudeAnimationBase** is a starter kit for a character animated in p5.js and p5.brush by Claude. Its guide is an animator's brain: read the timing sheet before drawing, something happens in every shot, show instead of labelling, nothing is ever fully still, faces act, anticipation and weight and arcs, overlapping action without twinning, key poses first, transitions that come from the story, one colour arc for the film, depth by overlap, light that adds, and a contact-sheet review of one's own work. These became most of the `animation-craft` pack, bound to the storyboard, the designed shots and the reviews. p5.brush itself has been our natural-media brush since 0.41.

**video-talkcraft** turns a talking-head script into an explainer with word-level sync, a shotbook and 108 motion recipes. Its licence (PolyForm Noncommercial) does not allow commercial use, so nothing of its text or code is used. Six of its ideas are restated in our words: annotate each beat by meaning, seven types of shot, three layers per shot, an element budget per frame, cut on the sentence that turns, and bursts of state changes checked in QA.

**autoclip_mvp** cuts long videos into clips: it scores candidate clips four ways and keeps an outline that covers the whole source. Two skills: score a clip four ways (for Shorts ideas and editing), and a full-coverage outline (for research and scripts). Its Bilibili download is not used.

**ffmpeg-skill** teaches an agent to probe, plan, check and look: read the file first, plan the command, check the output by measurement, then look at frames. One skill for the editor and QC. The program's render already works this way (probe, pinned build, checks, contact sheets).

**Remotion** (and its agent skills) read for ideas only, because its licence needs a company licence above three people: frame-based easing and measuring text to fit. Both are already how our drawing engine works (pure functions of time, `TEXT_BOX`); the skills keep the designed shots doing the same.

**threejs-skills** gives current three.js knowledge. One skill: 3D scenes must be seekable by time, never by a running clock, which is the rule our designed shots already follow.

**PixiJS** is a fast 2D renderer. One skill: particles need variety in size, speed and life, never clones. Our engine stays canvas-based; PixiJS is not added as a dependency.

**Synfig** and **OpenToonz** are full 2D animation programs (GPL and BSD). One idea each: bones and joints instead of sliding parts (Synfig), and exposure on twos and threes (OpenToonz's xsheet), which our `drawing.cadence` already offers.

**ghost-editor** was re-read; its 25 skills (pacing, emphasis, transitions, captions of an editor) have been in the editor since 0.89 and are now directives there.

**flow-mcp** drives Google Flow (a video generator) by clicking its web page in its own Chrome window with the owner's Google sign-in. It is not integrated: it automates a consumer website rather than an API, its author warns it may break Google's terms, and it has no licence. If the owner wants AI video clips, an official API is the way (a connection like the others, inside budgets).

## The earlier repositories, re-read: where each brain lives now

| Repository | Its brain | Where it lives in the program |
|---|---|---|
| OpenMontage (AGPL, read only) | editor's decisions, orchestration, reviewer rubric, lesson to skill loop | editing-brain skill drafts (160), `editing-brain.js`, `director.js`, the Skills Engine's learning loop |
| HyperFrames (Apache-2.0) | compositions, transitions, captions, mix doctrine | Motion Graphics engine (`atelier.js`, vendor/hyperframes), `transitions.js`, `captions.js`, `skills/hyperframes.json` |
| youtube-agent-skill (MIT) | hooks, packaging, retention scores | `craft.js`, `skills/youtube-agent.json` |
| claude-video (MIT) | scene cuts, clean stock windows, frame budgets | `R.sceneCuts`, `cleanWindow`, the unplanned-cuts check, `skills/claude-video.json` |
| palmier-pro, capcut-cli, flick, lossless-cut, open-higgsfield, Omni-Video, hand-drawn canvas | timeline model, operations with receipts, dead air, word-boundary cuts, motion templates | `editing-brain.js` operations, `motion-templates.js`, editing-brain drafts |
| motionmaxxing (Apache-2.0) | measured motion curves | `K.ease`, `skills/motion-craft.json` |
| lemo-opuscar | film looks, evidence tools | `FILMS`, `quote`/`document`/`gauge`/`loupe`/`ruler`, `skills/film-craft.json` |
| p5.brush (MIT) | natural media | `K.brush`, `K.wash` |
| video-use, watch-video, caption-ai, claude-code-video-toolkit, skill-creator | perceptual zoom, motion blur, cadence, caption themes, skill quality | `K.zlerp`, `drawing.motionBlur`, `drawing.cadence`, `captions.theme`, `skillQuality`, `skills/studio-craft.json` |
| whiteboard-animation-vi (CC0), SRT Whiteboard (MIT) | line order, colour regions, brush route | `drawn-reveal.js`, `skills/whiteboard-craft.json` |
| html-anime (MIT) | cel paint, colour scripts, drawings on twos, dip cut | anime finish, `dip-colour`, `skills/anime-craft.json` |
| claude-drawing-skill, anidoodle, MotionClone (two) | drawing craft, doodle animation, motion ideas | collage and pixel finishes, `drawing-craft`, `anidoodle-craft`, `motion-clone` packs |
| claude-youtube (MIT) | growth, packaging, channel types | `skills/youtube-growth.json`, music lessons |
| VoiceStudio (AGPL) | local test voices | a separate program reached over loopback (`voice.js`), never bundled |

What the re-read changed: the skills of all these packs now reach the models as directives (0.95), and three jobs that had no skills now have them (0.96): Claude's or ChatGPT's frame scan (`qc.review`), the partner's script review (`script.review`) and, through the new packs, the designed shots and paintings get the design and animation brains.

## Vendored for Claude Code

`.claude/skills/frontend-design` (Anthropic, Apache-2.0, with its LICENSE.txt) helps Claude Code when it changes the program's pages. `.claude/skills/control-room-release` is our own: the release routine of this repository (branch, checks, tests, docs, pull request, merge, verification). They are instructions for the coding assistant, not part of the program.
