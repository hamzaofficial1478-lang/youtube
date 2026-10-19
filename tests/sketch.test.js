'use strict';
// P06c/P06d drawn shots: the closed vocabulary, cast, word timing, the free fallback and the guide Claude reads.
const test = require('node:test');
const assert = require('node:assert/strict');
const Sk = require('../sketch');

const cast = Sk.validateCast([{id: 'c1', name: 'Max', role: 'the narrator', look: {hair: 'spiky', hairColor: 'ginger'}}, {id: 'boss', name: 'The Boss', look: {body: 'creature'}}]);

test('a drawn shot uses the closed vocabulary; positions stay inside the frame and above the captions', () => {
  const shot = Sk.validate({elements: [{kind: 'figure', pose: 'shock', x: 1.4, y: 0.99}, {kind: 'prop', prop: 'bolt', accent: true, label: 'Lightning {bold}'}, {kind: 'text', text: '  5x  hotter <b> ', style: 'stamp'}, {kind: 'arrow', from: [0.1, 0.5], to: 2}, {kind: 'bubble', text: 'Why later?', thought: true, on: 1}, {kind: 'fx', effect: 'burst', on: 2}]});
  assert.deepEqual([shot.engine, shot.set, shot.mood, shot.camera, shot.transition], ['stickman', 'none', 'normal', 'push', 'cut'], 'defaults');
  const [figure, prop, text, arrow, bubble, fx] = shot.elements;
  assert.deepEqual([figure.x, figure.y, figure.size, figure.facing, figure.expression, figure.look.hair], [0.9, 0.84, 'm', 'right', 'neutral', 'messy'], 'clamped into the frame, feet above the caption band, the default look');
  assert.equal(prop.label, 'Lightning bold', 'braces never reach the drawing');
  assert.equal(text.text, '5x hotter b', 'markup and spacing are cleaned');
  assert.deepEqual([arrow.from, arrow.to, bubble.on, fx.on], [[0.1, 0.5], 2, 1, 2], 'arrows, bubbles and effects can point at other elements');
  for (const [raw, pattern] of [
    [{elements: []}, /1-12 elements/], [{elements: Array(13).fill({kind: 'prop', prop: 'sun'})}, /1-12 elements/], [{elements: [{kind: 'prop', prop: 'dragon'}]}, /prop must be one of/],
    [{elements: [{kind: 'figure', pose: 'moonwalk'}]}, /pose must be one of/], [{elements: [{kind: 'video'}]}, /kind must be/], [{elements: [{kind: 'text', text: ''}]}, /needs text/],
    [{elements: [{kind: 'arrow', from: [0.1]}]}, /from must be a point/], [{set: 'volcano-lair', elements: [{kind: 'prop', prop: 'sun'}]}, /Set must be one of/], [[], /must be an object/],
    [{engine: 'claymation', elements: [{kind: 'prop', prop: 'sun'}]}, /Engine must be one of: stickman, handdrawn, motion/],
  ]) assert.throws(() => Sk.validate(raw), pattern);
});

test('Claude\'s near-misses are repaired with a warning; the owner\'s own edits are checked strictly', () => {
  const warnings = [];
  const shot = Sk.validate({engine: 'stickman', set: 'office', elements: [{kind: 'prop', prop: 'cash'}, {kind: 'prop', prop: 'dragon'}, {kind: 'figure', pose: 'moonwalk', who: 'c1'}, {kind: 'figure', who: 'ghost'}]}, {cast, lenient: true, warn: message => warnings.push(message)});
  assert.deepEqual(shot.elements.map(el => el.prop || el.pose), ['money', 'stand', 'stand'], 'a synonym maps onto the library, an unknown prop is left out, an unknown pose stands');
  assert.equal(shot.elements[1].look.hair, 'spiky', 'a cast member keeps their look in every shot');
  assert.equal(shot.elements[2].who, undefined);
  assert.equal(warnings.length, 3);
  assert.match(warnings.join(' '), /"dragon" is not in the prop library[\s\S]*pose must be one of[\s\S]*ghost, who is not in the cast/);
  assert.throws(() => Sk.validate({elements: [{kind: 'prop', prop: 'dragon'}]}, {lenient: true}), /at least one element/, 'nothing drawable is still an error');
  // A near-miss effect name keeps Claude's intent and is named; the owner's own edit must use the real name.
  const near = [];
  assert.equal(Sk.validate({elements: [{kind: 'fx', effect: 'highlight'}]}, {lenient: true, warn: message => near.push(message)}).elements[0].effect, 'circle');
  assert.match(near[0], /"highlight" is drawn as "circle"/);
  assert.throws(() => Sk.validate({elements: [{kind: 'fx', effect: 'highlight'}]}), /effect must be one of/);
  const face = Sk.validate({elements: [{kind: 'figure', pose: 'stand', expression: 'wondering', then: [{at: 'later', expression: 'horrified'}]}]}, {lenient: true, warn: message => near.push(message)}).elements[0];
  assert.deepEqual([face.expression, face.then[0].expression], ['curious', 'terrified']);
  assert.match(near.join(' '), /"wondering" is drawn as "curious"/);
  assert.throws(() => Sk.validate({elements: [{kind: 'figure', pose: 'stand', expression: 'wondering'}]}), /expression must be one of/);
  // Any drawing engine may draw a shot in any video; Claude decides and says why (engines.js).
  assert.equal(Sk.validate({engine: 'handdrawn', elements: [{kind: 'prop', prop: 'map'}]}, {primary: 'stickman'}).engine, 'handdrawn');
  assert.equal(Sk.validate({engine: 'stickman', elements: [{kind: 'prop', prop: 'map'}]}, {primary: 'montage'}).engine, 'stickman');
  assert.equal(Sk.validate({elements: [{kind: 'prop', prop: 'map'}]}, {primary: 'montage'}).engine, 'stickman', 'drawn shots in a footage video default to the first drawing engine');
});

