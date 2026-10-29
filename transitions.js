'use strict';
// 0.32 - The edit's transitions: one catalogue for every engine (owner review 2026-10-16: "make each engine use all
// and any type of effect, cut and transition"). Each name maps to an FFmpeg xfade transition the pinned build can
// draw (checked on the owner's FFmpeg; squeezev crashes it and is left out). Claude chooses one per scene in the plan
// (scene "transition"); the editing brain's own choice is the fallback. Pure: no I/O.
const CATALOG = Object.freeze({
  crossfade: {xfade: 'fade', seconds: 0.5, use: 'soft change between related moments'},
  'dip-to-black': {xfade: 'fadeblack', seconds: 0.8, use: 'a chapter ends, time passes, a grave moment'},
  'dip-to-white': {xfade: 'fadewhite', seconds: 0.6, use: 'a memory, a dream, a reveal of light'},
  'fade-grey': {xfade: 'fadegrays', seconds: 0.6, use: 'back to the past, colour drains away'},
  'push-left': {xfade: 'slideleft', seconds: 0.4, use: 'next step in a sequence, moving forward'},
  'push-right': {xfade: 'slideright', seconds: 0.4, use: 'going back, the other side'},
  'push-up': {xfade: 'slideup', seconds: 0.4, use: 'rising, growth, scrolling to the next thing'},
  'push-down': {xfade: 'slidedown', seconds: 0.4, use: 'falling, digging deeper'},
  'slide-left': {xfade: 'coverleft', seconds: 0.4, use: 'a new card slides over the last one'},
  'slide-right': {xfade: 'coverright', seconds: 0.4, use: 'a card slides in from the left'},
  'slide-up': {xfade: 'coverup', seconds: 0.4, use: 'a new layer rises over the last'},
  'slide-down': {xfade: 'coverdown', seconds: 0.4, use: 'a new layer drops in from above'},
  'reveal-left': {xfade: 'revealleft', seconds: 0.45, use: 'the old picture slides away to uncover the new'},
  'reveal-right': {xfade: 'revealright', seconds: 0.45, use: 'uncovering from the other side'},
  'wipe-left': {xfade: 'wipeleft', seconds: 0.45, use: 'a page turns, a board is wiped clean'},
  'wipe-right': {xfade: 'wiperight', seconds: 0.45, use: 'wiping back'},
  'wipe-up': {xfade: 'wipeup', seconds: 0.45, use: 'rising level, filling up'},
  'wipe-down': {xfade: 'wipedown', seconds: 0.45, use: 'a curtain comes down'},
  'zoom-in': {xfade: 'zoomin', seconds: 0.35, use: 'diving into a detail, the inside of something'},
  'iris-open': {xfade: 'circleopen', seconds: 0.5, use: 'opening on a new world, a spotlight'},
  'iris-close': {xfade: 'circleclose', seconds: 0.5, use: 'closing in on one thing, an ending'},
  circle: {xfade: 'circlecrop', seconds: 0.5, use: 'a playful round wipe'},
  box: {xfade: 'rectcrop', seconds: 0.5, use: 'a frame inside a frame'},
  'barn-door': {xfade: 'vertopen', seconds: 0.5, use: 'doors opening onto something new'},
  blinds: {xfade: 'horzopen', seconds: 0.5, use: 'a horizontal opening'},
  slice: {xfade: 'hlslice', seconds: 0.45, use: 'energetic slices, a list item changing'},
  'slice-down': {xfade: 'vuslice', seconds: 0.45, use: 'slices falling'},
  diagonal: {xfade: 'diagtl', seconds: 0.45, use: 'a dynamic diagonal change'},
  'diagonal-up': {xfade: 'diagbr', seconds: 0.45, use: 'the diagonal the other way'},
  dissolve: {xfade: 'dissolve', seconds: 0.6, use: 'a grainy dreamy change'},
  pixelize: {xfade: 'pixelize', seconds: 0.35, use: 'digital, data, the internet, a game'},
  radial: {xfade: 'radial', seconds: 0.5, use: 'a clock hand sweeping, time'},
  blur: {xfade: 'hblur', seconds: 0.35, use: 'speed, a rush'},
  'whip-pan': {xfade: 'hblur', seconds: 0.3, use: 'a fast swing to the next place, with motion blur'},
  'whip-right': {xfade: 'smoothright', seconds: 0.3, use: 'a fast swing back'},
  'whip-up': {xfade: 'smoothup', seconds: 0.3, use: 'a fast swing upwards'},
  'whip-down': {xfade: 'smoothdown', seconds: 0.3, use: 'a fast swing downwards'},
  squeeze: {xfade: 'squeezeh', seconds: 0.4, use: 'squashing one idea into the next'},
  wind: {xfade: 'hlwind', seconds: 0.45, use: 'blown away, things scatter'},
  distance: {xfade: 'distance', seconds: 0.5, use: 'a strange, unsettling change'},
  flash: {xfade: 'fadewhite', seconds: 0.15, use: 'a hit, a shock, a camera flash'},
  glitch: {xfade: 'pixelize', seconds: 0.2, use: 'something breaks, an error, a twist'},
  'zoom-cut': {xfade: 'zoomin', seconds: 0.18, use: 'punch into the next shot on a strong word'},
  // 0.68 (html-anime): the anime cut, a quick dip through one colour of the video (its accent) into the next drawing.
  'dip-colour': {xfade: 'custom', seconds: 0.6, use: 'the anime cut: a quick dip through the accent colour into the next drawing'},
});
// Older names kept so saved edits and styles still work.
const ALIASES = Object.freeze({push: 'push-left', slide: 'slide-left', zoom: 'zoom-in', wipe: 'wipe-left'});
const resolve = name => ALIASES[name] || name;
const NAMES = Object.freeze([...Object.keys(CATALOG), ...Object.keys(ALIASES)]);
const xfadeOf = name => CATALOG[resolve(name)]?.xfade || null;
const secondsOf = name => CATALOG[resolve(name)]?.seconds ?? 0.5;
// The colour dip as an xfade expression on 8-bit BT.709 TV-range YUV (the segments' format): in over 0.25 s
// (power2.in), a 0.05 s hold of the colour, out over 0.3 s (power2.out), like html-anime's #dip. In xfade P runs
// from 1 to 0, so 1-P is the time through the transition.
function dipExpr(hex = '#E23B4A') {
  const [r, g, b] = [1, 3, 5].map(k => parseInt(/^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(k, k + 2) : 'E2', 16) / 255);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Y = Math.round(16 + 219 * y), U = Math.round(128 + 224 * (b - y) / 1.8556), V = Math.round(128 + 224 * (r - y) / 1.5748);
  const C = `if(eq(PLANE,0),${Y},if(eq(PLANE,1),${U},${V}))`, t = '(1-P)';
  return `if(lt(${t},0.4167),A+(${C}-A)*pow(${t}/0.4167,2),if(lt(${t},0.5),${C},${C}+(B-${C})*(1-pow(1-(${t}-0.5)/0.5,2))))`;
}
// The xfade options for a transition (the colour dip needs its colour).
const xfadeArgs = (name, colour) => (xfadeOf(name) === 'custom' ? `transition=custom:expr='${dipExpr(colour)}'` : `transition=${xfadeOf(name) || 'fade'}`);
// For Claude: the transitions a style allows (all by default) with what each says, in one compact line each.
const guide = (names = Object.keys(CATALOG)) => [...new Set(names.map(resolve))].filter(name => CATALOG[name]).map(name => `${name} (${CATALOG[name].use})`).join('; ');

module.exports = {CATALOG, ALIASES, NAMES, resolve, xfadeOf, xfadeArgs, dipExpr, secondsOf, guide};
