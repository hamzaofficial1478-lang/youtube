# The AI team: Claude and ChatGPT together (0.53)

Owner request, 2026-10-22: use the ChatGPT subscription (its tokens) for pictures and scene drawing; when Claude and
ChatGPT are both connected, the one best at pictures makes the pictures and the two write scripts together; when only
one is connected, that one does everything; editing stays with Claude Opus 5.5.

## 1. How ChatGPT is reached

The owner has a ChatGPT subscription, not an OpenAI API key. OpenAI's Codex app (Microsoft Store) ships a command-line
program signed in with the owner's ChatGPT account. `ai.js` `CodexCli` asks it like the Claude Code connection asks
Claude Code:

- `codex exec --json --ephemeral --skip-git-repo-check --ignore-user-config -s read-only -C <empty temp folder> -o <answer file> [-m model] [-c model_reasoning_effort=...] -`
- one request per click, never retried by itself; an empty read-only working folder; the owner's own Codex settings
  are left out; no session is kept; `OPENAI_API_KEY`/`CODEX_API_KEY` are removed from its environment so only the
  ChatGPT sign-in is used;
- found through `CODEX_PATH`, then `PATH`, then the Store package (`Get-AppxPackage OpenAI.Codex`), once per run;
- usage counted = input not served from Codex's cache + output + reasoning (every request carries about 16k tokens
  of Codex's own instructions, almost all cached);
- errors name the cause: not signed in, usage limit reached, no answer (usage may still count).

Pictures use ChatGPT's image generation through the same program: Codex saves the image under
`CODEX_HOME/generated_images/<thread id>/`; `CodexCli.image` copies the newest one out. A live test (2026-10-22)
painted a 1672x941 picture for about 11k uncached tokens.

The connection is a connector slot of provider `chatgpt` (keyless, like `claude-code`). It names one GPT model
(any slug Codex lists, e.g. `gpt-6.1-sol`) or leaves it empty for Codex's own default; its test asks one tiny question.
The program never reads the Codex sign-in file.

**Signing in (0.69, owner review 2026-10-29).** Saving a ChatGPT subscription connection starts Codex's own sign-in
(`CodexCli.login`: `codex login` with its own home and no stray key), which opens ChatGPT's sign-in page in the browser;
the card shows the state ("waiting", "testing", done or failed with the reason) and the page's link in case the
browser did not open (kept in memory only, never in a message). When the sign-in finishes, the connection test runs by
itself (one tiny question). "Sign in with ChatGPT" / "Sign in again" on the card starts it again (one at a time, 10
minutes at most). The connector list says "OpenAI API key (paid per use; not the ChatGPT subscription)" for the API
and "ChatGPT subscription (sign in with ChatGPT, through the Codex app)" for the plan. The Claude subscription still
signs in inside Claude Code itself.

**Claude Code refusals (0.73, owner test review 2026-10-30).** A script job said "Claude Code is not logged in" and
"interrupted · usage unknown" while the connection showed connected. Two causes: the connection test asked only the
small support model, while jobs use the AI team's models (Opus 5.5 for scripts), and any Claude Code error whose text
mentioned "login" was shown as a sign-in problem (Claude Code's message for a model the plan does not include ends
with "run /login"). Now `claudeCodeRefusal` shows what Claude Code said and names the case: a model the plan cannot use
("choose a model your plan includes"), not signed in ("open a terminal, run claude, type /login"), a usage limit, or an
answer longer than the output limit. These are refusals before anything was generated (`nothingUsed`): the job fails
plainly, its token reservation is released and no paid attempt is used. Only other errors after Claude Code started
keep "usage unknown". A sign-in refusal also marks the connection test failed, so Connections stops saying connected.
The Claude Code test now asks every model the connection is used with (one tiny question each). Codex and the Claude
API name their refusals the same way.

**Scripts in Content Studio (0.73).** A draft without a script shows two choices. "Ask AI to write" uses the team as
set in section 3: both AIs together (draft, review, revision) when both are connected and the roles say together,
otherwise the one connected does all of it; the card says which. "Add my script" opens the draft with the script box:
type or paste it, or attach a .txt, .pdf or Word .docx file (`documents.js`, 10 MB at most; scanned PDFs without text
and old .doc files are refused with what to do). The hook takes the script's first sentence when it is empty.

