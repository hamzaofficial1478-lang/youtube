'use strict';
// P06d - The editing engines and how they work together. Four engines make the pictures:
//   montage   - stock and archival footage, photos, AI images and AI video (cut by the editing brain)
//   stickman  - cartoon stick characters acting the narration in built sets (drawn by the program)
//   handdrawn - ink illustrations drawn on paper, line by line (drawn by the program)
//   motion    - flat motion graphics: kinetic type, icons, counters, charts (drawn by the program)
// A style has one primary engine (from its renderer). Partners join it in fixed roles; pairs that clash are
// never offered, and the reason is written down so the planner, the Scene Room and the owner see the same rule.
// Pure: no I/O.

const ENGINES = Object.freeze({
  montage: {name: 'Footage montage', draws: false, finish: null, note: 'Stock and archival footage, photos, AI images and AI video, cut to the narration.'},
  stickman: {name: 'Stickman animation', draws: true, finish: 'cartoon', note: 'Cartoon stick characters with looks, expressions and gestures, acting each line inside a built set.'},
  handdrawn: {name: 'Hand-drawn illustration', draws: true, finish: 'ink', note: 'Ink illustrations drawn on paper stroke by stroke, with a living line and ink-figure characters.'},
  motion: {name: 'Motion graphics', draws: true, finish: 'flat', note: 'Flat icons, kinetic words, counters, bursts and diagrams with snappy easing.'},
});

const PRIMARY_BY_ADAPTER = Object.freeze({'ffmpeg-montage': 'montage', 'cinematic-hybrid': 'montage', 'ffmpeg-sketch': 'stickman', 'canvas-frames': 'handdrawn', 'motion-graphics': 'motion'});

// pair[primary][partner]: a role when they work together, or `no` with the reason they do not.
const PAIRS = Object.freeze({
  stickman: {
    motion: {role: 'The motion layer inside every stick scene (kinetic words, counters, bursts, speed lines, circles, ticks and crosses, camera punches) and full-screen motion shots for numbers, lists and comparisons.', maxShare: 0.25},
    handdrawn: {no: 'Two drawing languages in one video: an ink illustration next to a cartoon stick figure looks unfinished.'},
    montage: {no: 'Real footage, photos or painted AI images between cartoon stick scenes break the look; the drawings carry the whole video.'},
  },
  handdrawn: {
    motion: {role: 'Inked motion inside the illustrations (counters, highlights, underlines, circles, arrows) and full-screen inked diagrams or charts.', maxShare: 0.25},
    stickman: {no: 'A cartoon stick figure inside an ink illustration clashes with the hand-drawn look (owner rule, 2026-10-08).'},
    montage: {no: 'Footage between ink drawings breaks the hand-made look; an essay that needs footage uses the documentary style with hand-drawn partners.'},
  },
  motion: {
    stickman: {role: 'Character moments: a stick figure reacts inside a motion shot when the line is about people.', maxShare: 0.3},
    montage: {role: 'Stock footage as the background plate between motion shots, when the line names a real place or thing.', maxShare: 0.3},
    handdrawn: {no: 'Ink drawings next to flat motion graphics read as two different videos.'},
  },
  montage: {
    motion: {role: 'Titles, stat reveals, dates, quotes, charts and timelines over the footage (Editing Room), plus full-screen motion explainers for a number or a process.', maxShare: 0.25},
    handdrawn: {role: 'Ink explainer cutaways between the footage: how something works, a mechanism or a sketch map no footage can show.', maxShare: 0.3},
    stickman: {no: 'Cartoon stick figures next to real footage undermine a documentary\'s credibility.'},
  },
});

const primaryEngine = spec => PRIMARY_BY_ADAPTER[spec?.renderer?.adapter] || 'montage';
const partners = primary => Object.entries(PAIRS[primary] || {}).filter(([, pair]) => pair.role).map(([engine, pair]) => ({engine, ...pair}));
const refusals = primary => Object.entries(PAIRS[primary] || {}).filter(([, pair]) => pair.no).map(([engine, pair]) => ({engine, reason: pair.no}));
// The engines that may draw a generated-graphics shot in this video, primary first.
const drawEngines = primary => [primary, ...partners(primary).map(item => item.engine)].filter(engine => ENGINES[engine]?.draws);
const montageAllowed = primary => primary === 'montage' || partners(primary).some(item => item.engine === 'montage');

// The visual sources the scene planner may use: the style's executable sources, minus the ones the primary
// engine does not pair with. Drawing primaries lead with generated graphics. Returns {sources, primary, dropped}.
function plannerSources(spec, executable) {
  const engine = primaryEngine(spec), dropped = [];
  const sources = executable.filter(source => {
    if (source === 'generated-graphics') return drawEngines(engine).length > 0;
    if (montageAllowed(engine)) return true;
    dropped.push({source, reason: PAIRS[engine].montage.no});
    return false;
  });
  const primarySource = ENGINES[engine].draws && sources.includes('generated-graphics') ? 'generated-graphics' : (sources.includes(spec.visuals.primarySource) ? spec.visuals.primarySource : sources[0]);
  return {engine, sources, primarySource, dropped};
}

// Which engine draws a shot: the one Claude named when it may draw here, else the video's first drawing engine.
function shotEngine(primary, requested) {
  const allowed = drawEngines(primary);
  return allowed.includes(requested) ? requested : allowed[0] || 'motion';
}

// The partnership as Claude reads it in the scene-planning prompt.
function promptGuide(primary) {
  const lines = [`ENGINES. This video's primary engine is ${primary} (${ENGINES[primary].note})`];
  for (const item of partners(primary)) lines.push(`- Partner ${item.engine}: ${item.role} At most ${Math.round(item.maxShare * 100)}% of the shots as full ${item.engine} shots.`);
  for (const item of refusals(primary)) lines.push(`- Never use ${item.engine} here: ${item.reason}`);
  const engines = drawEngines(primary);
  if (engines.length) lines.push(`Drawn shots (source generated-graphics) name their engine in sketch.engine: ${engines.join(' or ')} (default ${engines[0]}).`);
  return lines.join('\n');
}

module.exports = {ENGINES, PAIRS, PRIMARY_BY_ADAPTER, primaryEngine, partners, refusals, drawEngines, plannerSources, shotEngine, promptGuide};
