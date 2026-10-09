'use strict';
// Room 03 - Style Library & Assignment.
// Owns versioned editing-style profiles, human review of each revision, and the
// explicit family default / channel override / approved-fallback assignments that
// later rooms (scenes, editing, captions, render) must lock into their manifests.
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();

const FORMATS = ['long-form', 'shorts'];
const FRAME_RATES = [24, 25, 30, 50, 60];
const RESOLUTIONS = {'long-form': ['1920x1080', '2560x1440', '3840x2160'], shorts: ['1080x1920']};
const ASPECT = {'long-form': '16:9', shorts: '9:16'};
const TRANSITIONS = ['cut', 'crossfade', 'dip-to-black', 'push', 'slide', 'zoom', 'whip-pan', 'match-cut', 'wipe', 'morph'];
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
    name: 'FFmpeg montage', milestone: 'P05', status: 'not_implemented', firstProof: true,
    note: 'First executable target: stock and AI stills/clips, Ken Burns moves, cuts and crossfades, rendered deterministically with FFmpeg.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30, 50, 60], transitions: ['cut', 'crossfade', 'dip-to-black', 'push', 'slide', 'zoom', 'wipe'], cameraMoves: ['static', 'ken-burns', 'pan', 'zoom']},
  },
  'ffmpeg-sketch': {
    name: 'FFmpeg sketch compositor', milestone: 'P05+', status: 'not_implemented',
    note: 'Stickman engine (0.20): cartoon stick characters with looks, expressions and gestures act each line in built sets, with a motion-graphics layer; every drawing arrives on the narrator\'s words. Drawn in the local browser and cut with the narration, captions and graphics.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30], transitions: ['cut', 'crossfade', 'dip-to-black', 'push', 'slide', 'wipe'], cameraMoves: ['static', 'pan', 'zoom', 'ken-burns']},
  },
  'canvas-frames': {
    name: 'Hand-drawn canvas frames', milestone: 'P05+', status: 'not_implemented',
    note: 'Hand-drawn engine (0.20): ink illustrations and ink figures drawn on paper with a living line, plus inked motion graphics; drawn frame by frame in the local browser, then assembled like a montage.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30], transitions: ['cut', 'crossfade', 'dip-to-black', 'wipe'], cameraMoves: ['static', 'pan', 'zoom', 'parallax']},
  },
  'motion-graphics': {
    name: 'Motion graphics compositor', milestone: 'P05+', status: 'not_implemented',
    note: 'Motion-graphics engine (0.20): flat icons, kinetic words, counters and effects, with stick-figure moments and stock plates as partners, plus the animated charts, timelines and lists of the Editing Room; assembled like a montage.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30, 50, 60], transitions: TRANSITIONS, cameraMoves: ['static', 'pan', 'zoom', 'parallax', 'tracking']},
  },
  'cinematic-hybrid': {
    name: 'Cinematic hybrid', milestone: 'P05+', status: 'not_implemented',
    note: 'Generated or stock video shots with continuity rules and a strict proxy-review loop.',
    supports: {formats: FORMATS, frameRates: [24, 25, 30], transitions: ['cut', 'crossfade', 'dip-to-black', 'zoom', 'whip-pan', 'match-cut', 'wipe'], cameraMoves: CAMERA_MOVES},
  },
};

const STANDARD_PROHIBITED = [
  'Copying another channel\'s script wording, footage, thumbnails, characters or recurring jokes',
  'Imitating a living artist\'s signature style',
  'Presenting AI-generated imagery as real footage or real events',
];

