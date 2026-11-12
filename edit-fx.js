'use strict';
// 0.109 (owner review 2026-11-12: "each engine and each style must have its own editing style ... the program did the
// same plain edits for the stickman and the anime video ... it goes plain and overrides the emotions"): the effects an
// editor lays over a finished shot, each engine's editing grammar, where the feelings of the narration put them, and
// their FFmpeg filters. Pure: no I/O, clock or randomness, so the same edit always gives the same effects.
//
// Before this, the edit could only move stills (camera moves), cut and join. Drawn and designed shots, most of every
// video, got nothing over them, so the edit read the same in every engine. An effect belongs to its clip and is timed
// from the clip's start: {kind, at, until?, amount, grade?, reason, skill}.

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// What each effect does and when an editor uses it (the editor's prompt and the Editing Room read these lines).
const FX = Object.freeze({
  push: {name: 'Slow push', moment: false, use: 'a slow push-in over the whole shot: keeps a held shot alive and leans into a thought or a face'},
  punch: {name: 'Punch-in', moment: true, use: 'a quick zoom on the word that lands: a reveal, a number, a punchline, a name'},
  shake: {name: 'Camera shake', moment: true, use: 'an impact, a crash, a blow, a stamp, anger or fear'},
  flash: {name: 'Flash', moment: true, use: 'a burst of light on a hit, a realisation or a jump between worlds'},
  impact: {name: 'Impact frame', moment: true, use: 'two inverted frames on the strongest hit (anime and game feel)'},
  glitch: {name: 'Glitch', moment: true, use: 'technology, a lie exposed, a broken system, damage, a jump in time'},
  grade: {name: 'Colour mood', moment: false, use: 'the feeling of the whole shot: sorrow, tension, nostalgia, danger, a dream'},
  vignette: {name: 'Vignette', moment: false, use: 'darkened edges for intimacy, focus or dread'},
  letterbox: {name: 'Letterbox', moment: false, use: 'cinema bars for the serious, dramatic or decisive moment'},
});
const KINDS = Object.freeze(Object.keys(FX));
const MOMENT_SECONDS = Object.freeze({punch: 0.4, shake: 0.45, flash: 0.25, impact: 0.07, glitch: 0.3});
// Colour moods (the shot's feeling), drawn by FFmpeg and converted back to the render's BT.709 TV range.
const GRADES = Object.freeze({
  cold: {use: 'sorrow, loss, loneliness, winter', filter: 'colorbalance=rs=-0.08:gs=0.02:bs=0.14:rm=-0.07:bm=0.09:rh=-0.04:bh=0.07,eq=contrast=1.08:saturation=0.78', css: 'saturate(0.78) hue-rotate(-12deg) brightness(0.98)'},
  warm: {use: 'love, home, memory, hope', filter: 'colorbalance=rm=0.07:gm=0.025:bm=-0.07:rh=0.05:bh=-0.06,eq=saturation=1.08:gamma=1.03', css: 'sepia(0.18) saturate(1.1)'},
  moody: {use: 'tension, secrets, a threat', filter: 'eq=contrast=1.12:brightness=-0.04:saturation=0.68,colorbalance=bs=0.04', css: 'contrast(1.12) brightness(0.94) saturate(0.68)'},
  noir: {use: 'crime, a betrayal, the past judged', filter: 'hue=s=0,eq=contrast=1.32:gamma=0.94', css: 'grayscale(1) contrast(1.3)'},
  vintage: {use: 'long ago, a flashback, an old record', filter: 'curves=preset=vintage,eq=saturation=0.85', css: 'sepia(0.45) saturate(0.85)'},
  danger: {use: 'rage, war, blood, an alarm', filter: 'colorbalance=rs=0.14:rm=0.09:bs=-0.06:bm=-0.04,eq=contrast=1.14:saturation=1.08', css: 'sepia(0.25) saturate(1.5) hue-rotate(-18deg) contrast(1.14)'},
  dream: {use: 'a dream, a vision, wonder', filter: 'eq=brightness=0.04:saturation=0.82:gamma=1.06', css: 'brightness(1.05) saturate(0.82)'},
});
const GRADE_NAMES = Object.freeze(Object.keys(GRADES));

