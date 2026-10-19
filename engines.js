'use strict';
// P06d - The editing engines and how Claude reasons about combining them. Four engines make the pictures:
//   montage   - stock and archival footage, photos, AI images and AI video (cut by the editing brain)
//   stickman  - cartoon stick characters acting the narration in built sets (drawn by the program)
//   handdrawn - ink illustrations drawn on paper, line by line (drawn by the program)
//   motion    - flat motion graphics: kinetic type, icons, counters, charts (drawn by the program)
//   atelier   - a shot designed from scratch by Claude as an animated page in this video's art direction (P06h,
//               the HyperFrames method; rendered by the program)
// A style's renderer sets the video's main look; the story-mix style (P06i) has none: the story director picks
// the engine for each beat (director.js). Nothing here forbids a combination: the planner reads each
// engine's strengths and the usual effects of mixing them, decides per video and per shot, and writes its
// reason in the shot's notes. The style's own visual sources (Room 03, the owner's choice) are the only limit.
// Pure: no I/O.

const ENGINES = Object.freeze({
  montage: {name: 'Documentary footage', draws: false, finish: null, strengths: 'real places, people, events and products; evidence and atmosphere', risks: 'cannot show mechanisms, numbers or things nobody filmed; generic B-roll under abstract lines feels lazy'},
  stickman: {name: 'Stickman animation', draws: true, finish: 'cartoon', strengths: 'people and situations acted out: emotions, mistakes, reactions, humour, cause and effect, "you" moments, energy', risks: 'cartoon tone can undercut a grave or sensitive subject'},
  handdrawn: {name: 'Hand-drawn whiteboard animation', draws: true, finish: 'wb', plan: 'Whiteboard animation: a hand draws every picture line by line on the narrator\'s words, writes the words, colours the drawing in, and the board moves on to the next picture (owner references: whiteboard-animation tutorials and After Skool). The people are drawn as people (proportions, clothes, hands, expressive faces), never stick figures. Build each picture so it explains the line: a person and what they think or feel, the object the words name, handwritten labels and arrows, a keyword, a comparison. A picture may grow across several lines (add to the same board on each cue) before the board moves on. Places, colour and composition are your choice: make every picture appealing and catchy for this audience.', strengths: 'explaining ideas, psychology, self-improvement, business and stories with a hand that draws in front of the viewer; people with real expressions; words and diagrams written as they are said', risks: 'drawing takes time, so give each picture room to be drawn; a stick figure beside a drawn person can look like two different films'},
  atelier: {name: 'Atelier (designed per shot)', draws: false, composes: true, finish: null, strengths: 'anything designed from scratch for this video: kinetic typography, a number that must hit, a diagram or chart assembling, an abstract visual metaphor, a comparison, a list, a title; a look nobody else has', risks: 'each shot costs Claude tokens to design; it cannot keep the drawn cast (people stay in stickman or hand-drawn shots); many atelier shots in a row read as slides unless the beats and framings vary'},
  // 0.37 (owner decision 2026-10-18): the key 'motion' draws the Documentary engine's designed shots (its looks are
  // DESIGNS). Motion graphics themselves are no engine: the motion layer is part of every engine (MOTION_LAYER).
  // 0.40: the Cinematic engine (adapter cinematic-hybrid): real moving footage cut with film grammar, graded as one film,
  // with designed titles. It draws nothing.
  cinema: {name: 'Cinematic', draws: false, finish: null, strengths: 'mood, scale and emotion carried by real moving pictures: places, faces, weather, crowds, machines in motion; openers, trailers and dramatic essays', risks: 'cannot explain mechanisms or numbers; generic stock looks cheap without a grade, a shot grammar and designed titles; needs a stock or image connection'},
  motion: {name: 'Documentary drawn shots', draws: true, finish: 'flat', strengths: 'history, money, science and business stories told with designed scenes: a cartoon history, painted scenes, flat vector worlds, infographic people, collage cut-outs, data desks, with maps and charts', risks: 'many charts or words in a row read as slides; a look that changes on every shot breaks the film'},
});

