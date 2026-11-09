# How the skills direct the models (0.95)

Owner review 2026-11-09: "the program was good at describing but failed at directing the models. It saved the skills and never led the models with them. The program is the medium: it should lead the models on how to work and how to give their output."

## What was wrong

The Skills Engine chose the right skills for each job (0.74), rotated them between attempts (0.94) and recorded every use. But every room put the chosen skills inside the **data** message, as JSON beside the script, the plan and the evidence. The instructions of the same request say that message is untrusted data and that the model must never follow instructions inside it. That rule protects the program from words in scripts, titles and web pages. The model obeyed it, so it read the owner's skills as material, not as orders.

The language editions job was worse: its prompt printed the brief as `[object Object]`, so the translator saw no skills at all.

## What happens now

Every AI request goes through one function, `Ai.complete`. Since 0.95 that function first calls `Direct.lead` (direct.js):

1. It finds the skill brief in the data message. This works when the data is plain JSON, when it is labelled ("UNTRUSTED CONTROL ROOM DATA:" followed by JSON), and when more text follows it, such as a draft.
2. It takes the brief out of the data. The family's open project state stays in the data where it belongs.
3. It adds the skills to the instructions as numbered directives:

```
DIRECTION FROM THE OWNER'S SKILLS (12 directives, D1-D12). These are not data: they are the owner's own reviewed craft rules ...
D1 · Open on the conflict [scene.hook-open]
  When: the first shot
  Do: show the problem first
  Avoid: logos
  Check before you answer: the first frame shows the stakes
...
CITE THE DIRECTIVES: wherever your answer already has a place for a reason, a note or a direction, name the codes you followed there ...
```

4. When the answer comes back, `Direct.cited` reads which codes it named. `Ai.complete` returns them as `directives: {given, applied}`.

Rooms that already put their skills in the instructions use the same directive text: the editor's commands, Claude's pictures, designed (Motion Graphics) shots and language editions. In the script writer, the partner's review and the final revision carry the draft after the data, so writer.js moves their skills by hand. The partner then judges the draft against each directive by its code.

## Where the codes go

- **Storyboard**: each scene's `direction` starts with the codes it follows ("D2, D5: …"). The continuity review runs each directive's checks on the shots. When a shot fails a check, the review redraws it and starts the change's reason with the code it failed ("D4: …").
- **Scripts**: an optional `directives` array of codes. It is never in the script, title or hook, and the program does not keep it in the candidate.
- **Editor, voice, music**: in the reasons and notes those answers already have.
- Codes never go into words the viewer sees or hears.

## What the owner sees

- **Skills → Usage**: each job says how many of the directives it was given the AI cited, and ticks them.
- **Content Studio**, "Skills chosen for this video": the same ticks, job by job.
- **Room 04**, "Skills that directed this storyboard": the key from D1 to Dn, with each skill's name and a tick for each one the AI cited.

The program records the cited skills in `skill_usage.applied` for the storyboard (map, parts, review), Claude's pictures, scripts, the editor, voice direction and the music score.

## What it does not prove

A cited code means the AI says it followed that directive. The program's own checks are what verify the result: scene continuity, detailing, the review, the craft checks and the critic. The directives make the skills the model's instructions. They do not replace those checks.

## 0.96: the reviews are directed too

- **Frame scan**: the owner's QC skills (`qc.review`) are directives in the scan's instructions. A frame that fails one is reported as a finding whose text starts with the code it fails ("D3: ..."), next to the usual problems.
- **Script review**: the second writer gets the writer's directives (same codes) and then the owner's script-review skills (`script.review`), and judges the draft against all of them.
- **Fixed**: in 0.95 the writer's review and revision tried to move the skills out of their data by reading it as plain JSON, but that data is labelled ("UNTRUSTED CONTROL ROOM DATA:"), so the skills stayed in the data and the review was never told to judge the draft against them. `directed` now reads the data with `Direct.lead`, the same reader `Ai.complete` uses.

## 0.96: no request leaves without the skills

Owner, 2026-11-09: "the skills are for the models. The program should hand them over to whichever model does the job, on any PC, and never keep them to itself."

- **The built-in skills travel with the program.** They are part of the program's files (skills/*.json) and come approved on every PC it is installed on, so a fresh PC directs its models exactly like this one.
- **The gate.** Every AI request passes `Ai.complete`. When a room has already sent its skills, they become the directives (0.95). When a room sent none (the storyboard merge, the trend word suggestions, a niche screenshot read, a style study), the gate itself chooses the approved skills of that kind of job (`GATE_SKILLS`: script, scenes, frames, pictures, editing, voice, review, research, niche, packaging, languages, competitors), by the request's own words, and puts them into the instructions as directives. It never doubles skills a room already gave. These uses are recorded in Skills → Usage as "the program added these skills at the gate".
- **Skills you add.** Skills → "Add skills (folder or .zip)" reads a folder or a .zip (skill-import.js). It keeps only what a model can use: SKILL.md files and their Markdown references, text notes and JSON skill packs. It throws out code (never run), pictures, sound, fonts, office files, nested archives, licences (their name is recorded), read-me files that repeat a SKILL.md, dependency and system folders, and sections such as installation or contents, and shows each one with the reason before anything is saved. Each document is split by its sections into small skills, and each skill is assigned to the jobs its words are about (script writing, hooks, voice-over, scene planning, pictures, motion graphics, editing, captions, music and sound, quality checks, titles, SEO and the research jobs). "Add these skills" with your name approves them at once, and from the next job the program hands them to the model of those jobs.