// Each engine's editing grammar: how its editor works, which effects suit it (weights 0-1 scale their strength and
// how often they are chosen), how many moment effects a minute it carries at most, and the transitions it reaches for
// first (only those the style allows are used). Experience to follow, not taste fixed in code: the AI editor gets the
// same lines and may go beyond them for a reason.
const GRAMMAR = Object.freeze({
  stickman: {name: 'Stickman', feel: 'a playful explainer: snappy cuts on the words, comic punch-ins on jokes, numbers and reveals, a shake on every bump or crash, a light flash on an idea; colour moods only for strong feelings', fx: {punch: 1, shake: 0.8, flash: 0.6, push: 0.5, grade: 0.6, vignette: 0.5, letterbox: 0.3}, perMinute: 10, transitions: ['whip-pan', 'zoom-in', 'push-left', 'slide-left']},
  handdrawn: {name: 'Whiteboard', feel: 'a calm teacher: the drawing hand carries the energy, so the edit stays quiet: gentle pushes on key ideas, wipes and slides between ideas, almost no shake, flash or glitch', fx: {push: 0.7, punch: 0.4, vignette: 0.3, grade: 0.3}, perMinute: 4, transitions: ['wipe-left', 'slide-left', 'reveal-left', 'crossfade']},
  motion: {name: 'Documentary', feel: 'serious storytelling: slow pushes into faces, documents and maps, letterbox and a colour mood for dramatic reveals, a flash or a dip between eras, glitch only for technology or deception', fx: {push: 1, letterbox: 0.7, grade: 0.8, vignette: 0.7, flash: 0.4, punch: 0.45, glitch: 0.3, shake: 0.3}, perMinute: 6, transitions: ['crossfade', 'dip-to-black', 'wipe-left', 'zoom-in']},
  montage: {name: 'Documentary', feel: 'serious storytelling: slow pushes into faces, documents and maps, letterbox and a colour mood for dramatic reveals, a flash or a dip between eras, glitch only for technology or deception', fx: {push: 1, letterbox: 0.7, grade: 0.8, vignette: 0.7, flash: 0.4, punch: 0.45, glitch: 0.3, shake: 0.3}, perMinute: 6, transitions: ['crossfade', 'dip-to-black', 'wipe-left', 'zoom-in']},
  atelier: {name: 'Motion graphics', feel: 'kinetic and precise: punch-ins on numbers and key words, glitch accents on a change, flashes on reveals, whip transitions; every effect lands on a word', fx: {punch: 1, glitch: 0.7, flash: 0.7, shake: 0.5, push: 0.5, grade: 0.4, vignette: 0.3}, perMinute: 12, transitions: ['whip-pan', 'zoom-in', 'push-left', 'glitch']},
  'atelier/anime': {name: 'Anime (HTML render)', feel: 'anime editing: hard cuts on the beat, an impact frame and screen shake on every hit, white flashes and colour dips on reveals, letterbox for the dramatic moment, a slow push on emotional close-ups, colour moods for sorrow, rage or a memory', fx: {impact: 1, shake: 1, flash: 0.9, punch: 0.8, letterbox: 0.7, grade: 0.8, push: 0.6, vignette: 0.6, glitch: 0.3}, perMinute: 14, transitions: ['flash', 'dip-colour', 'whip-pan', 'zoom-cut']},
  'atelier/collage': {name: 'Paper collage', feel: 'handmade and a little jittery: small stop-motion shakes, paper slides between scenes, punch-ins on the cut-out that speaks', fx: {shake: 0.6, punch: 0.6, push: 0.4, grade: 0.4, vignette: 0.3}, perMinute: 8, transitions: ['slide-left', 'push-left', 'wipe-left']},
  'atelier/pixel': {name: 'Pixel art', feel: 'game feel: screen shake and white flashes on hits, glitch on damage or a level change, hard cuts; never smooth zooms or pushes (they blur the pixels)', fx: {shake: 1, flash: 0.9, glitch: 0.7, impact: 0.5}, perMinute: 12, transitions: ['pixelize', 'flash', 'wipe-left']},
  cinema: {name: 'Cinematic', feel: 'film grammar: the grade belongs to the whole video, so effects are rare and slow: pushes into faces, a letterbox for the big moment, a flash or a dip on a jump in time', fx: {push: 0.8, letterbox: 0.5, vignette: 0.5, flash: 0.3}, perMinute: 3, transitions: ['crossfade', 'dip-to-black']},
});
// The grammar a clip edits by: a designed (HTML) shot by its finish, a drawn shot by its engine, else the video's engine.
function grammarKey(primary, asset = null, atelierFinish = null) {
  if (asset?.composition || asset?.designed) {
    const finish = asset.finish || asset.composition?.finish || atelierFinish;
    return ['anime', 'collage', 'pixel'].includes(finish) ? `atelier/${finish}` : 'atelier';
  }
  const engine = asset?.engine || asset?.sketch?.engine;
  if (engine && GRAMMAR[engine]) return engine;
  if (primary === 'atelier' && ['anime', 'collage', 'pixel'].includes(atelierFinish)) return `atelier/${atelierFinish}`;
  return GRAMMAR[primary] ? primary : 'stickman';
}

