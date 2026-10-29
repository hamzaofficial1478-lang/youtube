'use strict';
// Room 03 - Style Library & Assignment.
// Owns versioned editing-style profiles, human review of each revision, and the
// explicit family default / channel override / approved-fallback assignments that
// later rooms (scenes, editing, captions, render) must lock into their manifests.
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');
const T = require('./transitions');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();

const FORMATS = ['long-form', 'shorts'];
const FRAME_RATES = [24, 25, 30, 50, 60];
const RESOLUTIONS = {'long-form': ['1920x1080', '2560x1440', '3840x2160'], shorts: ['1080x1920']};
const ASPECT = {'long-form': '16:9', shorts: '9:16'};
// Every transition of the catalogue, the older short names, and two kept only so older styles stay valid.
const TRANSITIONS = ['cut', ...T.NAMES, 'match-cut', 'morph'];
// What a launch style allows: every transition; Claude chooses per scene (owner review 2026-10-16).
const ALL_TRANSITIONS = () => ['cut', ...Object.keys(T.CATALOG)];
const CAMERA_MOVES = ['static', 'ken-burns', 'pan', 'zoom', 'parallax', 'handheld-sim', 'tracking'];
const EASING = ['linear', 'ease-in-out', 'spring'];
const TEXT_CASE = ['sentence', 'title', 'upper'];
const CAPTION_MODES = ['burned-in', 'sidecar', 'both'];
const CAPTION_POSITIONS = ['bottom', 'center', 'top'];
const VISUAL_SOURCES = ['stock-video', 'stock-image', 'ai-image', 'ai-video', 'generated-graphics', 'maps-and-diagrams', 'archival-public-domain'];
const AI_DISCLOSURE = ['review-per-asset', 'always-disclose'];
const SFX_USAGE = ['none', 'subtle', 'accent', 'rich'];
const OWNER_REFERENCE_LIMIT = 30;
const PROFILE_LIMIT = 60;

// Renderer adapters a style can target. Readiness is runtime truth, not a promise:
// every adapter stays "not_implemented" until its milestone passes real fixtures.
const RENDERERS = {
  'ffmpeg-montage': {
    // 0.37 (owner decision 2026-10-18): the Documentary engine - footage with motion graphics, the cartoon documentary,
    // the painted story and the designed looks that were the motion engine's in 0.35.
    features: ['Looks: Footage with motion graphics, Cartoon documentary, Painted story, Vector world, Infographic, Collage, Data desk, or Mix of all documentary looks, or only the ones you tick (choose in the style)', 'Mix uses only documentary looks; for every engine at once choose the Story Mix style', 'Real maps: countries colour in, armies march as arrows, pins drop; crowds for nations and armies', 'Footage needs a stock or image key (Pexels and Pixabay keys are free); without one the drawn looks carry the video', 'Paid pictures where they count: Claude draws a detailed picture for the shots that need one, the program draws the rest free', 'Film looks for every drawn shot (0.39): 1920s silent film, film noir, old photograph, one-colour black and white, newspaper, risograph, blueprint, woodcut, 1950s TV, Technicolor, family album, silkscreen, engraving, art deco gold, or Claude chooses'],
    name: 'Documentary', milestone: 'P05', status: 'built', firstProof: true,
    note: 'First executable target: stock and AI stills/clips, Ken Burns moves, cuts and crossfades, rendered deterministically with FFmpeg.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30, 50, 60], transitions: TRANSITIONS, cameraMoves: ['static', 'ken-burns', 'pan', 'zoom']},
  },
  'ffmpeg-sketch': {
    features: ['Looks: Classic, Whiteboard, Storybook, Doodle, Illustrated, or Mix of all Stickman looks, or only the ones you tick (choose in the style)', 'Mix uses only Stickman looks; for every engine at once choose the Story Mix style', 'Motion graphics in every shot: kinetic words, counters, maps, charts, timelines and crowds, drawn in this engine\'s look', 'Option: a hand draws each scene', 'Paid pictures where they count: Claude draws a detailed picture for the shots that need one, the program draws the rest free', 'A cast with looks, poses and expressions in built sets, on the narrator\'s words', 'Film looks for every drawn shot (0.39): 1920s silent film, film noir, old photograph, one-colour black and white, newspaper, risograph, blueprint, woodcut, 1950s TV, Technicolor, family album, silkscreen, engraving, art deco gold, or Claude chooses'],
    name: 'FFmpeg sketch compositor', milestone: 'P05+', status: 'built',
    note: 'Stickman engine (0.20): cartoon stick characters with looks, expressions and gestures act each line in built sets, with a motion-graphics layer; every drawing arrives on the narrator\'s words. Drawn in the local browser and cut with the narration, captions and graphics.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30], transitions: TRANSITIONS, cameraMoves: ['static', 'pan', 'zoom', 'ken-burns']},
  },
  'canvas-frames': {
    features: ['Whiteboard animation: a hand draws people, objects and words, then colours them in', 'Looks: Colour cartoon, Black marker, Pencil sketch, Framed board, Dry-erase markers, or Mix of all whiteboard looks, or only the ones you tick (choose in the style)', 'Mix uses only whiteboard looks; for every engine at once choose the Story Mix style', 'Motion graphics in every shot: kinetic words, counters, maps, charts, timelines and crowds, drawn in this engine\'s look', 'Paid pictures where they count: Claude draws a detailed picture for the shots that need one, the program draws the rest free', 'People drawn as people: proportions, clothes, hands and expressive faces', 'Film looks for every drawn shot (0.39): 1920s silent film, film noir, old photograph, one-colour black and white, newspaper, risograph, blueprint, woodcut, 1950s TV, Technicolor, family album, silkscreen, engraving, art deco gold, or Claude chooses'],
    name: 'Hand-drawn canvas frames', milestone: 'P05+', status: 'built',
    note: 'Hand-drawn engine (0.20): ink illustrations and ink figures drawn on paper with a living line, plus inked motion graphics; drawn frame by frame in the local browser, then assembled like a montage.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30], transitions: TRANSITIONS, cameraMoves: ['static', 'pan', 'zoom', 'parallax']},
  },
  'motion-graphics': {
    // 0.37: no longer an editing style (motion graphics are a layer of every engine); kept so older styles still work.
    features: ['Not an editing style since 0.37: motion graphics are part of every engine, and these designs are Documentary looks'],
    name: 'Motion graphics compositor', milestone: 'P05+', status: 'built',
    note: 'Motion-graphics engine (0.20): flat icons, kinetic words, counters and effects, with stick-figure moments and stock plates as partners, plus the animated charts, timelines and lists of the Editing Room; assembled like a montage.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30, 50, 60], transitions: TRANSITIONS, cameraMoves: ['static', 'pan', 'zoom', 'parallax', 'tracking']},
  },
  atelier: {
    features: ['Every shot designed by Claude for this video'],
    name: 'Atelier compositions', milestone: 'P06h', status: 'built',
    note: 'Atelier engine (0.25): Claude designs every shot from scratch as an animated page (HyperFrames method: art direction, blueprints, motion rules, voice-paced reveals); the program checks each one and renders it frame by frame in the local browser, timed onto the narrator\'s words. Drawn and stock shots can join it.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30, 50, 60], transitions: TRANSITIONS, cameraMoves: ['static', 'pan', 'zoom', 'parallax', 'tracking']},
  },
  'story-mix': {
    features: ['Mix of ALL engines: Stickman, Whiteboard, Documentary and Atelier in one video', 'The story director picks the engine for each beat; each engine still uses its own looks', 'Film looks for every drawn shot (0.39): 1920s silent film, film noir, old photograph, one-colour black and white, newspaper, risograph, blueprint, woodcut, 1950s TV, Technicolor, family album, silkscreen, engraving, art deco gold, or Claude chooses'],
    name: 'Story mix (every engine)', milestone: 'P06i', status: 'built',
    note: 'Story mix (0.26): no engine leads. Claude\'s story director reads the whole script, finds its chapters, hook and turns, and picks stickman, hand-drawn, atelier, motion graphics or footage for each beat by its job, with a rhythm made for long videos. Drawn and designed shots are rendered by the program on the narrator\'s words.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30], transitions: TRANSITIONS, cameraMoves: ['static', 'pan', 'zoom', 'parallax']},
  },
  'cinematic-hybrid': {
    // 0.40: the Cinematic engine - real footage cut with film grammar, graded as one film (render.js GRADE_FILTERS).
    features: ['Real stock footage cut like a film: shot sizes, continuity of direction and light, cuts on motion', 'One colour grade for the whole video: natural, teal and orange, golden hour, bleach bypass, cold thriller, black and white, vintage film, moody, or Claude chooses for the story', 'Film grain and cinema bars (2.39:1) on long videos', 'Designed titles: place and date supers, the one number that matters, chapter titles', 'Nothing drawn: no characters, maps or charts (use the Documentary engine for those)', 'Footage needs a stock or image key (Pexels and Pixabay keys are free)'],
    name: 'Cinematic', milestone: 'P06u', status: 'built',
    note: 'Cinematic engine (0.40): real moving footage chosen like a cinematographer would (size, subject, movement, light), cut with film grammar and finished as one film: one colour grade on every clip, film grain and cinema bars, with designed titles from the editing brain. Rendered with the pinned FFmpeg.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30], transitions: TRANSITIONS, cameraMoves: CAMERA_MOVES},
  },
};