// The launch library's current version. Profiles the owner has not revised follow it: a newer launch spec is
// added as a draft revision (never approved or assigned automatically).
const LAUNCH_VERSION = 'Launch library v3';
const LAUNCH_PROFILES = [
  {key: 'stickman-sketch-explainer', upgrade: 'Launch library v3 (0.21): the stickman engine. Drawn shots lead; stock photos, footage and AI images stay available and Claude decides when the script needs one, with its reason. Faster energetic pacing, a richer motion layer and sound accents.', spec: {
    name: 'Stickman Sketch Explainer',
    summary: 'Cartoon stick characters with distinct looks, expressions and gestures act every line inside built sets, with kinetic words and effects on the narrator\'s words; energetic, word-timed and never still.',
    bestFit: ['Educational explainers', 'Business and money concepts', 'Psychology and how-it-works'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 30, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 1.2, shotMaxSeconds: 4.5, hookShotMaxSeconds: 2, maxStaticHoldSeconds: 5},
    transitions: {allowed: ['cut', 'crossfade', 'push'], default: 'cut', maxDurationMs: 300},
    motion: {cameraMoves: ['static', 'pan', 'zoom'], intensity: 60, easing: 'ease-in-out'},
    typography: {headingFont: 'Patrick Hand', bodyFont: 'Inter', maxWordsOnScreen: 6, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#FFFFFF', primary: '#1F1F1F', accent: '#E0753E', text: '#1F1F1F'},
    captions: {mode: 'both', maxCharsPerLine: 42, maxLines: 2, position: 'bottom', activeWordHighlight: true, safeAreaPercent: 8},
    visuals: {sources: ['generated-graphics', 'stock-image', 'stock-video', 'ai-image'], primarySource: 'generated-graphics', aiDisclosure: 'review-per-asset', characterConsistency: true},
    audio: {musicMoods: ['upbeat', 'curious', 'playful'], duckingDb: -18, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'rich'},
    renderer: {adapter: 'ffmpeg-sketch'},
    qc: {maxBlackSeconds: 0.5, maxFrozenSeconds: 5, minSceneSeconds: 1.5, maxSceneSeconds: 12, contactSheetEverySeconds: 3},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'hand-drawn-canvas', upgrade: 'Launch library v3 (0.21): the hand-drawn engine. Drawn shots lead; photos and AI images stay available and Claude decides when the story needs one, with its reason.', spec: {
    name: 'Hand-drawn Canvas',
    summary: 'Ink illustrations and ink figures drawn line by line on paper, with a living line, washed colour and inked motion graphics, for storytelling and essays.',
    bestFit: ['Storytelling', 'Video essays', 'Artistic education'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 24, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 2, shotMaxSeconds: 7, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 8},
    transitions: {allowed: ['cut', 'crossfade', 'dip-to-black', 'wipe'], default: 'crossfade', maxDurationMs: 600},
    motion: {cameraMoves: ['static', 'pan', 'zoom', 'parallax'], intensity: 20, easing: 'ease-in-out'},
    typography: {headingFont: 'Caveat', bodyFont: 'Inter', maxWordsOnScreen: 8, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#F6F0E4', primary: '#2B2B2B', accent: '#B5473A', text: '#2B2B2B'},
    captions: {mode: 'both', maxCharsPerLine: 40, maxLines: 2, position: 'bottom', activeWordHighlight: false, safeAreaPercent: 8},
    visuals: {sources: ['generated-graphics', 'stock-image', 'ai-image', 'archival-public-domain'], primarySource: 'generated-graphics', aiDisclosure: 'review-per-asset', characterConsistency: true},
    audio: {musicMoods: ['warm', 'reflective', 'acoustic'], duckingDb: -20, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'subtle'},
    renderer: {adapter: 'canvas-frames'},
    qc: {maxBlackSeconds: 0.8, maxFrozenSeconds: 8, minSceneSeconds: 2, maxSceneSeconds: 14, contactSheetEverySeconds: 5},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'motion-graphics', upgrade: 'Launch library v3 (0.21): the motion-graphics engine draws its own shots; Claude decides when a stick figure, an ink sketch or stock footage serves a line better.', spec: {
    name: 'Motion Graphics',
    summary: 'Fast, text-safe animated graphics with stable scene IDs; built for strong hooks, workflows and product concepts.',
    bestFit: ['Fast hooks and Shorts', 'Workflows and tutorials', 'Tech and product concepts'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 30, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 1.2, shotMaxSeconds: 4, hookShotMaxSeconds: 1.2, maxStaticHoldSeconds: 4},
    transitions: {allowed: ['cut', 'push', 'slide', 'zoom', 'whip-pan', 'match-cut', 'morph', 'wipe'], default: 'cut', maxDurationMs: 350},
    motion: {cameraMoves: ['static', 'zoom', 'pan', 'parallax', 'tracking'], intensity: 70, easing: 'spring'},
    typography: {headingFont: 'Inter', bodyFont: 'Inter', maxWordsOnScreen: 5, textCase: 'title', minTextHeightPercent: 5},
    palette: {background: '#101418', primary: '#F2F4F5', accent: '#37C2A0', text: '#FFFFFF'},
    captions: {mode: 'burned-in', maxCharsPerLine: 32, maxLines: 2, position: 'center', activeWordHighlight: true, safeAreaPercent: 10},
    visuals: {sources: ['generated-graphics', 'stock-video', 'ai-image'], primarySource: 'generated-graphics', aiDisclosure: 'review-per-asset', characterConsistency: false},
    audio: {musicMoods: ['energetic', 'electronic', 'driving'], duckingDb: -16, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'rich'},
    renderer: {adapter: 'motion-graphics'},
    qc: {maxBlackSeconds: 0.2, maxFrozenSeconds: 3, minSceneSeconds: 1, maxSceneSeconds: 8, contactSheetEverySeconds: 3},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'documentary-montage', upgrade: 'Launch library v3 (0.21): drawn explainer cutaways (hand-drawn, motion graphics or stick figures) are available beside the footage; Claude decides where they help, with its reason.', spec: {
    name: 'Documentary Montage',
    summary: 'Evidence-led stock and archival shots with per-shot provenance, restrained Ken Burns motion, maps and readable labels; chronology follows the narration.',
    bestFit: ['History and culture', 'Finance and economics stories', 'Sourced factual essays'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 30, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 3, shotMaxSeconds: 8, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 8},
    transitions: {allowed: ['cut', 'crossfade', 'dip-to-black'], default: 'cut', maxDurationMs: 700},
    motion: {cameraMoves: ['static', 'ken-burns', 'pan', 'zoom'], intensity: 35, easing: 'ease-in-out'},
    typography: {headingFont: 'Source Serif 4', bodyFont: 'Inter', maxWordsOnScreen: 8, textCase: 'sentence', minTextHeightPercent: 4},
    palette: {background: '#0E0E0E', primary: '#F2EEE6', accent: '#C9A227', text: '#FFFFFF'},
    captions: {mode: 'both', maxCharsPerLine: 42, maxLines: 2, position: 'bottom', activeWordHighlight: false, safeAreaPercent: 8},
    visuals: {sources: ['stock-video', 'stock-image', 'archival-public-domain', 'maps-and-diagrams', 'ai-image', 'generated-graphics'], primarySource: 'stock-video', aiDisclosure: 'always-disclose', characterConsistency: false},
    audio: {musicMoods: ['documentary', 'reflective', 'tense'], duckingDb: -20, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'subtle'},
    renderer: {adapter: 'ffmpeg-montage'},
    qc: {maxBlackSeconds: 1, maxFrozenSeconds: 6, minSceneSeconds: 2.5, maxSceneSeconds: 15, contactSheetEverySeconds: 5},
    originality: {referenceSharePercent: 30, prohibited: STANDARD_PROHIBITED},
  }},
  {key: 'cinematic-hybrid', spec: {
    name: 'Cinematic Hybrid',
    summary: 'Premium shot grammar and continuity using generated or stock video behind rights and cost gates, with deliberate sound design.',
    bestFit: ['Narrative essays', 'Trailers and openers', 'Dramatic explainers'],
    formats: ['long-form', 'shorts'],
    canvas: {frameRate: 24, longFormResolution: '1920x1080', shortsResolution: '1080x1920'},
    pacing: {shotMinSeconds: 2, shotMaxSeconds: 6, hookShotMaxSeconds: 1.5, maxStaticHoldSeconds: 6},
    transitions: {allowed: ['cut', 'crossfade', 'dip-to-black', 'match-cut', 'whip-pan', 'zoom'], default: 'cut', maxDurationMs: 500},
    motion: {cameraMoves: ['static', 'pan', 'zoom', 'tracking', 'handheld-sim', 'parallax'], intensity: 60, easing: 'ease-in-out'},
    typography: {headingFont: 'Bebas Neue', bodyFont: 'Inter', maxWordsOnScreen: 5, textCase: 'upper', minTextHeightPercent: 5},
    palette: {background: '#050505', primary: '#EDE6DA', accent: '#D6452F', text: '#FFFFFF'},
    captions: {mode: 'sidecar', maxCharsPerLine: 38, maxLines: 2, position: 'bottom', activeWordHighlight: false, safeAreaPercent: 10},
    visuals: {sources: ['ai-video', 'stock-video', 'ai-image'], primarySource: 'ai-video', aiDisclosure: 'always-disclose', characterConsistency: true},
    audio: {musicMoods: ['cinematic', 'tension', 'epic'], duckingDb: -18, targetLufs: -16, truePeakDbtp: -1, sfxUsage: 'rich'},
    renderer: {adapter: 'cinematic-hybrid'},
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
    return {formats: FORMATS, frameRates: FRAME_RATES, resolutions: RESOLUTIONS, aspect: ASPECT, transitions: TRANSITIONS, cameraMoves: CAMERA_MOVES, easing: EASING,
      textCase: TEXT_CASE, captionModes: CAPTION_MODES, captionPositions: CAPTION_POSITIONS, visualSources: VISUAL_SOURCES, aiDisclosure: AI_DISCLOSURE,
      sfxUsage: SFX_USAGE, referenceLimit: OWNER_REFERENCE_LIMIT};
  }

  state() {
    return {
      vocabulary: this.vocabulary(),
      renderers: Object.fromEntries(Object.entries(RENDERERS).map(([key, value]) => [key, {...value}])),
      profiles: this.profiles(),
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

module.exports = {StyleLibrary, validateStyleSpec, specDiff, specHash, contrastRatio, RENDERERS, LAUNCH_PROFILES, LAUNCH_VERSION, OWNER_REFERENCE_LIMIT};