// The feeling of the narration at a moment, from the voice direction (the narrator's performance, when the narration
// was directed) and the meaning of the words (music.js meaningsOf). Returns the kind of moment an editor reacts to.
const HIT_WORDS = new Set('hit hits struck strike strikes crash crashes crashed smash smashed slam slammed punch punched kick kicked explode explodes exploded explosion blast blasted bang boom collapse collapsed attack attacked attacks fight fought battle clash clashed slash slashed stab stabbed shot fired fire war killed kill kills dead destroyed broke breaks shattered'.split(' '));
const TECH_WORDS = new Set('computer computers code hacked hack hacker digital internet ai algorithm algorithms data system systems glitch virus robot robots machine machines screen online fake lie lies lied scam fraud'.split(' '));
const EMOTION_MOOD = Object.freeze({sad: 'sorrow', somber: 'sorrow', tense: 'tension', suspenseful: 'tension', serious: 'tension', dramatic: 'drama', angry: 'rage', urgent: 'drama', awe: 'wonder', whisper: 'intimate', warm: 'warmth', happy: 'joy', excited: 'joy', playful: 'joy', curious: 'wonder'});
const MOOD_GRADE = Object.freeze({sorrow: 'cold', tension: 'moody', rage: 'danger', wonder: 'dream', warmth: 'warm', memory: 'vintage'});
const PAST_WORDS = /\b(?:long ago|years ago|centuries|ancient|once upon|in the past|back then|remember|memory|memories|childhood|used to)\b/i;