test('the cast is validated once and characters keep their looks', () => {
  assert.deepEqual(cast.map(item => [item.id, item.name, item.look.body, item.look.hair]), [['c1', 'Max', 'stick', 'spiky'], ['boss', 'The Boss', 'creature', 'messy']]);
  assert.equal(Sk.validateCast(Array(12).fill(0).map((_, k) => ({id: `c${k}`}))).length, 12, 'as many characters as the script needs');
  assert.equal(Sk.validateCast(Array(45).fill(0).map((_, k) => ({id: `c${k}`}))).length, Sk.MAX_CAST, 'a sanity bound only');
  assert.throws(() => Sk.validateCast([{id: 'a'}, {id: 'a'}]), /repeats the id a/);
  assert.throws(() => Sk.validateCast([{look: {hair: 'dreadlocks-of-fire'}}]), /hair must be one of/);
});

test('drawings arrive on the narrator\'s words: cues, changes and exits resolve against the spoken words', () => {
  const words = 'A single bolt of lightning is five times hotter than the surface of the sun'.split(' ').map((text, k) => ({text, start: k * 0.25}));
  const shot = Sk.validate({elements: [{kind: 'figure', pose: 'cower', then: [{at: 'hotter', pose: 'shock'}]}, {kind: 'prop', prop: 'bolt', at: 'bolt', until: 'surface'}, {kind: 'text', text: '5x', style: 'stamp', at: 'five times'}, {kind: 'prop', prop: 'sun', at: 'suns'}, {kind: 'prop', prop: 'moon', at: 'moonlight'}], focus: [{at: 'sun', x: 0.8, y: 0.3, zoom: 1.8}]});
  const times = Sk.timing(shot, words);
  assert.deepEqual(times.elements.map(item => item.t0), [null, 0.5, 1.5, 3.5, null], 'a cue matches its word (stems too); an unspoken cue stays unset and the engine staggers it');
  assert.deepEqual([times.elements[0].then, times.elements[1].t1, times.focus], [[2], 2.75, [3.5]]);
  assert.deepEqual(Sk.matchPhrase(words, 'five times'), {index: 6, seconds: 1.5});
  assert.equal(Sk.matchPhrase(words, 'six times'), null);
});

