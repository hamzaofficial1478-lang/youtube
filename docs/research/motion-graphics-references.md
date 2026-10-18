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

Where it belongs in the program: the **Stickman engine** (a new look of our own: round-headed history-cartoon people with costumes, crowds and painted places; never OverSimplified's characters or signature look), plus the motion engine's maps (needs the map data, see below), the writer and voice direction for the comic narration, and the editing brain for cutaway gags and reaction cuts. Built in 0.36 as the Stickman look **History cartoon** (`chronicle`), see "History cartoons" below.

## What the program takes (restated in our own code)

The motion engine gets five **designs** (its looks), plus **Mix** (Claude picks the design per scene, for a reason):

1. **Vector world** (`vector`): flat illustrated scenes with gradient backdrops, glow and floating particles, flat people without outlines, timeline bars with medallions and pill labels.
2. **Infographic cartoon** (`infographic`): bright flat sets, proportioned people with thin outlines and speech bubbles, icons, ratings and score dials, counters, versus splits.
3. **Kinetic type** (`kinetic`): the words carry the shot - a bold sentence builds word by word with key words in the accent colour, big numbers, stamps, on strong colour fields.
4. **Documentary collage** (`collage`, from MagnatesMedia): cut-outs with a white sticker edge on a bold colour field with halftone and paper grain, giant poster words behind them, stamps, spotlights and falling particles.
5. **Data desk** (`data`): dark panels with titled charts (bar, line, area, pie, donut, rating) that build on the words, number callouts, date stamps, timelines and networks.

New drawing tools for every engine: `chart` (bar, line, area, pie, donut, rating), `timeline` (a bar with event medallions and labels), `network` (who is connected to whom, with flowing links), and the text styles `statement` (a kinetic sentence with highlighted words) and `poster` (giant words behind a cut-out). People in motion shots are drawn as flat-design people instead of stick figures.

Real maps were added in 0.36 after the owner's go-ahead (see below).

## History cartoons (owner request 2026-10-17: "there are many other channels like this ... search for the related channels so you will be able to upgrade that style more perfectly")

Storyboard frames were read in the browser (nothing downloaded) from four channels in the same family as OverSimplified:

- **History Matters** ("Why did Britain join WW1?"): blocky square-headed people with top hats, moustaches and uniforms; parliament and office interiors; flat maps with the countries in question highlighted, and countries personified (a flag-coloured shape with a face); letters, signs and a chalkboard of question marks; a protest banner ("We want peace!"); a name card under each politician.
- **Sam O'Nella Academy** ("Zhang Zongchang, the Dogmeat General"): stick bodies with big, detailed heads (hair, hats, make-up); an opening title card; a small map with one region lit; maps of a whole era with every faction coloured; crowds of identical sticks; numbered people ("#4, #27, #14"); money bags with dollar signs; a giant boot labelled with a country stepping on tiny people (scale as a joke); a train with a face; a "Positive / Negative" split. Deadpan delivery, the joke is in the cut.
- **Extra History** ("The History of Perfume"): chibi people (big heads, dot eyes, rosy cheeks) in period costume (crowns, tricorns, plague-doctor masks); soft painted colour washes as places; smells drawn as coloured wavy lines; close-ups of a single object with a heart; a recurring host at a lectern; a person's emotion in a medium close-up.
- **OverSimplified** (above): round-headed people, crowds, painted places, maps as characters, labelled cutaway gags, red arrows, reaction cuts.

What they share, and what the program takes (our own drawings, never any channel's characters or signature look):

1. **Big-headed people in costume**, recognisable by hat, coat and moustache, the same all video. -> The `chronicle` look draws people with a big round head on a short body (`drawPerson` with the `chibi` skeleton) and new period costume: headwear tricorn, bicorne, bowler, peaked cap, spiked helmet, turban, laurel; outfits officer (epaulettes, sash, buttons), armour, robe; a handlebar moustache.
2. **Maps that carry the geography and act** (an empire lights up, an army arrow sweeps, a country gets a face). -> the `map` element for every engine (`maps.js`, Natural Earth country shapes): areas colour in from their middle on their words, an area may be made of several of today's countries (an empire, an alliance), routes sweep as thick arrows, pins drop, a country may wear an expression; labels never pile up.
3. **Crowds** for a nation, an army, voters or a mob, often with a banner. -> the `crowd` element (3-24 people in rows, varied looks or one uniform and helmet, a shared pose, a banner).
4. **The comedy is in the cut**: a straight line, then the visual punchline (an understatement shown literally, a deadpan reaction close-up, a label on the absurd detail, scale jokes). -> the look's planning brief (`engines.js` LOOKS.chronicle) and the planner's new hook guidance.
5. **Name cards** for every key person, chapter cards and maps to open chapters. -> the brief asks for a figure label "Name, title", chapter cards and maps.

## Painted history (owner link 2026-10-18: StickOrbit, "that will also take place in documentary engine")

"How the British Took Control of India | East India Company Explained" was read from storyboard frames in the browser (nothing downloaded):
- Every scene is a detailed, warm, painterly illustration in comic-book style (AI-generated): a Tudor street, Queen Elizabeth's court, ships at sunset, the Taj Mahal and the Red Fort, a spice market with merchants, a Mughal court with the emperor on his throne beside a map of India, battles, handshakes between redcoats and princes.
- A recurring guide character (a merchant in a black hat and ruff) stands in most scenes.
- Titles sit on the painting ("East India Company"), a map appears on a board or in a hand, and an hourglass on a table shows time passing.
- Subtitles are in boxes, and each scene is held about 4-5 s.

What the program takes, in its own drawings: the Documentary look `painted`:
- warm painted places of the past (throne, castle, harbor, market, village, battlefield, chamber);
- a recurring guide character;
- slow camera moves;
- maps on tables and boards;
- paid pictures for the scenes that carry the story.

Not taken: the channel's art, characters or title style. Its real quality comes from AI image generation, which the program has only with an image API key (the owner has none yet).

## The Documentary engine (owner decision 2026-10-18)

The owner placed the documentary channels in one Documentary engine: OverSimplified (cartoon documentary), Vox, MagnatesMedia and Dhruv Rathee (real footage with motion graphics) and StickOrbit (painted history). The designs of 0.35 (vector world, infographic, kinetic type, collage, data desk) are documentary looks. Motion graphics themselves (typography, background animation, layering, map animation) are a layer of every engine, not an engine.

Not taken: any channel's character designs, colour schemes, title cards, intros or catchphrases; real photographs or memes (copyright); historical borders (the map uses today's countries; an empire is drawn as the group of today's countries it covered, and the planner is told so).
