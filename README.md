# YouTube Control Room

Version 0.14.1 - planning foundation, competitor channels per family, review-gated reasoning/research, a human-controlled primary-locale Voice Room, the Style Library & Assignment Room, Competitor Intelligence with per-channel blend picks, the Niche Factory, the Scene & Visual Room, the first assembly proxy render, the Skills Engine and the Editing Room.

The owner's working copy lives in the local program folder (Desktop\YT\youtube). Verified changes are delivered there; [hamzaofficial1478-lang/youtube](https://github.com/hamzaofficial1478-lang/youtube) is updated only when the owner asks for a push. Uploading code to GitHub does not run its server.

## Open the program

Clone this repository (or download and extract its ZIP), then on Windows double-click **Start Control Room.cmd**. It starts a hidden local server and opens the browser. Keep that checkout in place while running. To stop it, use **Stop Control Room.cmd**.

The app opens at http://127.0.0.1:3456. It is local to your computer. Planning requires no account setup, package installation or API key. Optional public YouTube lookup requires your own API key. Node.js 24 must be installed and available on PATH; this computer had Node 24.18.1 during development.

Alternatively, open a terminal in this directory and run:

```text
npm start
```

Use Ctrl+C to stop a terminal-started server. A different local port can be supplied through PORT. The Windows launcher uses 3456.

## What works now

1. Create a channel family and choose one primary content locale plus any optional additional language channels. One-language families are valid; no language trio is mandatory.
2. Set the audience tier, countries, niche hypothesis, format, cadence, locales and budget.
3. Write an original draft in the family’s primary locale, record a hook/angle and attach evidence with source-rights notes.
4. Submit it for review and approve the exact script version when the required checks pass.
5. Prepare a saved, approximate six-scene planning scaffold and export the content as JSON.
6. Edit and revise safely: changes invalidate old approvals and storyboards; conflicting edits are rejected instead of silently overwriting.
7. Archive/restore families without deleting work, reopen saved data and inspect the build tracker.
8. Save a YouTube Data API key with Windows account protection, then look up a public channel by handle, ID or URL. See [YouTube setup](docs/YOUTUBE-SETUP.md). The connector has fixture coverage; verification with your live project remains pending.
9. Add, edit, test and delete named connector slots. YouTube, OpenAI and ElevenLabs have read-only metadata tests; MCP/Reddit setup slots explicitly report pending adapters. See [Connector guide](docs/CONNECTORS.md).
10. Connect a dedicated, tool-free local Hermes Agent API, queue an evidence-bounded primary-locale script job and review its immutable candidate without overwriting the saved draft. Format-specific word/structure gates and family monthly/per-job token ceilings now block unusable or over-budget results. See [Hermes setup](docs/HERMES-SETUP.md).
11. Save family-scoped, dated evidence with explicit permission and analysis labels, then manually prepare zero to three immutable daily topic briefs. Briefs retain source snapshots, confidence, uncertainty, duplicate checks, token usage and deliberate retry history. They are review-only and never create drafts or publishing work. See [Research briefs](docs/RESEARCH-BRIEFS.md).
12. Use the professional per-family Production Panel and complete Voice Room to record narrator rights, delivery direction, pronunciation revisions and character budgets; generate explicitly admitted primary-locale auditions through a tested OpenAI or ElevenLabs connector; inspect real FFmpeg audio evidence; and approve or revoke one exact narration handoff. See [Voice Room](docs/VOICE-ROOM.md).
13. Add 3-10 competitor channels to each family (@handle, channel ID or channel link). The Competitors page studies them (item 15).
14. Use Room 03, the Style Library & Assignment Room, to review five launch editing styles (or your own custom/derived styles), approve exact revisions, assign one default style per family, add deliberate per-channel overrides and approve manual-only fallbacks. Every change is a new immutable revision with a visible diff and a decision trail. See [Style Room](docs/STYLE-ROOM.md).
15. Use the **Competitors** page to record your own observations per competitor, tick what to keep from each link (voice-over, narration, editing, thumbnails, visuals) to build a blend recipe, run an explicit NexLev/YouTube scan against reserved data caps, ask Hermes for a technique blueprint that must pass the 30% reference / 70% original rule and a copy guard, and approve it. An approved blueprint feeds Hermes script guidance, can prefill a narrator profile and can create a new style draft; each still needs your review. YouTube data about other channels is display-only and deleted after 30 days. See [Competitor Intelligence](docs/COMPETITOR-INTELLIGENCE.md).
16. Use the **Niche Factory** to save your own niche ideas, run NexLev discovery (niche overview, similar channels, keyword search, analytics estimates), have Hermes rate each idea on the blueprint rubric (score computed by the program; failed hard filters mean "do not produce"), then shortlist, reject or approve, and create a new family from an approved niche. See [Niche Factory](docs/NICHE-FACTORY.md).
17. Use Room 04, the **Scene & Visual Room**, to turn an approved script, its approved narration and the family style into a revisioned scene plan (free narration split or Hermes scene director), edit scenes and shots with stable IDs, find visuals from Pexels and Pixabay (24-hour cached searches, licensed downloads with checksums and ffprobe evidence) or generate AI images with OpenAI within a monthly budget, then approve the whole board with rights and AI-disclosure decisions. See [Scene Room](docs/SCENE-ROOM.md).
18. In Room 05 (Editing Room), check and pin your FFmpeg build, then render the **assembly preview**: a 360p proxy of the approved board on the approved narration with Ken Burns stills, held or trimmed clips and the style's transitions. Every proxy gets length, frame, audio, black-frame and frozen-picture checks, a contact sheet and a render manifest with checksums and commands; you record the style-proof verdict. See [Render proof](docs/RENDER-PROOF.md).