**Connections that sign in and say why (0.74, owner report 2026-10-31: the ChatGPT test failed "after a while", the
Claude test failed and Save did nothing).**

- *ChatGPT signed out after a while.* ChatGPT's sign-in is refreshed with a token that works only once. The program
  and the Codex app shared one sign-in file, so whichever refreshed second was signed out. The program now keeps its
  own ChatGPT sign-in (`~/.control-room/codex`; `CONTROL_ROOM_CODEX_HOME` moves it), never the Codex app's. After the
  update, click "Sign in again" on the ChatGPT card once. A sign-in that ran out is named as such ("Click Sign in again").
- *Claude "not logged in" while signed in.* The program threw away everything Claude Code wrote on its error output,
  so an old Claude Code that did not know a flag, or one refusing to start inside another Claude Code session (the
  program started from a Claude Code terminal), looked like a missing sign-in. Now the CLIs start with a clean
  environment (no variables of a parent Claude Code or Codex session, no API keys), their error output is read, and
  the message says what happened: update Claude Code (`claude update`), start the program from its own shortcut, or sign in.
- *Free checks first.* Both tests first ask the app, without asking the AI anything, for its version and whether it is
  signed in (`claude auth status`, `codex login status`). A Claude Code signed in with an Anthropic Console key (billed
  per use) is named instead of silently using it. Then each model gets its one tiny question.
- *Save now does something.* Saving a Claude subscription connection checks the sign-in: signed in, it tests by
  itself; not signed in, Claude Code's own sign-in opens in a window of its own (Claude's page in the browser; paste
  a code into the window if it asks) and the card waits, checking every few seconds, then tests. "Sign in to Claude"
  on the card does the same at any time.
- *Found where it is.* Claude Code installed with npm (`claude.cmd`) is found and run through its JavaScript entry;
  both apps are looked up again when they move (a Store update of the Codex app changes its folder).
- *Errors on their card.* A test's result and error stay on that connection's card (they used to appear in the
  YouTube research panel, out of sight), and cards test independently.

## 2. The team and its roles

`Ai.team()` reads the tested Claude connection (API key or subscription) and the tested ChatGPT connection, and the
owner's roles (table `ai_roles`, revisioned, set on the Connections page in the "AI team" card):

| Role | Default | Choices |
|---|---|---|
| Pictures and painted scenes | ChatGPT paints them | ChatGPT paints / Claude draws |
| Scripts | Both write together (when both are connected) | together / one AI |
| Who writes the draft | Claude writes, ChatGPT reviews | Claude / ChatGPT |

- Only one connected: it does everything (pictures fall back to whoever is connected; scripts are written alone).
- Scene planning, the story director, the continuity review, frame design, voice direction, packaging and editing
  run on the connection the owner picks for the job (Claude first in every picker), with Claude's main model
  (Opus 5.5) by default.

## 3. Scripts written together

`writer.js` `generateScript(..., {partner})`:

1. The writer drafts and the draft is checked (`validateCandidate`).
2. The partner reviews it as a demanding editor: the first 15 seconds, the promise, order of points, re-hooks, concrete
   detail, the payoff, one call to action, claims against the sources, evidence the draft missed. JSON only:
   verdict, keep, fixes, hooks (3 stronger openings), facts, additions (`readReview` drops anything malformed).
3. The writer revises with the review; the revision is checked again.

A partner that fails keeps the checked draft (`review.status: partner_failed`); a revision that breaks a rule keeps
the checked draft with the review beside it (`revision_failed`). The job reserves three times the family's script
limit; usage is the sum of the three calls (`model: "writer + partner"`). The Content Studio shows "Reviewed by
ChatGPT/Claude, revised by …" with the fixes, hooks and claims. A partner that changed or failed its test since the
job was queued is left out and the writer works alone.

## 4. Painted pictures

When ChatGPT has the pictures, every paid picture of a drawn shot is painted instead of traced:

- The planner is told (PAINTED PICTURES line in `Sk.promptGuide`). A picture may be `"backdrop": true`: the painted
  place behind the whole shot (place only, no people, no words; the program draws characters, words and effects on
  top). A shot holds one backdrop beside its one picture.
