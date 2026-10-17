# Motion-graphics references (research for the motion engine v2, 2026-10-17)

The owner asked to move on to the next editing engine (motion graphics) after the hand-drawn engine, with the same depth: its own looks, a Mix of all of them, and paid pictures where they count. No owner links were given for this engine, so these references were chosen as leading faceless motion-graphics channels in the owner's kinds of niches (explainers, business, geopolitics). Frames were looked at from each video's public storyboard thumbnails in the browser (about one frame every 10 seconds; nothing downloaded). Techniques only: no channel's characters, wording, layouts or signature look are copied (30/70 rule).

| Video | What it shows |
|---|---|
| Kurzgesagt, "We Finally Know More About Humanity's First Civilization" | **Flat vector world.** Rich, saturated palettes (deep purple and teal against warm orange), soft gradients, glow and light beams, layered landscapes with depth, cut-away dioramas, a framed world map. Characters are flat shapes without outlines, shaded with darker flat tones, often seen from behind looking into the scene. Infographic devices: a timeline bar split into before/after with icon medallions and small pill labels for years, all animated along the bar. |
| The Infographics Show, "The Steam Review Crisis" | **Infographic cartoon.** Proportioned 2D people (flat colour, thin outlines) acting in simple sets (office, gaming room, stage); white speech bubbles with a tail; a big bold sentence typed over a dimmed scene with key words in a second colour; score donut ("60%"), star ratings, a counter ("8,337"), money bags, a balance scale, a globe with crowds, "Expectations vs Reality" split, a chart on an easel. Very fast changes, many small icons. |
| Business Casual, "How Starbucks Really Became A Coffee Giant" | **Documentary data overlays.** Archival photos and cut-outs with big number callouts ("$3.8 million", "3X", "$25 million"), date stamps ("June 1st, 2000", "1992"), headline and document cards, a share-price area chart in a dark panel, brand cards. |
| Wendover Productions, "Why the Ikea Business Model Wins" | Footage-led; motion graphics where they explain: satellite map zooms with pin labels, a product line drawing with a name ("BILLY"), document cards. |
| MagnatesMedia, "The Nazi Brothers Who Started Rival Shoe Companies" (owner link, 2026-10-17: "the most relatable edits I am expecting") | **Cinematic documentary collage.** Archival photos and film stills as cut-outs on bold colour fields (acid yellow, deep red), duotone tints, giant typography layered with the cut-outs (a name in huge letters behind the runner), old-TV frames around archival footage, falling petals and confetti, a glowing-eye gag on a photo, a product cut-out on a clean field, a red town map with a big label, a stage with spotlights and a "years undefeated" title in flames. |
| Johnny Harris, "China's Dirty Money Problem, Explained" | **Network maps.** Dark teal maps with glowing country borders, people and company pins (round icons with labels) connected by flowing route lines, dark document cards. |
| RealLifeLore, "Why Everything is Going Wrong for Saudi Arabia" | **Maps and data.** Terrain maps with coloured territories, labels and curved shipping routes with arrows, pie markers on a map, and dark titled data cards with bar charts ("Saudi oil production"). |

## OverSimplified (owner link, 2026-10-17: "the characters, their motions, the expressions in the voice, the scene building, the humour, how each scene creates the hook")

"Prohibition - OverSimplified": simple round-headed cartoon people with tiny bodies, era costumes and expressive brows; crowds of them; painted backgrounds (the Capitol, a saloon, streets, rooms); maps that turn into characters (a country map with legs holding a beer); cutaway gags to one object on white with its name ("Sauerkraut"); red arrows on old paintings; meme-like photo inserts; quick reaction cuts. The method matters as much as the look: every scene is a small joke or a reveal on the narrator's words, the voice performs the humour, and each scene ends on a turn that pulls into the next.

Where it belongs in the program: the **Stickman engine** (a new look of our own: round-headed history-cartoon people with costumes, crowds and painted places; never OverSimplified's characters or signature look), plus the motion engine's maps (needs the map data, see below), the writer and voice direction for the comic narration, and the editing brain for cutaway gags and reaction cuts. Not built yet.

## What the program takes (restated in our own code)

The motion engine gets five **designs** (its looks), plus **Mix** (Claude picks the design per scene, for a reason):

1. **Vector world** (`vector`): flat illustrated scenes with gradient backdrops, glow and floating particles, flat people without outlines, timeline bars with medallions and pill labels.
2. **Infographic cartoon** (`infographic`): bright flat sets, proportioned people with thin outlines and speech bubbles, icons, ratings and score dials, counters, versus splits.
3. **Kinetic type** (`kinetic`): the words carry the shot - a bold sentence builds word by word with key words in the accent colour, big numbers, stamps, on strong colour fields.
4. **Documentary collage** (`collage`, from MagnatesMedia): cut-outs with a white sticker edge on a bold colour field with halftone and paper grain, giant poster words behind them, stamps, spotlights and falling particles.
5. **Data desk** (`data`): dark panels with titled charts (bar, line, area, pie, donut, rating) that build on the words, number callouts, date stamps, timelines and networks.

New drawing tools for every engine: `chart` (bar, line, area, pie, donut, rating), `timeline` (a bar with event medallions and labels), `network` (who is connected to whom, with flowing links), and the text styles `statement` (a kinetic sentence with highlighted words) and `poster` (giant words behind a cut-out). People in motion shots are drawn as flat-design people instead of stick figures.

Not built yet: real maps (countries, territories, routes) need a public-domain country-shapes package (Natural Earth through `world-atlas`); this needs the owner's go-ahead because it adds a downloaded data package.