19. Open the **Skills** page to read the program's operating knowledge: 344 skills taken from your main-brain documents (Precision OS, the YT Empire Builders library and the CB YT AI Mastery bundle), from the editing research and from two YouTube repositories (youtube-agent-skill and HyperFrames), each written in our own words. They all arrive as **drafts** and change nothing until you approve that exact revision. Channel and niche profiles are marked "pin to a family": they only reach a family you pin them to. You can add your own skills, import or export a pack, pin or block a skill for one family, record LOCKED/ACTIVE/OPEN/REJECTED decisions per family, and review the lessons the program raises from its own blocked scripts, rejected scene plans and style proofs. A lesson you approve becomes another draft, never a live rule. See [Skills Engine](docs/SKILLS-ENGINE.md).
20. In **Production → Room 05 · Editing**, press **Draft the edit**. The editing brain measures the pauses in the narration and cuts, times and moves every shot with a written reason, proposes graphics (numbers, quotes, dates, your title card at a turn, and animated charts, timelines, lists, comparisons and process diagrams drawn from the script's own data), and the critic lists anything boring, lazy or amateur with a fix. Change any decision, redo one scene, undo, then **Render this edit** and record the style-proof verdict. Run the FFmpeg readiness check again once after updating. See [Editing Room](docs/EDITING-ROOM.md).
21. **Captions and YouTube craft (0.14).** Every new edit carries captions timed on the narration's pauses: they are burned into the render (bottom band on 16:9, above the Shorts buttons on 9:16), can be switched off as an edit change, and download as an SRT file for YouTube. Under the edit you also get draft **YouTube chapters**, up to five **Shorts** hiding inside a long video, and a reader for a **YouTube Studio retention export** that names the hook leak, the cliffs (with what the narration said) and one fix. In the Content studio every draft shows a **Craft check**: a hook score with its weakest point, a title check and a thumbnail-text pairing check. In a family's settings you can add its **writing voice** (who one video talks to, words it never uses, its own phrases, claims it refuses); Hermes writes in it and blocks never-used words. Competitor scans now show each video as a multiple of its channel's median and the hook formula its title uses.

The storyboard is **planning only**. Hermes can propose a quality-gated candidate in the family’s primary locale and review-only topic briefs from operator-approved evidence. Script candidates remain separate until the operator copies, edits and saves them. Evidence collection is manual. Voice auditions are explicit, potentially billable actions and still require complete human listening and approval. Optional localization into selected extra locales, visual generation, editing, rendering, channel sign-in and publishing remain upcoming.

## Where your work is saved

`data/control-room.sqlite` contains your families, drafts, evidence, immutable briefs/candidates, voice profiles, audition provenance, cost ledgers, approvals, jobs and activity. Generated narration is stored beneath `data/voice-artifacts/`. SQLite may keep `-wal` and `-shm` companion files while running. Do not remove these while the app is open. Stop the app before copying the whole data directory for a manual backup.

The exported planning JSON contains the selected draft and its source references; it never includes API keys. Named slot keys are encrypted for your Windows account in the SQLite connectors table. Existing v0.2 keys remain in `data/youtube-key.dpapi`. Other machines/accounts may require key re-entry. Removing a key or slot affects the current local copy; provider revocation and old backups are separate.

## How to continue development

- **docs/BUILD-PROGRESS.md**: detailed completed/remaining process, decisions, tests and limitations.
- **docs/build-status.json**: structured checklist used by the UI.
- **docs/REPOSITORIES.md**: pinned source revisions, licenses, static production-reference reviews and actual reuse.
- **docs/PRODUCTION-ROOM.md**: the Production Panel, ten rooms, five launch editing styles, artifact flow, mandatory gates, repository decisions and integration order.
- **AGENTS.md**: instructions for future coding sessions.
- **docs/YOUTUBE-SETUP.md**: key setup, security boundaries, live verification and the next research steps.
- **docs/HERMES-SETUP.md**: dedicated Hermes profile, local API connection and reasoning boundary.
- **docs/RESEARCH-BRIEFS.md**: evidence eligibility, daily brief workflow, schema, budget and safety boundaries.
- **docs/VOICE-ROOM.md**: voice identity, provider, spending, real-audio validation, approval and downstream-handoff contract.
- **docs/STYLE-ROOM.md**: style specification, review gate, assignments, overrides, fallbacks, renderer contracts and the first executable style decision.
- [Detailed PDF blueprint](docs/YouTube_Automation_Program_Blueprint.pdf).
- `scripts/build_blueprint.py`: optional PDF source; requires Python, ReportLab and Windows Calibri/Consolas fonts. It is separate from the dependency-free Node application.

```text
npm run check
npm test
npm run tracker
```

Tests create temporary databases and audio fixtures, not demo data in your workspace. This release uses Node's built-in libraries plus the locally installed FFmpeg/ffprobe executables for media validation; it has no npm dependencies. No upstream scheduler or repository installation scripts run on startup.

## Current architecture

`server.js` handles local requests and saved queues. `store.js` validates inputs, provenance, approvals and transactional SQLite changes. `hermes.js` owns script quality and the fixed reasoning boundary; `research.js` owns the exact daily-brief contract; `voice.js` owns fixed-origin narration adapters, artifact assembly and real-audio validation. `style.js` owns the style library, immutable revisions, assignments and renderer contracts. `public/` contains the professional per-family Production Panel, the Voice Room, the Style Room (`style-room.js`) and locked contracts for later rooms. One local process owns SQLite; move to a multi-worker database design before adding separate worker hosts.

## Troubleshooting

- **Node 24 required:** install a supported Node 24 runtime, then restart the launcher.
- **Port already used:** the launcher reopens an existing matching Control Room instance. If another app owns port 3456, it stops with an explanation instead of terminating that app.
- **Connection refused:** rerun the launcher. Check data/server-error.log after a launcher-started failure.
- **Item changed in another tab:** close the edit dialog, refresh the page, reopen the latest record and reapply your changes.
- **Draft cannot enter review:** the draft card lists missing requirements. Source permissions are your explicit review, not a claim of automatic legal verification.
- **Generation is budget blocked:** increase the family's explicit monthly or per-job token ceiling, or wait for its next local calendar month. Dollar budget and token ceilings are separate fields.
- **FFmpeg not installed:** planning still works, but Voice Room auditions remain blocked because returned audio cannot pass the mandatory local validation gate.

The tests reduce known failure risks; they cannot establish that a program has no bugs. Live provider and channel behavior will need separate verification as those stages are implemented.