- `scene-room.illustrate` reserves `PAINT_TOKENS` (30,000) per painting against the family's monthly tokens, asks
  ChatGPT once with `Il.paintPrompt` (style per engine and look, the palette, the story's era and place, the
  narrator's words), checks the file is a real PNG/JPEG/WebP (`keepArt`) and keeps it in the data folder as
  `generated-art/<sha256>.<ext>`. The drawing stores only the SHA-256 (`picture.image`). A retry of the same plan job
  reuses the kept painting (`plan_pictures` key `paint:...`).
- A painting that fails: a picture card is drawn by Claude as before; a backdrop is left out (never traced).
- Rendering: `scene-room.artImages` reads each named file and checks its SHA-256 (a missing or changed file stops the
  shot with a 409); the drawing page receives the images as data and decodes them before the layout (`window.DIMG`).
  The engine draws backdrops first, full-frame and 6% larger than the frame so camera moves never show an edge;
  picture cards wipe in (hand-made looks) or land (motion designs). `drawn-scene/26`.

OpenAI image generation through an API key stays the montage `ai-image` source.

## 4b. Pictures in the look, models per job (0.56)

- Painted pictures follow the visual rules of the shot's look (DRAWN-SCENES.md section 29): a Stickman video gets flat
  cartoon places, a footage documentary gets photographs. The first painting that passes is the video's style key and
  is attached to every later painting; the plan's AI checks each painting against the rules before it is used and a
  miss is painted once more.
- The AI team card chooses a Claude model per kind of job (writing, planning and checks, editing, pictures, voice
  direction, packaging, language editions, research): `ai_roles.models`, `MODEL_GROUPS`, `MODEL_WEIGHT` (best quality /
  fewer tokens / fewest tokens). A job without a choice uses its connection's main or support model; ChatGPT jobs use
  the GPT model of their connection.

## 4c. How a script is built, and watching it written (0.77)

The owner's test (2026-10-31) scored a ChatGPT hook at 25: the "hook" was 82 words, and the writer had never been told
what a hook is or in which order a script goes, although the program measures exactly that afterwards. Now
`writer.js` `SCRIPT_CRAFT` goes to the writer in every request (alone or together), in this order:

1. **Hook**: the hook field is only the first one or two spoken sentences, 9-24 words, and the script starts with it.
   No greeting or channel name; "you" in the first six words, a number, name or date, what the viewer risks or gains,
   and a question the video answers.
2. **Promise** in the first minute: what the viewer will know by the end.
3. **Value**: one beat per paragraph, strongest first, a concrete detail at least every 100 words, and at least 4 in
   10 paragraphs ending on a pull forward (a question, a turn, a hint).
4. **Re-hook** between a quarter and just past half way.
5. **Payoff**: the last paragraph answers the hook, reuses its key word, and pays off.
6. **One call to action**, after 60% of the script.

These are the rules `craft.scoreHook` and `retention.check` read, so the writer aims at what it is measured on. When
two AIs write together, the second writer judges the draft against them and gets `craftNotes` (what the free checks
found: the hook score with its weakest part, and each failed retention check); the revision gets the same notes and
fixes every one. The approved skills already reach both writers through the skill brief.

The script appears as it is written (`live.js`): the job's steps (first draft, the second writer's review, the final
version), a bar, how long it has run, when it last showed a sign of life, and the newest words. Claude Code streams its
answer (`--include-partial-messages`, only for jobs that show progress); Codex sends its answer whole, so a ChatGPT step
shows signs of life and thinking until the answer lands. Under the AI's script, "Edit draft" opens it for changes and
"Approve script" makes it the approved script in one click after the owner confirms the rights (`approveCandidate`).

## 5. Tests

`tests/ai-team.test.js` (fake Codex in `tests/fake-codex.js`: isolation flags, no stray key, usage, errors, image copy;
the team with one and two AIs and the owner's roles; the script duo with partner and revision failures; paint
prompts and picture validation) and `tests/scene.test.js` "painted pictures (0.53)" (backdrops kept by checksum, a
broken painting drawn by Claude, a failed backdrop left out, a changed file refused). No test uses either subscription.