// The story mix draws a shot without a named engine as stickman (the cast's home), but no engine leads.
const PRIMARY_BY_ADAPTER = Object.freeze({'ffmpeg-montage': 'montage', 'cinematic-hybrid': 'cinema', 'ffmpeg-sketch': 'stickman', 'canvas-frames': 'handdrawn', 'motion-graphics': 'motion', atelier: 'atelier', 'story-mix': 'stickman'});
const isMix = spec => spec?.renderer?.adapter === 'story-mix';

// How engines usually combine: experience to weigh, not rules. Claude decides for this script and this audience.
const COMBINATIONS = Object.freeze([
  'Motion graphics inside a stickman or hand-drawn shot (a counter, a stamp, a burst, a circle, an arrow) usually helps: the number or emphasis appears without leaving the story\'s world.',
  'A full motion-graphics shot between character shots works for a number, list or comparison the viewer must read; keep the main look\'s colours so it feels like the same film.',
  'Stick figures and ink illustrations are two drawing languages. Mixing them usually looks unfinished, unless the second is clearly a different layer in the story (a page in a book, a drawing on a board, a memory).',
  'Real footage or photos between cartoon shots usually breaks the look, unless the line needs the real thing (a real place, product, animal or event). Then make it a short, deliberate "this is real" beat.',
  'Documentaries gain from hand-drawn or motion explainer cutaways for mechanisms, processes and numbers footage cannot show. Cartoon characters can undercut a serious tone; they can work when the tone is light or the moment is about everyday people.',
  'A motion-graphics video can use a stick figure for a human reaction and stock footage as a plate for a real place.',
  'An atelier shot inside a drawn video works for the beat the drawing vocabulary cannot carry (a dramatic number, a diagram, kinetic words); give it the video\'s palette so it stays the same film, and keep people in the drawn shots.',
  'An atelier video can still use a stick figure or an ink sketch for a human moment, and a photo for something real.',
]);

// The stickman engine's looks (the style's drawing.look, 0.29; owner references in research/stickman-and-handdrawn-
// references.md): each its own drawing and its own way of editing. Experience to plan with, not rules.
const LOOKS = Object.freeze({
  classic: {name: 'classic cartoon', plan: 'Cartoon stick characters act every line inside built sets, with kinetic words and effects on the narrator\'s words; energetic and word-timed.'},
  whiteboard: {name: 'whiteboard', plan: 'A hand draws every line and writes every word on a white board, one thing after another. Give each shot few, big things (one or two figures, one or two objects or words) so the drawing finishes while the line is said; let words be written (title, label, highlight); hold a shot while it is drawn (2-7 s); a light set or none - the board is the place.'},
  storybook: {name: 'storybook', plan: 'An illustrated story with deadpan, round-headed characters. Open every chapter or stage with its own chapter-card shot (a text element with style "chapter", e.g. "Level 2: The Shot Caller", nothing else in it). Frame like a film and change the framing from shot to shot: a wide shot of the place, an over-the-shoulder shot (one figure size xl at the frame edge, x 0.1-0.2, smaller people behind), a close-up (focus zoom on a face), an object insert with nobody in it (a prop size l or xl in its place). The drama is in the situation, not in big gestures. Every scene has a place (a set or the story\'s own kit place). Cut every 1.5-3.5 s.'},
  illustrated: {name: 'illustrated', plan: 'An illustrated explainer: real objects and cartoon people (a suit, a cap, a beard) in ink and colour, drawn on as the words come. The explaining is done by annotations that build on the words: a handwritten label with an arrow on the thing (prop "label"), price tags ("tag"), arrow callouts ("callout") and sticky notes ("sticky") for figures and costs, dashed arrows connecting related things, check marks and charts; objects may have a cute face ("face": true); a big hand-lettered keyword can name the beat ("keyword"); compare two things with a divider ("versus"); show a thought inside a head (prop "head"). Choose places and colour that make each scene appealing (a colourful street or office often lifts it). Hold each drawing 2-5 s while its notes arrive.'},
  doodle: {name: 'doodle', plan: 'Marker doodles on a white page with a bold ground. Show every line literally with a visual gag (to explain that water was far away, a man carries a whole pond on his head). Reactions in face close-ups (a figure size xl, focus zoom on the face, big expressions, sweat or shock emotes). Objects may have faces. Very quick cuts (1-3 s), no camera moves beyond a punch-in.'},
});

