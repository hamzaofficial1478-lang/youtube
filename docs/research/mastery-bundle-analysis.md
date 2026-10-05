# CB YT AI Mastery Prompts Bundle — analysis notes (complete, 2026-10-05)

Source: owner-supplied PDF, 475 pages. Private course material: the PDF and its text extraction live in
`Desktop\YT\claude-code-handoff\source-documents\` (`CB_YT_AI_Mastery_Prompts_Bundle.clean.txt`,
split into `bundle-parts/`). Nothing below quotes it; these are our own notes for writing skills.

## Reading status

- Read in full: pages 1-475 (done 2026-10-05).
- Result: `skills/mastery-bundle.json`, 64 skills in our own words (34 general, 30 pin-only), plus five
  deterministic rules in `skills.js` (`wordsForMinutes`, `wordAllocationIssues`, `paragraphImageCount`,
  `imageIntervalSeconds`, `titleVariationIssues`). All arrive as drafts.
- Pin-only (`pinOnly: true`): the 16 niche profiles and the format-specific templates, so a profile only
  reaches the family it is pinned to.

## Structure

1. pp. 1–70: general engines (script DNA analysis, outline → exact-word expansion, music brief, niche comparison,
   trend+niche crossover, competitor screenshot read, title pattern cloning, Grok social sweep, dark-philosophy arc,
   paragraph image tiers, stick-figure script + scene breakdown, sleep-history immersive, editing-pattern decode,
   comments+transcripts megaprompt, problem→solution 1000-word, sub-category title trees, 3-second clip map,
   keyword extraction by People/Places/Events/Objects/Emotions/Concepts, Session 5 A–Z prompt-system builder).
2. pp. 71–166: Veo 3 vlog/persona prompts, I2V/T2V 8-second templates, survival visual-only structure, niche
   systems (spiritual/Jung, ancient discovery, Historic Slumber, Timeless Mysteries, UK true crime, Rome,
   late science), screenplay scene breakdown, zero-decision editor package, Sora 2 timeline beats, small-channel
   outlier niche signal, AI-visualisable concept generation.
3. pp. 167–420: ~35 per-channel packs, one shared template (titles with reasons → chapter/section outline with
   exact sums → one-section-at-a-time exact-word expansion → paragraph image prompts with a locked style prefix,
   ≤100 words → 3, >100 → 6). The value is each niche's audience/tone/contrast/length/visual profile.

4. pp. 421-436: end of the folklore packs (wet-plate and Victorian looks), a 3D-animation channel note,
   a universal channel analyser that builds a five-prompt set, and "Niches in a Nutshell".
5. pp. 437-475, the 2026 sessions: zero views and stalls, inauthentic/reused content, core idea → topic →
   title ladders with variation rules, forensic channel analysis, investigative business documentaries,
   owner-angle questions, a self-improvement explainer system, the Content DNA Engine (replicate format,
   not content; niche blending into new markets), multiple editing formats per channel, and a channel
   description disclaimer.

## Skills planned before writing (kept for the record)

Script: `script.dna-nine-point`, `script.exact-word-expansion`, `script.chapter-section-allocation`,
`script.contrast-framing`, `script.invisible-hooks`, `script.dark-philosophy-arc`, `script.sleep-history-immersive`,
`script.sleep-relaxation-architecture`, `script.problem-solution-1000`, `script.named-steps-shorts`,
`script.part-by-part-true-crime`, `script.comments-transcripts-megaprompt`, `script.section-micro-structure`.
Ideas/niche/competitors: `ideas.trend-niche-crossover`, `ideas.subcategory-title-tree`, `ideas.titles-with-reasons`,
`niche.small-channel-outlier-signal`, `niche.ai-visualisable-concepts`, `niche.format-transfer`,
`niche.compare-advertiser-lens`, `competitors.screenshot-quick-read`, `competitors.editing-pattern-decode`,
`library.niche-prompt-system-builder`, `research.social-sentiment-sweep`.
Visuals: `visuals.paragraph-tier-image-count`, `visuals.style-prefix-lock`, `visuals.script-keyword-extraction`,
`visuals.structured-element-prompt`, `visuals.ai-video-timeline-beats` (disabled capability; disclosure required).
Editing room: `editing.three-second-clip-map`, `editing.screenplay-scene-breakdown`,
`editing.zero-decision-assembly-package`, `editing.sleep-content-visual-pacing`,
`editing.interchangeable-ambient-pool`, `motion.stick-figure-scene-breakdown`.
Packaging/SEO/audio/analytics: `packaging.thumbnail-formula-variants`, `seo.sleep-documentary-package`,
`audio.music-brief-from-script`, `analytics.impressions-standing-heuristic` (label: course claim, unverified).
Per-niche profiles (one skill each, audience/tone/contrast pairs/title length/visual prefix): sleep-history &
forbidden-knowledge, cosmic science sleep, dark philosophy/power, Jungian spiritual, quantum manifestation,
stoic, WWII technical, ancient discovery, Roman military, true crime UK, horror narration, nostalgia 40–75,
melodrama dialogue titles, paradox/riddle sleep, self-improvement fast-cut.

What changed while writing: `niche.compare-advertiser-lens` was already covered by `niche.compare-14-point`, and
`competitors.screenshot-quick-read` by `competitors.channel-dna-extractor`, so neither was added. The planned
paradox/riddle and quantum-manifestation profiles were folded into `niche.profile-mystery-sleep` and
`niche.profile-spiritual-healing`. New from pp. 421-475: `script.owner-angle-questions`,
`script.self-improvement-explainer`, `script.investigative-business-documentary`, `script.plain-outline-second-person`,
`ideas.core-idea-topic-title-ladder`, `competitors.growth-forensics`, `competitors.core-idea-extraction`,
`niche.format-blend-markets`, `niche.format-subcategory-audience`, `editing.format-rotation`,
`strategy.authenticity-guardrails`, `packaging.ai-assist-disclosure`, `analytics.stall-response-order`,
`niche.profile-cozy-fantasy-sleep`. Added for the owner's stock-plus-AI decision: `editing.clip-source-policy`.

## Deterministic rules (now in `RULES`)

- `wordAllocationIssues(outline)`: sections sum exactly to each chapter, chapters to the target total.
- `wordsForMinutes(minutes, wpm)`: 150–170 wpm documentary pace.
- `paragraphImageCount(words, tiers)`: style-specific tier tables (3/6; 3/5/15; 5/ask/15).
- Image interval = narration seconds ÷ image count (zero-decision package).

## Policy flags (record as `avoid`/`checks`, do not import as-is)

- Fabricated authority ("CIA used this", "scientists baffled", expert names) → only cited, real sources.
- Conspiracy/forbidden-truth framing → label speculation as speculation; never present it as fact.
- Ethnicity/immigration title formula (UK crime) and religion "lies exposed" outrage titles → excluded
  (hateful/harassment and monetisation risk). Gendered generalisations in dark-psychology titles → avoid demeaning groups.
- Real-person likeness in AI video (religious figures, celebrities) and realistic fake CCTV → not allowed;
  AI disclosure required.
- Movie clips → excluded (owner decision: stock + AI only). Taboo/torture content → monetisation risk flag.
- Competitor signature phrases ("Fall Asleep To | ENTIRE …") are identity → learn the pattern, never copy it (30/70).
- "Delete and re-upload the same content to a new channel" → conflicts with reused-content policy; do not adopt.
- "stay tuned" appears in a CTA example → stays banned.
- pp. 437-439, 473-474: fixing stalls by converting to a brand account and switching device/email; running
  several channels on separate devices and IPs; opening AdSense accounts in family members' names; residential
  IPs or RDP after a circumvention strike → **excluded**. These are ways around YouTube enforcement; the skills
  keep only the legitimate levers (prompts, thumbnails, editing format, original value).
- p. 430: building 3D-animation scripts from award-winning films' synopses → excluded (copyright); the
  2-frame image-to-video idea is kept under the disabled AI-video capability.
- pp. 445-446: a wizarding-world-inspired sleep niche → kept as an original cozy-fantasy profile; franchise
  names, characters and retellings excluded.
- p. 459: re-uploading downloaded mobile-game footage → excluded (reused content, not stock or AI).
- p. 392: "each image stays for 2 to 3 minutes" in an archival slideshow reads like a typo for seconds; not adopted
  as a number; the sleep pacing skill uses dissolve and motion ranges instead.

## Owner mandate for the Editing Room (2026-10-05, "mark this")

The editing repositories were added to be analysed deeply, not as hints: extract each repo's core brain, features,
working flow and strategy into the editing brain. The Editing Room must think like a professional editor and motion
designer — which cut creates the hook, which clip is more creative, what makes a video boring or lazy, where each
cut/effect/transition goes — and add motion graphics and 2D animation when the script needs them, editing to match
the script. Skills apply wherever they fit. The editing repos are not vendored locally; fetch them at the pinned
revisions in `docs/REPOSITORIES.md` into an inspection folder outside the repository.

The owner's title-card prompt is captured as `motion.title-cards-canvas` (docs/research/editing-brain/motion.json):
the timing, typography, palette, deterministic-render and encode rules became the skill. The full original prompt
is kept unchanged in the private handoff folder: `claude-code-handoff/source-documents/title-card-prompt.original.txt`.
It is not in the repository because its origin and licence are unknown.
