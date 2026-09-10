# YouTube Control Room

Version 0.4.0 - planning foundation, protected connectors and Hermes reasoning integration.

The main project lives at [hamzaofficial1478-lang/youtube](https://github.com/hamzaofficial1478-lang/youtube). Existing and future development is committed there. A local checkout is only needed to run and test the application; uploading code to GitHub does not run its server.

## Open the program

Clone this repository (or download and extract its ZIP), then on Windows double-click **Start Control Room.cmd**. It starts a hidden local server and opens the browser. Keep that checkout in place while running. To stop it, use **Stop Control Room.cmd**.

The app opens at http://127.0.0.1:3456. It is local to your computer. Planning requires no account setup, package installation or API key. Optional public YouTube lookup requires your own API key. Node.js 24 must be installed and available on PATH; this computer had Node 24.18.1 during development.

Alternatively, open a terminal in this directory and run:

```text
npm start
```

Use Ctrl+C to stop a terminal-started server. A different local port can be supplied through PORT. The Windows launcher uses 3456.

## What works now

1. Create a channel family with English, Spanish and Italian slots.
2. Set the audience tier, countries, niche hypothesis, format, cadence, locales and budget.
3. Write an original English draft, record a hook/angle and attach evidence with source-rights notes.
4. Submit it for review and approve the exact script version when the required checks pass.
5. Prepare a saved, approximate six-scene planning scaffold and export the content as JSON.
6. Edit and revise safely: changes invalidate old approvals and storyboards; conflicting edits are rejected instead of silently overwriting.
7. Archive/restore families without deleting work, reopen saved data and inspect the build tracker.
8. Save a YouTube Data API key with Windows account protection, then look up a public channel by handle, ID or URL. See [YouTube setup](docs/YOUTUBE-SETUP.md). The connector has fixture coverage; verification with your live project remains pending.
9. Add, edit, test and delete named connector slots. YouTube, OpenAI and ElevenLabs have read-only metadata tests; MCP/Reddit setup slots explicitly report pending adapters. See [Connector guide](docs/CONNECTORS.md).
10. Connect a dedicated, tool-free local Hermes Agent API, queue one evidence-bounded English script job, inspect sourced claims and review its immutable candidate without overwriting or approving the saved draft. Terminal jobs require deliberate, capped retries. The first live factual candidate and source-link UI were verified on 2026-09-10; explicit long-form quality and token-budget gates remain. See [Hermes setup](docs/HERMES-SETUP.md).

The storyboard is **planning only**. Hermes can now propose an English script candidate from saved evidence, but the candidate remains separate until the operator chooses to copy, edit and save it. Competitor research automation, voiceover, translation, rendering, channel sign-in and publishing remain upcoming. Connection cards distinguish a saved key, a tested capability and production authorization.

## Where your work is saved

`data/control-room.sqlite` contains your families, drafts, reviews, jobs and activity. SQLite may keep `-wal` and `-shm` companion files while running. Do not remove these while the app is open. Stop the app before copying the whole data directory for a manual backup.

The exported planning JSON contains the selected draft and its source references; it never includes API keys. Named slot keys are encrypted for your Windows account in the SQLite connectors table. Existing v0.2 keys remain in `data/youtube-key.dpapi`. Other machines/accounts may require key re-entry. Removing a key or slot affects the current local copy; provider revocation and old backups are separate.

## How to continue development

- **docs/BUILD-PROGRESS.md**: detailed completed/remaining process, decisions, tests and limitations.
- **docs/build-status.json**: structured checklist used by the UI.
- **docs/REPOSITORIES.md**: the three supplied repos, pinned revisions, licenses and actual reuse.
- **AGENTS.md**: instructions for future coding sessions.
- **docs/YOUTUBE-SETUP.md**: key setup, security boundaries, live verification and the next research steps.
- **docs/HERMES-SETUP.md**: dedicated Hermes profile, local API connection and reasoning boundary.
- [Detailed PDF blueprint](docs/YouTube_Automation_Program_Blueprint.pdf).
- `scripts/build_blueprint.py`: optional PDF source; requires Python, ReportLab and Windows Calibri/Consolas fonts. It is separate from the dependency-free Node application.

```text
npm run check
npm test
npm run tracker
```

Tests create temporary databases, not demo data in your workspace. This release uses Node's built-in libraries and two inspected MIT upstream helpers; it has no npm dependencies. No upstream scheduler or repository installation scripts run on startup.

## Current architecture

`server.js` handles local requests and a small saved planning queue. `store.js` validates inputs and applies transactional SQLite changes. `public/` contains the interface. `vendor/` holds selected upstream files and license notices. `docs/` keeps the development record. One local process owns the database; move to a multi-worker database design before adding separate worker hosts.

## Troubleshooting

- **Node 24 required:** install a supported Node 24 runtime, then restart the launcher.
- **Port already used:** the launcher reopens an existing matching Control Room instance. If another app owns port 3456, it stops with an explanation instead of terminating that app.
- **Connection refused:** rerun the launcher. Check data/server-error.log after a launcher-started failure.
- **Item changed in another tab:** close the edit dialog, refresh the page, reopen the latest record and reapply your changes.
- **Draft cannot enter review:** the draft card lists missing requirements. Source permissions are your explicit review, not a claim of automatic legal verification.
- **FFmpeg not installed:** this does not prevent planning. Installation and media validation belong to the rendering milestone.

The tests reduce known failure risks; they cannot establish that a program has no bugs. Live provider and channel behavior will need separate verification as those stages are implemented.
