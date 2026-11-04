'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../atelier');
const {MotionRenderer, findBrowser} = require('../motion');

const frameId = 's04a';
const composition = (script, extra = '') => `<template><div id="root" data-composition-id="${frameId}" data-width="1920" data-height="1080" data-duration="3"><div id="${frameId}-bg" class="clip" data-start="0" data-duration="3"></div><div id="${frameId}-hero">45</div>${extra}<style>#${frameId}-bg{position:absolute;inset:0;background:#10131A}#${frameId}-hero{position:absolute;left:0;right:0;top:30%;text-align:center;font:900 200px Bahnschrift;color:#F7F4EE}</style><script>${script}</script></div></template>`;
const timeline = `const tl = gsap.timeline({paused: true}); tl.fromTo('#${frameId}-hero', {opacity: 0, y: 40}, {opacity: 1, y: 0, duration: 1, ease: 'power3.out'}, 1); window.__timelines["${frameId}"] = tl;`;

test('a composition passes only when it keeps the contract: one registered paused timeline, nothing from outside, nothing random', () => {
  const size = {frameId, width: 1920, height: 1080, duration: 3};
  const ok = A.validateComposition(`Sure:\n${composition(timeline)}\nDone.`, size);
  assert.deepEqual(ok.issues, []);
  assert.ok(ok.html.startsWith('<div id="root"'), 'only the template content is kept');
  for (const [bad, pattern] of [
    [timeline.replace('window.__timelines', 'window.__other'), /Register the timeline/],
    [`${timeline} const r = Math.random();`, /Math\.random/],
    [`${timeline} fetch('https://example.com');`, /network/],
    [`${timeline} setTimeout(() => {}, 10);`, /timers/],
    [`${timeline} tl.play();`, /plays the timeline/],
    [timeline.replace("ease: 'power3.out'}", "ease: 'power3.out', repeat: -1}"), /repeats forever/],
  ]) assert.match(A.validateComposition(composition(bad), size).issues.join(' '), pattern);
  assert.match(A.validateComposition(composition(timeline, '<img src="https://x.test/a.png">'), size).issues.join(' '), /outside/);
  assert.match(A.validateComposition(composition(timeline, '<style>#x{transition: opacity 1s}</style>'), size).issues.join(' '), /CSS transitions/);
  assert.match(A.validateComposition(composition(timeline, '<style>#x{font-family: "Comic Neue", sans-serif}</style>'), size).warnings.join(' '), /Comic Neue/);
  assert.deepEqual(A.validateComposition('no template here', size).issues, ['The answer is not one <template>...</template> fragment.']);
});