test('the free fallback builds a scene from the narration: a set, the narrator acting, props it names, its number counting up', () => {
  const hot = Sk.fromText('A single bolt of lightning is five times hotter than the surface of the sun.', {cast});
  assert.equal(hot.set, 'storm');
  assert.deepEqual(hot.elements.map(el => el.kind === 'figure' ? `${el.who}:${el.pose}:${el.expression}` : el.prop || el.text), ['c1:shock:shocked', 'bolt', 'sun']);
  const count = Sk.fromText('Right now, lightning is striking about 45 times every second.', {shotIndex: 1});
  assert.equal(count.elements[0].facing, 'left', 'every other shot mirrors the layout');
  assert.deepEqual(count.elements[1], {kind: 'text', text: '45', style: 'counter', x: 0.5, y: 0.15, size: 'l', accent: true, enter: 'auto'}, 'the number comes right after the speaker, so a drawing hand writes it first');
  // Audit 2026-10-19: a year is a date (it lands, it does not count up), the amount wins over the year, many people
  // are a crowd, a ship at sea stays above water, a turn word changes the mood, nothing named takes turns.
  const army = Sk.fromText('By 1700 the company had 40,000 employees and its own army.', {cast});
  assert.deepEqual([army.set, army.elements[0].kind, army.elements.find(el => el.kind === 'text').text, army.elements.find(el => el.kind === 'text').style], ['battlefield', 'crowd', '40,000', 'counter']);
  assert.equal(Sk.fromText('In 1602 the merchants met.', {cast}).elements.find(el => el.kind === 'text').style, 'number');
  const sea = Sk.fromText('But one ship lost at sea could wipe out a whole year of profit.', {cast, shotIndex: 1});
  assert.deepEqual([sea.set, sea.mood, sea.camera, sea.elements.filter(el => el.kind === 'prop').map(el => el.prop)], ['storm', 'tense', 'punch', ['ship', 'chart-down']]);
  assert.equal(Sk.fromText('Their ships sailed for months.', {cast}).set, 'harbor', 'ships at sea are not under water');
  assert.equal(Sk.fromText('Merchants sold spices.', {primary: 'motion', cast}).set, 'market', 'documentary drawn shots stand in a place too');
  assert.notEqual(Sk.fromText('Nothing named.', {shotIndex: 1}).elements.find(el => el.kind === 'prop').prop, Sk.fromText('Nothing named.', {shotIndex: 2}).elements.find(el => el.kind === 'prop').prop);
  const hook = Sk.fromText('Nothing to see.', {purpose: 'hook'});
  assert.deepEqual([hook.camera, hook.elements[1].effect, hook.elements[1].on, hook.elements[2].prop], ['punch', 'burst', 3, 'exclamation'], 'a hook opens on a punch with a burst behind its prop');
  assert.equal(Sk.fromText('Prices rise.', {primary: 'motion'}).elements.some(el => el.kind === 'figure'), false, 'motion graphics without a cast draw no figure');
  assert.deepEqual(Sk.fromText('A single bolt of lightning.'), Sk.fromText('A single bolt of lightning.'), 'deterministic');
});