const STANDARD_PROHIBITED = [
  'Copying another channel\'s script wording, footage, thumbnails, characters or recurring jokes',
  'Imitating a living artist\'s signature style',
  'Presenting AI-generated imagery as real footage or real events',
];

// The launch library's current version. Profiles the owner has not revised follow it: a newer launch spec is
// added as a draft revision (never approved or assigned automatically).
const LAUNCH_VERSION = 'Launch library v12';
// 'mix' (0.34): the video uses every look of the engine; Claude picks the look per scene.
const DRAWING_LOOKS = Object.freeze(['classic', 'whiteboard', 'storybook', 'doodle', 'illustrated', 'mix']);
// The hand-drawn engine's whiteboard looks (0.32).
const DRAWING_BOARDS = Object.freeze(['cartoon', 'marker', 'pencil', 'framed', 'dry-erase', 'mix']);
// The Documentary engine's looks (0.37; the motion engine's designs in 0.35), or a mix of them. Footage is a look of the
// style only (real footage led by motion graphics); the others are drawn.
const DRAWING_DESIGNS = Object.freeze(['footage', 'cartoon', 'painted', 'vector', 'infographic', 'kinetic', 'collage', 'data', 'mix']);
// Film looks (0.39, engines.js FILMS): one medium finish for every drawn shot, or Claude chooses one per video.
const DRAWING_FILMS = Object.freeze(['none', 'choose', ...Object.keys(require('./engines').FILMS)]);
// The Cinematic engine's colour grades (0.40, engines.js GRADES), or Claude chooses one per video.
const CINEMA_GRADES = Object.freeze(['choose', ...Object.keys(require('./engines').GRADES)]);
// The picture type of a drawing engine (0.63): cartoon, natural or a mix chosen per scene; engines that draw nothing
// (Cinematic) or design every shot (Atelier) keep their own pictures.
const PICTURE_TYPES = Object.freeze(['cartoon', 'natural', 'mix']);
const PICTURE_TYPE_ADAPTERS = Object.freeze(['ffmpeg-sketch', 'canvas-frames', 'ffmpeg-montage', 'motion-graphics', 'story-mix']);
// The Stickman engine's looks are features of its one style (owner review 2026-10-16: the Style Library shows the
// main editing engines only). Choosing a look in the style editor fills in its recommended settings, which the
// owner can still change; the drawing itself follows drawing.look.
const LOOK_PRESETS = Object.freeze({
  classic: {hand: false, palette: {background: '#FFFFFF', primary: '#1F1F1F', accent: '#E0753E', text: '#1F1F1F'}, pacing: {shotMinSeconds: 1.2, shotMaxSeconds: 4.5, hookShotMaxSeconds: 2, maxStaticHoldSeconds: 5}, transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800}, intensity: 60},
  whiteboard: {hand: true, palette: {background: '#FFFFFF', primary: '#1E1E1E', accent: '#2F6FE0', text: '#1E1E1E'}, pacing: {shotMinSeconds: 2, shotMaxSeconds: 7, hookShotMaxSeconds: 3, maxStaticHoldSeconds: 7}, transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800}, intensity: 35},
  storybook: {hand: false, palette: {background: '#F3E7D7', primary: '#4E3E35', accent: '#B5473A', text: '#3B2F28'}, pacing: {shotMinSeconds: 1.5, shotMaxSeconds: 3.5, hookShotMaxSeconds: 2, maxStaticHoldSeconds: 4}, transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800}, intensity: 30},
  doodle: {hand: false, palette: {background: '#FFFFFF', primary: '#141414', accent: '#E8A317', text: '#141414'}, pacing: {shotMinSeconds: 1, shotMaxSeconds: 3, hookShotMaxSeconds: 1.5, maxStaticHoldSeconds: 3}, transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800}, intensity: 55},
  illustrated: {hand: false, palette: {background: '#FFFFFF', primary: '#222222', accent: '#D9534F', text: '#222222'}, pacing: {shotMinSeconds: 2, shotMaxSeconds: 5.5, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 6}, transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800}, intensity: 25},
});
// Launch profiles that are gone from the library, with the reason. A copy the owner never approved, assigned or
// revised is retired automatically, so it leaves the library list.
const LOOKS_MOVED = 'The stickman looks are features of the Stickman engine now: choose them in its style, not as separate styles.';
const RETIRED_LAUNCH = Object.freeze({'stickman-whiteboard': LOOKS_MOVED, 'stickman-storybook': LOOKS_MOVED, 'stickman-doodle': LOOKS_MOVED,
  'motion-graphics': 'Motion graphics are not an editing style any more (owner decision 2026-10-18): they are part of every engine, and the motion designs are looks of the Documentary engine.'});