// Places the effects of one edit. clips: the brain's clips (start, frames, sceneId, purpose, mediaType, shotId, hero);
// words: [{text, start, end}] on the narration; sentences: [{n, text, startSeconds, endSeconds}]; delivery: the voice
// direction's lines by sentence (index n-1) or null; grammarOf(clip) -> GRAMMAR key; camera(clip) -> the drawing's own
// camera move ('still' when it holds); meaningsOf: music.js. Returns {fx: {clipId: [effects]}, count}.
function placeEffects({clips, fps, words = [], sentences = [], delivery = null, grammarOf, camera = () => null, meaningsOf, allowed = null}) {
  const out = {}, moments = [], perClip = new Map();
  const seconds = clips.reduce((sum, clip) => sum + clip.frames, 0) / fps;
  const add = (clip, effect) => { (out[clip.id] ||= []).push(effect); perClip.set(clip.id, (perClip.get(clip.id) || 0) + (FX[effect.kind].moment ? 1 : 0)); };
  const lineAt = time => { const sentence = sentences.find(item => time >= item.startSeconds - 0.05 && time < (item.endSeconds ?? Infinity)); return sentence ? {sentence, line: delivery?.lines?.[sentence.n - 1] || null} : {sentence: null, line: null}; };
  const ok = (grammar, kind) => (GRAMMAR[grammar].fx[kind] || 0) > 0 && (!allowed || allowed.includes(kind));
  const amountOf = (grammar, kind, energy) => round(clamp((GRAMMAR[grammar].fx[kind] || 0) * (energy === 'high' ? 1 : energy === 'low' ? 0.65 : 0.85), 0.2, 1), 2);
  let budget = Math.max(2, Math.round(seconds / 60 * Math.max(...clips.map(clip => GRAMMAR[grammarOf(clip)].perMinute)))), last = -Infinity;
  clips.forEach((clip, index) => {
    const from = clip.start / fps, to = (clip.start + clip.frames) / fps, length = to - from, grammar = grammarOf(clip), g = GRAMMAR[grammar];
    const spoken = words.filter(word => word.start >= from && word.start < to - 0.15);
    const {line, sentence} = lineAt(from + Math.min(0.5, length / 2)), energy = !line ? null : line.energy >= 4 ? 'high' : line.energy <= 2 ? 'low' : 'mid', mood = EMOTION_MOOD[line?.emotion] || (sentence && PAST_WORDS.test(sentence.text) ? 'memory' : null);
    // Moments: the words that land (meanings, hits, technology, numbers), in the order they are said.
    const said = (meaningsOf ? meaningsOf(spoken) : []).map(hit => ({...hit, why: `"${hit.word}"`}));
    for (const word of spoken) {
      const token = String(word.text || '').toLowerCase().replace(/[^a-z0-9%$£€.]/g, '');
      if (HIT_WORDS.has(token)) said.push({kind: 'hit', at: word.start, why: `"${word.text}"`});
      else if (TECH_WORDS.has(token)) said.push({kind: 'tech', at: word.start, why: `"${word.text}"`});
      else if (/\d/.test(token)) said.push({kind: 'number', at: word.start, why: `the number ${word.text}`});
    }
    said.sort((a, b) => a.at - b.at);
    for (const hit of said) {
      if (budget <= 0 || (perClip.get(clip.id) || 0) >= 2 || hit.at - last < 2) continue;
      const at = round(Math.max(0, hit.at - from - 0.04), 3), moment = [];
      if (hit.kind === 'hit' || (hit.kind === 'boom' && energy !== 'low')) {
        if (ok(grammar, 'impact') && ['high', null].includes(energy)) moment.push('impact');
        if (ok(grammar, 'shake')) moment.push('shake');
        if (!moment.length && ok(grammar, 'flash')) moment.push('flash');
        if (!moment.length && ok(grammar, 'punch')) moment.push('punch');
      } else if (['gasp', 'boom', 'number'].includes(hit.kind)) moment.push(ok(grammar, 'punch') ? 'punch' : ok(grammar, 'flash') ? 'flash' : null);
      else if (['ding', 'cheer'].includes(hit.kind)) moment.push(ok(grammar, 'flash') && (hit.kind === 'ding' || energy === 'high') ? 'flash' : ok(grammar, 'punch') ? 'punch' : null);
      else if (hit.kind === 'laugh') moment.push(ok(grammar, 'shake') ? 'shake' : ok(grammar, 'punch') ? 'punch' : null);
      else if (hit.kind === 'tech') moment.push(ok(grammar, 'glitch') ? 'glitch' : null);
      const kinds = moment.filter(Boolean);
      if (!kinds.length) continue;
      for (const kind of kinds) add(clip, {kind, at, ...(kind === 'shake' && hit.kind === 'laugh' ? {amount: round(amountOf(grammar, kind, energy) * 0.5, 2)} : {amount: amountOf(grammar, kind, energy)}), reason: `${FX[kind].name} on ${hit.why}: ${g.name.toLowerCase()} editing reacts to the word the line lands on.`, skill: 'timeline.punch-in-on-emphasis'});
      budget--; last = hit.at;
    }
    // The shot's feeling: a colour mood and a vignette when the narrator's delivery (or a memory) carries one.
    const grade = MOOD_GRADE[mood];
    if (grade && length >= 1.2 && ok(grammar, 'grade')) add(clip, {kind: 'grade', at: 0, grade, amount: amountOf(grammar, 'grade', energy), reason: `Colour mood ${grade}: the line is ${line?.emotion || 'a memory'}, and the colour carries that feeling (${GRADES[grade].use}).`, skill: 'cinematic.emotional-arc-restraint'});
    if (['sorrow', 'tension', 'intimate', 'rage'].includes(mood) && length >= 1.5 && ok(grammar, 'vignette')) add(clip, {kind: 'vignette', at: 0, amount: amountOf(grammar, 'vignette', energy), reason: `Vignette: darker edges hold the eye on a ${line?.emotion || mood} moment.`, skill: 'cinematic.emotional-arc-restraint'});
    // The turn of the story, or a dramatic line, gets the cinema bars (a few a video).
    const turnStart = clip.purpose === 'turn' && (index === 0 || clips[index - 1].sceneId !== clip.sceneId);
    if ((turnStart || (mood === 'drama' && energy === 'high')) && length >= 1.5 && ok(grammar, 'letterbox') && Object.values(out).flat().filter(item => item.kind === 'letterbox').length < Math.max(1, Math.round(seconds / 90))) add(clip, {kind: 'letterbox', at: 0, amount: amountOf(grammar, 'letterbox', energy), reason: turnStart ? 'Letterbox: the story turns here, so the frame turns serious.' : `Letterbox for a dramatic, ${line?.emotion} line.`, skill: 'cinematic.emotional-arc-restraint'});
    // A held shot whose drawing does not move its own camera gets a slow push (never stills: they have camera moves).
    const own = camera(clip);
    if (clip.mediaType === 'video' && length >= 3.2 && (!own || own === 'still') && ok(grammar, 'push') && !(out[clip.id] || []).some(item => item.kind === 'punch')) {
      add(clip, {kind: 'push', at: 0, amount: round(amountOf(grammar, 'push', energy) * (clip.hero ? 1 : 0.8), 2), reason: `Slow push across the ${length.toFixed(1)} s hold, so the shot keeps moving${clip.hero ? ' (hero shot)' : ''}.`, skill: 'editing.still-image-motion'});
    }
  });
  return {fx: out, count: Object.values(out).flat().length};
}