test('the plan side: frames and the art direction are repaired with named notes; the catalog and packets come from the vendored recipes', () => {
  const {blueprints, rules} = A.loadCatalog();
  assert.ok(blueprints.length >= 20 && rules.length >= 40);
  const warnings = [];
  const frame = A.validateFrame({blueprint: 'made-up', beats: [{at: 'four million', show: 'the counter lands'}], motions: ['counting-dynamic-scale', 'nope']}, {warn: message => warnings.push(message)});
  assert.deepEqual([frame.blueprint, frame.posture, frame.motions], ['compose', 'compose', ['counting-dynamic-scale']]);
  assert.equal(warnings.length, 2);
  assert.throws(() => A.validateFrame({blueprint: 'compose', beats: []}), /needs beats/);
  assert.throws(() => A.validateFrame({blueprint: 'made-up', beats: [{show: 'x'}]}, {lenient: false}), /not in the catalog/);
  const direction = A.validateDirection({read: 'Calm, precise money history with numbers you can hold', dials: {variance: 3, motion: 12, density: 4}, palette: {canvas: '#101010', ink: 'white', accent: '#E0753E', support: '#3A6EA5'}, fonts: {display: 'Impact', body: 'Inter'}}, {warn: message => warnings.push(message)});
  assert.deepEqual([direction.dials.motion, direction.palette.ink, direction.fonts.display, direction.fonts.body], [5, '#1F1F1F', 'Impact', 'Segoe UI']);
  // The packet carries only this shot's blueprint and cited recipes.
  const [system, user] = A.composeMessages({frameId, width: 1920, height: 1080, duration: 3, frame: A.validateFrame({blueprint: 'dataviz-countup', beats: [{show: 'count'}], motions: ['counting-dynamic-scale']}), direction, words: [{text: 'nearly', start: 0.2}]});
  assert.match(system.content, /MOTION DOCTRINE[\s\S]*Never front-load/);
  assert.match(user.content, /## Selected blueprint: dataviz-countup[\s\S]*## Selected motion rule: counting-dynamic-scale/);
  assert.equal(user.content.includes('## Selected motion rule: svg-path-draw'), false);
  assert.ok(user.content.length < 16000, 'the packet stays small');
});

test('time follows the voice: reveals planned on a word land on that word when the narrator says it later', () => {
  const anchors = A.warp({planned: [{text: 'nearly', start: 0.5}, {text: 'four', start: 1.0}, {text: 'million', start: 1.5}], actual: [{text: 'nearly', start: 0.8}, {text: 'four', start: 1.6}, {text: 'million', start: 2.2}], composed: 3, hold: 3.6});
  assert.equal(A.warpAt(anchors, 1.6), 1, 'the narrator says "four" at 1.6 s; the composition shows its "four" moment');
  assert.equal(A.warpAt(anchors, 0), 0);
  assert.equal(A.warpAt(anchors, 3.6), 3);
  let previous = -1;
  for (let t = 0; t <= 3.6; t += 0.1) { const at = A.warpAt(anchors, t); assert.ok(at >= previous); previous = at; }
});

test('the local browser renders a composition identically twice, follows the warp and reports broken scripts and text off the frame', {skip: findBrowser() ? false : 'No Edge or Chrome on this machine'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-'));
  const renderer = new MotionRenderer();
  t.after(async () => { await renderer.close(); fs.rmSync(dir, {recursive: true, force: true}); });
  await renderer.start();
  const html = A.validateComposition(composition(timeline), {frameId, width: 1920, height: 1080, duration: 3}).html;
  const base = {html, frameId, width: 1920, height: 1080, scale: 0.25, canvas: '#10131A', duration: 3, fps: 4};
  const one = await renderer.renderComposition({...base, outDir: path.join(dir, 'a')}), two = await renderer.renderComposition({...base, outDir: path.join(dir, 'b')});
  assert.deepEqual([one.frames, one.sha256], [12, two.sha256]);
  // Before 1 s the hero is invisible; with a warp that maps 0 s to 2 s it is already there.
  const early = fs.readFileSync(path.join(dir, 'a', 'f00000.png'));
  const warped = await renderer.renderComposition({...base, duration: 0.25, warp: [[0, 2], [1, 3]], outDir: path.join(dir, 'c')});
  assert.ok(warped.frames === 1 && !fs.readFileSync(path.join(dir, 'c', 'f00000.png')).equals(early));
  // A script error is reported instead of rendering a blank shot; text pushed off the frame is found.
  const broken = await renderer.loadComposition({...base, html: html.replace('window.__timelines', 'undefinedThing.x; window.__timelines')});
  assert.equal(broken.ready, false);
  assert.match(broken.errors.join(' '), /undefinedThing/);
  const wide = A.validateComposition(composition(timeline.replace('y: 0, duration', 'x: 1400, y: 0, duration')), {frameId, width: 1920, height: 1080, duration: 3}).html;
  await renderer.loadComposition({...base, html: wide});
  assert.match((await renderer.auditComposition([2.5])).join(' '), /runs off the frame/);
  // A rolling counter's waiting digits sit outside the frame inside a masked window: not a finding.
  const ticker = `<div id="${frameId}-win" style="position:absolute;left:800px;top:300px;width:200px;height:200px;overflow:hidden"><div style="position:absolute;top:0;font:900 180px Bahnschrift;color:#fff">1<br>2<br>3<br>4<br>5<br>6<br>7</div></div>`;
  await renderer.loadComposition({...base, html: A.validateComposition(composition(timeline, ticker), {frameId, width: 1920, height: 1080, duration: 3}).html});
  assert.deepEqual(await renderer.auditComposition([2.5]), []);
  // A dark opening is found the way the render's black-frame check finds it: before 1 s only the dark field shows
  // (a lone white number on a dark field counts as black too; here the hero lands as a full-width band).
  const dark = A.validateComposition(composition(timeline, `<style>#${frameId}-hero{background:#E0753E}</style>`).replace('#10131A', '#0B1020'), {frameId, width: 1920, height: 1080, duration: 3}).html;
  await renderer.loadComposition({...base, html: dark});
  assert.deepEqual(await renderer.blackMoments([0, 0.5, 2]), [0, 0.5]);
});

// 0.68 (owner request 2026-10-29, html-anime): the anime finish - a closed colour script, shots with a drawing budget,
// one expensive shot per scene, drawings swapped instead of eased, and the colour-dip cut.
test('the anime finish: colour scripts, shot budgets, its own contract and checks', () => {
  const read = 'A quiet duel on a rooftop told through rain and one blade of light';
  const named = A.validateDirection({read, dials: {variance: 4, motion: 5, density: 3}, fonts: {display: 'Georgia', body: 'Segoe UI'}, script: 'eclipse', palette: {canvas: '#FFFFFF'}}, {finish: 'anime'});
  assert.equal(named.finish, 'anime');
  assert.equal(named.script.name, 'Vermilion eclipse');
  assert.equal(named.palette.canvas, A.SCRIPTS.eclipse.colors.sky, 'the palette is the colour script\'s, not Claude\'s');
  assert.equal(A.validateDirection({read, script: 'eclipse'}, {finish: 'anime', script: 'noon'}).script.name, 'Paper noon', 'the style\'s script wins over Claude\'s');
  const own = {name: 'Dusk', colors: {...A.SCRIPTS.indigo.colors, line: '#1C2C6A'}}, warnings = [];
  assert.equal(A.validateDirection({read, script: own}, {finish: 'anime', warn: m => warnings.push(m)}).script.name, 'Indigo moon');
  assert.match(warnings.join(' '), /line does not stand out/, 'a line lost in its sky is refused');
  assert.throws(() => A.validateDirection({read, dials: {variance: 4, motion: 5, density: 3}, fonts: {display: 'Georgia', body: 'Segoe UI'}, script: 'neon'}, {finish: 'anime', lenient: false}), /not one of/);
  assert.equal(A.validateDirection({read, dials: {variance: 4, motion: 5, density: 3}}).finish, undefined, 'motion directions are unchanged');

  const beats = [{show: 'the blade crosses the moon'}];
  const sakuga = A.validateFrame({blueprint: 'compose', shot: 'sakuga', drawings: 12, beats}, {finish: 'anime'});
  assert.deepEqual([sakuga.shot, sakuga.drawings], ['sakuga', 8]);
  assert.deepEqual([A.validateFrame({blueprint: 'compose', beats}, {finish: 'anime'}).shot, A.validateFrame({blueprint: 'compose', beats}, {finish: 'anime'}).drawings], ['approach', 3]);
  assert.equal(A.validateFrame({blueprint: 'compose', shot: 'sakuga', beats}).shot, undefined, 'motion frames carry no shot');
  const second = A.validateFrame({blueprint: 'compose', shot: 'sakuga', drawings: 6, beats}, {finish: 'anime'}), notes = [];
  A.sakugaBudget([{frame: sakuga, label: 'S01C'}, {frame: second, label: 'S01D'}], m => notes.push(m));
  assert.deepEqual([sakuga.shot, second.shot, second.drawings], ['sakuga', 'turn', 3], 'one expensive shot per scene');
  assert.match(notes[0], /^S01D: one expensive/);

  const [system, user] = A.composeMessages({frameId, width: 1920, height: 1080, duration: 3, frame: sakuga, direction: named, words: [{text: 'rain', start: 0.2}], fps: 24});
  assert.match(system.content, /CEL PAINT/);
  assert.match(system.content, /DRAWINGS, NOT TWEENS/);
  assert.doesNotMatch(system.content, /MOTION DOCTRINE/, 'the anime contract replaces the motion doctrine');
  const packet = JSON.parse(user.content.split('\n\n')[0]);
  assert.deepEqual([packet.finish, packet.fps, packet.drawingBudget.uniqueDrawings, packet.colourScript.accent], ['anime', 24, 8, '#FF3B3B']);
  assert.match(A.composeMessages({frameId, width: 1920, height: 1080, duration: 3, frame: A.validateFrame({blueprint: 'compose', beats}), direction: A.validateDirection({read}), words: []})[0].content, /MOTION DOCTRINE/);

  const size = {frameId, width: 1920, height: 1080, duration: 3, script: named.script};
  const eased = A.validateComposition(composition(timeline), size);
  assert.ok(eased.issues.some(item => /swaps drawings/.test(item)), 'an anime shot that only eases is sent back');
  const swapped = `const tl = gsap.timeline({paused: true}); tl.set('#${frameId}-hero', {opacity: 1}, 0.5); window.__timelines["${frameId}"] = tl;`;
  assert.ok(A.validateComposition(composition(swapped), size).warnings.some(item => /outside the colour script: #10131A, #F7F4EE/.test(item)), 'two stray colours are named');
  assert.ok(A.validateComposition(composition(swapped, '<svg><rect fill="#00FF00"/></svg>'), size).issues.some(item => /outside the colour script/.test(item)), 'more stray colours send the shot back');
  const inScript = composition(swapped).replace('#10131A', named.script.colors.sky).replace('#F7F4EE', named.script.colors.line);
  assert.deepEqual(A.validateComposition(inScript, size).issues, [], 'a shot in the script that swaps drawings passes');
  assert.match(A.promptGuide({finish: 'anime'}), /HTML RENDER[\s\S]*"sakuga"[\s\S]*dip-colour/);
  assert.match(A.promptGuide({finish: 'anime', script: 'festival'}), /style's Festival/);
});

// 0.70 (owner request 2026-10-29): a mix of motion graphics and the HTML render, one finish per scene.
test('the mix finish: each frame names motion graphics or the HTML render, both in one colour script', () => {
  const read = 'A history of money told through people at markets and the numbers they traded';
  const direction = A.validateDirection({read, script: 'noon'}, {finish: 'mix'});
  assert.deepEqual([direction.finish, direction.script.name, direction.palette.accent], ['mix', 'Paper noon', A.SCRIPTS.noon.colors.accent], 'a mixed video keeps one colour script');
  const beats = [{show: 'the coin changes hands'}], warnings = [];
  const anime = A.validateFrame({blueprint: 'compose', finish: 'anime', shot: 'sakuga', beats}, {finish: 'mix'});
  const motion = A.validateFrame({blueprint: 'compose', beats}, {finish: 'mix'});
  const odd = A.validateFrame({blueprint: 'compose', finish: 'oil', beats}, {finish: 'mix', warn: m => warnings.push(m)});
  assert.deepEqual([anime.finish, anime.shot, anime.drawings, motion.finish, motion.shot, odd.finish], ['anime', 'sakuga', 8, 'motion', undefined, 'motion']);
  assert.match(warnings[0], /finish "oil" is motion or anime/);
  assert.throws(() => A.validateFrame({blueprint: 'compose', finish: 'oil', beats}, {finish: 'mix', lenient: false}), /motion or anime/);
  assert.deepEqual([A.frameFinish(direction, anime), A.frameFinish(direction, motion), A.frameFinish(A.validateDirection({read}, {finish: 'anime'}), motion), A.frameFinish(A.validateDirection({read}), anime)], ['anime', 'motion', 'anime', 'motion']);
  // Each frame gets its own contract.
  const ask = frame => A.composeMessages({frameId, width: 1920, height: 1080, duration: 3, frame, direction, words: [], fps: 24})[0].content;
  assert.match(ask(anime), /CEL PAINT/);
  assert.match(ask(motion), /MOTION DOCTRINE/);
  const guide = A.promptGuide({finish: 'mix', script: 'noon'});
  assert.match(guide, /MIX OF MOTION GRAPHICS AND HTML RENDER[\s\S]*"finish": "motion"[\s\S]*"sakuga"[\s\S]*style's Paper noon[\s\S]*Blueprints/);
});

test('the style keeps the atelier finish only for the Atelier and Story Mix engines', () => {
  const St = require('../style'), launch = key => structuredClone(St.LAUNCH_PROFILES.find(item => item.key === key).spec);
  assert.deepEqual(St.validateStyleSpec({...launch('atelier'), atelier: {finish: 'anime', script: 'indigo'}}).atelier, {finish: 'anime', script: 'indigo'});
  assert.equal(St.validateStyleSpec({...launch('atelier'), atelier: {finish: 'anime'}}).atelier.script, 'choose');
  assert.equal(St.validateStyleSpec(launch('atelier')).atelier, undefined, 'no finish means motion design, and older specs hash the same');
  assert.throws(() => St.validateStyleSpec({...launch('cinematic-hybrid'), atelier: {finish: 'anime'}}), /no atelier finish/);
  assert.throws(() => St.validateStyleSpec({...launch('atelier'), atelier: {finish: 'watercolour'}}), /atelier finish/);
  assert.equal(St.validateStyleSpec({...launch('atelier'), atelier: {finish: 'mix'}}).atelier.finish, 'mix');
  assert.match(launch('atelier').name, /^Motion Graphics/, 'the engine is called Motion Graphics (it was Atelier)');
});

// 0.89 (owner request 2026-11-04): paper collage and pixel art in the Motion Graphics engine.
test('paper collage and pixel art: their contracts, palettes, checks and what the render needs', () => {
  const read = 'A warm handmade story of a small town told in cut paper and little pixel signs';
  const paper = A.validateDirection({read, palette: {canvas: '#C9A36B', ink: '#2B2430', accent: '#E85D4A', support: '#8CC6E7'}}, {finish: 'collage'});
  assert.deepEqual([paper.finish, paper.palette.accent, paper.pixel, paper.script], ['collage', '#E85D4A', undefined, undefined]);
  // Pixel art: the style's palette, Claude's own, or a named repair; the palette roles come from it.
  const preset = A.validateDirection({read}, {finish: 'pixel', palette: 'arcade'});
  assert.deepEqual([preset.finish, preset.pixel.name, preset.pixel.colors.length, preset.palette.canvas], ['pixel', 'Arcade night', 16, A.PALETTES.arcade.colors[0]]);
  const own = A.validateDirection({read, pixel: {name: 'Night lake', colors: ['#101828', '#2A4365', '#F6E05E', '#FFFFFF']}}, {finish: 'pixel'});
  assert.deepEqual([own.pixel.key, own.palette.canvas, own.palette.ink], ['own', '#101828', '#FFFFFF']);
  const warnings = [];
  assert.equal(A.validateDirection({read, pixel: {colors: ['#101010', '#111111', '#121212', '#131313']}}, {finish: 'pixel', warn: m => warnings.push(m)}).pixel.name, 'Rainy dusk');
  assert.match(warnings[0], /stands out from its ground/);
  assert.throws(() => A.pixelPalette({colors: ['#000000']}, {lenient: false}), /4 to 16/);
  // Contracts: paper and pixels have their own rules and keep the shared ones.
  const frame = A.validateFrame({blueprint: 'compose', beats: [{show: 'the house drops in'}]});
  const ask = (direction, extra = {}) => A.composeMessages({frameId, width: 1920, height: 1080, duration: 3, frame, direction, words: [], fps: 30, ...extra});
  const [paperSystem, paperUser] = ask(paper, {skills: {skills: [{id: 'collage.torn-rims', do: ['tear part of the edge']}]}});
  assert.match(paperSystem.content, /PAPER COLLAGE FINISH[\s\S]*url\(#at-torn\)[\s\S]*STOP-MOTION|PAPER COLLAGE FINISH[\s\S]*url\(#at-torn\)[\s\S]*stop-motion/i);
  assert.doesNotMatch(paperSystem.content, /MOTION DOCTRINE/);
  assert.match(paperUser.content, /"finish":"collage"[\s\S]*"heldFrames":2[\s\S]*Craft skills the owner approved[\s\S]*collage\.torn-rims/);
  const [pixelSystem, pixelUser] = ask(preset);
  assert.match(pixelSystem.content, /PIXEL ART FINISH[\s\S]*crispEdges[\s\S]*__atelier\.pixel\.text/);
  assert.match(pixelUser.content, /"heldFrames":3,"grid":"320x180","pixelPalette":\["#0B0B14"/);
  assert.equal(JSON.parse(A.composeMessages({frameId, width: 1080, height: 1920, duration: 3, frame, direction: preset, words: [], fps: 30})[1].content.split('\n\n')[0]).grid, '180x320', 'Shorts get a tall grid');
  // The checks: paper must be paper; pixels must be cells in the palette without blends.
  const svg = body => `<template><div id="root" data-composition-id="${frameId}" data-width="1920" data-height="1080" data-duration="3">${body}<script>${timeline}</script></div></template>`;
  const check = (body, finish, pixel = null) => A.validateComposition(svg(body), {frameId, width: 1920, height: 1080, duration: 3, finish, pixel});
  assert.match(check('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#C9A36B"/></svg>', 'collage').issues.join(' '), /Nothing in the shot is paper/);
  assert.deepEqual(check('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#C9A36B" filter="url(#at-torn-kraft)"/></svg>', 'collage').issues, []);
  assert.match(check('<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#0B0B14"/></svg>', 'pixel', preset.pixel).issues.join(' '), /not on the cell grid/);
  const flagged = check('<svg viewBox="0 0 320 180" shape-rendering="crispEdges"><rect width="320" height="180" fill="#0B0B14"/><rect width="9" height="9" fill="#123456"/><rect width="9" height="9" fill="#654321"/><rect width="9" height="9" fill="#ABCDEF"/><div style="filter:blur(2px)"></div></svg>', 'pixel', preset.pixel).issues.join(' ');
  assert.match(flagged, /no blur[\s\S]*Colours outside the pixel palette: #123456, #654321, #ABCDEF/);
  assert.deepEqual(check(`<svg viewBox="0 0 320 180" shape-rendering="crispEdges"><rect width="320" height="180" fill="${A.PALETTES.arcade.colors[0]}"/></svg>`, 'pixel', preset.pixel).issues, []);
  // The render: frames held per drawing, and a pixel grid scaled sharply.
  assert.deepEqual(A.renderFinish(paper, frame, {width: 1920, height: 1080}), {finish: 'collage', hold: 2});
  assert.deepEqual(A.renderFinish(preset, frame, {width: 1080, height: 1920}), {finish: 'pixel', hold: 3, grid: [180, 320]});
  assert.deepEqual(A.renderFinish(A.validateDirection({read}), frame, {width: 1920, height: 1080}), {}, 'motion graphics are not held');
  assert.equal(A.pixelFilter([320, 180], {width: 1280, height: 720}), 'scale=320:180:flags=neighbor,scale=1280:720:flags=neighbor');
  // The planner's guide.
  assert.match(A.promptGuide({finish: 'collage'}), /PAPER COLLAGE[\s\S]*cut-paper figures[\s\S]*Blueprints/);
  assert.match(A.promptGuide({finish: 'pixel', palette: 'meadow'}), /PIXEL ART[\s\S]*style's Meadow day/);
});

test('a mix of the ticked finishes: each frame takes one of them, with its own palette and checks', () => {
  const read = 'An explainer that tells the history in paper and the numbers in pixels and plain charts';
  const direction = A.validateDirection({read, pixel: 'desert'}, {finish: 'mix', finishes: ['collage', 'pixel', 'motion']});
  assert.deepEqual([direction.finish, direction.finishes, direction.pixel.name, direction.script], ['mix', ['motion', 'collage', 'pixel'], 'Desert noon', undefined]);
  const beats = [{show: 'a map of the old town'}], warnings = [];
  const paper = A.validateFrame({blueprint: 'compose', finish: 'collage', beats}, {finish: 'mix', finishes: direction.finishes});
  const none = A.validateFrame({blueprint: 'compose', beats}, {finish: 'mix', finishes: direction.finishes});
  const odd = A.validateFrame({blueprint: 'compose', finish: 'anime', beats}, {finish: 'mix', finishes: direction.finishes, warn: m => warnings.push(m)});
  assert.deepEqual([paper.finish, none.finish, odd.finish], ['collage', 'motion', 'motion']);
  assert.match(warnings[0], /is motion, collage or pixel; it is motion graphics/);
  assert.deepEqual([A.frameFinish(direction, paper), A.frameFinish(direction, {finish: 'pixel'}), A.frameFinish(direction, {finish: 'anime'})], ['collage', 'pixel', 'motion']);
  // The old mix (no ticks) is motion graphics and the HTML render, exactly as before 0.89.
  const old = A.validateDirection({read, script: 'noon'}, {finish: 'mix'});
  assert.deepEqual([old.finishes, old.script.name, A.frameFinish(old, {finish: 'collage'})], [undefined, 'Paper noon', 'motion']);
  const guide = A.promptGuide({finish: 'mix', finishes: ['collage', 'pixel', 'motion']});
  assert.match(guide, /A MIX OF 3 FINISHES[\s\S]*"collage"[\s\S]*"pixel"[\s\S]*PAPER COLLAGE FRAMES[\s\S]*PIXEL ART FRAMES/);
  assert.doesNotMatch(guide, /HTML RENDER FRAMES/);
  assert.match(A.promptGuide({finish: 'mix', script: 'noon'}), /MIX OF MOTION GRAPHICS AND HTML RENDER/, 'the old mix keeps its guide');
});

test('the style keeps paper and pixel settings: ticked finishes only for a mix, a named pixel palette', () => {
  const St = require('../style'), launch = structuredClone(St.LAUNCH_PROFILES.find(item => item.key === 'atelier').spec);
  assert.deepEqual(St.validateStyleSpec({...launch, atelier: {finish: 'pixel', palette: 'handheld'}}).atelier, {finish: 'pixel', script: 'choose', palette: 'handheld'});
  assert.deepEqual(St.validateStyleSpec({...launch, atelier: {finish: 'mix', finishes: ['pixel', 'collage']}}).atelier, {finish: 'mix', script: 'choose', finishes: ['collage', 'pixel']});
  assert.deepEqual(St.validateStyleSpec({...launch, atelier: {finish: 'collage', finishes: ['pixel', 'collage']}}).atelier, {finish: 'collage', script: 'choose'}, 'ticks are kept only while the finish is mix');
  assert.throws(() => St.validateStyleSpec({...launch, atelier: {finish: 'mix', finishes: ['pixel']}}), /Tick two or more/);
  assert.throws(() => St.validateStyleSpec({...launch, atelier: {finish: 'pixel', palette: 'neon'}}), /pixel palette/);
});

test('the browser holds paper on twos and pixels on threes, and the pixel helpers lay exact cells', {skip: findBrowser() ? false : 'No Edge or Chrome on this machine'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-hold-'));
  const renderer = new MotionRenderer();
  t.after(async () => { await renderer.close(); fs.rmSync(dir, {recursive: true, force: true}); });
  await renderer.start();
  const move = `const tl = gsap.timeline({paused: true}); tl.fromTo('#${frameId}-hero', {x: 0}, {x: 600, duration: 3, ease: 'none'}, 0); window.__timelines["${frameId}"] = tl;`;
  const html = A.validateComposition(composition(move), {frameId, width: 1920, height: 1080, duration: 3}).html;
  const base = {html, frameId, width: 1920, height: 1080, scale: 0.125, canvas: '#10131A', duration: 1, fps: 12};
  await renderer.renderComposition({...base, hold: 3, outDir: path.join(dir, 'h')});
  const frame = k => fs.readFileSync(path.join(dir, 'h', `f${String(k).padStart(5, '0')}.png`));
  assert.ok(frame(0).equals(frame(1)) && frame(1).equals(frame(2)), 'one drawing is shown for three frames');
  assert.ok(!frame(2).equals(frame(3)), 'the next drawing comes on the fourth frame');
  // The pixel helpers, run in the page: a bitmap word, a sprite and a dither, in cells.
  const pix = `<svg id="${frameId}-px" viewBox="0 0 320 180" width="100%" height="100%" shape-rendering="crispEdges"></svg>`;
  const build = `const s = document.getElementById('${frameId}-px'), X = __atelier.pixel; window.__word = X.text(s, 'HI 1', 2, 2, '#FFFFFF').childNodes.length; window.__sprite = X.sprite(s, ['.##.', '#aa#'], {'#': '#FF0000', a: '#00FF00'}, 10, 10).childNodes.length; window.__fill = X.dither('#000000', '#FFFFFF', 0.5); window.__defs = !!document.querySelector('#at-defs #at-torn') && !!document.getElementById(window.__fill.slice(5, -1)); ${timeline}`;
  await renderer.loadComposition({html: A.validateComposition(composition(build, pix), {frameId, width: 1920, height: 1080, duration: 3}).html, frameId, width: 640, height: 360, duration: 3});
  assert.deepEqual(await renderer.evaluate('[window.__word, window.__sprite, window.__fill, window.__defs]'), [19, 4, 'url(#at-px-000000-FFFFFF-8)', true]);
});

// 0.89: the approved skills reach the continuity review, Claude's pictures, ChatGPT's paintings and the art director.
test('skills reach the review, the pictures, the paintings and the art director', () => {
  const {reviewMessages, skillStyle} = require('../scene-room');
  const Il = require('../illustrate'), Dna = require('../visual-dna');
  const skills = {sourceHierarchy: ['owner instruction in this request'], skills: [{id: 'era.cave-painting', title: 'Cave painting', do: ['Keep pigment strong and dense.'], avoid: ['A bison like a box on table legs.'], checks: ['The bison has a tall hump.']}]};
  const review = reviewMessages({engine: 'stickman', look: 'classic', skills, scenes: []});
  assert.match(review[0].content, /OWNER SKILLS \(input "skills"\)[^\n]*Judge every shot by them too/);
  assert.doesNotMatch(reviewMessages({engine: 'stickman', look: 'classic', scenes: []})[0].content, /OWNER SKILLS/);
  assert.match(Il.messages({describe: 'a bison on a cave wall', skills})[1].content, /CRAFT SKILLS THE OWNER APPROVED FOR PICTURES[\s\S]*era\.cave-painting/);
  assert.match(Il.paintPrompt({describe: 'a bison on a cave wall', skills}), /Craft: Keep pigment strong and dense\. Avoid: A bison like a box on table legs\./);
  assert.doesNotMatch(Il.paintPrompt({describe: 'a bison on a cave wall'}), /Craft:/);
  const check = Dna.checkMessages({rules: Dna.of({engine: 'stickman', look: 'classic'}), describe: 'a bison', image: {mediaType: 'image/png', data: 'AA=='}, skills});
  assert.match(check[1].content[1].text, /CRAFT CHECKS THE OWNER APPROVED[^\n]*tall hump/);
  assert.equal(Dna.craftText(skills, 'do', 10), '', 'a rule that does not fit is left out whole');
  // The words that decide which engine-specific skills fit a video include its Motion Graphics finishes and film looks.
  assert.match(skillStyle({engine: 'atelier'}, {atelier: {finish: 'mix', finishes: ['collage', 'pixel']}, drawing: {film: 'riso'}}), /collage paper pixel riso/);
});