// The Documentary engine's looks (the style's drawing.design; 0.35 as the motion engine's designs, the Documentary
// engine's since 0.37 by owner decision; research/motion-graphics-references.md): each its own backdrop, people and
// way of building a shot. Experience to plan with, not rules.
const DESIGNS = Object.freeze({
  // 0.36 (research "History cartoons": OverSimplified, History Matters, Sam O'Nella Academy, Extra History; our own
  // characters); a Stickman look in 0.36, a Documentary look since 0.37.
  cartoon: {name: 'cartoon documentary', plan: 'A comic history cartoon. Big-headed cartoon people in period costume (the cast\'s headwear, outfit and facial hair: crowns, tricorns, bicornes, peaked caps, spiked helmets, officer coats, robes, handlebar moustaches) act the story in painted places. Maps carry the geography (kind "map": empires and alliances colour in on their words, armies march as arrows, a country may wear a face and react). Crowds stand for nations, armies, voters and mobs (kind "crowd", a banner for what they want). The comedy is in the cut: play the narration straight, then cut to the visual punchline - an understatement shown literally, a deadpan reaction close-up (size xl, focus zoom), a callout or tag naming the absurd detail, a tiny figure under a huge problem. Introduce every key person with a name label (the figure\'s "label": "Name, title") and keep their costume the whole video so viewers know them on sight. Alternate wide establishing shots (a place or a map), medium shots of people talking or arguing (bubbles), and quick gag inserts (1-2 s). Open each chapter on a chapter card or a map. Follow the voice: a dramatic line gets a slow push and a grave face, the undercut after it a snap cut and a silly face.'},
  // 0.37 (owner link: StickOrbit; research "Painted history"): our own painted scenes, never that channel's art.
  painted: {name: 'painted story', plan: 'An illustrated history told in painted scenes: every scene is a rich illustration in warm, cinematic light - a place full of period detail and people in costume (sets throne, castle, harbor, market, village, battlefield, chamber) - held 3-5 s while the camera slowly pushes or pans across it. A recurring guide character in a distinct costume appears in most scenes and walks the viewer through the story. Titles and dates sit on the painting; maps lie on a table, a scroll or a board. Spend the paid pictures on the scenes that carry the story (the most detailed places and crowds), and draw the rest with the program\'s painted places and people.'},
  vector: {name: 'vector world', plan: 'Flat illustrated scenes with depth: a gradient backdrop with soft glow and floating particles, flat people without outlines acting in the scene (often seen from behind, looking into it), big simple shapes, warm light against deep colour, a timeline bar for history. Use it for wonder, big ideas, history and science: places and moments the viewer should feel.'},
  infographic: {name: 'infographic cartoon', plan: 'Bright flat sets with proportioned people in thin outlines who act and talk (speech bubbles), surrounded by icons, score dials, star ratings, counters and versus splits. Fast: a new idea every 2-3 seconds. Use it for stories about people, money, products and comparisons.'},
  kinetic: {name: 'kinetic type (a typography beat)', plan: 'The words carry the shot: a bold sentence builds word by word (text style "statement", key words between *stars* light up in the accent), big numbers count up, a stamp lands; strong colour fields and one or two icons at most. Use it for hooks, claims, turning points and lists the viewer must remember.'},
  collage: {name: 'documentary collage', plan: 'Cinematic collage: cut-outs (a picture with a white sticker edge, a person, a product) on a bold colour field with halftone and paper grain, giant poster words behind them (text style "poster", placed before the cut-out so it sits behind), stamps and headline cards, spotlights and falling particles for drama. Use it for the turns of a business or history story: a reveal, a rise, a scandal, a rivalry.'},
  data: {name: 'data desk', plan: 'Dark panels with titled charts that build on the words (chart: bar, line, area, pie, donut, rating), number callouts, date stamps and timelines. Use only numbers the narration says; one chart is the hero of its shot and its title says what it shows. Use it for evidence: growth, decline, shares, before and after.'},
});

