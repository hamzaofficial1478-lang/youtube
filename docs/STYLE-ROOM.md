# Style Library & Assignment Room (Room 03)

Version 0.7 makes Room 03 of the Production Panel live. It owns the editing-style library, the human review of every style revision, and the explicit decisions that tie a style to a channel family and its channel editions. It records decisions only: no renderer, visual provider, asset library or publishing permission becomes active here.

## What the room does

1. **Library.** Five launch profiles are seeded on first start: Stickman Sketch Explainer, Hand-drawn Canvas, Motion Graphics, Documentary Montage and Cinematic Hybrid. You can also create a custom style from scratch or duplicate any style as a derived style.
2. **Immutable revisions.** Every change creates a new draft revision. A revision's specification can never be edited or deleted; SQLite triggers refuse it. Each revision shows exactly what changed compared with the previous one.
3. **Human review.** A draft cannot be assigned until a named reviewer approves it and confirms three checks: the creative settings, the rights policy (visual sources, licensed music, AI disclosure) and the originality guard.
4. **Family default.** One approved revision is assigned to a channel family. Every configured channel edition inherits it.
5. **Channel override.** An additional channel (never the primary master) can get its own style. You must confirm that this creates a separate visual production, cost plan and approval trail for that channel.
6. **Approved fallback.** You can approve a second style as a fallback. It is never used automatically; every use on a failed render still needs your explicit decision on that job (milestone P05).
7. **Retire and revoke.** Retiring an assigned revision or revoking an assignment blocks the style handoff. Nothing switches to another style by itself.
8. **Handoff.** Each family exposes one style handoff: ready only when the family default is approved, not retired and compatible with the family format, and every channel override is valid. Room 04 (Scene & Visual) will refuse to start without it.

## Style specification

Every revision is a complete, validated production contract:

| Section | Settings |
|---|---|
| Identity | Name, summary, best-fit content, supported formats (long-form and/or Shorts) |
| Canvas & pacing | Frame rate; 16:9 long-form resolution; 9:16 Shorts resolution; shortest/longest shot; longest hook shot; longest static hold |
| Transitions & motion | Allowed transitions (a straight cut is always required), default transition, longest transition; camera moves, motion intensity, easing |
| Typography & palette | Heading and body fonts, most words on screen, text case, minimum text height; background, primary, accent and text colours (text must reach 4.5:1 contrast) |
| Captions | Burned-in, sidecar or both; characters per line; lines; position; active-word highlight; safe area |
| Visual sources | Stock video, stock images, AI images, AI video, generated graphics, maps & diagrams, public-domain archive; primary source; AI-disclosure policy (AI video always requires disclosure); character consistency. Licence evidence is always required. |
| Music & sound | Music moods, ducking, target loudness, true-peak ceiling, sound-effect usage. Licensed music only. |
| Renderer & QC | Renderer adapter; longest black, longest frozen frame, shortest and longest scene, contact-sheet interval |
| Originality guard | Reference share (owner rule: at most 30%), prohibited techniques |

The chosen renderer must support every format, frame rate, transition and camera move in the specification, otherwise the revision cannot be saved. All renderers report `not_implemented` until their milestone passes real fixtures.

## Renderer adapters

| Adapter | Used by | Milestone |
|---|---|---|
| FFmpeg montage | Documentary Montage | **P05 first proof target** |
| FFmpeg sketch compositor | Stickman Sketch Explainer | after P05 |
| Hand-drawn canvas frames | Hand-drawn Canvas | after P05 |
| Motion graphics compositor | Motion Graphics | after P05 |
| Cinematic hybrid | Cinematic Hybrid | after P05 |

**Decision (2026-10-04):** Documentary Montage is the first style to become executable, because the owner's visuals come from stock libraries and AI generation, and an FFmpeg montage of stock clips and stills with Ken Burns moves is the most dependable first renderer. The owner decides which channel uses which style.

## Mix of ticked looks (0.62)

Owner request 2026-10-28: inside one engine, the owner chooses which looks a video mixes. A style whose look is
"mix" (Stickman `drawing.look`, Whiteboard `drawing.board`, Documentary `drawing.design`) may tick two or more of
that engine's looks (`drawing.looks`, `drawing.boards`, `drawing.designs`); a style whose film look is "choose" may
tick the film looks Claude chooses from (`drawing.films`). Nothing ticked means every look, as before. The ticks
are part of the immutable revision, so they need the same named approval.

