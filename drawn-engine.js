'use strict';
// P06d - The scene engine for drawn shots. It lays out one shot from sketch.js's vocabulary and draws any frame
// of it as a pure function of time: the set (with parallax), characters and props arriving on the narrator's
// words, pose and expression changes, walks, kinetic text, motion effects, the camera (moves, focus, punches,
// shakes) and the opening transition. Engines: stickman = cartoon finish, handdrawn = ink, motion = flat.
(function () {
  const K = window.DK, C = K.COL, TAU = Math.PI * 2, clamp01 = K.clamp01, ease = K.ease;
  const FINISH = {stickman: 'cartoon', handdrawn: 'ink', motion: 'flat'};
  const WRITTEN = new Set(['title', 'label', 'highlight']);
  const PROP_SIZE = {s: 150, m: 230, l: 330, xl: 460};
  const TEXT_BASE = {title: 84, note: 54, number: 150, counter: 140, stamp: 96, highlight: 70, pop: 84, label: 42, headline: 60};
  const TEXT_SCALE = {s: 0.7, m: 1, l: 1.35, xl: 1.8};
  const FX_SIZE = {s: 120, m: 200, l: 300, xl: 420};
  const ENTER_SECONDS = {pop: 0.34, slide: 0.4, drop: 0.42, draw: 0.75, fade: 0.3, grow: 0.5, none: 0};
  // Drawing-on is the hand-drawn look and takes its time there; elsewhere a drawing is on screen quickly.
  const enterSeconds = (enter, engine = D?.engine) => (enter === 'draw' && engine !== 'handdrawn' ? 0.45 : ENTER_SECONDS[enter] ?? 0.34);
  const SCREEN_FX = new Set(['flash', 'confetti', 'money-rain', 'rain', 'snow', 'glitch']);
  const BACKDROP_FX = new Set(['burst', 'glow', 'speedlines', 'shockwave', 'pulse']);
  const MARKS = new Set(['underline', 'circle', 'cross', 'check', 'spotlight']);
  let D, P, LAYOUT, layerCanvas, layerCtx, lastKey = null;

  // ------------------------------------------------------------ layout and timing (once per shot)
  function autoEnter(el, engine) {
    if (engine === 'handdrawn') return el.kind === 'fx' ? 'pop' : 'draw';
    if (el.kind === 'arrow') return 'draw';
    if (el.kind === 'figure') return engine === 'motion' ? 'slide' : 'pop';
    if (el.kind === 'text' && ['stamp', 'number', 'counter', 'note', 'headline'].includes(el.style)) return 'none';
    return 'pop';
  }
  const figureH = el => K.FIGURE_SIZE[el.size || 'm'] * K.u;
  const propS = el => PROP_SIZE[el.size || 'm'] * K.u;
  const textSize = el => TEXT_BASE[el.style] * TEXT_SCALE[el.size || 'm'] * K.u;
  function estimate(el) {
    if (el.kind === 'figure') { const h = figureH(el), x = el.x * K.W, y = el.y * K.H, dir = el.facing === 'left' ? -1 : 1; return {box: [x - 0.28 * h, y - 1.02 * h, x + 0.28 * h, y], center: [x, y - 0.55 * h], head: [x + 0.04 * h * dir, y - 0.8 * h, 0.165 * h], r: 0.3 * h}; }
    if (el.kind === 'prop') { const s = propS(el), x = el.x * K.W, y = Math.min(el.y * K.H, 0.86 * K.H - 0.45 * s); return {box: [x - 0.5 * s, y - 0.5 * s, x + 0.5 * s, y + 0.5 * s], center: [x, y], r: 0.45 * s}; }
    const x = (el.x ?? 0.5) * K.W, y = (el.y ?? 0.5) * K.H, s = el.kind === 'text' ? textSize(el) : el.kind === 'fx' ? FX_SIZE[el.size || 'm'] * K.u : 60 * K.u;
    return {box: [x - s, y - s / 2, x + s, y + s / 2], center: [x, y], r: s / 2};
  }
  function layout(d) {
    const dur = P.duration, engine = d.engine, times = d.times || {elements: [], focus: []};
    const est = d.elements.map(estimate);
    // A face is never covered: a loose prop placed on a character's head moves above it, or beside it towards the open
    // side when there is no room above (live 0.26 run: a target pin sat on the hero's face).
    const heads = est.filter((item, i) => d.elements[i].kind === 'figure').map(item => item.head);
    d.elements.forEach((el, i) => {
      if (el.kind !== 'prop' || ['cloud', 'rainbow'].includes(el.prop)) return;
      for (const [hx, hy, hr] of heads) {
        const e = est[i], s = e.box[2] - e.box[0], R = hr * 1.25;
        const ox = Math.min(e.box[2], hx + R) - Math.max(e.box[0], hx - R), oy = Math.min(e.box[3], hy + R) - Math.max(e.box[1], hy - R);
        if (ox <= 0 || oy <= 0 || ox * oy < 0.2 * 4 * R * R) continue;
        let cx = e.center[0], cy = hy - R - 0.55 * s;
        if (cy - 0.5 * s < 0.06 * K.H) { cy = e.center[1]; cx = hx + (hx > K.W / 2 ? -1 : 1) * (R + 0.6 * s); }
        cx = Math.min(K.W - K.M - 0.5 * s, Math.max(K.M + 0.5 * s, cx));
        est[i] = {...e, box: [cx - 0.5 * s, cy - 0.5 * s, cx + 0.5 * s, cy + 0.5 * s], center: [cx, cy]};
      }
    });
    const solid = d.elements.map((el, i) => (['figure', 'prop'].includes(el.kind) && !(el.kind === 'prop' && ['cloud', 'rainbow'].includes(el.prop)) ? est[i].box : null)).filter(Boolean);
    // Words never leave the frame or sit on a drawing: they move to the free height that covers least.
    const textAt = d.elements.map((el, i) => {
      if (el.kind !== 'text') return null;
      // Words always fit inside the frame, even at the camera's closest zoom: a long line gets a smaller font.
      const base = textSize(el), safe = (K.W - 2 * K.M) / 1.12, natural = K.measure(el.text, base, {weight: 800}) * 1.08;
      const size = base * Math.min(1, safe / natural), width = Math.min(safe, natural * size / base), half = width / 2;
      const x = el.style === 'headline' ? K.W / 2 : Math.min(K.W - K.M - half, Math.max(K.M + half, el.x * K.W));
      const cover = y => solid.reduce((sum, [x1, y1, x2, y2]) => sum + Math.max(0, Math.min(x + half, x2) - Math.max(x - half, x1)) * Math.max(0, Math.min(y + size * 0.6, y2) - Math.max(y - size * 0.6, y1)), 0);
      // Big words keep room above them for the camera's push (live 0.25 run: an xl counter touched the top edge).
      const limit = 0.8 * K.H - size * 0.6, top = 0.07 * K.H + size * 0.6;
      const y = el.style === 'headline' ? Math.max(top, 0.09 * K.H) : [el.y * K.H, 0.12 * K.H, 0.22 * K.H, 0.34 * K.H, 0.5 * K.H].map(v => Math.min(limit, Math.max(top, v))).reduce((a, b) => (cover(b) < cover(a) - 1 ? b : a));
      est[i] = {box: [x - half, y - size * 0.55, x + half, y + size * 0.55], center: [x, y], r: half};
      return {x, y, size, width};
    });
    const uncued = d.elements.filter((el, i) => times.elements?.[i]?.t0 == null).length;
    let order = 0;
    const el = d.elements.map((item, i) => {
      const cue = times.elements?.[i] || {};
      let ts = cue.t0;
      let enter = !item.enter || item.enter === 'auto' ? autoEnter(item, engine) : item.enter;
      // A drawing arriving on a word starts a moment before it, so it has landed when the word is heard.
      if (ts != null && item.kind !== 'fx') ts -= Math.min(0.3, 0.08 + 0.45 * enterSeconds(enter, engine));
      // A character who is in the shot from its start is there on the first frame and arrives with the shot's
      // transition, so the place never shows empty before the person (owner review 2026-10-10). Hand-drawn
      // still draws the character on, first.
      if (ts == null && item.kind === 'figure' && (!item.enter || item.enter === 'auto')) { ts = engine === 'handdrawn' ? 0.05 : 0; if (engine !== 'handdrawn') enter = 'none'; }
      if (ts == null) { ts = engine === 'handdrawn' ? 0.05 + order * Math.min(0.5, Math.max(0.18, dur * 0.45 / Math.max(1, uncued))) : 0.03 + order * 0.08; order++; }
      ts = Math.max(0, Math.min(ts, dur - 0.3));
      const te = cue.t1 != null && cue.t1 > ts + 0.25 ? cue.t1 : null;
      // A change of pose or face anticipates its word by a beat, as an animator would key it.
      const steps = (item.then || []).map((step, k) => ({...step, t: cue.then?.[k] != null ? Math.max(ts, cue.then[k] - 0.1) : ts + (k + 1) * (dur - ts) / (item.then.length + 1)})).sort((a, b) => a.t - b.t);
      return {ts, te, enter, steps, seed: K.hashText(`${item.kind}${i}${item.who || item.prop || item.text || item.effect || ''}`)};
    });
    // A shot never opens on an empty frame: when nothing would be on screen for the first 0.6 s, the first
    // character (or else the first thing) is there from the start.
    const shownIdx = d.elements.map((item, i) => i).filter(i => !['fx', 'arrow'].includes(d.elements[i].kind));
    if (shownIdx.length && Math.min(...shownIdx.map(i => el[i].ts)) > 0.6) el[shownIdx.find(i => d.elements[i].kind === 'figure') ?? shownIdx.reduce((a, b) => (el[b].ts < el[a].ts ? b : a))].ts = 0.05;
    // A lone object on a plain backdrop gets a stage: a lit disc with slow rays behind it, so it never reads as a
    // still icon pasted on a page.
    const props = d.elements.map((item, i) => i).filter(i => d.elements[i].kind === 'prop' && !['cloud', 'rainbow'].includes(d.elements[i].prop));
    const stage = !d.elements.some(item => item.kind === 'figure') && (!d.set || ['abstract', 'none'].includes(d.set)) && props.length && props.length <= 2 ? props.reduce((a, b) => (est[b].r > est[a].r ? b : a)) : null;
    const focus = (d.focus || []).map((item, k) => ({...item, t: times.focus?.[k] != null ? Math.max(0, times.focus[k] - 0.15) : dur * (k + 1) / ((d.focus || []).length + 1)})).sort((a, b) => a.t - b.t);
    const impulses = [];
    d.elements.forEach((item, i) => {
      if (item.kind === 'fx' && ['shake', 'punch'].includes(item.effect)) impulses.push({kind: item.effect, t: el[i].ts});
      if (item.kind === 'text' && item.style === 'stamp') impulses.push({kind: 'shake', t: el[i].ts + 0.16, amount: 0.6});
      if (item.kind === 'prop' && el[i].enter === 'drop' && ['l', 'xl'].includes(item.size)) impulses.push({kind: 'shake', t: el[i].ts + ENTER_SECONDS.drop, amount: 0.5});
      if (item.kind === 'fx' && item.effect === 'flash') impulses.push({kind: 'punch', t: el[i].ts, amount: 0.5});
    });
    return {est, textAt, el, focus, impulses, stage, anchors: []};
  }

  // ------------------------------------------------------------ camera
  function camera(t) {
    const {W, H} = K, dur = Math.max(0.1, P.duration), e = ease.inOutSine(clamp01(t / dur));
    let z = 1, ox = 0, oy = 0;
    switch (D.camera) {
      case 'push': z = 1 + 0.07 * e; break;
      case 'pull': z = 1.08 - 0.08 * e; break;
      case 'drift': z = 1.04; ox = (0.5 - e) * 0.035 * W; break;
      case 'punch': z = 1.02 + 0.03 * e + 0.1 * Math.exp(-t * 6); break;
      case 'shake': z = 1.05; ox = K.noise(t * 7) * 0.008 * W; oy = K.noise(t * 9 + 4) * 0.008 * H; break;
      case 'pan-left': z = 1.08; ox = (e - 0.5) * 0.07 * W; break;
      case 'pan-right': z = 1.08; ox = (0.5 - e) * 0.07 * W; break;
      default: break;
    }
    const cur = {x: W / 2, y: H / 2, z: 1};
    for (const f of LAYOUT.focus) { if (t < f.t) break; const q = ease.inOutCubic(clamp01((t - f.t) / 0.45)); cur.x = K.lerp(cur.x, f.x * W, q); cur.y = K.lerp(cur.y, f.y * H, q); cur.z = K.lerp(cur.z, f.zoom, q); }
    let Z = z * cur.z;
    for (const imp of LAYOUT.impulses) {
      if (t < imp.t) continue;
      const s = t - imp.t, a = imp.amount ?? 1;
      if (imp.kind === 'punch') Z *= 1 + 0.12 * a * Math.exp(-s * 7) * Math.min(1, s / 0.06);
      if (imp.kind === 'shake') { const amp = 0.014 * a * Math.exp(-s * 5); ox += K.noise(s * 40) * amp * W; oy += K.noise(s * 43 + 7) * amp * H; }
    }
    const q = name => clamp01(t / name);
    switch (D.transition) {
      case 'whip-left': ox += (1 - ease.outCubic(q(0.24))) * W * 0.85; break;
      case 'whip-right': ox -= (1 - ease.outCubic(q(0.24))) * W * 0.85; break;
      case 'zoom': Z *= 1 + 0.3 * (1 - ease.outCubic(q(0.25))); break;
      case 'pop': Z *= 0.86 + 0.14 * ease.outBack(q(0.22)); break;
      case 'slide-up': oy += (1 - ease.outCubic(q(0.26))) * H; break;
      default: break;
    }
    const shown = kind => D.elements.map((el, i) => (el.kind === kind && t >= LAYOUT.el[i].ts && (LAYOUT.el[i].te === null || t < LAYOUT.el[i].te) ? LAYOUT.est[i] : null)).filter(Boolean);
    const people = shown('figure'), words = shown('text');
    // Words on screen are never cropped, and neither are the faces with them: the camera does not zoom closer
    // than the words and the characters' heads fit together.
    if (words.length) {
      const boxes = [...words.map(b => b.box), ...people.map(p => [p.head[0] - p.head[2] * 1.9, p.head[1] - p.head[2] * 1.5, p.head[0] + p.head[2] * 1.9, p.head[1] + p.head[2] * 1.4])];
      const spanW = Math.max(...boxes.map(b => b[2])) - Math.min(...boxes.map(b => b[0])) + 0.04 * W;
      const spanH = Math.max(...boxes.map(b => b[3])) - Math.min(...boxes.map(b => b[1])) + 0.04 * H;
      Z = Math.max(1, Math.min(Z, W / spanW, H / spanH));
    }
    const half = W / (2 * Z), halfH = H / (2 * Z);
    // A zoom, punch or focus never crops the characters: the view slides to keep them (or at least their heads) in.
    if ((people.length || words.length) && Z > 1.001) {
      const margin = 0.02 * W, fit = (boxes, [from, to], size) => (boxes.length && to - from <= size ? [from, to] : null);
      const span = boxes => [Math.min(...boxes.map(b => b[0])) - margin, Math.max(...boxes.map(b => b[1])) + margin];
      const heads = people.map(p => [p.head[0] - p.head[2] * 1.9, p.head[0] + p.head[2] * 1.9]);
      // Everything if it fits; else the words with the faces, the words alone, the characters, their faces.
      const wordSpans = words.map(p => [p.box[0], p.box[2]]);
      const xs = fit([...people, ...words], span([...people, ...words].map(p => [p.box[0], p.box[2]])), 2 * half) || fit(words, words.length ? span([...wordSpans, ...heads]) : [0, 0], 2 * half) || fit(words, words.length ? span(wordSpans) : [0, 0], 2 * half) || fit(people, people.length ? span(people.map(p => [p.box[0], p.box[2]])) : [0, 0], 2 * half) || fit(heads, heads.length ? span(heads) : [0, 0], 2 * half);
      if (xs) cur.x = Math.min(xs[0] + half, Math.max(xs[1] - half, cur.x));
      const tops = [...people.map(p => p.head[1] - p.head[2] * 1.4), ...words.map(p => p.box[1] - margin)], bottoms = [...people.map(p => p.box[3]), ...words.map(p => p.box[3])];
      const top = Math.min(...tops), bottom = Math.max(...bottoms);
      if (bottom - top <= 2 * halfH) cur.y = Math.min(top + halfH, Math.max(bottom - halfH, cur.y));
      else if (cur.y - halfH > Math.min(...people.map(p => p.head[1] - p.head[2] * 1.4), Infinity)) cur.y = Math.min(...people.map(p => p.head[1] - p.head[2] * 1.4)) + halfH;
    }
    return {Z, cx: Math.min(W - half, Math.max(half, cur.x)), cy: Math.min(H - halfH, Math.max(halfH, cur.y)), ox, oy};
  }
  function applyCamera(ctx, cam, k = 1) {
    const {W, H} = K, z = 1 + (cam.Z - 1) * k;
    ctx.translate(W / 2 + cam.ox * k, H / 2 + cam.oy * k); ctx.scale(z, z); ctx.translate(-(W / 2 + (cam.cx - W / 2) * k), -(H / 2 + (cam.cy - H / 2) * k));
  }

  // ------------------------------------------------------------ elements
  const anchorOf = (ref, fallback) => {
    if (Array.isArray(ref)) return {center: [ref[0] * K.W, ref[1] * K.H], r: 0};
    const a = LAYOUT.anchors[ref - 1] || LAYOUT.est[ref - 1];
    return a ? {center: a.center, r: a.r, box: a.box, head: a.head} : fallback;
  };
  function figureState(el, i, t) {
    const tm = LAYOUT.el[i];
    let cur = {pose: el.pose, expression: el.expression, emote: el.emote, x: el.x, facing: el.facing, since: tm.ts}, prev = null, moving = null;
    for (const step of tm.steps) {
      if (t < step.t) break;
      if (step.expression) cur.expression = step.expression;
      if (step.emote) cur.emote = step.emote;
      if (step.x !== undefined && Math.abs(step.x - cur.x) > 0.01) {
        const dist = Math.abs(step.x - cur.x), md = Math.min(1.6, Math.max(0.35, dist * K.W / (620 * K.u)));
        if (t < step.t + md) { moving = {from: cur.x, to: step.x, start: step.t, md, run: dist > 0.35}; break; }
        prev = {...cur}; cur = {...cur, x: step.x, pose: step.pose || cur.pose, facing: step.facing || (step.x > cur.x ? 'right' : 'left'), since: step.t + md};
        if (!step.facing && !step.pose) cur.facing = step.x > prev.x ? 'right' : 'left';
        continue;
      }
      if (step.pose && step.pose !== cur.pose) { prev = {...cur}; cur = {...cur, pose: step.pose, since: step.t}; }
      if (step.facing) cur.facing = step.facing;
    }
    let A, x = cur.x, facing = cur.facing, pose = cur.pose;
    if (moving) { const f = ease.inOutSine(clamp01((t - moving.start) / moving.md)); x = K.lerp(moving.from, moving.to, f); facing = moving.to > moving.from ? 'right' : 'left'; pose = moving.run ? 'run' : 'walk'; A = K.poseAngles(pose, t - moving.start, tm.seed % 10); }
    else {
      A = K.poseAngles(pose, t - cur.since, tm.seed % 10);
      const f = (t - cur.since) / 0.22;
      if (prev && f < 1) A = K.blendAngles(K.poseAngles(prev.pose, t - prev.since, tm.seed % 10), A, ease.inOutCubic(clamp01(f)));
    }
    return {x, facing, pose, A, expression: cur.expression, emote: cur.emote};
  }
  // A soft contact shadow keeps feet and objects on the ground (not on the hand-drawn ink finish).
  function shadow(x, y, rx) {
    if (K.FIN === 'ink' || rx <= 0) return;
    const {ctx} = K;
    ctx.save(); ctx.fillStyle = K.alpha('#000000', K.DARK ? 0.28 : 0.13); ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.16, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawFigure(el, i, t, local, p) {
    const s = figureState(el, i, t), pose = K.POSE[s.pose] || {};
    if (!['lie', 'sleep', 'fall'].includes(s.pose)) shadow(s.x * K.W, el.y * K.H, 0.24 * figureH(el) * (1 - Math.min(0.5, Math.max(0, s.A.lift || 0) * 3)) * p);
    const a = K.drawFigure({x: s.x * K.W, y: el.y * K.H, dir: s.facing === 'left' ? -1 : 1, size: el.size, A: s.A, pose: s.pose, expression: s.expression, emote: s.emote, talk: !!pose.talk, holds: el.holds, tl: local, seed: LAYOUT.el[i].seed, look: el.look, engine: D.engine}, p);
    LAYOUT.anchors[i] = {center: [(a.box[0] + a.box[2]) / 2, (a.box[1] + a.box[3]) / 2], r: (a.box[2] - a.box[0]) / 2, box: a.box, head: a.head};
    if (el.label && p >= 1) K.pill(el.label, a.head[0], a.head[1] - a.head[2] * 1.7, 46 * K.u);
  }
  function drawProp(el, i, t, local, p) {
    const s = propS(el), [cx, cy] = LAYOUT.est[i].center, {ctx} = K;
    // A prop on the ground stays put (with its shadow); one in the air breathes gently, so nothing sits dead still.
    const grounded = cy + 0.45 * s >= (K.GROUND - 0.05) * K.H, m = el.motion === 'auto' ? (grounded ? 'none' : 'idle') : el.motion;
    if (grounded) shadow(cx, Math.min(cy + 0.47 * s, K.GROUND * K.H + 0.02 * K.H), 0.36 * s * p);
    ctx.save();
    if (m === 'idle') { const ph = LAYOUT.el[i].seed % 7; ctx.translate(0, Math.sin(local * 1.9 + ph) * 0.03 * s); ctx.translate(cx, cy); ctx.rotate(Math.sin(local * 1.3 + ph) * 0.045); ctx.translate(-cx, -cy); }
    if (m === 'spin') { ctx.translate(cx, cy); ctx.rotate(local * 1.6); ctx.translate(-cx, -cy); }
    if (m === 'pulse') { const z = 1 + 0.08 * Math.sin(local * 5); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }
    if (m === 'float') ctx.translate(0, Math.sin(local * 2) * 0.05 * s);
    if (m === 'shake') ctx.translate(Math.sin(local * 40) * 0.02 * s, 0);
    if (m === 'bounce') ctx.translate(0, -Math.abs(Math.sin(local * 4)) * 0.12 * s);
    if (m === 'swing') { ctx.translate(cx, cy - 0.45 * s); ctx.rotate(Math.sin(local * 3) * 0.25); ctx.translate(-cx, -(cy - 0.45 * s)); }
    const frame = K.frame(cx, cy, s, 1), g = {tl: el.motion === 'none' ? 0 : local, seed: LAYOUT.el[i].seed, label: el.label};
    K.render(K.propOf(el.prop)(frame, g), p, LAYOUT.el[i].seed);
    ctx.restore();
    LAYOUT.anchors[i] = LAYOUT.est[i];
    if (el.label && el.prop !== 'sign' && p >= 1) K.pill(el.label, cx, cy - 0.62 * s, 46 * K.u, {color: el.accent ? K.PAL.accent : K.PAL.ink});
  }
  const NUMBER = /(-?\d[\d,]*(?:\.\d+)?)/;
  // The hand-drawn engine's hand: a marker held in a hand, its tip on the stroke being drawn (device pixels),
  // with the small wobble of a hand at work. Drawn only while something is being drawn.
  function drawHand([x, y], t, context) {
    const {ctx} = K, s = 1.35 * context.H * (context.scale || 1) / 1080, angle = 0.95 + Math.sin(t * 9) * 0.03;
    const f = K.frame(x, y, s, 1, angle), ink = '#2B2B2B', lw = 2.6 * s, skin = '#F1D2B6';
    const draw = (pts, fill) => { ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Back to front: the sleeve, the palm behind the pen, the marker (nib on the line, barrel, cap in the accent),
    // then the fingers that grip it - the middle finger under, the index along the barrel, the thumb over it.
    draw(f.pts([[180, 52], [330, 118], [292, 205], [148, 122]]), '#3C4A5C');
    draw(f.pts([[56, 10], [96, 22], [150, 32], [190, 48], [200, 92], [162, 122], [112, 112], [80, 82], [60, 46]]), skin);
    draw(f.pts([[0, 0], [16, -6], [16, 6]]), '#3A3A3A');
    draw(f.pts([[16, -10], [175, -12], [175, 12], [16, 10]]), '#4A4A4A');
    draw(f.pts([[175, -13], [214, -13], [214, 13], [175, 13]]), K.PAL.accent);
    draw(f.pts([[58, 6], [82, 22], [72, 32], [52, 20]]), skin);
    draw(f.pts([[46, -5], [100, -12], [124, -8], [126, 6], [100, 11], [50, 8]]), skin);
    draw(f.pts([[72, -12], [98, -27], [122, -26], [120, -12], [94, -5]]), skin);
    ctx.restore();
  }
  function drawText(el, i, t, local, p) {
    const at = LAYOUT.textAt[i], {ctx, u} = K, color = el.accent || ['number', 'counter'].includes(el.style) ? K.PAL.accent : K.PAL.ink;
    const {x, y, size} = at;
    switch (el.style) {
      case 'note': { const n = Math.ceil(el.text.length * clamp01(local * 28 / Math.max(1, el.text.length))); K.text(el.text.slice(0, n), x, y, size, {color, weight: 700, maxWidth: K.W - 2 * K.M}); break; }
      case 'number': { const q = clamp01(local / 0.25), z = 1 + 0.7 * (1 - ease.outCubic(q)); ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08 * (1 - q)); ctx.scale(z, z); ctx.globalAlpha *= clamp01(q * 3); K.text(el.text, 0, 0, size, {color, maxWidth: K.W - 2 * K.M}); ctx.restore(); break; }
      case 'counter': {
        const match = el.text.match(NUMBER), value = match ? Number(match[1].replace(/,/g, '')) : null;
        let shown = el.text;
        if (value !== null) { const decimals = (match[1].split('.')[1] || '').length, now = value * ease.outCubic(clamp01(local / 0.9)); shown = el.text.replace(match[1], now.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: match[1].includes(',') || value >= 10000})); }
        const z = 1 + 0.12 * Math.exp(-Math.max(0, local - 0.9) * 8) * (local > 0.9 ? 1 : 0);
        ctx.save(); ctx.translate(x, y); ctx.scale(z, z); K.text(shown, 0, 0, size, {color, maxWidth: K.W - 2 * K.M}); ctx.restore();
        break;
      }
      case 'stamp': {
        const q = clamp01(local / 0.16), z = 1 + 1.4 * (1 - ease.inCubic(q)), stamp = el.accent ? K.PAL.accent : C.red;
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12); ctx.scale(z, z); ctx.globalAlpha *= clamp01(q * 2);
        const w = Math.min(K.W - 2 * K.M, at.width) / 2 + size * 0.3, h = size * 0.75;
        ctx.strokeStyle = stamp; ctx.lineWidth = size * 0.08; ctx.strokeRect(-w, -h, w * 2, h * 2); ctx.lineWidth = size * 0.03; ctx.strokeRect(-w + size * 0.12, -h + size * 0.12, w * 2 - size * 0.24, h * 2 - size * 0.24);
        K.text(el.text.toUpperCase(), 0, 0, size, {color: stamp, maxWidth: w * 2 - size * 0.4});
        ctx.restore();
        break;
      }
      case 'highlight': {
        const q = ease.outCubic(clamp01(local / 0.45)), w = at.width;
        ctx.save(); ctx.fillStyle = K.alpha(el.accent ? K.PAL.accent : C.yellow, 0.55); ctx.beginPath(); ctx.moveTo(x - w / 2 - 12 * u, y - size * 0.42); ctx.lineTo(x - w / 2 - 12 * u + (w + 24 * u) * q, y - size * 0.46); ctx.lineTo(x - w / 2 - 12 * u + (w + 24 * u) * q, y + size * 0.46); ctx.lineTo(x - w / 2 - 12 * u, y + size * 0.42); ctx.fill(); ctx.restore();
        K.text(el.text, x, y, size, {color: K.PAL.ink, outline: false, maxWidth: K.W - 2 * K.M});
        break;
      }
      case 'pop': {
        const words = el.text.split(' '), widths = words.map(word => K.measure(`${word} `, size)), total = widths.reduce((a, b) => a + b, 0), fit = Math.min(1, (K.W - 2 * K.M) / total);
        let cursor = x - total * fit / 2;
        words.forEach((word, k) => { const q = clamp01((local - k * 0.1) / 0.25); if (q > 0) { const z = ease.outBack(q); ctx.save(); ctx.translate(cursor + widths[k] * fit / 2, y); ctx.scale(z, z); K.text(word, 0, 0, size * fit, {color: k === words.length - 1 && el.accent ? K.PAL.accent : color}); ctx.restore(); } cursor += widths[k] * fit; });
        break;
      }
      case 'label': { const w = at.width + size * 0.8, h = size * 1.5; ctx.save(); ctx.fillStyle = el.accent ? K.PAL.accent : K.PAL.ink; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.restore(); K.text(el.text, x, y, size, {color: K.PAL.bg, outline: false}); break; }
      case 'headline': { const q = ease.outCubic(clamp01(local / 0.35)), h = size * 1.6, yy = y - (1 - q) * (y + h); ctx.save(); ctx.fillStyle = el.accent ? K.PAL.accent : K.PAL.ink; ctx.fillRect(K.M * 0.5, yy - h / 2, K.W - K.M, h); ctx.restore(); K.text(el.text, K.W / 2, yy, size, {color: K.PAL.bg, outline: false, maxWidth: K.W - 2 * K.M}); break; }
      default: {
        K.text(el.text, x, y, size, {color, maxWidth: K.W - 2 * K.M});
        const q = clamp01((local - 0.25) / 0.3);
        if (q > 0) { const w = Math.min(K.W - 2 * K.M, at.width) * 0.9; K.render([{pts: K.partial(K.frame(0, 0, 1).curve(x - w / 2, y + size * 0.62, x, y + size * 0.72, x + w / 2, y + size * 0.56), q), color: K.PAL.accent, px: Math.max(5 * u, size * 0.08)}]); }
      }
    }
    LAYOUT.anchors[i] = LAYOUT.est[i];
  }
  function drawArrow(el, i, t, local, p) {
    const a = anchorOf(el.from, {center: [K.W * 0.3, K.H * 0.5], r: 0}), b = anchorOf(el.to, {center: [K.W * 0.7, K.H * 0.5], r: 0});
    let [x1, y1] = a.center, [x2, y2] = b.center;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    x1 += ux * Math.min(a.r * 0.8, len * 0.3); y1 += uy * Math.min(a.r * 0.8, len * 0.3); x2 -= ux * Math.min(b.r * 0.85, len * 0.3); y2 -= uy * Math.min(b.r * 0.85, len * 0.3);
    const bend = len * 0.16, pts = K.frame(0, 0, 1).curve(x1, y1, (x1 + x2) / 2 - uy * bend, (y1 + y2) / 2 + ux * bend, x2, y2, 24);
    const color = el.accent ? K.PAL.accent : K.PAL.ink, w = 7 * K.u;
    K.render([{pts: K.partial(pts, p), color, px: w}], 1, 5);
    if (p >= 0.98) { const [ax, ay] = pts.at(-3), ang = Math.atan2(y2 - ay, x2 - ax), hl = 34 * K.u; K.render([{pts: [[x2 - Math.cos(ang - 0.5) * hl, y2 - Math.sin(ang - 0.5) * hl], [x2, y2], [x2 - Math.cos(ang + 0.5) * hl, y2 - Math.sin(ang + 0.5) * hl]], color, px: w}], 1, 6); }
    if (el.label && p >= 1) { const side = uy > 0 ? 1 : -1; K.text(el.label, (x1 + x2) / 2 - uy * (bend + 46 * K.u) * side, (y1 + y2) / 2 + ux * (bend + 46 * K.u) * side, 40 * K.u, {color}); }
  }
  function drawBubble(el, i, t, local, p) {
    const {ctx, u} = K, size = 46 * u, words = el.text.split(/\s+/), lines = [];
    let current = '';
    for (const word of words) { const next = current ? `${current} ${word}` : word; if (K.measure(next, size) > K.W * 0.28 && current) { lines.push(current); current = word; } else current = next; }
    if (current) lines.push(current);
    const shown = lines.slice(0, 2), bw = Math.max(...shown.map(item => K.measure(item, size))) + 70 * u, bh = shown.length * size * 1.25 + 46 * u;
    const bx = Math.min(K.W - K.M - bw / 2, Math.max(K.M + bw / 2, el.x * K.W)), by = el.y * K.H;
    const target = el.on ? anchorOf(el.on, null) : LAYOUT.anchors.find((a, k) => a && D.elements[k].kind === 'figure');
    const head = target?.head || (target ? [...target.center, 20 * u] : null);
    const fill = K.DARK ? K.mix(K.PAL.bg, '#000000', 0.3) : '#FFFFFF', line = K.PAL.line;
    const shape = K.frame(bx, by, 1).blob(0, 0, bw / 2, bh / 2, el.thought ? 12 : 1, el.thought ? 0.07 : 0, 64);
    const items = [];
    if (head) {
      if (el.thought) [0.4, 0.68].forEach((f, k) => items.push({pts: K.frame(bx + (head[0] - bx) * f, by + bh / 2 + (head[1] - head[2] - by - bh / 2) * f, (12 - k * 5) * u).ring(0, 0, 1, 1, 16), fill, px: 4 * u}));
      else { const tx = bx + (head[0] - bx) * 0.5, ty = by + bh / 2 + Math.max(36 * u, (head[1] - head[2] - by - bh / 2) * 0.5); items.push({pts: [[bx - 22 * u, by + bh / 2 - 6 * u], [tx, ty], [bx + 22 * u, by + bh / 2 - 6 * u]], fill, px: 5 * u, closed: false}); }
    }
    items.push({pts: shape, fill, px: 5 * u});
    if (!el.thought && head) { const tx = bx + (head[0] - bx) * 0.5; items.push({pts: [[bx - 20 * u, by + bh / 2 - 7 * u], [bx + 20 * u, by + bh / 2 - 7 * u]], color: fill, px: 9 * u}); void tx; }
    K.render(items, 1, 7);
    if (p >= 0.5) shown.forEach((item, row) => K.text(item, bx, by - bh / 2 + 23 * u + size * 0.62 + row * size * 1.25, size, {color: K.PAL.ink, outline: false}));
    ctx.save(); ctx.restore();
    LAYOUT.anchors[i] = {center: [bx, by], r: bw / 2, box: [bx - bw / 2, by - bh / 2, bx + bw / 2, by + bh / 2]};
  }

  // ------------------------------------------------------------ the motion layer
  function fxTarget(el, i) {
    if (el.on) { const a = anchorOf(el.on, null); if (a) { const box = a.box || [a.center[0] - a.r, a.center[1] - a.r, a.center[0] + a.r, a.center[1] + a.r]; return {cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2, w: box[2] - box[0], h: box[3] - box[1], head: a.head}; } }
    // Without a target, a marking effect marks the nearest drawing or words it was placed on.
    if (MARKS.has(el.effect)) {
      const x = el.x * K.W, y = el.y * K.H;
      let best = 0, far = 0.2 * Math.hypot(K.W, K.H);
      D.elements.forEach((item, k) => { if (k === i || ['fx', 'arrow'].includes(item.kind) || !LAYOUT.est[k]) return; const dd = Math.hypot(LAYOUT.est[k].center[0] - x, LAYOUT.est[k].center[1] - y); if (dd < far) { far = dd; best = k + 1; } });
      if (best) return fxTarget({...el, on: best}, i);
    }
    // An effect placed on the same spot as a drawing or words (a burst behind a number) stays with it when the
    // layout moves them (live 0.25 run: the counter moved up, the burst stayed and covered it).
    if (!MARKS.has(el.effect) && !SCREEN_FX.has(el.effect)) {
      const k = D.elements.findIndex((item, n) => n !== i && !['fx', 'arrow'].includes(item.kind) && Number.isFinite(item.x) && Number.isFinite(item.y) && Math.hypot(item.x - el.x, (item.y - el.y) * K.H / K.W) < 0.04);
      if (k >= 0) return fxTarget({...el, on: k + 1}, i);
    }
    const s = FX_SIZE[el.size || 'm'] * K.u;
    return {cx: el.x * K.W, cy: el.y * K.H, w: s * 1.4, h: s * 1.4};
  }
  function drawFx(el, i, t, local, p) {
    const {ctx, u, W, H} = K, g = fxTarget(el, i), color = el.accent ? K.PAL.accent : null, seed = LAYOUT.el[i].seed;
    // On a wide target (a line of words) a round effect stays about two text-heights across, not the whole line.
    const r = Math.min(Math.max(g.w, g.h), Math.min(g.w, g.h) * 2.2) * 0.62;
    switch (el.effect) {
      case 'burst': { const z = ease.outBack(clamp01(local / 0.3)), f = K.frame(g.cx, g.cy, r * z, 1, local * 0.25); K.render([{pts: f.star(0, 0, 1.08, 0.68, 14), fill: color || C.yellow, px: 6 * u}, {pts: f.star(0, 0, 0.8, 0.5, 14, 0.2), fill: K.mix(color || C.yellow, '#FFFFFF', 0.45), stroke: false}]); break; }
      case 'speedlines': { const rand = K.seeded(seed + Math.floor(K.T * 15)), n = 46, inner = Math.max(r * 1.1, Math.min(W, H) * 0.28); ctx.save(); ctx.strokeStyle = K.alpha(K.PAL.ink, 0.32 * clamp01(local / 0.15)); ctx.lineCap = 'round'; for (let k = 0; k < n; k++) { const a = (k + rand() * 0.6) * TAU / n, r1 = inner * (1 + rand() * 0.35), r2 = Math.max(W, H) * 1.1; ctx.lineWidth = (2 + rand() * 6) * u; ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a) * r1, g.cy + Math.sin(a) * r1); ctx.lineTo(g.cx + Math.cos(a) * r2, g.cy + Math.sin(a) * r2); ctx.stroke(); } ctx.restore(); break; }
      case 'smoke': for (let k = 0; k < 6; k++) { const f = clamp01((local - k * 0.05) / 1.2); if (f <= 0 || f >= 1) continue; const a = k * TAU / 6, d = r * 0.8 * ease.outCubic(f); K.render([{pts: K.frame(g.cx + Math.cos(a) * d, g.cy + Math.sin(a) * d * 0.6, r * (0.25 + 0.3 * f)).ring(0, 0, 1, 1, 20), fill: '#E2E2E2', px: 3 * u, color: K.alpha(K.PAL.ink, 0.4), alpha: 1 - f}]); } break;
      case 'sparkles': for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.4, s = 22 * u * Math.max(0.05, Math.sin(local * 5 + k * 1.3)); K.render([{pts: K.frame(g.cx + Math.cos(a) * g.w * 0.62, g.cy + Math.sin(a) * g.h * 0.62, s).star(0, 0, 1, 0.28, 4), fill: color || C.yellow, px: 2.5 * u}]); } break;
      case 'circle': { const pts = Array.from({length: 61}, (_, k) => { const a = -Math.PI * 0.6 + TAU * 1.1 * k / 60; return [g.cx + Math.cos(a) * g.w * 0.62 * (1 + 0.04 * Math.sin(a * 3)), g.cy + Math.sin(a) * g.h * 0.62]; }); K.render([{pts: K.partial(pts, ease.outCubic(clamp01(local / 0.45))), color: color || C.red, px: 8 * u}]); break; }
      case 'underline': { const y = g.cy + g.h * 0.55, pts = K.frame(0, 0, 1).curve(g.cx - g.w * 0.55, y, g.cx, y + 14 * u, g.cx + g.w * 0.55, y - 6 * u, 20); K.render([{pts: K.partial(pts, ease.outCubic(clamp01(local / 0.35))), color: color || C.red, px: 9 * u}]); break; }
      case 'cross': { const s = Math.max(g.w, g.h) * 0.5, q1 = clamp01(local / 0.18), q2 = clamp01((local - 0.18) / 0.18); K.render([{pts: K.partial([[g.cx - s, g.cy - s], [g.cx + s, g.cy + s]], q1), color: color || C.red, px: 16 * u}, ...(q2 > 0 ? [{pts: K.partial([[g.cx + s, g.cy - s], [g.cx - s, g.cy + s]], q2), color: color || C.red, px: 16 * u}] : [])]); break; }
      case 'check': { const s = Math.max(g.w, g.h) * 0.42, pts = [[g.cx - s * 0.6, g.cy], [g.cx - s * 0.15, g.cy + s * 0.5], [g.cx + s * 0.75, g.cy - s * 0.6]]; K.render([{pts: K.partial(pts, ease.outCubic(clamp01(local / 0.35))), color: color || C.green, px: 18 * u}]); break; }
      case 'spotlight': { const q = clamp01(local / 0.35), rr = Math.max(g.w, g.h) * 0.75; ctx.save(); ctx.fillStyle = `rgba(0,0,0,${0.62 * q})`; ctx.beginPath(); ctx.rect(-W, -H, W * 3, H * 3); ctx.arc(g.cx, g.cy, rr, 0, TAU, true); ctx.fill('evenodd'); ctx.restore(); break; }
      case 'hearts': for (let k = 0; k < 4; k++) { const f = ((local * 0.6 + k / 4) % 1), x = g.cx + Math.sin(local * 2 + k * 2) * g.w * 0.4, y = g.cy - f * g.h * 1.1, s = 0.012 * r * (1 - f * 0.3); K.render([{pts: Array.from({length: 31}, (_, n) => { const a = TAU * n / 30; return [x + 16 * Math.sin(a) ** 3 * s, y - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s]; }), fill: C.red, alpha: 1 - f, px: 2 * u}]); } break;
      case 'glow': { const pulse = 0.75 + 0.25 * Math.sin(local * 4), gr = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, r * 1.3); gr.addColorStop(0, K.alpha(color || C.yellow, 0.55 * pulse * clamp01(local / 0.3))); gr.addColorStop(1, K.alpha(color || C.yellow, 0)); ctx.fillStyle = gr; ctx.fillRect(g.cx - r * 1.4, g.cy - r * 1.4, r * 2.8, r * 2.8); break; }
      case 'shockwave': case 'pulse': for (let k = 0; k < (el.effect === 'pulse' ? 3 : 1); k++) { const f = ((local / (el.effect === 'pulse' ? 1.2 : 0.7)) + k / 3) % 1; if (el.effect === 'shockwave' && local > 0.7) break; K.render([{pts: K.frame(g.cx, g.cy, r * (0.5 + f * 1.4)).ring(0, 0, 1, 1, 40), color: color || K.PAL.accent, px: (10 - f * 7) * u, alpha: 1 - f}]); } break;
      case 'scan': { const f = (local / 1.2) % 1, y = g.cy - g.h * 0.6 + g.h * 1.2 * f; ctx.save(); ctx.fillStyle = K.alpha(C.green, 0.12); ctx.fillRect(g.cx - g.w * 0.65, g.cy - g.h * 0.6, g.w * 1.3, g.h * 1.2); ctx.shadowColor = C.green; ctx.shadowBlur = 16 * u; ctx.fillStyle = C.green; ctx.fillRect(g.cx - g.w * 0.65, y, g.w * 1.3, 5 * u); ctx.restore(); K.render([{pts: K.frame(g.cx, g.cy, 1).rect(-g.w * 0.65, -g.h * 0.6, g.w * 1.3, g.h * 1.2), color: C.green, px: 3 * u}]); break; }
      case 'ink-splat': { const z = ease.outBack(clamp01(local / 0.25)), rand = K.seeded(seed), f = K.frame(g.cx, g.cy, r * 0.7 * z); K.render([{pts: f.blob(0, 0, 0.8, 0.7, 9, 0.25), fill: color || K.PAL.ink, stroke: false}, ...Array.from({length: 6}, () => { const a = rand() * TAU, d = 1.1 + rand() * 0.5; return {pts: f.ring(Math.cos(a) * d, Math.sin(a) * d, 0.1 + rand() * 0.1), fill: color || K.PAL.ink, stroke: false}; })]); break; }
      case 'progress': { const w = Math.min(W * 0.5, W - 2 * K.M), h = 46 * u, q = ease.outCubic(clamp01(local / 1.1)) * (el.value ?? 0) / 100, x = Math.min(W - K.M - w / 2, Math.max(K.M + w / 2, g.cx)); ctx.save(); ctx.fillStyle = K.alpha(K.PAL.ink, 0.12); ctx.beginPath(); ctx.roundRect(x - w / 2, g.cy - h / 2, w, h, h / 2); ctx.fill(); ctx.fillStyle = color || C.green; ctx.beginPath(); ctx.roundRect(x - w / 2, g.cy - h / 2, Math.max(h, w * q), h, h / 2); ctx.fill(); ctx.strokeStyle = K.PAL.line; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.roundRect(x - w / 2, g.cy - h / 2, w, h, h / 2); ctx.stroke(); ctx.restore(); K.text(`${Math.round(q * 100)}%`, x, g.cy - h * 1.3, 52 * u, {color: K.PAL.ink}); break; }
      case 'stars': { const c = g.head ? [g.head[0], g.head[1] - g.head[2] * 1.05] : [g.cx, g.cy - g.h * 0.5], rr = g.head ? g.head[2] : r * 0.5; for (let k = 0; k < 3; k++) { const a = local * 4 + k * TAU / 3; K.render([{pts: K.frame(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr * 0.28, rr * 0.2).star(0, 0, 1, 0.42), fill: C.yellow, px: 2 * u}]); } break; }
      default: break;
    }
  }
  function drawScreenFx(el, i, t) {
    const {ctx, u, W, H} = K, tm = LAYOUT.el[i], local = t - tm.ts;
    if (local < 0 || (tm.te !== null && t > tm.te)) return;
    const rand = K.seeded(tm.seed);
    switch (el.effect) {
      case 'flash': if (local < 0.3) { ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - local / 0.3)})`; ctx.fillRect(0, 0, W, H); } break;
      case 'confetti': for (let k = 0; k < 70; k++) { const x0 = rand() * W, v = 0.35 + rand() * 0.5, y = -0.1 * H + (local * v + rand() * 0.3) * H * 0.9, a = local * (2 + rand() * 4) + rand() * 6; if (y > H * 1.05) continue; ctx.save(); ctx.translate(x0 + Math.sin(local * 2 + k) * 20 * u, y); ctx.rotate(a); ctx.fillStyle = [C.red, C.blue, C.yellow, C.green, C.pink, C.orange][k % 6]; ctx.fillRect(-7 * u, -4 * u, 14 * u, 8 * u); ctx.restore(); } break;
      case 'money-rain': for (let k = 0; k < 12; k++) { const x0 = rand() * W, y = (-0.15 + ((local * (0.18 + rand() * 0.12) + rand()) % 1.2)) * H; K.render(K.PROPS.money(K.frame(x0 + Math.sin(local * 2 + k) * 30 * u, y, 90 * u, 1, Math.sin(local * 2 + k) * 0.6), {tl: local + k, seed: k}), 1, k); } break;
      case 'rain': ctx.save(); ctx.strokeStyle = 'rgba(120,170,230,0.6)'; ctx.lineWidth = 2.5 * u; for (let k = 0; k < 90; k++) { const x = rand() * W * 1.1, f = (local * (1.4 + rand() * 0.4) + rand()) % 1; ctx.beginPath(); ctx.moveTo(x, f * H); ctx.lineTo(x - 10 * u, f * H + 34 * u); ctx.stroke(); } ctx.restore(); break;
      case 'snow': ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.9)'; for (let k = 0; k < 70; k++) { const x = rand() * W + Math.sin(local + k) * 20 * u, f = (local * (0.1 + rand() * 0.1) + rand()) % 1; ctx.beginPath(); ctx.arc(x, f * H, (3 + rand() * 4) * u, 0, TAU); ctx.fill(); } ctx.restore(); break;
      case 'glitch': if (local < 0.35 || (local % 2.2) < 0.12) glitch(tm.seed + Math.floor(t * 30)); break;
      default: break;
    }
  }
  function glitch(seed) {
    const {ctx} = K, canvas = ctx.canvas, rand = K.seeded(seed);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let k = 0; k < 7; k++) { const y = rand() * canvas.height, h = (0.02 + rand() * 0.06) * canvas.height, dx = (rand() - 0.5) * 0.08 * canvas.width; ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h); }
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,0,60,0.08)'; ctx.fillRect(0, rand() * canvas.height, canvas.width, canvas.height * 0.05); ctx.fillStyle = 'rgba(0,200,255,0.08)'; ctx.fillRect(0, rand() * canvas.height, canvas.width, canvas.height * 0.05);
    ctx.restore();
  }

  // ------------------------------------------------------------ the frame
  function drawStage(t) {
    const i = LAYOUT.stage, tm = LAYOUT.el[i];
    if (i === null || t < tm.ts) return;
    const q = ease.outCubic(clamp01((t - tm.ts) / 0.5)), [cx, cy] = LAYOUT.est[i].center, r = LAYOUT.est[i].r * 2.2 * q, {ctx} = K;
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, K.alpha(K.PAL.accent, 0.28)); g.addColorStop(0.6, K.alpha(K.PAL.accent, 0.1)); g.addColorStop(1, K.alpha(K.PAL.accent, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = K.alpha(K.PAL.accent, 0.07);
    for (let k = 0; k < 12; k++) { const a = t * 0.22 + k * TAU / 12; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 1.7, a, a + TAU / 28); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function drawElement(el, i, t) {
    const tm = LAYOUT.el[i];
    if (t < tm.ts) return;
    const exitAt = tm.te;
    if (exitAt !== null && t > exitAt + 0.22) return;
    const local = t - tm.ts, enter = el.kind === 'fx' ? 'none' : tm.enter, d = enterSeconds(enter);
    let sx = 1, sy = 1, dx = 0, dy = 0, a = 1, p = 1;
    if (d && local < d) {
      const q = local / d;
      if (enter === 'pop') sx = sy = ease.outBack(q);
      if (enter === 'grow') sx = sy = ease.outCubic(q);
      if (enter === 'slide') dx = (1 - ease.outCubic(q)) * (LAYOUT.est[i].center[0] < K.W / 2 ? -1 : 1) * 0.6 * K.W;
      if (enter === 'drop') dy = -(1 - ease.inCubic(q)) * 0.75 * K.H;
      if (enter === 'fade') a = q;
      if (enter === 'draw') p = el.kind === 'figure' ? clamp01(local / (d * 1.25)) : q;
    }
    if (enter === 'draw' && el.kind === 'figure') p = clamp01(local / (d * 1.25));
    if (enter === 'drop' && local >= d && local < d + 0.18) { const s = Math.sin(Math.PI * (local - d) / 0.18); sy = 1 - 0.14 * s; sx = 1 + 0.1 * s; }
    if (exitAt !== null && t > exitAt) { const q = clamp01((t - exitAt) / 0.22); sx *= 1 - ease.inCubic(q); sy *= 1 - ease.inCubic(q); a *= 1 - q; }
    const est = LAYOUT.est[i], [ax, ay] = el.kind === 'figure' ? [el.x * K.W, el.y * K.H] : est.center;
    const {ctx} = K;
    ctx.save();
    ctx.globalAlpha *= a;
    // Hand-drawn: words are written out left to right by the pen, at a writing pace.
    if (K.FIN === 'ink' && enter === 'draw' && el.kind === 'text' && WRITTEN.has(el.style)) {
      const at = LAYOUT.textAt[i], q = clamp01(local / Math.min(1.6, Math.max(0.4, 0.25 + el.text.length * 0.045)));
      if (q < 1) {
        const half = at.width / 2 + at.size * 0.6, left = at.x - half, edge = left + 2 * half * q;
        ctx.beginPath(); ctx.rect(left, at.y - at.size * 1.3, edge - left, at.size * 2.6); ctx.clip();
        K.penAt(edge, at.y + at.size * 0.22);
      }
    }
    ctx.translate(ax + dx, ay + dy); ctx.scale(Math.max(0.001, sx), Math.max(0.001, sy)); ctx.translate(-ax, -ay);
    if (el.kind === 'figure') drawFigure(el, i, t, local, p);
    else if (el.kind === 'prop') drawProp(el, i, t, local, p);
    else if (el.kind === 'text') drawText(el, i, t, local, p);
    else if (el.kind === 'arrow') drawArrow(el, i, t, local, p);
    else if (el.kind === 'bubble') drawBubble(el, i, t, local, p);
    else if (el.kind === 'fx' && !SCREEN_FX.has(el.effect) && !['shake', 'punch'].includes(el.effect)) drawFx(el, i, t, local, p);
    ctx.restore();
  }
  function frame(t, context) {
    P = context.P; D = P.data;
    K.KIT = D.kit || {};
    K.TIP = null;
    const params = {...P, finish: FINISH[D.engine] || 'cartoon'};
    K.bind({ctx: context.ctx, P: params, W: context.W, H: context.H, M: context.M});
    K.T = t;
    const key = P;
    if (lastKey !== key) { LAYOUT = layout(D); lastKey = key; }
    LAYOUT.anchors = [];
    const {ctx, W, H, u} = K;
    ctx.fillStyle = K.PAL.bg; ctx.fillRect(0, 0, W, H);
    if (K.FIN === 'ink') { const rand = K.seeded(11); ctx.fillStyle = K.alpha(K.PAL.ink, 0.035); for (let k = 0; k < 260; k++) ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3); }
    const cam = camera(t);
    // The set: drawn at full strength on its own layer, laid back behind the action, moving a little slower.
    // A kit set (the story's own place) is drawn on the whole frame like a library set.
    const setOf = name => (String(name).startsWith('kit:') ? (K.KIT[name.slice(4)] ? () => K.kitShapes(name, ([x, y]) => [x * K.W, y * K.H]) : null) : K.SETS[name]);
    if (D.set && D.set !== 'none' && setOf(D.set)) {
      const canvas = ctx.canvas;
      if (!layerCanvas || layerCanvas.width !== canvas.width || layerCanvas.height !== canvas.height) { layerCanvas = document.createElement('canvas'); layerCanvas.width = canvas.width; layerCanvas.height = canvas.height; layerCtx = layerCanvas.getContext('2d'); }
      layerCtx.setTransform(1, 0, 0, 1, 0, 0); layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
      layerCtx.setTransform(context.scale, 0, 0, context.scale, 0, 0);
      layerCtx.save(); applyCamera(layerCtx, cam, 0.7);
      K.ctx = layerCtx;
      const reveal = K.FIN === 'ink' ? clamp01(t / 0.6) : 1;
      K.render(setOf(D.set)(t), reveal, 77);
      K.ctx = ctx;
      layerCtx.restore();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = (K.SET_STRENGTH[D.set] ?? 0.55) * (K.DARK ? 0.9 : 1); ctx.drawImage(layerCanvas, 0, 0); ctx.restore();
    }
    // Backdrop effects (a burst, a glow, speed lines, rings) sit behind everything else, so they never hide a word.
    ctx.save(); applyCamera(ctx, cam, 1);
    if (LAYOUT.stage !== null) drawStage(t);
    D.elements.forEach((el, i) => { if (el.kind === 'fx' && BACKDROP_FX.has(el.effect)) drawElement(el, i, t); });
    D.elements.forEach((el, i) => { if (!(el.kind === 'fx' && BACKDROP_FX.has(el.effect))) drawElement(el, i, t); });
    ctx.restore();
    K.mood(D.mood, t);
    if (K.FIN === 'ink' && K.TIP) drawHand(K.TIP, t, context);
    D.elements.forEach((el, i) => { if (el.kind === 'fx' && SCREEN_FX.has(el.effect)) drawScreenFx(el, i, t); });
    // The opening transition's own marks: speed streaks on a whip, an ink wipe, a glitch, a flash on a pop.
    const tr = D.transition;
    if ((tr === 'whip-left' || tr === 'whip-right') && t < 0.24) { const q = 1 - t / 0.24, rand = K.seeded(5); ctx.save(); ctx.strokeStyle = K.alpha(K.DARK ? '#FFFFFF' : K.PAL.ink, 0.35 * q); ctx.lineCap = 'round'; for (let k = 0; k < 22; k++) { const y = rand() * H, l = (0.2 + rand() * 0.5) * W, x = rand() * W; ctx.lineWidth = (2 + rand() * 7) * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y); ctx.stroke(); } ctx.restore(); }
    if (tr === 'ink' && t < 0.3) { const rr = Math.hypot(W, H) * (0.12 + 0.5 * ease.outCubic(t / 0.3)), f = K.frame(W / 2, H / 2, 1); ctx.save(); ctx.fillStyle = K.PAL.bg; ctx.beginPath(); ctx.rect(0, 0, W, H); const ring = f.blob(0, 0, rr, rr, 9, 0.08, 72); ring.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill('evenodd'); ctx.restore(); }
    if (tr === 'glitch' && t < 0.25) glitch(Math.floor(t * 30) + 3);
    if (tr === 'pop' && t < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - t / 0.12)})`; ctx.fillRect(0, 0, W, H); }
    return true;
  }
  const catalog = () => ({props: Object.keys(K.PROPS).sort(), sets: Object.keys(K.SETS).sort(), poses: [...K.POSES].sort(), expressions: [...K.EXPRESSIONS].sort()});
  // layout(): the last frame's measured boxes and the pen's tip, read by the tests.
  window.DRAWN = {frame, catalog, layout: () => (LAYOUT ? {est: LAYOUT.est, tip: K.TIP} : null)};
}());