test('Claude reads the whole vocabulary, the scene-building rules and the layout rules', () => {
  const guide = Sk.promptGuide('stickman');
  for (const word of [...Sk.POSES, ...Sk.PROPS, ...Sk.EXPRESSIONS, ...Sk.SETS, ...Sk.FX, ...Sk.EMOTES, ...Sk.LOOK.headwear]) assert.ok(guide.includes(word), word);
  assert.match(guide, /BUILD EVERY SHOT LIKE A SCENE/);
  assert.match(guide, /keep the bottom 18% clear for captions/);
  assert.match(guide, /Never copy a real person or another channel's characters/);
  assert.match(guide, /"engine": stickman\|handdrawn\|motion/);
  assert.match(guide, /SCRIPT MATCH: every shot shows exactly what its own words say/);
  assert.match(guide, /CONTINUITY: plan the world first/);
  assert.match(guide, /every character the script needs \(one, ten or more/);
  assert.match(Sk.VERSION, /^drawn-scene\/\d+$/);
});

test('a scene setting is shared by its shots, and continuity notes catch place jumps and screen-direction flips', () => {
  assert.deepEqual(Sk.validateSetting({set: 'bank', mood: 'tense'}), {set: 'bank', mood: 'tense'});
  assert.deepEqual(Sk.validateSetting({set: 'moon-base'}), {set: 'none', mood: 'normal'}, 'repaired for Claude');
  assert.throws(() => Sk.validateSetting({set: 'moon-base'}, {strict: true}), /Setting set must be one of/);
  const shot = (label, sceneId, set, x, facing) => ({label, sceneId, sketch: Sk.validate({set, elements: [{kind: 'figure', who: 'c1', x, facing}]}, {cast})});
  const notes = Sk.continuity([shot('S01A', 'a', 'bank', 0.3, 'right'), shot('S01B', 'a', 'desert', 0.7, 'left'), shot('S02A', 'b', 'space', 0.3, 'right')], cast);
  assert.deepEqual(notes, ['S01B moves from the bank to the desert inside one scene; keep the place unless the words move.', 'Max jumps to the other side of the screen and turns round between S01A and S01B.'], 'a new scene may move');
  assert.equal(Sk.fromText('Money talk.', {setting: {set: 'bank', mood: 'money'}}).set, 'bank');
  // The story moving there is not a jump: the shot's own words or its notes go to the new place; an abstract
  // backdrop is a close-up beat.
  const words = (item, value) => ({...item, words: value});
  assert.deepEqual(Sk.continuity([shot('S02A', 'b', 'nature', 0.3, 'right'), words(shot('S02B', 'b', 'beach', 0.3, 'right'), 'melt sand into glass')], cast), []);
  assert.deepEqual(Sk.continuity([shot('S02A', 'b', 'nature', 0.3, 'right'), {...shot('S02B', 'b', 'beach', 0.3, 'right'), notes: 'Cut to the beach: where the bolt lands.'}], cast), []);
  assert.deepEqual(Sk.continuity([shot('S03A', 'c', 'storm', 0.3, 'right'), shot('S03B', 'c', 'abstract', 0.3, 'right'), shot('S03C', 'c', 'storm', 0.3, 'right')], cast), []);
  // What is left is mended on Claude's and the free plans: the place stays, the facing holds.
  const jumpy = [shot('S01A', 'a', 'bank', 0.3, 'right'), words(shot('S01B', 'a', 'desert', 0.7, 'left'), 'and nobody noticed'), shot('S01C', 'a', 'bank', 0.3, 'right')];
  const fixes = Sk.mend(jumpy, cast);
  assert.deepEqual(fixes.map(item => item.label), ['S01B', 'S01B']);
  assert.match(fixes[0].fix, /Kept the bank/);
  assert.deepEqual([jumpy[1].sketch.set, jumpy[1].sketch.elements[0].facing], ['bank', 'right']);
  assert.deepEqual(Sk.continuity(jumpy, cast), [], 'nothing left to note once mended');
  // A character already on screen in the shot before does not pop in again on a word.
  const carried = [shot('S02A', 'b', 'home', 0.3, 'right'), {...shot('S02B', 'b', 'home', 0.3, 'right'), sketch: Sk.validate({set: 'home', elements: [{kind: 'figure', who: 'c1', x: 0.3, facing: 'right', at: 'every three'}]}, {cast})}];
  assert.deepEqual(Sk.mend(carried, cast).map(item => item.fix), ['Max stays on screen from S02A instead of appearing again.']);
  assert.deepEqual([carried[1].sketch.elements[0].at, carried[1].sketch.elements[0].enter], [undefined, 'none']);
});

test('a picture is data, never code: path data and colours only, checked before anything draws it', () => {
  const Il = require('../illustrate');
  const shape = (d, extra = {}) => ({d, fill: '#E5484D', stroke: '#1E1E1E', width: 3, ...extra});
  const good = {viewBox: [600, 400], paths: [shape('M10 10 L100 10 L100 100 Z'), shape('M20 20 C40 0 60 0 80 20'), shape('M5 5 A20 20 0 1 1 4.9 5 Z'), shape('M1 1 L2 2', {stroke: 'none'}), shape('M3 3 Q4 4 5 3'), shape('M6 6 h10 v10 z')]};
  const {art, issues} = Il.validateArt('Here it is:\n```json\n' + JSON.stringify(good) + '\n```');
  assert.deepEqual(issues, []);
  assert.deepEqual([art.version, art.viewBox, art.paths.length, art.paths[3].width], [Il.VERSION, [600, 400], 6, undefined]);
  const bad = (change, pattern) => assert.match(Il.validateArt({...good, paths: good.paths.map((item, k) => (k ? item : {...item, ...change}))}).issues.join(' '), pattern);
  bad({d: 'M0 0 L10 10 <script>alert(1)</script>'}, /SVG path data/);
  bad({d: 'url(http://example.com/x.svg)'}, /SVG path data/);
  bad({fill: 'red'}, /"fill" must be "#RRGGBB"/);
  bad({fill: 'none', stroke: 'none'}, /neither a fill nor a stroke/);
  bad({width: 400}, /at most 5% of the picture/);
  assert.match(Il.validateArt({viewBox: [600, 400], paths: good.paths.slice(0, 3)}).issues[0], /at least 6 shapes/);
  assert.match(Il.validateArt({viewBox: [600, 400], paths: Array.from({length: 300}, () => good.paths[0])}).issues[0], /at most 220/);
  assert.match(Il.validateArt({viewBox: [600, 400], paths: good.paths.map(item => ({...item, stroke: 'none'}))}).issues.join(' '), /dark outline/);
  assert.match(Il.validateArt('no picture').issues[0], /one JSON object/);
  // In a drawing: one picture per shot, checked again from a stored plan; a shot may name its own whiteboard look.
  const shot = Sk.validate({engine: 'handdrawn', board: 'dry-erase', elements: [{kind: 'picture', describe: 'A coffee cup on a table', art: good}]}, {primary: 'handdrawn'});
  assert.deepEqual([shot.board, shot.elements[0].art.paths.length, shot.elements[0].size], ['dry-erase', 6, 'l']);
  assert.throws(() => Sk.validate({board: 'chalk', elements: [{kind: 'text', text: 'Hi'}]}), /Whiteboard look/);
  assert.throws(() => Sk.validate({elements: [{kind: 'picture', describe: 'A coffee cup on a table', art: {...good, paths: [{d: 'javascript:1'}]}}]}), /picture/);
  const warned = [];
  assert.equal(Sk.validate({elements: [{kind: 'picture', describe: 'A coffee cup on a table', art: {viewBox: [1, 1]}}, {kind: 'text', text: 'Hi'}]}, {lenient: true, warn: message => warned.push(message)}).elements[0].art, undefined);
  assert.match(warned[0], /did not pass its checks/);
  // The illustrator is told the look, the words and the rules; the planner learns the element only when offered.
  const asked = Il.messages({describe: 'A coffee cup', words: 'Every cup starts here.', board: 'marker', aspect: 1.5}).map(item => item.content).join('\n');
  assert.match(asked, /black marker line art/);
  assert.match(asked, /NO text, letters, numbers/);
  assert.match(asked, /ORDER IS THE DRAWING ORDER/);
  assert.match(Sk.promptGuide('handdrawn', {pictures: true}), /"kind": "picture"/);
  assert.doesNotMatch(Sk.promptGuide('handdrawn'), /"kind": "picture"/);
});

test('a shot may name its own stickman look (videos that mix the looks); pictures are drawn in each engine\'s own style', () => {
  assert.equal(Sk.validate({engine: 'stickman', look: 'doodle', elements: [{kind: 'text', text: 'Hi'}]}).look, 'doodle');
  assert.equal(Sk.validate({elements: [{kind: 'text', text: 'Hi'}]}).look, undefined);
  assert.throws(() => Sk.validate({look: 'mix', elements: [{kind: 'text', text: 'Hi'}]}), /Stickman look/);
  assert.match(Sk.promptGuide('stickman', {looks: true}), /names its look: "look": classic/);
  assert.doesNotMatch(Sk.promptGuide('stickman'), /names its look/);
  assert.match(Sk.promptGuide('handdrawn', {boards: true}), /names its look: "board": cartoon/);
  const Il = require('../illustrate');
  const read = options => Il.messages({describe: 'A cafe at dawn', ...options}).map(item => item.content).join('\n');
  assert.match(read({engine: 'stickman', look: 'storybook'}), /stickman-animation video[\s\S]*storybook illustration[\s\S]*stick characters/);
  assert.match(read({engine: 'motion'}), /motion-graphics video[\s\S]*build in one after another[\s\S]*no outline/);
  assert.match(read({engine: 'handdrawn', board: 'marker'}), /whiteboard-animation video[\s\S]*black marker line art/);
  // Motion design needs no outlines; a traced picture does.
  const flat = {viewBox: [600, 400], paths: Array.from({length: 6}, (_, k) => ({d: `M${k} ${k} L${k + 50} ${k} L${k + 50} ${k + 50} Z`, fill: '#3E7BFA'}))};
  assert.deepEqual(Il.validateArt(flat, {outlines: false}).issues, []);
  assert.match(Il.validateArt(flat).issues.join(' '), /dark outline/);
});

test('motion tools: charts, timelines, networks, kinetic statements and posters are checked; a motion shot names its design', () => {
  const shot = elements => Sk.validate({engine: 'motion', design: 'data', elements}, {primary: 'motion'});
  const chart = shot([{kind: 'chart', type: 'bar', values: [3, 5, '9'], labels: ['2019', '2021', '2023', 'extra'], title: 'Shops opened', unit: '$', highlight: 2}]);
  assert.deepEqual([chart.design, chart.elements[0].values, chart.elements[0].labels.length, chart.elements[0].highlight], ['data', [3, 5, 9], 3, 2]);
  assert.deepEqual(shot([{kind: 'chart', type: 'rating', values: [7]}]).elements[0].values, [5], 'a rating stays within five stars');
  assert.throws(() => shot([{kind: 'chart', type: 'bar', values: []}]), /chart|values/);
  assert.throws(() => shot([{kind: 'chart', type: 'radar', values: [1]}]), /chart type/);
  const line = shot([{kind: 'timeline', events: [{label: 'Founded', when: '1971'}, {label: 'Today'}], now: 1}]).elements[0];
  assert.deepEqual([line.events.length, line.now, line.events[1].when], [2, 1, undefined]);
  assert.throws(() => shot([{kind: 'timeline', events: [{label: 'Alone'}]}]), /timeline|events/);
  const net = shot([{kind: 'network', nodes: [{label: 'Bank', icon: 'bank'}, {label: 'You'}, {label: 'Shop', icon: 'dragon'}], links: [[1, 2], [2, 3], [3, 3], [1, 9]]}]).elements[0];
  assert.deepEqual([net.nodes[0].icon, net.nodes[2].icon, net.links], ['building', undefined, [[1, 2], [2, 3]]], 'icons from the props, links by node number, bad links dropped');
  const words = shot([{kind: 'text', style: 'statement', text: 'The farmer keeps only *ten cents* of every cup you buy, every single morning'}, {kind: 'text', style: 'poster', text: 'BILLIONS'}]);
  assert.deepEqual([words.elements[0].text.length > 48, words.elements[0].y, words.elements[1].style], [true, 0.45, 'poster'], 'a statement keeps its whole sentence and sits in the middle');
  assert.throws(() => Sk.validate({design: 'neon', elements: [{kind: 'text', text: 'Hi'}]}), /Motion design/);
  const guide = Sk.promptGuide('motion', {designs: true});
  assert.match(guide, /"kind": "chart"[\s\S]*never invent data[\s\S]*"kind": "timeline"[\s\S]*style "statement"[\s\S]*"kind": "network"/);
  assert.match(guide, /names its look: "design": cartoon\|painted\|vector/);
});

test('0.36 maps: everyday country names, date-line shapes, fitted views, and map and crowd elements checked like the rest', () => {
  const Maps = require('../maps');
  assert.equal(Maps.country('USA'), 'United States of America');
  assert.equal(Maps.country('England'), 'United Kingdom');
  assert.equal(Maps.country("Cote d'Ivoire"), "Côte d'Ivoire");
  assert.equal(Maps.country('Ottoman Empire'), null);
  const world = Maps.load();
  assert.ok(world.meta.Russia.box[2] > 180 && world.meta.Russia.point[0] > 60 && world.meta.Russia.point[0] < 140, 'Russia is unwrapped across the date line, its middle in Siberia');
  assert.ok(Object.values(world.countries).every(polys => polys.every(poly => poly.every(ring => ring.every(Array.isArray)))), 'no ring around the pole is kept');
  const [w, s, e, n] = Maps.fit(['France']), france = world.meta.France.box;
  assert.ok(w < france[0] && s < france[1] && e > france[2] && n > france[3] && e - w < 40, 'a fitted view holds the country with room around it, without French Guiana');
  const map = {kind: 'map', areas: [{countries: ['Germany', 'Austria'], label: 'Central Powers', face: 'angry', at: 'Germany'}, {countries: ['France'], at: 'France'}], routes: [{from: 'Germany', to: [4.35, 50.85], label: 'March'}], pins: [{place: 'Japan', label: 'Tokyo'}]};
  const sk = Sk.validate({elements: [map, {kind: 'crowd', count: 99, pose: 'cheer', colors: ['blue'], headwear: 'spiked-helmet', banner: 'Home by Christmas'}]});
  const [m, crowd] = sk.elements;
  assert.deepEqual(m.steps.map(step => step.type), ['area', 'area', 'route', 'pin']);
  assert.equal(m.size, 'xl');
  assert.deepEqual(m.steps[2].to, [4.35, 50.85]);
  assert.deepEqual(m.steps[3].place, world.meta.Japan.point);
  assert.equal(crowd.count, 24, 'a crowd holds at most 24 people');
  assert.deepEqual(Sk.timing(sk, [{text: 'Germany', start: 0.4}, {text: 'and', start: 0.8}, {text: 'France', start: 1.1}]).elements[0].then, [0.4, 1.1, null, null], 'each area arrives on its own words');
  assert.throws(() => Sk.validate({elements: [{kind: 'map', areas: [{countries: ['Ottoman Empire']}]}]}), /not a country on the map/);
  const warnings = [];
  const kept = Sk.validate({elements: [{kind: 'map', areas: [{countries: ['Ottoman Empire', 'Turkey']}]}]}, {lenient: true, warn: message => warnings.push(message)});
  assert.deepEqual(kept.elements[0].steps[0].countries, ['Turkey']);
  assert.match(warnings[0], /Ottoman Empire/);
  assert.match(Sk.promptGuide('stickman'), /"kind": "map"[\s\S]*"kind": "crowd"/);
  // A free plan of a line that names countries draws a map; short words like "us" are never read as a country.
  const free = Sk.fromText('In 1914, Germany marched through Belgium toward France.');
  assert.deepEqual(free.elements[0].steps.map(step => [step.countries[0], step.at]), [['Germany', 'Germany'], ['Belgium', 'Belgium'], ['France', 'France']]);
  assert.ok(!Sk.fromText('Let us talk about money.').elements.some(el => el.kind === 'map'));
});

test('a checked drawing checked again is the same drawing: every element kind survives a stored plan being drawn again', () => {
  const sketch = {engine: 'motion', design: 'cartoon', set: 'throne', texture: 'film', elements: [
    {kind: 'figure', who: 'c1', pose: 'point', expression: 'happy', then: [{at: 'later', pose: 'cheer'}], label: 'Max, narrator', layer: 'front'},
    {kind: 'prop', prop: 'coin', x: 0.7, y: 0.4, face: true, layer: 'back', enter: 'mask'}, {kind: 'text', style: 'statement', text: 'A *big* idea', animate: 'focus'}, {kind: 'arrow', from: 1, to: [0.8, 0.3]},
    {kind: 'chart', type: 'bar', values: [1, 60], labels: ['cost', 'sale']}, {kind: 'timeline', events: [{label: 'Leave', when: '1497'}, {label: 'India', when: '1498'}], now: 1},
    {kind: 'network', nodes: [{label: 'Venice'}, {label: 'Lisbon'}], links: [[1, 2]]},
    {kind: 'map', style: 'atlas', areas: [{countries: ['Portugal'], face: 'happy', zoom: true, at: 'Portugal'}], routes: [{from: 'Portugal', to: 'India', label: 'Around Africa', icon: 'galleon'}], pins: [{place: [72.88, 19.08], label: 'Calicut', zoom: true}]},
    {kind: 'crowd', count: 7, pose: 'cheer', colors: ['red'], banner: 'Pepper!'}, {kind: 'fx', effect: 'burst', on: 2},
  ]};
  const once = Sk.validate(sketch, {cast}), twice = Sk.validate(once, {cast});
  assert.deepEqual(twice, once);
  assert.deepEqual(once.elements.find(el => el.kind === 'network').links, [[1, 2]]);
});

test('0.37: a video draws only with its engines, places of the past, and a story of the past never keeps a place of today', () => {
  // A stickman style allows only stickman shots: Claude's other engine is drawn as stickman with a named warning;
  // an owner edit is told plainly.
  const warnings = [];
  const shot = Sk.validate({engine: 'handdrawn', elements: [{kind: 'text', text: 'Hi'}]}, {primary: 'stickman', engines: ['stickman'], lenient: true, warn: message => warnings.push(message)});
  assert.equal(shot.engine, 'stickman');
  assert.match(warnings[0], /Engine must be one of: stickman/);
  assert.throws(() => Sk.validate({engine: 'motion', elements: [{kind: 'text', text: 'Hi'}]}, {primary: 'stickman', engines: ['stickman']}), /Engine must be one of: stickman/);
  assert.match(Sk.promptGuide('stickman', {engines: ['stickman']}), /"engine": stickman, "set"/);
  // Places of the past are in the vocabulary, and a story of the past moves places of today to them.
  for (const set of ['throne', 'castle', 'chamber', 'harbor', 'market', 'village', 'battlefield']) assert.ok(Sk.SETS.includes(set), set);
  assert.ok(Sk.PROPS.includes('galleon'));
  const drawn = [{label: 'S01A', sketch: Sk.validate({set: 'home', elements: [{kind: 'figure', pose: 'think'}]}), words: 'So Portugal asked a dangerous question'},
    {label: 'S01B', sketch: Sk.validate({set: 'street', elements: [{kind: 'figure', pose: 'walk'}]}), words: 'Today the street is still there'}];
  const fixes = Sk.worldMend(drawn, {era: 'early-modern'});
  assert.equal(drawn[0].sketch.set, 'chamber');
  assert.equal(drawn[1].sketch.set, 'street', 'a line about today keeps today\'s place');
  assert.match(fixes[0].fix, /place of today, so this early-modern story moved it to the chamber/);
  assert.deepEqual(Sk.worldMend([{label: 'S02A', sketch: Sk.validate({set: 'home', elements: [{kind: 'figure'}]})}], {era: 'modern'}), [], 'a modern story keeps its home');
  assert.equal(Sk.fromText('The king sat alone and wondered what to do.', {primary: 'stickman'}).set, 'throne');
});

test('0.38 motion layer: word animations, depth layers, textures and map moves are checked like the rest', () => {
  const shot = Sk.validate({texture: 'vhs', elements: [{kind: 'text', text: 'LANGTANG', animate: 'track', layer: 'front'}, {kind: 'prop', prop: 'globe', enter: 'mask', layer: 'back'},
    {kind: 'map', style: 'night', areas: [{countries: ['Nepal'], zoom: true}], routes: [{from: 'Portugal', to: 'India', icon: 'sailing-ship'}]}]});
  assert.equal(shot.texture, 'vhs');
  assert.deepEqual([shot.elements[0].animate, shot.elements[0].layer, shot.elements[1].enter, shot.elements[1].layer], ['track', 'front', 'mask', 'back']);
  assert.deepEqual([shot.elements[2].style, shot.elements[2].steps[0].zoom, shot.elements[2].steps[1].icon], ['night', true, 'galleon']);
  assert.equal('animate' in Sk.validate({elements: [{kind: 'text', text: 'Hi', animate: 'auto'}]}).elements[0], false, 'auto is the style\'s own way');
  assert.throws(() => Sk.validate({elements: [{kind: 'text', text: 'Hi', animate: 'explode'}]}), /animate must be one of/);
  assert.throws(() => Sk.validate({texture: 'oil', elements: [{kind: 'text', text: 'Hi'}]}), /Texture must be one of/);
  assert.throws(() => Sk.validate({elements: [{kind: 'prop', prop: 'coin', layer: 'deep'}]}), /layer must be one of/);
  const warnings = [];
  assert.equal(Sk.validate({elements: [{kind: 'text', text: 'Hi', animate: 'explode'}]}, {lenient: true, warn: message => warnings.push(message)}).elements[0].animate, undefined);
  assert.match(warnings[0], /animate must be one of/);
  assert.match(Sk.promptGuide('stickman'), /MOTION LAYER: a text may "animate": auto\|rise\|letters/);
});

test('0.39 evidence tools, unit charts, redaction, landing and film looks are checked, and a checked drawing checked again is the same', () => {
  const sketch = {engine: 'motion', film: 'newsprint', elements: [
    {kind: 'quote', text: 'We *never* saw it coming', name: 'A banker', who: 'c1', source: 'Testimony, 1929'},
    {kind: 'document', doc: 'newspaper', source: 'Evening Herald', headline: 'Bank closes its doors', line: 'savings of 4,000 families'},
    {kind: 'gauge', value: 3, steps: 7, label: 'Principle'}, {kind: 'gauge', value: 72, unit: '%', max: 100},
    {kind: 'loupe', on: 2, zoom: 3.2, label: 'the date'}, {kind: 'ruler', from: [0.2, 0.7], to: [0.8, 0.7], value: '43 km', label: 'shore moved'},
    {kind: 'chart', type: 'units', values: [1, 100], icon: 'person', title: 'The top 1%'},
    {kind: 'text', style: 'title', text: 'Project *Blue*', animate: 'redact', enter: 'land'},
  ]};
  const once = Sk.validate(sketch, {cast}), twice = Sk.validate(once, {cast});
  assert.deepEqual(twice, once);
  assert.equal(once.film, 'newsprint');
  assert.deepEqual(once.elements.map(el => el.kind), ['quote', 'document', 'gauge', 'gauge', 'loupe', 'ruler', 'chart', 'text']);
  assert.equal(once.elements[0].who, 'c1');
  assert.deepEqual(once.elements[0].look, cast[0].look, 'a quote shows its speaker in the cast look');
  assert.deepEqual([once.elements[2].steps, once.elements[2].value, once.elements[3].min, once.elements[3].max], [7, 3, 0, 100]);
  assert.deepEqual([once.elements[6].values, once.elements[6].icon], [[1, 100], 'person']);
  assert.deepEqual([once.elements[7].animate, once.elements[7].enter], ['redact', 'land']);
  // Strict for owner edits, lenient (with named warnings) for Claude.
  assert.throws(() => Sk.validate({elements: [{kind: 'quote', name: 'x'}]}), /needs the quoted words/);
  assert.throws(() => Sk.validate({elements: [{kind: 'document', doc: 'letter'}]}), /needs a headline or a line/);
  assert.throws(() => Sk.validate({elements: [{kind: 'gauge', value: 2, steps: 30}]}), /steps must be 2-12/);
  assert.throws(() => Sk.validate({elements: [{kind: 'text', text: 'Hi'}, {kind: 'loupe'}]}), /on must be a point/);
  assert.throws(() => Sk.validate({elements: [{kind: 'chart', type: 'units', values: [5, 2]}]}), /part, whole/);
  assert.throws(() => Sk.validate({film: 'oil', elements: [{kind: 'text', text: 'Hi'}]}), /Film look must be one of/);
  // A style without film looks keeps its own finish: a film named by Claude is left out with a warning.
  const warnings = [];
  const plain = Sk.validate({film: 'noir', elements: [{kind: 'text', text: 'Hi'}]}, {lenient: true, warn: message => warnings.push(message), films: []});
  assert.equal(plain.film, undefined);
  assert.match(warnings[0], /not this style's/);
  assert.equal(Sk.validate({film: 'none', elements: [{kind: 'text', text: 'Hi'}]}, {films: []}).film, 'none', 'a shot may always switch the film look off');
  const guide = Sk.promptGuide('motion', {engines: ['motion']});
  for (const word of ['"kind": "quote"', '"kind": "document"', '"kind": "gauge"', '"kind": "loupe"', '"kind": "ruler"', 'units is a unit chart', 'redact:', 'land:']) assert.ok(guide.includes(word), word);
});
