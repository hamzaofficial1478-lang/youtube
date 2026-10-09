'use strict';
// P06d - The editing engines and how Claude reasons about combining them. Four engines make the pictures:
//   montage   - stock and archival footage, photos, AI images and AI video (cut by the editing brain)
//   stickman  - cartoon stick characters acting the narration in built sets (drawn by the program)
//   handdrawn - ink illustrations drawn on paper, line by line (drawn by the program)
//   motion    - flat motion graphics: kinetic type, icons, counters, charts (drawn by the program)
//   atelier   - a shot designed from scratch by Claude as an animated page in this video's art direction (P06h,
//               the HyperFrames method; rendered by the program)
// A style's renderer sets the video's main look. Nothing here forbids a combination: the planner reads each
// engine's strengths and the usual effects of mixing them, decides per video and per shot, and writes its
// reason in the shot's notes. The style's own visual sources (Room 03, the owner's choice) are the only limit.
// Pure: no I/O.

const ENGINES = Object.freeze({
  montage: {name: 'Footage montage', draws: false, finish: null, strengths: 'real places, people, events and products; evidence and atmosphere', risks: 'cannot show mechanisms, numbers or things nobody filmed; generic B-roll under abstract lines feels lazy'},
  stickman: {name: 'Stickman animation', draws: true, finish: 'cartoon', strengths: 'people and situations acted out: emotions, mistakes, reactions, humour, cause and effect, "you" moments, energy', risks: 'cartoon tone can undercut a grave or sensitive subject'},
  handdrawn: {name: 'Hand-drawn illustration', draws: true, finish: 'ink', strengths: 'storytelling, history, essays and how-it-works sketches with a warm, crafted feel; ink figures and illustrated places', risks: 'slower, calmer rhythm; a cartoon stick figure beside an ink illustration can look like two different films'},
  atelier: {name: 'Atelier (designed per shot)', draws: false, composes: true, finish: null, strengths: 'anything designed from scratch for this video: kinetic typography, a number that must hit, a diagram or chart assembling, an abstract visual metaphor, a comparison, a list, a title; a look nobody else has', risks: 'each shot costs Claude tokens to design; it cannot keep the drawn cast (people stay in stickman or hand-drawn shots); many atelier shots in a row read as slides unless the beats and framings vary'},
  motion: {name: 'Motion graphics', draws: true, finish: 'flat', strengths: 'numbers, comparisons, lists, processes, timelines, kinetic words and emphasis; clean and fast', risks: 'with no person or place it can feel cold; long runs of it read as slides'},
});

const PRIMARY_BY_ADAPTER = Object.freeze({'ffmpeg-montage': 'montage', 'cinematic-hybrid': 'montage', 'ffmpeg-sketch': 'stickman', 'canvas-frames': 'handdrawn', 'motion-graphics': 'motion', atelier: 'atelier'});

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
function promptGuide(primary) {
  return [
    `ENGINES. This video's main look is ${ENGINES[primary].name} (${primary}). You decide, shot by shot, which engine and source serve the line best; the video must still feel like one film.`,
    ...Object.entries(ENGINES).map(([key, item]) => `- ${key}: best for ${item.strengths}; watch out: ${item.risks}.`),
    'What usually happens when engines mix (weigh it, do not follow it blindly):',
    ...COMBINATIONS.map(item => `- ${item}`),
    `When a shot leaves the main look (another engine or source), say why in its notes in one sentence. Drawn shots name their engine in sketch.engine: ${drawEngines(primary).join(', ')}. An atelier shot carries a "frame" instead of a sketch.`,
  ].join('\n');
}

module.exports = {ENGINES, COMBINATIONS, PRIMARY_BY_ADAPTER, DRAW_ENGINES, primaryEngine, drawEngines, plannerSources, promptGuide};