// The hand-drawn engine's whiteboard looks (the style's drawing.board, 0.32; owner references 2026-10-16).
const BOARDS = Object.freeze({
  cartoon: {name: 'colour cartoon', plan: 'Clean black line art coloured in with flat colour after the line, on a white board.'},
  marker: {name: 'black marker', plan: 'Black marker only: line art that fills the board, no colour; strong shapes and lots of small doodles (icons, arrows, signs) around the subject.'},
  pencil: {name: 'pencil sketch', plan: 'A grey pencil sketch with light colour: realistic grown-up people, handwritten sentences that carry the key message.'},
  framed: {name: 'framed board', plan: 'A real whiteboard in its frame: simple people, handwritten capital words and coloured icons for money and numbers.'},
  'dry-erase': {name: 'dry-erase markers', plan: 'Colour dry-erase markers on a white board: caricature heads with big expressions, colour filled in with visible marker strokes, coloured hand-lettering, and one board that keeps filling as the story goes before it is wiped for the next.'},
});

const primaryEngine = spec => PRIMARY_BY_ADAPTER[spec?.renderer?.adapter] || 'montage';
const DRAW_ENGINES = Object.freeze(Object.keys(ENGINES).filter(key => ENGINES[key].draws));
// Every drawing engine may draw a shot; the video's main look leads when it draws.
const drawEngines = primary => (ENGINES[primary]?.draws ? [primary, ...DRAW_ENGINES.filter(engine => engine !== primary)] : [...DRAW_ENGINES]);

// The visual sources the planner may use are exactly the style's executable sources. Drawing styles lead with
// drawn shots. Returns {engine, sources, primarySource}.
// A style on one drawing engine plans drawn shots only (0.37); documentary, atelier and the story mix keep footage.
function plannerSources(spec, executable) {
  // An engine that draws nothing (Cinematic) gets no drawn shots.
  const engine = primaryEngine(spec), scope = engineScope(spec), sources = (scope.footage ? [...executable] : executable.filter(source => source === 'generated-graphics')).filter(source => source !== 'generated-graphics' || scope.drawn.length || scope.frames);
  const primarySource = (ENGINES[engine].draws || ENGINES[engine].composes) && sources.includes('generated-graphics') ? 'generated-graphics' : (sources.includes(spec.visuals.primarySource) ? spec.visuals.primarySource : sources[0]);
  return {engine, sources, primarySource, scope};
}

