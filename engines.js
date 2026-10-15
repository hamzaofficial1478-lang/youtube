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
  montage: {name: 'Footage montage', draws: false, finish: null, strengths: 'real places, people, events and products; evidence and atmosphere', risks: 'cannot show mechanisms, numbers or things nobody filmed; generic B-roll under abstract lines feels lazy'},
  stickman: {name: 'Stickman animation', draws: true, finish: 'cartoon', strengths: 'people and situations acted out: emotions, mistakes, reactions, humour, cause and effect, "you" moments, energy', risks: 'cartoon tone can undercut a grave or sensitive subject'},
  handdrawn: {name: 'Hand-drawn illustration', draws: true, finish: 'ink', plan: 'An illustrated explainer on white paper (owner reference: "The Economics of Owning a Cargo Fleet"). One idea per drawing: the real object drawn large (the story\'s own kit for anything specific, e.g. a cargo truck or a warehouse), with few or no backgrounds. The explaining is done by annotations that build on the words: a handwritten label with an arrow on the thing (prop "label"), price tags ("tag"), arrow callouts ("callout") and sticky notes ("sticky") for figures and costs, dashed arrows connecting related things, check marks and charts. People are cartoon people (a suit, a cap, a beard), not stick figures; objects may have a cute face ("face": true) and money moves (money-rain, a hand passing cash). A big hand-lettered keyword in a top corner can name the beat ("keyword"); compare two things with a divider down the frame ("versus") and one on each side; show what someone thinks or wants inside a head in profile (prop "head"); use colour for meaning (one accent for money or danger, glows and arrows for heat or force); a small corner label can open a chapter; when the topic allows, carry one metaphor world through the whole video (an economy as a market stall, a body as a city), our own, never a channel\'s. Hold each drawing 2-5 s while its notes arrive; cut hard to the next idea.', strengths: 'illustrated explainers: real objects and cartoon people in ink and coloured pencil on white paper, explained with handwritten labels, arrows, sticky notes, price tags and charts; how money, businesses and mechanisms work; storytelling with a crafted feel', risks: 'slower, calmer rhythm; a cartoon stick figure beside an ink illustration can look like two different films'},
  atelier: {name: 'Atelier (designed per shot)', draws: false, composes: true, finish: null, strengths: 'anything designed from scratch for this video: kinetic typography, a number that must hit, a diagram or chart assembling, an abstract visual metaphor, a comparison, a list, a title; a look nobody else has', risks: 'each shot costs Claude tokens to design; it cannot keep the drawn cast (people stay in stickman or hand-drawn shots); many atelier shots in a row read as slides unless the beats and framings vary'},
  motion: {name: 'Motion graphics', draws: true, finish: 'flat', strengths: 'numbers, comparisons, lists, processes, timelines, kinetic words and emphasis; clean and fast', risks: 'with no person or place it can feel cold; long runs of it read as slides'},
});

// The story mix draws a shot without a named engine as stickman (the cast's home), but no engine leads.
const PRIMARY_BY_ADAPTER = Object.freeze({'ffmpeg-montage': 'montage', 'cinematic-hybrid': 'montage', 'ffmpeg-sketch': 'stickman', 'canvas-frames': 'handdrawn', 'motion-graphics': 'motion', atelier: 'atelier', 'story-mix': 'stickman'});
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
  doodle: {name: 'doodle', plan: 'Marker doodles on a white page with a bold ground. Show every line literally with a visual gag (to explain that water was far away, a man carries a whole pond on his head). Reactions in face close-ups (a figure size xl, focus zoom on the face, big expressions, sweat or shock emotes). Objects may have faces. Very quick cuts (1-3 s), no camera moves beyond a punch-in.'},
});

const primaryEngine = spec => PRIMARY_BY_ADAPTER[spec?.renderer?.adapter] || 'montage';
const DRAW_ENGINES = Object.freeze(Object.keys(ENGINES).filter(key => ENGINES[key].draws));
// Every drawing engine may draw a shot; the video's main look leads when it draws.
const drawEngines = primary => (ENGINES[primary]?.draws ? [primary, ...DRAW_ENGINES.filter(engine => engine !== primary)] : [...DRAW_ENGINES]);

// The visual sources the planner may use are exactly the style's executable sources. Drawing styles lead with
// drawn shots. Returns {engine, sources, primarySource}.
function plannerSources(spec, executable) {
  const engine = primaryEngine(spec);
  const primarySource = (ENGINES[engine].draws || ENGINES[engine].composes) && executable.includes('generated-graphics') ? 'generated-graphics' : (executable.includes(spec.visuals.primarySource) ? spec.visuals.primarySource : executable[0]);
  return {engine, sources: [...executable], primarySource};
}

// The engines as Claude reads them in the scene-planning prompt.
function promptGuide(primary, {mix = false, look = null, brief = null} = {}) {
  const stickman = LOOKS[look] && look !== 'classic' && (mix || primary === 'stickman');
  return [
    mix ? 'ENGINES. This video is a story mix: no engine leads. Each beat gets the engine that serves its job best (see the story director), and the video must still feel like one film.'
      : `ENGINES. This video's main look is ${ENGINES[primary].name} (${primary}). You decide, shot by shot, which engine and source serve the line best; the video must still feel like one film.`,
    ...Object.entries(ENGINES).map(([key, item]) => `- ${key}: best for ${item.strengths}; watch out: ${item.risks}.`),
    'What usually happens when engines mix (weigh it, do not follow it blindly):',
    ...COMBINATIONS.map(item => `- ${item}`),
    mix ? `Drawn shots name their engine in sketch.engine: ${DRAW_ENGINES.join(', ')}. An atelier shot carries a "frame" instead of a sketch.`
      : `When a shot leaves the main look (another engine or source), say why in its notes in one sentence. Drawn shots name their engine in sketch.engine: ${drawEngines(primary).join(', ')}. An atelier shot carries a "frame" instead of a sketch.`,
    ...(stickman ? [`STICKMAN LOOK: ${LOOKS[look].name}. ${LOOKS[look].plan}`] : []),
    ...(primary === 'handdrawn' || mix ? [`HAND-DRAWN SHOTS: ${ENGINES.handdrawn.plan}`] : []),
    // A style learned from an approved study: its techniques in our own words (never copy the reference).
    ...(brief ? [`LEARNED LOOK (from an approved style study; use the techniques, never copy a channel): ${brief}`] : []),
  ].join('\n');
}

module.exports = {ENGINES, COMBINATIONS, PRIMARY_BY_ADAPTER, DRAW_ENGINES, LOOKS, primaryEngine, isMix, drawEngines, plannerSources, promptGuide};