const LAUNCH_PROFILES = [
  {key: 'stickman-sketch-explainer', upgrade: 'Launch library v12 (0.41): fonts that ship with Windows (Segoe UI for text); the earlier Inter was not installed, so the text was drawn in another face. Launch library v3 (0.21): the stickman engine. Drawn shots lead; stock photos, footage and AI images stay available and Claude decides when the script needs one, with its reason. Faster energetic pacing, a richer motion layer and sound accents.', spec: {
    name: 'Stickman Sketch Explainer',
    summary: 'Cartoon stick characters with distinct looks, expressions and gestures act every line inside built sets, with kinetic words and effects on the narrator\'s words; energetic, word-timed and never still.',
    bestFit: ['Educational explainers', 'Business and money concepts', 'Psychology and how-it-works'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 30, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 1.2, shotMaxSeconds: 4.5, hookShotMaxSeconds: 2, maxStaticHoldSeconds: 5},
    transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800},
    motion: {cameraMoves: ['static', 'pan', 'zoom'], intensity: 60, easing: 'ease-in-out'},
    typography: {headingFont: 'Patrick Hand', bodyFont: 'Segoe UI', maxWordsOnScreen: 6, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#FFFFFF', primary: '#1F1F1F', accent: '#E0753E', text: '#1F1F1F'},
    captions: {mode: 'both', maxCharsPerLine: 42, maxLines: 2, position: 'bottom', activeWordHighlight: true, safeAreaPercent: 8},
    visuals: {sources: ['generated-graphics', 'stock-image', 'stock-video', 'ai-image'], primarySource: 'generated-graphics', aiDisclosure: 'review-per-asset', characterConsistency: true},
    audio: {musicMoods: ['upbeat', 'curious', 'playful'], duckingDb: -18, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'rich'},
    renderer: {adapter: 'ffmpeg-sketch'},
    qc: {maxBlackSeconds: 0.5, maxFrozenSeconds: 5, minSceneSeconds: 1.5, maxSceneSeconds: 12, contactSheetEverySeconds: 3},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'hand-drawn-canvas', upgrade: 'Launch library v12 (0.41): fonts that ship with Windows (Segoe UI for text); the earlier Inter was not installed, so the text was drawn in another face. Launch library v8 (0.32): the hand-drawn engine is whiteboard animation (owner references 2026-10-16): a hand draws people, objects and words line by line and colours them in; looks: colour cartoon, black marker, pencil sketch, framed board, dry-erase markers.', spec: {
    name: 'Hand-drawn Whiteboard',
    summary: 'Whiteboard animation: a hand draws people, objects and words on a whiteboard, line by line on the narrator\'s words, then colours them in; the board moves on to the next picture.',
    bestFit: ['Self-improvement and psychology', 'Business and money explained', 'Big ideas and stories'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 24, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 2.5, shotMaxSeconds: 8, hookShotMaxSeconds: 3, maxStaticHoldSeconds: 8},
    transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800},
    motion: {cameraMoves: ['static', 'pan', 'zoom', 'parallax'], intensity: 20, easing: 'ease-in-out'},
    typography: {headingFont: 'Caveat', bodyFont: 'Segoe UI', maxWordsOnScreen: 8, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#FFFFFF', primary: '#1E1E1E', accent: '#2F6FE0', text: '#1E1E1E'},
    captions: {mode: 'both', maxCharsPerLine: 40, maxLines: 2, position: 'bottom', activeWordHighlight: false, safeAreaPercent: 8},
    visuals: {sources: ['generated-graphics', 'stock-image', 'ai-image', 'archival-public-domain'], primarySource: 'generated-graphics', aiDisclosure: 'review-per-asset', characterConsistency: true},
    audio: {musicMoods: ['warm', 'reflective', 'acoustic'], duckingDb: -20, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'subtle'},
    renderer: {adapter: 'canvas-frames'},
    drawing: {look: 'classic', hand: true, board: 'cartoon'},
    qc: {maxBlackSeconds: 0.8, maxFrozenSeconds: 8, minSceneSeconds: 2, maxSceneSeconds: 14, contactSheetEverySeconds: 5},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'story-mix', upgrade: 'Launch library v12 (0.41): fonts that ship with Windows (Segoe UI for text); the earlier Inter was not installed, so the text was drawn in another face. Launch library v10 (0.37): the mix of ALL engines - stickman, whiteboard, documentary and atelier - each in its own looks; motion graphics are part of every engine.', spec: {
    name: 'Story Mix · every engine',
    summary: 'The mix of all engines: stick characters for people and feelings, whiteboard drawings for how things work, documentary looks for history, places and evidence, Claude-designed shots for the numbers and turns, footage for the real thing. Built for long videos that must not bore.',
    bestFit: ['Long explainers (8 minutes and more)', 'Science, history and money stories', 'Channels that want a look nobody else has'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 30, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 1.2, shotMaxSeconds: 6, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 6},
    transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800},
    motion: {cameraMoves: ['static', 'pan', 'zoom', 'parallax'], intensity: 60, easing: 'ease-in-out'},
    typography: {headingFont: 'Patrick Hand', bodyFont: 'Segoe UI', maxWordsOnScreen: 6, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#FFFDF8', primary: '#1F1F1F', accent: '#E0753E', text: '#1F1F1F'},
    captions: {mode: 'both', maxCharsPerLine: 42, maxLines: 2, position: 'bottom', activeWordHighlight: true, safeAreaPercent: 8},
    visuals: {sources: ['generated-graphics', 'stock-image', 'stock-video', 'ai-image'], primarySource: 'generated-graphics', aiDisclosure: 'review-per-asset', characterConsistency: true},
    audio: {musicMoods: ['curious', 'upbeat', 'cinematic'], duckingDb: -18, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'rich'},
    renderer: {adapter: 'story-mix'},
    qc: {maxBlackSeconds: 0.5, maxFrozenSeconds: 6, minSceneSeconds: 1.5, maxSceneSeconds: 14, contactSheetEverySeconds: 3},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'atelier', upgrade: 'Launch library v4 (0.25): new. Every shot is designed for its video by Claude (HyperFrames method), so no two videos share a look.', spec: {
    name: 'Atelier · designed per video',
    summary: 'Every shot is designed from scratch for its video: an art direction made for the topic, then kinetic type, diagrams, charts and visual metaphors built on the narrator\'s words.',
    bestFit: ['Explainers on any topic', 'Data and concept stories', 'Fast hooks and Shorts', 'Brand-free, distinctive channels'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 30, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 1.5, shotMaxSeconds: 6, hookShotMaxSeconds: 2, maxStaticHoldSeconds: 6},
    transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800},
    motion: {cameraMoves: ['static', 'zoom', 'pan', 'parallax', 'tracking'], intensity: 60, easing: 'ease-in-out'},
    typography: {headingFont: 'Bahnschrift', bodyFont: 'Segoe UI', maxWordsOnScreen: 6, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#F7F4EE', primary: '#1F1F1F', accent: '#E0753E', text: '#1F1F1F'},
    captions: {mode: 'burned-in', maxCharsPerLine: 40, maxLines: 2, position: 'bottom', activeWordHighlight: true, safeAreaPercent: 8},
    visuals: {sources: ['generated-graphics', 'stock-image', 'stock-video', 'ai-image'], primarySource: 'generated-graphics', aiDisclosure: 'review-per-asset', characterConsistency: true},
    audio: {musicMoods: ['modern', 'curious', 'driving'], duckingDb: -18, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'subtle'},
    renderer: {adapter: 'atelier'},
    qc: {maxBlackSeconds: 0.3, maxFrozenSeconds: 5, minSceneSeconds: 1.5, maxSceneSeconds: 12, contactSheetEverySeconds: 3},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'documentary-montage', upgrade: 'Launch library v12 (0.41): fonts that ship with Windows (Segoe UI for text, Georgia for documentary titles); the earlier Inter and Source Serif 4 were not installed, so the titles and text were drawn in other faces. Launch library v10 (0.37): the Documentary engine. Looks: footage with motion graphics, cartoon documentary, painted story, vector world, infographic, collage and data desk, or a mix of them (owner decision 2026-10-18); it uses only documentary looks.', spec: {
    name: 'Documentary',
    summary: 'Documentary storytelling in its own looks: real footage with motion graphics, a cartoon documentary, painted story scenes, flat vector worlds, infographic people, collage cut-outs and data desks, with real maps and charts; chronology follows the narration.',
    bestFit: ['History and culture', 'Finance and economics stories', 'Sourced factual essays'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 30, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 3, shotMaxSeconds: 8, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 8},
    transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800},
    motion: {cameraMoves: ['static', 'ken-burns', 'pan', 'zoom'], intensity: 35, easing: 'ease-in-out'},
    typography: {headingFont: 'Georgia', bodyFont: 'Segoe UI', maxWordsOnScreen: 8, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#0E0E0E', primary: '#F2EEE6', accent: '#C9A227', text: '#FFFFFF'},
    captions: {mode: 'both', maxCharsPerLine: 42, maxLines: 2, position: 'bottom', activeWordHighlight: false, safeAreaPercent: 8},
    visuals: {sources: ['stock-video', 'stock-image', 'archival-public-domain', 'maps-and-diagrams', 'ai-image', 'generated-graphics'], primarySource: 'stock-video', aiDisclosure: 'always-disclose', characterConsistency: false},
    audio: {musicMoods: ['documentary', 'reflective', 'tense'], duckingDb: -20, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'subtle'},
    renderer: {adapter: 'ffmpeg-montage'},
    drawing: {look: 'classic', hand: false, design: 'mix'},
    qc: {maxBlackSeconds: 1, maxFrozenSeconds: 6, minSceneSeconds: 2.5, maxSceneSeconds: 15, contactSheetEverySeconds: 5},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'cinematic-hybrid', upgrade: 'Launch library v11 (0.40): the Cinematic engine. Real stock footage cut with film grammar (shot sizes, continuity, cuts on motion), one colour grade for the whole video (Claude chooses by default), film grain, cinema bars and designed titles. Footage needs a free Pexels or Pixabay key.', spec: {
    name: 'Cinematic',
    summary: 'Real footage cut like a film: shot grammar and continuity, one colour grade for the whole video, film grain, cinema bars and designed titles, with deliberate sound design.',
    bestFit: ['Narrative essays', 'Trailers and openers', 'Dramatic explainers', 'Travel and places'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 24, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 2, shotMaxSeconds: 6, hookShotMaxSeconds: 1.5, maxStaticHoldSeconds: 6},
    transitions: {allowed: ALL_TRANSITIONS(), default: 'cut', maxDurationMs: 800},
    motion: {cameraMoves: ['static', 'ken-burns', 'pan', 'zoom'], intensity: 45, easing: 'ease-in-out'},
    typography: {headingFont: 'Bahnschrift', bodyFont: 'Segoe UI', maxWordsOnScreen: 5, textCase: 'upper', minTextHeightPercent: 5},
    palette: {background: '#050505', primary: '#EDE6DA', accent: '#D6452F', text: '#FFFFFF'},
    captions: {mode: 'sidecar', maxCharsPerLine: 38, maxLines: 2, position: 'bottom', activeWordHighlight: false, safeAreaPercent: 10},
    visuals: {sources: ['stock-video', 'stock-image', 'ai-image'], primarySource: 'stock-video', aiDisclosure: 'always-disclose', characterConsistency: false},
    audio: {musicMoods: ['cinematic', 'tension', 'epic'], duckingDb: -18, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'rich'},
    renderer: {adapter: 'cinematic-hybrid'},
    cinema: {grade: 'choose', grain: 30, letterbox: true},
    qc: {maxBlackSeconds: 1.5, maxFrozenSeconds: 2, minSceneSeconds: 1.5, maxSceneSeconds: 10, contactSheetEverySeconds: 3},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
];

// ---------------------------------------------------------------- validation
function object(value, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  return value;
}
function text(value, label, min, max) {
  requireValue(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  requireValue(result.length >= min && result.length <= max, `${label} must contain ${min}-${max} characters.`);
  requireValue(!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(result), `${label} contains unsupported control characters.`);
  return result;
}
function number(value, min, max, label, step = null) {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `${label} must be a number from ${min} to ${max}.`);
  if (step) requireValue(Math.abs(Math.round(value / step) * step - value) < 1e-9, `${label} must use steps of ${step}.`);
  return value;
}
function integer(value, min, max, label) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be a whole number from ${min} to ${max}.`);
  return value;
}
function choice(value, allowed, label) {
  requireValue(allowed.includes(value), `Choose a valid ${label}.`);
  return value;
}
// The looks ticked for a mix: absent or empty = every look of the list; otherwise two or more, only while mixing.
function ticked(value, mixing, list, field, label, when) {
  if (value === undefined || value === null || (Array.isArray(value) && !value.length)) return {};
  requireValue(mixing, `Tick ${label} only when ${when}.`);
  return {[field]: subset(value, list.filter(item => !['mix', 'choose', 'none'].includes(item)), label, 2)};
}
function subset(value, allowed, label, min = 1) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= allowed.length, `Choose at least ${min} ${label}.`);
  const unique = [...new Set(value)];
  requireValue(unique.length === value.length, `Choose each ${label} once.`);
  unique.forEach(item => choice(item, allowed, label));
  return allowed.filter(item => unique.includes(item));
}
function textList(value, label, min, max, itemMax) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max, `${label} needs ${min}-${max} entries.`);
  const result = value.map(item => text(item, label, 2, itemMax));
  requireValue(new Set(result.map(item => item.toLowerCase())).size === result.length, `${label} entries must be unique.`);
  return result;
}
function hex(value, label) {
  requireValue(typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value), `${label} must be a #RRGGBB colour.`);
  return value.toUpperCase();
}
function fontName(value, label) {
  const result = text(value, label, 2, 60);
  requireValue(/^[\p{L}\p{N} .'-]+$/u.test(result), `${label} may contain letters, numbers, spaces, dots, apostrophes and hyphens only.`);
  return result;
}

function validateStyleSpec(input) {
  object(input, 'Style specification');
  const formats = subset(input.formats, FORMATS, 'supported format');
  const canvasIn = object(input.canvas, 'Canvas');
  const canvas = {frameRate: choice(canvasIn.frameRate, FRAME_RATES, 'frame rate')};
  if (formats.includes('long-form')) canvas.longFormResolution = choice(canvasIn.longFormResolution, RESOLUTIONS['long-form'], 'long-form resolution');
  if (formats.includes('shorts')) canvas.shortsResolution = choice(canvasIn.shortsResolution, RESOLUTIONS.shorts, 'Shorts resolution');

  const pacingIn = object(input.pacing, 'Pacing');
  const pacing = {
    shotMinSeconds: number(pacingIn.shotMinSeconds, 0.5, 30, 'Minimum shot length', 0.1),
    shotMaxSeconds: number(pacingIn.shotMaxSeconds, 0.5, 60, 'Maximum shot length', 0.1),
    hookShotMaxSeconds: number(pacingIn.hookShotMaxSeconds, 0.5, 10, 'Hook shot length', 0.1),
    maxStaticHoldSeconds: number(pacingIn.maxStaticHoldSeconds, 1, 30, 'Longest static hold', 0.1),
  };
  requireValue(pacing.shotMinSeconds <= pacing.shotMaxSeconds, 'Minimum shot length cannot exceed the maximum shot length.');

  const transitionsIn = object(input.transitions, 'Transitions');
  const allowedTransitions = subset(transitionsIn.allowed, TRANSITIONS, 'transition');
  requireValue(allowedTransitions.includes('cut'), 'Every style must allow a straight cut.');
  const transitions = {
    allowed: allowedTransitions,
    default: choice(transitionsIn.default, allowedTransitions, 'default transition (it must be one of the allowed transitions)'),
    maxDurationMs: integer(transitionsIn.maxDurationMs, 0, 2000, 'Longest transition in milliseconds'),
  };

  const motionIn = object(input.motion, 'Motion');
  const motion = {
    cameraMoves: subset(motionIn.cameraMoves, CAMERA_MOVES, 'camera move'),
    intensity: integer(motionIn.intensity, 0, 100, 'Motion intensity'),
    easing: choice(motionIn.easing, EASING, 'easing'),
  };

  const typographyIn = object(input.typography, 'Typography');
  const typography = {
    headingFont: fontName(typographyIn.headingFont, 'Heading font'),
    bodyFont: fontName(typographyIn.bodyFont, 'Body font'),
    maxWordsOnScreen: integer(typographyIn.maxWordsOnScreen, 1, 40, 'Most words on screen'),
    textCase: choice(typographyIn.textCase, TEXT_CASE, 'text case'),
    minTextHeightPercent: number(typographyIn.minTextHeightPercent, 2, 15, 'Minimum text height', 0.5),
  };

  const paletteIn = object(input.palette, 'Palette');
  const palette = {background: hex(paletteIn.background, 'Background colour'), primary: hex(paletteIn.primary, 'Primary colour'), accent: hex(paletteIn.accent, 'Accent colour'), text: hex(paletteIn.text, 'Text colour')};
  requireValue(contrastRatio(palette.text, palette.background) >= 4.5, `Text colour ${palette.text} on ${palette.background} has contrast ${contrastRatio(palette.text, palette.background).toFixed(2)}:1; on-screen text needs at least 4.5:1.`);

  const captionsIn = object(input.captions, 'Captions');
  const captions = {
    mode: choice(captionsIn.mode, CAPTION_MODES, 'caption mode'),
    maxCharsPerLine: integer(captionsIn.maxCharsPerLine, 16, 60, 'Caption characters per line'),
    maxLines: integer(captionsIn.maxLines, 1, 3, 'Caption lines'),
    position: choice(captionsIn.position, CAPTION_POSITIONS, 'caption position'),
    activeWordHighlight: bool(captionsIn.activeWordHighlight, 'Active-word highlight'),
    safeAreaPercent: integer(captionsIn.safeAreaPercent, 5, 20, 'Caption safe area'),
    // 0.41: how burned-in captions look (captions.js THEMES); without one they are clean.
    ...(captionsIn.theme === undefined || captionsIn.theme === 'clean' ? {} : {theme: choice(captionsIn.theme, Object.keys(require('./captions').THEMES), 'caption theme')}),
  };

  const visualsIn = object(input.visuals, 'Visual sources');
  const sources = subset(visualsIn.sources, VISUAL_SOURCES, 'visual source');
  const visuals = {
    sources,
    primarySource: choice(visualsIn.primarySource, sources, 'primary visual source (it must be one of the allowed sources)'),
    aiDisclosure: choice(visualsIn.aiDisclosure, AI_DISCLOSURE, 'AI disclosure policy'),
    characterConsistency: bool(visualsIn.characterConsistency, 'Character consistency'),
    licenseEvidenceRequired: true,
  };
  if (sources.includes('ai-video')) requireValue(visuals.aiDisclosure === 'always-disclose', 'Styles that use AI video must always disclose synthetic media.');

  const audioIn = object(input.audio, 'Audio');
  const audio = {
    musicMoods: textList(audioIn.musicMoods, 'Music mood', 1, 6, 40),
    duckingDb: number(audioIn.duckingDb, -30, -6, 'Music ducking', 0.5),
    targetLufs: number(audioIn.targetLufs, -24, -9, 'Target loudness', 0.5),
    truePeakDbtp: number(audioIn.truePeakDbtp, -3, -0.5, 'True peak ceiling', 0.1),
    sfxUsage: choice(audioIn.sfxUsage, SFX_USAGE, 'sound-effect usage'),
    licensedOnly: true,
  };

  const rendererIn = object(input.renderer, 'Renderer');
  const adapter = choice(rendererIn.adapter, Object.keys(RENDERERS), 'renderer adapter');
  const renderer = {adapter};
  const support = RENDERERS[adapter].supports;
  const name = RENDERERS[adapter].name;
  formats.forEach(format => requireValue(support.formats.includes(format), `The ${name} renderer cannot produce ${format} videos.`));
  requireValue(support.frameRates.includes(canvas.frameRate), `The ${name} renderer does not support ${canvas.frameRate} fps.`);
  transitions.allowed.forEach(item => requireValue(support.transitions.includes(item), `The ${name} renderer does not support the "${item}" transition.`));
  motion.cameraMoves.forEach(item => requireValue(support.cameraMoves.includes(item), `The ${name} renderer does not support the "${item}" camera move.`));

  // The stickman engine's look (0.29): classic, whiteboard, storybook or doodle, and whether a hand is seen drawing.
  // Optional: a style without it draws the classic look without the hand.
  const drawing = input.drawing === undefined ? null : (() => {
    const drawingIn = object(input.drawing, 'Stickman drawing');
    return {look: choice(drawingIn.look, DRAWING_LOOKS, 'stickman look'), hand: bool(drawingIn.hand, 'Drawing hand'), ...(drawingIn.board === undefined ? {} : {board: choice(drawingIn.board, DRAWING_BOARDS, 'whiteboard look')}), ...(drawingIn.design === undefined ? {} : {design: choice(drawingIn.design, DRAWING_DESIGNS, 'documentary look')}), ...(drawingIn.film === undefined || drawingIn.film === 'none' ? {} : {film: choice(drawingIn.film, DRAWING_FILMS, 'film look')}),
      // 0.62 (owner request 2026-10-28): a mix uses only the looks the owner ticked (two or more); none ticked means every
      // look, as before. The same for whiteboard looks, documentary looks and the film looks Claude chooses from.
      ...ticked(drawingIn.looks, drawingIn.look === 'mix', DRAWING_LOOKS, 'looks', 'stickman looks to mix', 'the stickman look is "mix"'),
      ...ticked(drawingIn.boards, drawingIn.board === 'mix', DRAWING_BOARDS, 'boards', 'whiteboard looks to mix', 'the whiteboard look is "mix"'),
      ...ticked(drawingIn.designs, drawingIn.design === 'mix', DRAWING_DESIGNS, 'designs', 'documentary looks to mix', 'the documentary look is "mix"'),
      ...ticked(drawingIn.films, drawingIn.film === 'choose', DRAWING_FILMS.filter(item => item !== 'none'), 'films', 'film looks to choose from', 'the film look is "choose"'),
      // 0.63 (owner request 2026-10-28): the engine's picture type for every look: cartoon (drawn, as before), natural
      // (realistic scenes painted by ChatGPT) or mix (Claude chooses per scene). Absent means cartoon.
      ...(drawingIn.pictureType === undefined || drawingIn.pictureType === 'cartoon' ? {} : {pictureType: choice(drawingIn.pictureType, PICTURE_TYPES, 'picture type')}),
      // 0.41: hand-made stepped motion (on twos or threes) and a film camera's motion blur on fast moments (unset: on for
      // the Documentary engine's designed shots, off for hand-made looks).
      ...(drawingIn.cadence === undefined || drawingIn.cadence === 'full' ? {} : {cadence: choice(drawingIn.cadence, ['twos', 'threes'], 'drawing cadence')}),
      ...(drawingIn.motionBlur === undefined ? {} : {motionBlur: bool(drawingIn.motionBlur, 'Motion blur')})};
  })();

  // A planning brief learned from an approved style study (0.30), given to Claude's planner. Optional.
  requireValue(!drawing?.pictureType || PICTURE_TYPE_ADAPTERS.includes(adapter), `The ${name} engine keeps its own pictures; the Natural and Mix picture types are for the Stickman, Hand-drawn, Documentary and Story Mix engines.`);
  const brief = input.brief === undefined || input.brief === null || input.brief === '' ? null : text(input.brief, 'Planning brief', 20, 1200);
  // The Cinematic engine's finish (0.40): one colour grade for the video (or Claude chooses), film grain, cinema bars.
  const cinema = input.cinema === undefined ? null : (() => {
    const cinemaIn = object(input.cinema, 'Cinematic finish');
    return {grade: choice(cinemaIn.grade, CINEMA_GRADES, 'colour grade'), grain: integer(cinemaIn.grain, 0, 100, 'Film grain'), letterbox: bool(cinemaIn.letterbox, 'Cinema bars')};
  })();

  const qcIn = object(input.qc, 'Quality checks');
  const qc = {
    maxBlackSeconds: number(qcIn.maxBlackSeconds, 0, 5, 'Longest allowed black', 0.1),
    maxFrozenSeconds: number(qcIn.maxFrozenSeconds, 0, 15, 'Longest allowed frozen frame', 0.1),
    minSceneSeconds: number(qcIn.minSceneSeconds, 0.5, 30, 'Shortest scene', 0.1),
    maxSceneSeconds: number(qcIn.maxSceneSeconds, 2, 120, 'Longest scene', 0.1),
    contactSheetEverySeconds: number(qcIn.contactSheetEverySeconds, 1, 30, 'Contact-sheet interval', 0.5),
  };
  requireValue(qc.minSceneSeconds <= qc.maxSceneSeconds, 'Shortest scene cannot exceed the longest scene.');
  requireValue(qc.maxFrozenSeconds >= Math.min(pacing.maxStaticHoldSeconds, 15) || motion.cameraMoves.some(move => move !== 'static'), 'Frozen-frame QC would fail the style\'s own static holds; allow camera motion or raise the frozen-frame limit.');

  const originalityIn = object(input.originality, 'Originality');
  const originality = {
    referenceSharePercent: integer(originalityIn.referenceSharePercent, 0, OWNER_REFERENCE_LIMIT, 'Reference share (owner rule: at most 30%)'),
    prohibited: textList(originalityIn.prohibited, 'Prohibited technique', 1, 12, 200),
  };

  return {
    name: text(input.name, 'Style name', 3, 60),
    summary: text(input.summary, 'Style summary', 10, 400),
    bestFit: textList(input.bestFit, 'Best fit', 1, 6, 80),
    formats, canvas, pacing, transitions, motion, typography, palette, captions, visuals, audio, renderer, qc, originality,
    ...(drawing ? {drawing} : {}),
    ...(cinema ? {cinema} : {}),
    ...(brief ? {brief} : {}),
  };
}
function bool(value, label) {
  requireValue(typeof value === 'boolean', `${label} must be true or false.`);
  return value;
}
function luminance(hexColour) {
  const channel = index => {
    const value = parseInt(hexColour.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const specHash = spec => createHash('sha256').update(stableStringify(spec)).digest('hex');
function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) flatten(value[key], prefix ? `${prefix}.${key}` : key, out);
  } else out[prefix] = value;
  return out;
}
function specDiff(before, after) {
  if (!before) return [];
  const a = flatten(before), b = flatten(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    .filter(key => stableStringify(a[key]) !== stableStringify(b[key]))
    .map(key => ({path: key, before: a[key] ?? null, after: b[key] ?? null}));
}
function slug(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'style';
}
function person(value, label) { return text(value, label, 2, 80); }
function reason(value, label = 'Reason') { return text(value, label, 8, 1000); }

// ---------------------------------------------------------------- library
class StyleLibrary {
  constructor(store) {
    this.store = store;
    this.db = store.db;
    this.migrate();
    this.seedLaunchProfiles();
  }

  migrate() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS style_profiles(id TEXT PRIMARY KEY, profile_key TEXT UNIQUE NOT NULL, origin TEXT NOT NULL, base_revision_id TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS style_revisions(id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES style_profiles(id), revision INTEGER NOT NULL, status TEXT NOT NULL, spec TEXT NOT NULL, spec_hash TEXT NOT NULL, change_note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, review TEXT, retirement TEXT, UNIQUE(profile_id,revision));
        CREATE TABLE IF NOT EXISTS style_assignments(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), scope TEXT NOT NULL, locale TEXT NOT NULL DEFAULT '', revision_id TEXT NOT NULL REFERENCES style_revisions(id), family_revision INTEGER NOT NULL, status TEXT NOT NULL, decision TEXT NOT NULL, fallback TEXT, created_at TEXT NOT NULL, ended_at TEXT, ended_reason TEXT, supersedes_id TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS style_assignment_active ON style_assignments(family_id,scope,locale) WHERE status='active';
        CREATE TRIGGER IF NOT EXISTS style_revision_spec_immutable BEFORE UPDATE OF spec,spec_hash,profile_id,revision,created_by,created_at,change_note ON style_revisions
          BEGIN SELECT RAISE(ABORT,'Style revision specifications are immutable; create a new revision instead.'); END;
        CREATE TRIGGER IF NOT EXISTS style_revision_no_delete BEFORE DELETE ON style_revisions
          BEGIN SELECT RAISE(ABORT,'Style revisions are retained for provenance and cannot be deleted.'); END;
      `);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // New workspaces get every launch profile; a profile whose newest revision is still a launch revision gets the
  // current launch spec as a new draft when it changed, so the owner always has the newest built-in version to
  // approve. A revision the owner made is never followed by an automatic one.
  seedLaunchProfiles() {
    this.store.transaction(() => {
      for (const [key, reason] of Object.entries(RETIRED_LAUNCH)) {
        const profile = this.db.prepare('SELECT id FROM style_profiles WHERE profile_key=?').get(key);
        if (!profile) continue;
        const revisions = this.db.prepare('SELECT id, status, created_by FROM style_revisions WHERE profile_id=?').all(profile.id);
        const used = revisions.some(item => item.status === 'approved' || !item.created_by.startsWith('Launch library')) || this.db.prepare("SELECT 1 FROM style_assignments a JOIN style_revisions r ON r.id=a.revision_id WHERE r.profile_id=? LIMIT 1").get(profile.id);
        if (used || revisions.every(item => item.status === 'retired')) continue;
        const retirement = JSON.stringify({retiredBy: LAUNCH_VERSION, retiredAt: now(), reason});
        this.db.prepare("UPDATE style_revisions SET status='retired', retirement=? WHERE profile_id=? AND status<>'retired'").run(retirement, profile.id);
        this.store.event(`Launch library update: the ${key} style was retired (${reason})`);
      }
      for (const launch of LAUNCH_PROFILES) {
        const spec = validateStyleSpec(structuredClone(launch.spec)), at = now(), existing = this.db.prepare('SELECT id FROM style_profiles WHERE profile_key=?').get(launch.key);
        if (existing) {
          const latest = this.latestRevision(existing.id);
          if (latest.spec_hash === specHash(spec) || !latest.created_by.startsWith('Launch library') || latest.created_by === LAUNCH_VERSION) continue;
          this.db.prepare('INSERT INTO style_revisions(id,profile_id,revision,status,spec,spec_hash,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(randomUUID(), existing.id, latest.revision + 1, 'draft', JSON.stringify(spec), specHash(spec), launch.upgrade || 'Updated launch profile. Review before assignment.', LAUNCH_VERSION, at);
          this.store.event(`Launch library update: ${spec.name} r${latest.revision + 1} (draft) is ready to review`);
          continue;
        }
        const profileId = randomUUID();
        this.db.prepare('INSERT INTO style_profiles(id,profile_key,origin,base_revision_id,created_at) VALUES(?,?,?,?,?)').run(profileId, launch.key, 'launch', null, at);
        this.db.prepare('INSERT INTO style_revisions(id,profile_id,revision,status,spec,spec_hash,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(), profileId, 1, 'draft', JSON.stringify(spec), specHash(spec), 'Launch profile from the Production Panel architecture. Review before first assignment.', LAUNCH_VERSION, at);
      }
    });
  }

  // ------------------------------------------------------------ reads
  revisionRow(id) {
    const row = this.db.prepare('SELECT r.*, p.profile_key, p.origin FROM style_revisions r JOIN style_profiles p ON p.id=r.profile_id WHERE r.id=?').get(id);
    requireValue(row, 'Style revision not found.', 404);
    return row;
  }
  revision(id) { return this.publicRevision(this.revisionRow(id)); }
  publicRevision(row) {
    return {
      id: row.id, profileId: row.profile_id, profileKey: row.profile_key, revision: row.revision, status: row.status,
      spec: JSON.parse(row.spec), specHash: row.spec_hash, changeNote: row.change_note, createdBy: row.created_by, createdAt: row.created_at,
      review: row.review ? JSON.parse(row.review) : null, retirement: row.retirement ? JSON.parse(row.retirement) : null,
    };
  }
  latestRevision(profileId) {
    return this.db.prepare('SELECT * FROM style_revisions WHERE profile_id=? ORDER BY revision DESC LIMIT 1').get(profileId);
  }
  assignmentRow(id) {
    const row = this.db.prepare('SELECT * FROM style_assignments WHERE id=?').get(id);
    requireValue(row, 'Style assignment not found.', 404);
    return row;
  }
  publicAssignment(row) {
    return {
      id: row.id, familyId: row.family_id, scope: row.scope, locale: row.locale || null, revisionId: row.revision_id,
      familyRevision: row.family_revision, status: row.status, decision: JSON.parse(row.decision),
      fallback: row.fallback ? JSON.parse(row.fallback) : null, createdAt: row.created_at, endedAt: row.ended_at,
      endedReason: row.ended_reason, supersedesId: row.supersedes_id,
    };
  }
  activeAssignment(familyId, scope, locale = '') {
    return this.db.prepare("SELECT * FROM style_assignments WHERE family_id=? AND scope=? AND locale=? AND status='active'").get(familyId, scope, locale || '');
  }

  profiles() {
    const usage = new Map();
    for (const row of this.db.prepare('SELECT revision_id, status, COUNT(*) AS count FROM style_assignments GROUP BY revision_id, status').all()) {
      const entry = usage.get(row.revision_id) || {active: 0, historical: 0};
      if (row.status === 'active') entry.active += row.count; else entry.historical += row.count;
      usage.set(row.revision_id, entry);
    }
    return this.db.prepare('SELECT * FROM style_profiles ORDER BY CASE origin WHEN \'launch\' THEN 0 ELSE 1 END, created_at, rowid').all().map(profile => {
      let previous = null;
      const revisions = this.db.prepare('SELECT * FROM style_revisions WHERE profile_id=? ORDER BY revision').all(profile.id).map(row => {
        const revision = this.publicRevision({...row, profile_key: profile.profile_key, origin: profile.origin});
        revision.changes = specDiff(previous, revision.spec);
        revision.usage = usage.get(row.id) || {active: 0, historical: 0};
        previous = revision.spec;
        return revision;
      });
      const latest = revisions.at(-1);
      return {id: profile.id, key: profile.profile_key, origin: profile.origin, baseRevisionId: profile.base_revision_id, createdAt: profile.created_at, name: latest.spec.name, latestRevisionId: latest.id, revisions};
    });
  }

  assignments(familyId = null) {
    const rows = familyId
      ? this.db.prepare('SELECT * FROM style_assignments WHERE family_id=? ORDER BY created_at DESC, rowid DESC').all(familyId)
      : this.db.prepare('SELECT * FROM style_assignments ORDER BY created_at DESC, rowid DESC').all();
    return rows.map(row => this.publicAssignment(row));
  }

  // Compatibility of one approved revision with one family, as of now.
  compatibility(family, revisionRow) {
    const issues = [], spec = JSON.parse(revisionRow.spec);
    if (revisionRow.status === 'draft') issues.push(`${spec.name} r${revisionRow.revision} is still a draft; approve it in the Style Library first.`);
    if (revisionRow.status === 'retired') issues.push(`${spec.name} r${revisionRow.revision} was retired.`);
    if (!spec.formats.includes(family.format)) issues.push(`${spec.name} r${revisionRow.revision} does not support the family's ${family.format} format.`);
    const renderer = RENDERERS[spec.renderer.adapter];
    if (!renderer.supports.formats.includes(family.format)) issues.push(`The ${renderer.name} renderer cannot produce ${family.format} videos.`);
    return issues;
  }

  effectiveStyles(family) {
    const familyRow = this.activeAssignment(family.id, 'family');
    return family.channels.map((channel, index) => {
      const overrideRow = index === 0 ? null : this.activeAssignment(family.id, 'channel', channel.locale);
      const row = overrideRow || familyRow;
      if (!row) return {locale: channel.locale, primary: index === 0, source: 'none', assignmentId: null, revisionId: null, issues: ['No family default style is assigned.']};
      const revisionRow = this.revisionRow(row.revision_id);
      return {
        locale: channel.locale, primary: index === 0, source: overrideRow ? 'override' : 'family', assignmentId: row.id,
        revisionId: row.revision_id, profileKey: revisionRow.profile_key, revision: revisionRow.revision, name: JSON.parse(revisionRow.spec).name,
        specHash: revisionRow.spec_hash, issues: this.compatibility(family, revisionRow),
      };
    });
  }

  handoffs() {
    return this.store.families().map(family => {
      const channels = this.effectiveStyles(family), primary = channels[0];
      const familyRow = this.activeAssignment(family.id, 'family');
      let blocker = null;
      if (family.archived) blocker = 'Family is archived.';
      else if (!familyRow) blocker = 'Assign an approved default style to this family.';
      else {
        const issue = channels.flatMap(channel => channel.issues.map(item => channel.primary ? item : `${channel.locale}: ${item}`))[0];
        if (issue) blocker = issue;
      }
      const revisionRow = familyRow ? this.revisionRow(familyRow.revision_id) : null;
      const adapter = revisionRow ? JSON.parse(revisionRow.spec).renderer.adapter : null;
      return {
        familyId: family.id, ready: !blocker, blocker,
        assignmentId: familyRow?.id || null, revisionId: primary?.revisionId || null, specHash: primary?.specHash || null,
        renderer: adapter ? {adapter, ...RENDERERS[adapter], supports: undefined} : null,
        channels,
      };
    });
  }

  vocabulary() {
    return {formats: FORMATS, frameRates: FRAME_RATES, resolutions: RESOLUTIONS, aspect: ASPECT, transitions: ALL_TRANSITIONS(), cameraMoves: CAMERA_MOVES, easing: EASING,
      textCase: TEXT_CASE, drawingLooks: DRAWING_LOOKS, drawingBoards: DRAWING_BOARDS, drawingDesigns: DRAWING_DESIGNS, drawingFilms: DRAWING_FILMS, pictureTypes: PICTURE_TYPES, pictureTypeAdapters: PICTURE_TYPE_ADAPTERS, cinemaGrades: CINEMA_GRADES, lookPresets: LOOK_PRESETS, captionModes: CAPTION_MODES, captionPositions: CAPTION_POSITIONS, visualSources: VISUAL_SOURCES, aiDisclosure: AI_DISCLOSURE,
      sfxUsage: SFX_USAGE, referenceLimit: OWNER_REFERENCE_LIMIT};
  }

  state() {
    const profiles = this.profiles();
    return {
      vocabulary: this.vocabulary(),
      renderers: Object.fromEntries(Object.entries(RENDERERS).map(([key, value]) => [key, {...value}])),
      profiles,
      // Fonts a style names that this PC does not have, with the face drawn instead (0.41, fonts.js).
      missingFonts: Object.fromEntries(profiles.flatMap(profile => profile.revisions.flatMap(revision => require('./fonts').missing(revision.spec?.typography))).map(item => [item.font, item.instead])),
      assignments: this.assignments(),
      handoffs: this.handoffs(),
    };
  }

  // ------------------------------------------------------------ writes
  createProfile(input) {
    object(input, 'Request');
    const spec = validateStyleSpec(input.spec);
    const createdBy = person(input.createdBy, 'Your name');
    const changeNote = reason(input.changeNote, 'Change note');
    return this.store.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM style_profiles').get().count;
      requireValue(count < PROFILE_LIMIT, `The style library holds at most ${PROFILE_LIMIT} profiles.`);
      let baseRevisionId = null;
      if (input.baseRevisionId !== undefined && input.baseRevisionId !== null) baseRevisionId = this.revisionRow(text(input.baseRevisionId, 'Base revision', 10, 64)).id;
      const nameTaken = this.profiles().some(profile => profile.name.toLowerCase() === spec.name.toLowerCase());
      requireValue(!nameTaken, `A style named "${spec.name}" already exists. Choose a distinct name.`, 409);
      let key = slug(spec.name), suffix = 2;
      while (this.db.prepare('SELECT 1 FROM style_profiles WHERE profile_key=?').get(key)) key = `${slug(spec.name)}-${suffix++}`;
      const profileId = randomUUID(), revisionId = randomUUID(), at = now();
      this.db.prepare('INSERT INTO style_profiles(id,profile_key,origin,base_revision_id,created_at) VALUES(?,?,?,?,?)').run(profileId, key, baseRevisionId ? 'derived' : 'custom', baseRevisionId, at);
      this.db.prepare('INSERT INTO style_revisions(id,profile_id,revision,status,spec,spec_hash,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(revisionId, profileId, 1, 'draft', JSON.stringify(spec), specHash(spec), changeNote, createdBy, at);
      this.store.event(`Created style profile: ${spec.name} (draft r1)`);
      return this.revision(revisionId);
    });
  }

  createRevision(profileId, input) {
    object(input, 'Request');
    const spec = validateStyleSpec(input.spec);
    const createdBy = person(input.createdBy, 'Your name');
    const changeNote = reason(input.changeNote, 'Change note');
    return this.store.transaction(() => {
      requireValue(this.db.prepare('SELECT 1 FROM style_profiles WHERE id=?').get(profileId), 'Style profile not found.', 404);
      const latest = this.latestRevision(profileId);
      requireValue(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision === latest.revision, 'This style changed in another tab. Reload before creating a revision.', 409);
      requireValue(specHash(spec) !== latest.spec_hash, 'This revision is identical to the current one. Change at least one setting.');
      const nameTaken = this.profiles().some(profile => profile.id !== profileId && profile.name.toLowerCase() === spec.name.toLowerCase());
      requireValue(!nameTaken, `Another style is already named "${spec.name}".`, 409);
      const revisionId = randomUUID();
      this.db.prepare('INSERT INTO style_revisions(id,profile_id,revision,status,spec,spec_hash,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(revisionId, profileId, latest.revision + 1, 'draft', JSON.stringify(spec), specHash(spec), changeNote, createdBy, now());
      this.store.event(`Created style revision: ${spec.name} r${latest.revision + 1} (draft)`);
      return this.revision(revisionId);
    });
  }

  approveRevision(id, input) {
    object(input, 'Request');
    const approvedBy = person(input.approvedBy, 'Reviewer name');
    const notes = text(input.notes || '', 'Review notes', 0, 2000);
    const confirmations = object(input.confirmations, 'Review confirmations');
    for (const [key, label] of [['specReviewed', 'pacing, typography, captions and QC settings'], ['rightsReviewed', 'visual, music and AI-disclosure policy'], ['originalityReviewed', 'originality guard and the 30% reference limit']])
      requireValue(confirmations[key] === true, `Confirm that you reviewed the ${label}.`);
    return this.store.transaction(() => {
      const row = this.revisionRow(id);
      requireValue(row.status === 'draft', `Only draft revisions can be approved; r${row.revision} is ${row.status}.`, 409);
      const review = {approvedBy, approvedAt: now(), notes, confirmations: {specReviewed: true, rightsReviewed: true, originalityReviewed: true}};
      this.db.prepare("UPDATE style_revisions SET status='approved', review=? WHERE id=? AND status='draft'").run(JSON.stringify(review), id);
      this.store.event(`Approved style: ${JSON.parse(row.spec).name} r${row.revision} by ${approvedBy}`);
      return this.revision(id);
    });
  }

  retireRevision(id, input) {
    object(input, 'Request');
    const retiredBy = person(input.retiredBy, 'Your name');
    const why = reason(input.reason);
    return this.store.transaction(() => {
      const row = this.revisionRow(id);
      requireValue(row.status !== 'retired', 'This revision is already retired.', 409);
      const retirement = {retiredBy, retiredAt: now(), reason: why};
      this.db.prepare("UPDATE style_revisions SET status='retired', retirement=? WHERE id=?").run(JSON.stringify(retirement), id);
      const name = JSON.parse(row.spec).name;
      for (const assignment of this.db.prepare("SELECT * FROM style_assignments WHERE status='active' AND revision_id=?").all(id))
        this.invalidate(assignment.family_id, `Style ${name} r${row.revision} was retired (${why}); assign a current revision before scene planning continues.`);
      this.store.event(`Retired style: ${name} r${row.revision}`);
      return this.revision(id);
    });
  }

  assign(familyId, input) {
    object(input, 'Request');
    const scope = choice(input.scope ?? 'family', ['family', 'channel'], 'assignment scope');
    const assignedBy = person(input.assignedBy, 'Your name');
    const why = reason(input.reason);
    return this.store.transaction(() => {
      const family = this.store.family(familyId);
      requireValue(!family.archived, 'Restore the family before assigning a style.', 409);
      this.store.version(family, input.familyRevision);
      let locale = '';
      if (scope === 'channel') {
        locale = text(input.locale, 'Channel locale', 2, 255);
        requireValue(family.locales.includes(locale), 'Choose one of this family\'s configured channel locales.');
        requireValue(locale !== family.primaryLocale, 'The primary channel always uses the family default. Change the family default instead.');
        requireValue(input.separateProductionAcknowledged === true, 'Confirm that this override creates a separate visual production, cost plan and approval trail for that channel.');
        requireValue(this.activeAssignment(familyId, 'family'), 'Assign the family default style before adding a channel override.', 409);
      }
      const revisionRow = this.revisionRow(text(input.revisionId, 'Style revision', 10, 64));
      const issues = this.compatibility(family, revisionRow);
      requireValue(!issues.length, issues.join(' '), 409);
      const current = this.activeAssignment(familyId, scope, locale);
      const expected = input.expectedAssignmentId ?? null;
      requireValue((current?.id || null) === expected, 'The style assignment changed in another tab. Reload before assigning.', 409);
      requireValue(!current || current.revision_id !== revisionRow.id, 'That exact style revision is already assigned here.', 409);
      if (scope === 'channel') {
        const familyDefault = this.activeAssignment(familyId, 'family');
        requireValue(familyDefault.revision_id !== revisionRow.id, 'That revision is already the family default; an override must use a different style revision.', 409);
      }
      const id = randomUUID(), at = now(), name = JSON.parse(revisionRow.spec).name;
      if (current) this.db.prepare("UPDATE style_assignments SET status='superseded', ended_at=?, ended_reason=? WHERE id=?").run(at, `Replaced by ${name} r${revisionRow.revision}: ${why}`, current.id);
      const decision = {assignedBy, reason: why, ...(scope === 'channel' ? {separateProductionAcknowledged: true} : {})};
      this.db.prepare('INSERT INTO style_assignments(id,family_id,scope,locale,revision_id,family_revision,status,decision,fallback,created_at,supersedes_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, familyId, scope, locale, revisionRow.id, family.revision, 'active', JSON.stringify(decision), null, at, current?.id || null);
      if (current) this.invalidate(familyId, `Style ${scope === 'family' ? 'family default' : `override for ${locale}`} changed to ${name} r${revisionRow.revision}; scene plans, edits, captions treatment, packaging and renders built on the previous style are stale.`);
      this.store.event(`${scope === 'family' ? 'Assigned family style' : `Assigned ${locale} style override`}: ${name} r${revisionRow.revision} → ${family.name}`);
      return this.publicAssignment(this.assignmentRow(id));
    });
  }

  revoke(assignmentId, input) {
    object(input, 'Request');
    const revokedBy = person(input.revokedBy, 'Your name');
    const why = reason(input.reason);
    return this.store.transaction(() => {
      const row = this.assignmentRow(assignmentId);
      requireValue(row.status === 'active', 'Only an active assignment can be revoked.', 409);
      const family = this.store.family(row.family_id);
      this.store.version(family, input.familyRevision);
      if (row.scope === 'family') {
        const overrides = this.db.prepare("SELECT COUNT(*) AS count FROM style_assignments WHERE family_id=? AND scope='channel' AND status='active'").get(row.family_id).count;
        requireValue(!overrides, 'Revoke the channel overrides first, or replace the family default instead of revoking it.', 409);
      }
      this.db.prepare("UPDATE style_assignments SET status='revoked', ended_at=?, ended_reason=? WHERE id=?").run(now(), `Revoked by ${revokedBy}: ${why}`, assignmentId);
      this.invalidate(row.family_id, `Style ${row.scope === 'family' ? 'family default' : `override for ${row.locale}`} was revoked (${why}); dependent visual planning is blocked until a style is assigned.`);
      this.store.event(`Revoked ${row.scope === 'family' ? 'family style' : `${row.locale} style override`} for ${family.name}`);
      return this.publicAssignment(this.assignmentRow(assignmentId));
    });
  }

  setFallback(assignmentId, input) {
    object(input, 'Request');
    const approvedBy = person(input.approvedBy, 'Your name');
    const why = reason(input.reason);
    return this.store.transaction(() => {
      const row = this.assignmentRow(assignmentId);
      requireValue(row.status === 'active', 'Fallbacks can only be set on an active assignment.', 409);
      const family = this.store.family(row.family_id);
      this.store.version(family, input.familyRevision);
      let fallback = null;
      if (input.fallbackRevisionId !== null) {
        requireValue(input.confirmManualActivation === true, 'Confirm that the fallback is never used automatically; each use still needs your explicit decision on the failed job.');
        const fallbackRow = this.revisionRow(text(input.fallbackRevisionId, 'Fallback revision', 10, 64));
        requireValue(fallbackRow.id !== row.revision_id, 'The fallback must be a different style revision.');
        const issues = this.compatibility(family, fallbackRow);
        requireValue(!issues.length, issues.join(' '), 409);
        fallback = {revisionId: fallbackRow.id, approvedBy, approvedAt: now(), reason: why, activation: 'manual-per-job'};
      }
      this.db.prepare('UPDATE style_assignments SET fallback=? WHERE id=?').run(fallback ? JSON.stringify(fallback) : null, assignmentId);
      this.store.event(fallback ? `Approved style fallback for ${family.name}` : `Cleared style fallback for ${family.name}`);
      return this.publicAssignment(this.assignmentRow(assignmentId));
    });
  }

  // Record that artifacts built on the previous style are stale for every approved script.
  invalidate(familyId, why) {
    const at = now();
    const approved = this.store.contents().filter(content => content.familyId === familyId && content.state === 'approved');
    for (const content of approved) {
      for (const stage of ['scene_manifest', 'editing_timeline', 'captions', 'packaging', 'render']) {
        this.db.prepare('INSERT INTO production_invalidations(id,family_id,content_id,approval_id,stage,reason,created_at) VALUES(?,?,?,?,?,?,?)')
          .run(randomUUID(), familyId, content.id, null, stage, why, at);
      }
    }
  }
}

module.exports = {StyleLibrary, validateStyleSpec, specDiff, specHash, contrastRatio, RENDERERS, LAUNCH_PROFILES, LAUNCH_VERSION, OWNER_REFERENCE_LIMIT, DRAWING_LOOKS, DRAWING_BOARDS, DRAWING_DESIGNS, DRAWING_FILMS, CINEMA_GRADES, PICTURE_TYPES};