// Checks one effect against its clip (seconds of the clip), strictly for everyone: a bad one is refused with the reason.
function checkEffect(effect, clipSeconds) {
  const problem = message => { throw Object.assign(new Error(message), {status: 400}); };
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) problem('An effect must be an object.');
  if (!KINDS.includes(effect.kind)) problem(`Effects are: ${KINDS.join(', ')}.`);
  const at = effect.at === undefined ? 0 : Number(effect.at);
  if (!(Number.isFinite(at) && at >= 0 && at < clipSeconds)) problem(`Start the ${effect.kind} inside the clip: 0 to ${clipSeconds.toFixed(2)} s from its start.`);
  const until = effect.until === undefined || effect.until === null ? null : Number(effect.until);
  if (until !== null && !(Number.isFinite(until) && until > at && until <= clipSeconds + 0.001)) problem(`End the ${effect.kind} after it starts and inside the clip.`);
  const amount = effect.amount === undefined ? 0.8 : Number(effect.amount);
  if (!(Number.isFinite(amount) && amount >= 0.1 && amount <= 1)) problem('An effect\'s amount runs from 0.1 to 1.');
  if (effect.kind === 'grade' && !GRADE_NAMES.includes(effect.grade)) problem(`Colour moods are: ${GRADE_NAMES.join(', ')}.`);
  return {kind: effect.kind, at: round(at), ...(until !== null ? {until: round(until)} : {}), amount: round(amount, 2), ...(effect.kind === 'grade' ? {grade: effect.grade} : {}), reason: String(effect.reason || '').replace(/[\x00-\x1F]/g, ' ').slice(0, 300), skill: effect.skill || null};
}
// Effects are timed from their clip's start: after any change of a clip's length, those that no longer fit it go and
// an end past the clip is brought back inside (a whole-shot effect without "until" always spans the clip).
function fit(effects, clipSeconds) {
  const kept = (effects || []).filter(effect => effect.at < clipSeconds - 0.05).map(effect => (effect.until !== undefined && effect.until > clipSeconds ? {...effect, until: round(clipSeconds)} : effect)).filter(effect => effect.until === undefined || effect.until > effect.at);
  return kept.length ? kept : undefined;
}
// The window an effect plays in, in clip seconds.
function windowOf(effect, clipSeconds) {
  const end = effect.until ?? (FX[effect.kind].moment ? effect.at + MOMENT_SECONDS[effect.kind] : clipSeconds);
  return [effect.at, Math.min(clipSeconds, end)];
}

