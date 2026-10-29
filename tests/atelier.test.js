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
