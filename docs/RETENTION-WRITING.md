# Retention writing (S03, 0.51.0)

Owner request (2026-10-21): use the attached screenshots to make the program stronger at hooks and script writing, at
"what audience and viewers love to watch", and at making them sit and watch (higher retention).

## The screenshots, turned into skills (`skills/retention-craft.json`, 16 drafts)

Each skill restates a technique in the program's own words and names its source. The sources:
- Kallaway Marketing's script-structure carousel;
- the HOOK / VALUE / SOLUTION / CTA reel framework (aashrayy0, aikathekedaar);
- Paul Hilse's five prompts (shared by aiautomationchannels);
- the owner's own request.

The pack has five groups of skills:
- **Structure:**
  - `script.retention-skeleton`: hook, then a lock-in, then the two best points, a re-hook, the rest and one aligned
    call to action;
  - `script.three-to-six-points`;
  - `script.best-first`;
  - `script.rehook-after-two`;
  - `script.point-maps-to-objective`: name each point, then one or two sentences on why it serves the promise.
- **Long-form retention:**
  - `hooks.cold-open-curiosity-gap`: a specific gap in the first 15 seconds with no intro, then the promise;
  - `script.escalating-beats-cliffhangers`: 3-5 growing beats, each ending on a small cliffhanger;
  - `script.payoff-ties-to-hook`;
  - `script.specificity-over-vague`.
- **Short form and calls to action:**
  - `script.hook-value-solution-cta`;
  - `script.one-cta-matched-to-goal`: one ask, chosen from the goal (followers, comments, saves, shares, leads).
- **Research and strategy:**
  - `analytics.retention-breakdown`: how to study a script that held viewers;
  - `niche.underserved-finder`;
  - `ideas.title-promise-differentiator`: a title under 60 characters, the promise, and why click it over the
    competitor's video;
  - `strategy.revenue-beyond-adsense`.
- **The viewers:** `audience.viewer-model`: who watches, wants, pains, why they stay, why they leave.

Like every builtin skill, they arrive as **drafts** and reach Claude only after the owner approves them by name. One
review approves the whole pack: Skills → Packs → "Retention craft". Once approved, they reach:
- the script writer (`script.candidate`);
- hooks;
- topic ideas from trends (`ideas.titles`);
- the niche go/no-go (`niche.evaluate`).

## The retention check (`retention.js`, advice only)

Every draft in the Content Studio shows **"Will viewers stay?"** in its craft check, with up to seven plain checks:

| Check | Passes when |
|---|---|
| No intro in the first 15 seconds | The first ~38 words (15 s at 150 words a minute) have no greeting or channel intro ("welcome back to", "hey guys", "in this video", "don't forget to subscribe"). |
| A promise in the first minute | The first ~150 words say what the viewer will get ("by the end", "you'll learn", "here's why"). |
| Specific numbers and names | At least one number or name (a capitalised word inside a sentence) per 100 words. |
| Sections end by pulling forward | At least 40% of the sections before the last end on a question, a turn ("but", "until", "here's where") or a hint of what comes next. |
| A re-hook before the middle | A sentence between a quarter and a little over half of the script reopens curiosity. |
| The ending answers the hook | The last section shares a meaningful word with the hook. |
| One call to action, at the end | Exactly one ask ("subscribe", "comment below", "link in the description"), after the payoff. |

The check reads English only, as the craft checks do. It needs at least 60 words. It never blocks a draft: it names what
to look at again, the way the hook score does.

## The viewer study travels to the family

When an approved niche creates a family, the family form's audience field also gets two lines from the go/no-go:
- what keeps the viewers watching;
- what makes them leave.

The niche field gets "How we win". The script writer reads the family's audience, so these lines reach every script of
that family.

## Checked

- `tests/retention.test.js`:
  - a script with a cold open, a promise, specifics, pulling sections, a re-hook, a payoff and one late ask passes all
    seven checks;
  - a greeting, no promise, vague words, flat sections and three asks are each named;
  - other languages and very short drafts are not judged;
  - a name that starts a sentence is not counted.
- `tests/skills.test.js`: 436 builtin skills; the pack's 16 skills validate, pass the quality advice and say they are
  restated; the pack reaches niche, ideas and script tasks.

- Browser check on a throwaway workspace (stand-in providers):
  - an approved niche's family form carried "They stay for", "They leave when" and "How we win";
  - a draft that opened with a greeting, used vague words and asked four times scored 1 of 7, each problem named;
  - the same draft rewritten with a cold open, a promise, specifics, pulling sections, a re-hook, a payoff and one
    late ask scored 7 of 7;
  - nothing overflowed.

**Not tested:** how much the skills change real Claude scripts. That needs the owner to approve the pack and write
scripts with it; the retention check then shows the difference.