// The FFmpeg filters of one clip's effects, appended to its segment (t = seconds from the clip's start). The zoom
// effects share one zoompan on a doubled picture (smooth sub-pixel moves); a pixel-art clip shakes by whole pixels
// instead and never zooms. Everything ends back in BT.709 TV range, so the segments keep one colour profile.
function filters(effects, {width, height, fps, frames, pixel = false}) {
  if (!Array.isArray(effects) || !effects.length) return '';
  const seconds = frames / fps, T = `(on/${fps})`, num = value => round(value, 4), out = [];
  const zoomTerms = [], dx = [], dy = [];
  for (const effect of effects) {
    const [a, b] = windowOf(effect, seconds), A = effect.amount ?? 0.8;
    if (effect.kind === 'push' && !pixel) { const e = `clip((${T}-${num(a)})/${num(Math.max(0.1, b - a))},0,1)`; zoomTerms.push(`${num(0.07 * A)}*${e}*${e}*(3-2*${e})`); }
    if (effect.kind === 'punch' && !pixel) zoomTerms.push(`${num(0.13 * A)}*if(lt(${T},${num(a)}),0,if(lt(${T},${num(a + 0.07)}),(${T}-${num(a)})/0.07,max(0,1-(${T}-${num(a + 0.07)})/0.3)))`);
    if (effect.kind === 'shake') {
      const decay = `if(between(${T},${num(a)},${num(b)}),1-(${T}-${num(a)})/${num(Math.max(0.05, b - a))},0)`;
      dx.push(`${num(0.011 * A)}*sin(${T}*61)*${decay}`); dy.push(`${num(0.009 * A)}*cos(${T}*53)*${decay}`);
      if (!pixel) zoomTerms.push(`${num(0.03 * A)}*${decay}`);
    }
  }
  if (zoomTerms.length || (dx.length && !pixel)) {
    const z = `1+${zoomTerms.join('+') || '0'}`, X = `iw/2-iw/zoom/2${dx.length ? `+iw*(${dx.join('+')})` : ''}`, Y = `ih/2-ih/zoom/2${dy.length ? `+ih*(${dy.join('+')})` : ''}`;
    out.push(`scale=${width * 2}:${height * 2}:flags=lanczos`, `zoompan=z='${z}':x='max(0,min(iw-iw/zoom,${X}))':y='max(0,min(ih-ih/zoom,${Y}))':d=1:s=${width}x${height}:fps=${fps}`, 'setsar=1');
  } else if (dx.length) {
    // Pixel art: a 4% larger picture by whole pixels, cropped back with integer offsets (the pixels stay sharp).
    const W = 2 * Math.ceil(width * 1.04 / 2), H = 2 * Math.ceil(height * 1.04 / 2), t = `(n/${fps})`, swap = term => term.split(`(on/${fps})`).join(t);
    out.push(`scale=${W}:${H}:flags=neighbor`, `crop=${width}:${height}:x='round(${(W - width) / 2}+${W}*(${dx.map(swap).join('+')}))':y='round(${(H - height) / 2}+${H}*(${dy.map(swap).join('+')}))'`, 'setsar=1');
  }
  const flashes = effects.filter(effect => effect.kind === 'flash').map(effect => `${num(0.55 * (effect.amount ?? 0.8))}*max(0,1-abs(t-${num(effect.at + 0.06)})/0.12)`);
  if (flashes.length) out.push(`eq=brightness='min(0.9,${flashes.join('+')})':eval=frame`);
  for (const effect of effects.filter(item => item.kind === 'impact')) out.push(`negate=enable='between(t,${num(effect.at)},${num(effect.at + 2 / fps)})'`);
  for (const [k, effect] of effects.filter(item => item.kind === 'glitch').entries()) {
    const [a, b] = windowOf(effect, seconds), shift = Math.max(2, Math.round(10 * (effect.amount ?? 0.8)));
    out.push(`chromashift=cbh=-${shift}:crh=${shift}:enable='between(t,${num(a)},${num(b)})'`, `noise=alls=${Math.round(22 * (effect.amount ?? 0.8))}:allf=t:all_seed=${4099 + k}:enable='between(t,${num(a)},${num(b)})'`);
  }
  const grade = effects.find(effect => effect.kind === 'grade' && GRADES[effect.grade]);
  if (grade) out.push(GRADES[grade.grade].filter, 'scale=out_color_matrix=bt709:out_range=tv', 'format=yuv420p', 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709');
  for (const effect of effects.filter(item => item.kind === 'vignette')) { const [a, b] = windowOf(effect, seconds); out.push(`vignette=angle=${num(Math.PI / (5.5 - 2 * (effect.amount ?? 0.8)))}${b - a < seconds - 0.01 ? `:enable='between(t,${num(a)},${num(b)})'` : ''}`); }
  for (const effect of effects.filter(item => item.kind === 'letterbox')) {
    const [a, b] = windowOf(effect, seconds), bar = 2 * Math.round(height * 0.064), when = b - a < seconds - 0.01 ? `:enable='between(t,${num(a)},${num(b)})'` : '';
    if (width > height) out.push(`drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill${when}`, `drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:color=black:t=fill${when}`);
  }
  return out.length ? `${out.join(',')},` : '';
}

// The prompt lines the AI editor gets: what each effect is for, the colour moods, and this video's grammar.
function promptLines(grammarKeys = []) {
  const keys = [...new Set(grammarKeys)].filter(key => GRAMMAR[key]);
  return [
    `EFFECTS over a shot (any clip; "at"/"until" are seconds from the clip's start; amount 0.1-1): ${KINDS.map(kind => `${kind} (${FX[kind].use})`).join('; ')}. Colour moods for grade: ${GRADE_NAMES.map(name => `${name} (${GRADES[name].use})`).join(', ')}.`,
    ...keys.map(key => `EDITING GRAMMAR of ${GRAMMAR[key].name}${keys.length > 1 ? ` (clips of kind ${key})` : ''}: ${GRAMMAR[key].feel}. Effects it uses: ${Object.entries(GRAMMAR[key].fx).map(([kind, weight]) => `${kind}${weight >= 0.8 ? ' (often)' : weight <= 0.4 ? ' (rarely)' : ''}`).join(', ')}; about ${GRAMMAR[key].perMinute} moment effects a minute at most; transitions it reaches for: ${GRAMMAR[key].transitions.join(', ')}.`),
    'FEELING FIRST: read each clip\'s words and the narrator\'s delivery (FEEL). Put the effect on the word that lands (WORDS give the seconds); match its strength to the line; let quiet, sad or tender lines breathe (a slow push, a colour mood, a vignette) instead of hitting them; never two moment effects within 2 s; an effect that fights the feeling is worse than none.',
  ];
}

module.exports = {FX, KINDS, GRADES, GRADE_NAMES, GRAMMAR, MOMENT_SECONDS, grammarKey, placeEffects, checkEffect, fit, windowOf, filters, promptLines, EMOTION_MOOD};