- `engines.js` `engineScope` carries the ticks (only when there are some) and `promptGuide` lists only those
  looks to the planner and the story director ("this video mixes only the ... the owner ticked").
- `sketch.js` `validate` keeps a shot's own look inside the ticks: Claude's plan is repaired to the first
  ticked look with a named warning, an owner edit naming another look is refused.
- A shot that names no look draws the first ticked look (`drawn-engine.js`, `drawn-kit.js`, paid pictures).
- The visual rules given to the planner (`scene-room.js` `dnaKeys`) are those of the ticked looks only.
- The style editor shows the ticks under each look menu while it says Mix (or "Claude chooses" for film looks);
  the style card lists them.

## A channel's editing style from its page (0.62)

Owner request 2026-10-28: set a channel's engine and looks without walking through the rooms. The channel page's
"Editing style" step (and a new family, right after it is created) opens one window: the editing engine (every
style of the library, the channel's own copies included), that engine's looks to tick (one = that look, two or
more = a mix of only those), the film looks (none, one, or two or more for Claude to choose from) and "All
settings" (the full style editor). It saves:

- **For this channel only:** the channel's own copy, named "<channel> · <style>" (a derived profile of the chosen
  style); saving again revises that copy and keeps its own settings.
- **For every channel using this style:** a new revision of the chosen library style. Other channels stay on
  their revision until it is assigned there.

Then it approves the revision under the owner's name with the same three confirmations as Room 03, and assigns it
as the family default, through Room 03's own routes. An unchanged spec is not revised again; a revision made by a
failed try is reused.

## Competitor learning (30 / 70)

The owner supplies 3-10 competitor channels per family (milestone F07, done). Milestone R05 (Competitor Intelligence) will study them and may propose a **derived style revision** as a draft. Such a draft still needs the normal human review, keeps the reference share at or below 30%, and must not copy another channel's wording, footage, thumbnails, characters or signature look.

## Invalidation

When an assigned family default or override is changed, revoked, or its revision retired, every approved script in that family gets dependency-ledger entries for `scene_manifest`, `editing_timeline`, `captions`, `packaging` and `render`. The first assignment invalidates nothing. History is kept; authority is revoked.

## API

| Method and path | Purpose |
|---|---|
| `GET /api/state` → `styles` | Vocabulary, renderers, profiles with revisions/diffs/usage, assignments and per-family handoffs |
| `POST /api/styles` | Create a custom or derived style (draft r1) |
| `POST /api/styles/:profileId/revisions` | Create a new draft revision (`expectedRevision` guards stale tabs) |
| `POST /api/style-revisions/:id/approve` | Human approval with reviewer name and three confirmations |
| `POST /api/style-revisions/:id/retire` | Retire a revision with a reason |
| `POST /api/families/:id/style-assignments` | Assign a family default (`scope: family`) or channel override (`scope: channel`) |
| `POST /api/style-assignments/:id/revoke` | Revoke an assignment |
| `POST /api/style-assignments/:id/fallback` | Approve or clear a manual-only fallback |

All writes require the per-process local token, the current family revision where relevant, a person's name and a reason.

## Data

`style_profiles`, `style_revisions` (immutable spec + SHA-256 hash, review and retirement records) and `style_assignments` (scope, locale, revision, decision, fallback, supersede chain). A partial unique index allows only one active assignment per family/scope/locale.

## Verification (2026-10-04)

- `tests/style.test.js`: 9 checks covering seeding, spec validation and renderer contracts, immutability triggers, diffs, stale-editor protection, the approval gate, assignment history and invalidation, inheritance and overrides, manual-only fallbacks, retirement/format-change blocking and the HTTP routes with token checks.
- Full suite: 112 tests, 110 passed, 2 skipped (Windows-only DPAPI checks). Run on Node 22 in the build sandbox; re-run on the owner's Node 24 machine.
- Browser: complete approve → assign → override → fallback → new revision → spec viewer flow driven in Chromium at 1440 × 1400 and checked at 390 × 844 (no horizontal page overflow, no console or CSP errors).