// The engines as Claude reads them in the scene-planning prompt.
// The mix of an engine's own looks (owner request 2026-10-17: "the user can select the specific one, or the mix: the
// program uses all features of that engine in one video"). Claude picks the look per scene, for a reason.
// The Documentary engine's footage look (a style choice, not a drawing): real footage led by motion graphics.
const FOOTAGE = Object.freeze({name: 'footage with motion graphics', plan: 'Real footage with motion graphics (the way Vox, MagnatesMedia and Dhruv Rathee work; never their look): stock footage and photos carry the real places, people and events, and motion graphics explain over and between them - maps with animated routes and highlighted countries, kinetic headlines, number callouts, layered cut-outs on a colour field, charts and timelines. Cut on the narration\'s beats every 2-4 s.'});
// Motion graphics are a layer of every engine (owner decision 2026-10-18), not an engine with its own style.
const MOTION_LAYER = 'MOTION GRAPHICS are a layer of every engine, not an engine of their own: kinetic words (text styles statement, poster, counter, stamp, pop, highlight, and how words animate: rise, letters, typewriter, wipe, slam, track, glitch, blur, focus, redact), evidence (a quote card with the speaker, a document whose one line lights up, a dial, a loupe that magnifies a spot, a measured range line, a unit chart of identical marks), textures (grain, film, paper, grid paper, VHS, a two-colour archive tint, light leaks), depth (a back layer that moves slower and goes soft, a front layer that moves faster, camera moves and focus), maps (the camera flies to a country or a pin, a traveller moves along a route, pins pulse, atlas, satellite and night styles), charts, timelines, networks, crowds, effects and transitions all go inside this engine\'s own shots, drawn in its look. Use them like a motion designer: one or two moves per shot, each on its words, never all at once.';
// What a video may use (owner decision 2026-10-18: "when the stickman engine is used and the user selects mix, the
// program uses only the stickman engine's features"): a style built on one engine uses only that engine (one of its
// looks, or a mix of its looks); the Story Mix uses every engine; an atelier video keeps its guests (people stay drawn).
// {mix, drawn: drawing engines allowed, footage: footage and image sources allowed, frames: atelier frames allowed}.
function engineScope(spec) {
  const primary = primaryEngine(spec);
  // Film looks (0.39) a shot may name: any when the style has one or lets Claude choose; none otherwise.
  const films = spec?.drawing?.film && spec.drawing.film !== 'none' ? null : [];
  if (isMix(spec) || primary === 'atelier') return {mix: isMix(spec), drawn: [...DRAW_ENGINES], footage: true, frames: true, films};
  if (primary === 'montage') return {mix: false, drawn: ['motion'], footage: true, frames: false, films};
  // The Cinematic engine draws nothing: footage and images only (its titles come from the editing brain).
  if (primary === 'cinema') return {mix: false, drawn: [], footage: true, frames: false, films: []};
  return {mix: false, drawn: [primary], footage: false, frames: false, films};
}
// Film looks (0.39): how a medium prints the finished frame, for the drawn shots of every engine (drawn-engine.js
// drawFilm). After lemo-opuscar's film styles (MIT), restated in our own words: what each suits and how to plan for it.
const FILMS = Object.freeze({
  silent: {name: '1920s silent film', plan: 'Silver black and white with warm whites, flicker, gate weave and scratches. Tell beats by action in wide shots and short intertitle cards (text style chapter, a few words); faces stay deadpan and bodies act. Suits the early 20th century, old inventions, slapstick, a story told like an old reel.'},
  noir: {name: '1940s studio black and white', plan: 'Deep blacks, small glowing whites, slatted shadows of blinds. Push to faces, keep shadows over the scene. Suits crime, secrets, spies, a detective\'s telling.'},
  sepia: {name: '19th-century photograph', plan: 'Umber and cream print tones; the hero is hand-tinted (accent). Frontal, still subjects and slow pans across faces. Suits history before 1920: pioneers, frontiers, empires, inventors.'},
  selective: {name: 'black and white with one colour', plan: 'Everything grey except what carries the accent colour: mark the hero or the one story object accent: true and never colour more than two things. Suits tragedy, the one who stands out, a single choice that matters.'},
  newsprint: {name: 'newspaper print', plan: 'Black halftone dots on newsprint; the hero on its own spot plate. Use headlines (text style headline), documents and big plain pictures. Suits news events, scandals, a front page of its time.'},
  riso: {name: 'two-ink risograph', plan: 'Two translucent inks with halftone on warm paper, slightly off register. Saturated areas print in the accent ink, darks in the deep ink. Suits playful explainers, youth culture, indie and creative topics.'},
  blueprint: {name: 'engineering blueprint', plan: 'White lines on Prussian blue. Draw like an engineer: outlines, then detail, then dimensions (ruler) and labels; one stamp for the verdict. Suits inventions, machines, buildings, how things are made.'},
  woodcut: {name: 'woodcut print', plan: 'Black wood and carved white; one colour plate prints only the accent (the thing that matters). Heavy and solemn. Suits folk tales, protest, plague, labour and war.'},
  kinescope: {name: '1950s television', plan: 'Soft cool phosphor with scanlines, a rolling hum bar and the tube\'s rounded corners. Suits the 1950s, early TV, broadcasts, propaganda, the space race on the evening news.'},
  technicolor: {name: 'golden-age Technicolor', plan: 'A saturated warm print with a soft bloom. Suits epics, adventure, Hollywood, spectacle, the dream of a golden age.'},
  album: {name: 'family album snapshot', plan: 'A faded 1970s-80s print with a white border. Suits memories, family history, nostalgia, the personal side of a story.'},
  screenprint: {name: 'silkscreen poster', plan: 'Values stepped into flat bands with a key slightly off register, on paper. Suits places, travel, bold summary cards, posters of an era.'},
  engraving: {name: 'copperplate engraving', plan: 'Every tone made of engraved lines that swell in the darks, then thin hand colouring. Suits natural history, old science, exploration, the 1500s-1800s.'},
  deco: {name: 'art deco gold', plan: 'Gold in hard metal bands on warm black with glints; the hero keeps its own colour. Suits luxury, wealth, the 1920s, grand hotels, empires of money and their fall.'},
});
// The Cinematic engine's grades (0.40): one colour treatment for every clip of a video, so stock from many cameras reads
// as one film (render.js GRADE_FILTERS draws them). What each suits, in our own words.
const GRADES = Object.freeze({
  natural: {name: 'natural', plan: 'Clean, true colour with a gentle contrast. Suits travel, nature, science and anything that must look real.'},
  'teal-orange': {name: 'teal and orange', plan: 'Warm skin and highlights against teal shadows, the blockbuster look. Suits adventure, business stories, energy and spectacle.'},
  golden: {name: 'golden hour', plan: 'Warm, soft, glowing light. Suits nostalgia, hope, origins, family and success stories.'},
  bleach: {name: 'bleach bypass', plan: 'Low colour, hard contrast, metallic. Suits war, crime, disasters, industry and grit.'},
  cold: {name: 'cold thriller', plan: 'Blue-green shadows, cool and quiet. Suits mysteries, technology, surveillance, winter and loneliness.'},
  noir: {name: 'black and white', plan: 'Silver black and white with deep blacks. Suits history, crime, memory and timeless statements.'},
  vintage: {name: 'vintage film', plan: 'Faded film stock with lifted blacks, warm cast and grain. Suits the 1950s-1980s, archives, home-movie memories.'},
  moody: {name: 'moody', plan: 'Dark, desaturated, low-key with crushed blacks. Suits tension, loss, true crime and the hour before a turn.'},
});
const CINEMA = 'CINEMATIC ENGINE. This video uses one engine: Cinematic - real moving footage (stock video first, photos when nothing moves) cut with film grammar and graded as one film. Nothing is drawn: no characters, maps, charts or diagrams (a number or a name goes into on-screen text, which the program sets as a designed title).\n- best for ' + ENGINES.cinema.strengths + '; watch out: ' + ENGINES.cinema.risks + '.\n' + [
  'SHOT GRAMMAR: give every shot a shot size and a reason, and write its stock query like a cinematographer: size + subject + movement + light, in 3-6 generic words (aerial drone cargo ship ocean; close up hands counting coins; slow motion wave crashing rocks; silhouette walking city night). Vary sizes the way films do: an establishing wide, then closer, an insert of the detail the words name, a reaction or a human face, then wide again for a change of place.',
  'CONTINUITY: keep the screen direction of a journey (a ship sailing left to right keeps sailing that way until the story turns back), keep the light and time of day within a scene, and cut on motion (a whip, a pan, something crossing the frame) or on a matching shape. Use the same kind of shot to rhyme the opening and the ending.',
  'RHYTHM: open on the most striking moving picture with a hard cut on the first word; short shots (1.5-3 s) for energy and lists, long held shots (4-8 s) for awe, grief or a reveal; slow motion (say so in the query) for an emotional beat; a held, quiet shot before the turn.',
  'TITLES: on-screen text is a designed title, never a caption: a place and date super for a new place or time (AMSTERDAM, 1602), the one number or name that matters, a chapter title at a turn. At most one title on screen at a time, few words.',
].join('\n');
const FILM_RULE = 'Drawn shots are printed in it automatically (footage keeps its own grade). A shot may name another film look in sketch.film, or "none", only for a change of register (a flashback, an archive memory, a dream) and says why in its notes; the video must still feel like one film.';
const MIX_RULE ='Change look where the story changes (a new chapter, a flashback, a story inside the story, a change of mood or place), keep one look for a whole scene, and say why in the shot\'s notes; the video must still feel like one film, never a different look on every shot.';
function promptGuide(primary, {mix = false, look = null, board = null, design = null, brief = null, sources = null, film = null, grade = null} = {}) {
  // The Cinematic engine (0.40) has its own guide: footage only, no drawing vocabulary or motion layer.
  if (primary === 'cinema') return [CINEMA, ...(GRADES[grade] ? [`GRADE: ${GRADES[grade].name}. ${GRADES[grade].plan} Every clip is graded alike, so choose footage whose light suits it.`] : []), ...(grade === 'choose' ? [`GRADE: choose one grade for the whole video and put its key in the plan's "grade" field: ${Object.entries(GRADES).map(([key, item]) => `${key} (${item.name}): ${item.plan}`).join(' ')}`] : []), 'TASTE: references are ideas, never rules. Choose shots, light and rhythm that make each moment feel like a film for this audience, and say why when it matters.', ...(brief ? [`LEARNED LOOK (from an approved style study; use the techniques, never copy a channel): ${brief}`] : [])].join('\n');
  // One engine (0.37): every shot comes from it; documentary means its footage and its drawn shots.
  const single = !mix && primary !== 'atelier', documentary = primary === 'montage' || primary === 'motion';
  const footage = documentary && (sources ? sources.some(source => source !== 'generated-graphics') : true);
  const stickman = LOOKS[look] && look !== 'classic' && (mix || primary === 'stickman');
  const stickMix = look === 'mix' && (mix || primary === 'stickman'), boardMix = board === 'mix' && (mix || primary === 'handdrawn'), motionMain = mix || documentary;
  const docName = key => (key === 'footage' ? FOOTAGE : DESIGNS[key]);
  return [
    ...(single ? [
      documentary ? `ENGINE. This video uses one engine: the Documentary engine - ${footage ? 'real footage (sources other than generated-graphics) and ' : ''}its drawn shots (sketch.engine "motion", in the documentary looks below). Use nothing from the other engines (no stick figures, no whiteboard, no designed atelier frames).`
        : `ENGINE. This video uses one engine: ${ENGINES[primary].name} (sketch.engine "${primary}"). Every shot is drawn by it, in its looks below; use nothing from the other engines and no footage.`,
      `- best for ${ENGINES[primary === 'montage' ? 'motion' : primary].strengths}; watch out: ${ENGINES[primary === 'montage' ? 'motion' : primary].risks}.`,
      MOTION_LAYER,
    ] : [
      mix ? 'ENGINES. This video is a story mix: no engine leads. Each beat gets the engine that serves its job best (see the story director), and the video must still feel like one film.'
        : `ENGINES. This video's main look is ${ENGINES[primary].name} (${primary}). You decide, shot by shot, which engine and source serve the line best; the video must still feel like one film.`,
      ...Object.entries(ENGINES).map(([key, item]) => `- ${key}: best for ${item.strengths}; watch out: ${item.risks}.`),
      'What usually happens when engines mix (weigh it, do not follow it blindly):',
      ...COMBINATIONS.map(item => `- ${item}`),
      MOTION_LAYER,
      mix ? `Drawn shots name their engine in sketch.engine: ${DRAW_ENGINES.join(', ')}. An atelier shot carries a "frame" instead of a sketch.`
        : `When a shot leaves the main look (another engine or source), say why in its notes in one sentence. Drawn shots name their engine in sketch.engine: ${drawEngines(primary).join(', ')}. An atelier shot carries a "frame" instead of a sketch.`,
    ]),
    ...(stickman ? [`STICKMAN LOOK: ${LOOKS[look].name}. ${LOOKS[look].plan}`] : []),
    ...(stickMix ? [`STICKMAN LOOKS (mix): this video uses every stickman look. Give each stickman shot its look in sketch.look, chosen for what its scene needs: ${Object.entries(LOOKS).map(([key, item]) => `${key} (${item.name}): ${item.plan}`).join(' ')} ${MIX_RULE}`] : []),
    ...(primary === 'handdrawn' || mix ? [`HAND-DRAWN SHOTS: ${ENGINES.handdrawn.plan}${BOARDS[board] ? ` WHITEBOARD LOOK: ${BOARDS[board].name}. ${BOARDS[board].plan}` : ''}`] : []),
    ...(docName(design) && motionMain ? [`DOCUMENTARY LOOK: ${docName(design).name}. ${docName(design).plan}${design === 'footage' && !footage ? ' Footage is not connected on this PC (no stock or image key), so build it from the documentary drawn shots with the same motion graphics.' : ''}`] : []),
    ...(design === 'mix' && motionMain ? [`DOCUMENTARY LOOKS (mix): this video uses every documentary look. Give each drawn shot its look in sketch.design, chosen for what its scene needs: ${Object.entries(DESIGNS).map(([key, item]) => `${key} (${item.name}): ${item.plan}`).join(' ')}${footage ? ` Footage shots (stock or image sources): ${FOOTAGE.plan}` : ''} ${MIX_RULE}`] : []),
    ...(boardMix ? [`WHITEBOARD LOOKS (mix): this video uses every whiteboard look. Give each hand-drawn shot its look in sketch.board, chosen for what its scene needs: ${Object.entries(BOARDS).map(([key, item]) => `${key} (${item.name}): ${item.plan}`).join(' ')} ${MIX_RULE}`] : []),
    ...(FILMS[film] ? [`FILM LOOK: ${FILMS[film].name}. ${FILMS[film].plan} ${FILM_RULE}`] : []),
    ...(film === 'choose' ? [`FILM LOOK: choose one film look for this whole video, or none, and set it on every drawn shot as sketch.film: ${Object.entries(FILMS).map(([key, item]) => `${key} (${item.name}): ${item.plan}`).join(' ')} A second look only for a change of register (a flashback, an archive memory), with the reason in notes.`] : []),
    'TASTE: references are ideas, never rules. Choose places, colour, composition, effects and transitions that make each scene appealing and catchy for this audience, and say why when it matters.',
    // A style learned from an approved study: its techniques in our own words (never copy the reference).
    ...(brief ? [`LEARNED LOOK (from an approved style study; use the techniques, never copy a channel): ${brief}`] : []),
  ].join('\n');
}

module.exports = {ENGINES, COMBINATIONS, PRIMARY_BY_ADAPTER, DRAW_ENGINES, LOOKS, BOARDS, DESIGNS, FILMS, FILM_RULE, GRADES, CINEMA, FOOTAGE, MOTION_LAYER, primaryEngine, isMix, engineScope, drawEngines, plannerSources, promptGuide};
