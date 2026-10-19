'use strict';
// P06d - Drawing toolkit for drawn shots, shared by drawn-props.js, drawn-figures.js, drawn-sets.js and
// drawn-engine.js. Runs inside the local headless browser (injected by motion.js); our own code, no network.
// Every frame is a pure function of time: no Math.random, clocks or timers; randomness is seeded.
// Finishes: cartoon (stickman: bold clean outlines, flat colour), ink (hand-drawn, 0.29: an illustrator's clean ink
// line, flat colour with coloured-pencil shading and hatching, white paper) and flat (motion graphics: filled
// shapes, no outlines, glow); the stickman looks
// add board (whiteboard: clean black marker on white), story (storybook: warm paper, soft brown line, muted colour)
// and doodle (thick uneven marker, bright fills).
(function () {
  const K = window.DK = {};
  const clamp01 = x => Math.max(0, Math.min(1, x));
  K.clamp01 = clamp01;
  K.lerp = (a, b, f) => a + (b - a) * f;
  K.ease = {
    outCubic: x => 1 - (1 - x) ** 3, inCubic: x => x ** 3, inOutCubic: x => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
    inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2, outQuart: x => 1 - (1 - x) ** 4, outExpo: x => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
    outBack: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; },
  };
  // 0.39: curves measured from human-made motion films, one per role (motionmaxxing, Apache-2.0, pinned 8c8ec0f,
  // runtime/motion.js; formulas and constants reused, see docs/REPOSITORIES.md). Landings ease out (60-72% of the
  // travel in the first 4-5 frames, then a long tail), leavings ease in, overshoot is rare and small.
  {
    const powerOut = p => x => 1 - (1 - x) ** p, powerIn = p => x => x ** p;
    const expoOut = k => { const d = 1 - Math.exp(-k); return x => (1 - Math.exp(-k * x)) / d; };
    const snapRamp = (w, tau) => { const n = w * (1 - Math.exp(-1 / tau)) + (1 - w); return x => (w * (1 - Math.exp(-x / tau)) + (1 - w) * x) / n; };
    const norm = f => { const end = f(1); return x => f(x) / end; };
    const snapOver = (A, ta, td) => norm(x => (1 + A * Math.exp(-x / td)) * (1 - Math.exp(-x / ta)));
    const spring = (c, om) => norm(x => 1 - Math.exp(-c * x) * (Math.cos(om * x) + (c / om) * Math.sin(om * x)));
    const smoothP = p => x => { const a = x ** p, b = (1 - x) ** p; return a + b ? a / (a + b) : 0; };
    const clampEase = f => x => (x <= 0 ? 0 : x >= 1 ? 1 : f(x));
    Object.assign(K.ease, Object.fromEntries(Object.entries({
      crashIn: snapOver(2.0, 0.19, 0.218), popOver: spring(2.67, 4.36), bounceHard: spring(1.34, 5.07), snapSettle: snapRamp(0.942, 0.118),
      softLand: expoOut(3.41), whip: powerOut(2.52), glide: powerOut(1.7), cruise: x => x, softInOut: smoothP(1.42), gentleIn: powerIn(2.07),
      accelExit: powerIn(2.6), crashOut: powerIn(3.97),
    }).map(([name, f]) => [name, clampEase(f)])));
  }
  K.seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let r = Math.imul(a ^ (a >>> 15), 1 | a); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  K.hashText = text => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  // Smooth deterministic noise in [-1, 1].
  K.noise = x => { const i = Math.floor(x), f = x - i, h = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; }; const w = f * f * (3 - 2 * f); return h(i) * (1 - w) + h(i + 1) * w; };

  // ------------------------------------------------------------ colour
  K.hexRgb = hex => { const v = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] || 'ffffff'; return [0, 2, 4].map(k => parseInt(v.slice(k, k + 2), 16)); };
  K.alpha = (hex, a) => { const [r, g, b] = K.hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  K.mix = (a, b, f) => { const x = K.hexRgb(a), y = K.hexRgb(b); return '#' + x.map((v, k) => Math.round(v + (y[k] - v) * f).toString(16).padStart(2, '0')).join(''); };
  K.lum = hex => { const [r, g, b] = K.hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  K.COL = {
    red: '#E5484D', blue: '#3E7BFA', green: '#34B36B', yellow: '#FFC83D', orange: '#FF8A3D', purple: '#8B5CF6', pink: '#F58AB8', black: '#2A2A2A', white: '#FFFFFF', grey: '#9AA0A6', brown: '#8B5A3C', gold: '#F2B531', teal: '#1FB5A8',
    sky: '#A6DCF7', grass: '#8CD06F', leaf: '#4CAF50', trunk: '#8B5A3C', water: '#4DA6E8', sand: '#F2D48F', rock: '#A3A3A3', fire: '#FF6A2B', flame: '#FFC93C', metal: '#BAC2CA', wood: '#B37A48',
    screen: '#2F3542', glow: '#7FDBFF', money: '#6CC070', moneyDark: '#2E8B57', brain: '#F7A6B8', cream: '#FFF6E0', night: '#1F2547', dark: '#262626', skin: '#FFFFFF', paper: '#FFFFFF',
  };
  K.HAIR = {black: '#2B2626', brown: '#7A4B2C', blonde: '#EFC75E', ginger: '#E5762C', grey: '#A9A9A9', white: '#F4F4F4', red: '#D83A3A', blue: '#3C6FD8', pink: '#F08DB4', purple: '#8B5AD6', green: '#3DAA62'};
  K.col = name => K.COL[name] || name;

  // ------------------------------------------------------------ state for the current frame
  K.bind = ({ctx, P, W, H, M}) => {
    const dark = K.lum(P.palette.bg) < 0.45;
    Object.assign(K, {ctx, P, W, H, M, u: Math.min(W, H) / 1080, FIN: P.finish || 'cartoon', WB: P.drawing?.board && P.drawing.board !== 'mix' ? P.drawing.board : 'cartoon', DARK: dark,
      PAL: {bg: P.palette.bg, ink: P.palette.ink, accent: P.palette.accent, line: P.palette.ink, // Faces stay light with dark features on every palette (live 0.25 run: dark-palette faces read as black).
      head: dark ? '#F3EEE4' : '#FFFFFF', face: dark ? '#1F1F1F' : P.palette.ink, shadow: dark ? 'rgba(0,0,0,0.35)' : K.alpha(P.palette.ink, 0.13)}});
  };
  const LINE = {ink: 4.4, flat: 4.2, board: 4.6, story: 3.6, doodle: 6.6, wb: 3.8, info: 3.4, chron: 3.8, paint: 3.2};
  K.LW = () => (K.FIN === 'wb' && K.WB === 'pencil' ? 2.6 : LINE[K.FIN] || 5.2) * K.u;
  // Background colours sit back so the foreground reads: pastel on light styles, dim on dark ones.
  K.tone = (c, k = 0.3) => K.mix(K.col(c), K.PAL.bg, K.DARK ? (K.DESIGN ? 0.42 : 0.72) : k);

  // ------------------------------------------------------------ strokes and fills
  K.polyLen = pts => { let n = 0; for (let k = 1; k < pts.length; k++) n += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return n; };
  K.partial = (pts, p) => {
    if (p >= 1) return pts;
    const target = K.polyLen(pts) * p, out = [pts[0]];
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], l = Math.hypot(x1 - x0, y1 - y0);
      if (acc + l >= target) { const f = l ? (target - acc) / l : 0; out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]); return out; }
      out.push(pts[k]); acc += l;
    }
    return out;
  };
  K.trace = (pts, closed, jitter) => {
    const {ctx} = K;
    ctx.beginPath();
    pts.forEach(([x, y], k) => { const jx = jitter ? jitter() : 0, jy = jitter ? jitter() : 0; if (k) ctx.lineTo(x + jx, y + jy); else ctx.moveTo(x + jx, y + jy); });
    if (closed) ctx.closePath();
  };
  // One drawing item: {pts, fill?, color?, width? (x line width) | px?, stroke?: false, line?: true (keep the outline
  // on flat), closed?, alpha?, glow?} or a custom {draw(p)}.
  // K.TIP: where the pen is in this frame (device pixels) while the drawing hand is on (K.PEN), so the engine can
  // draw the hand holding it.
  K.TIP = null;
  K.PEN = false;
  K.SKETCH = false;
  K.penAt = (x, y) => { if (!K.PEN) return; const m = K.ctx.getTransform(); K.TIP = [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
  K.paint = (it, p, seed, wash = 1) => {
    const {ctx, u, FIN} = K, pts = it.pts;
    if (!pts || pts.length < 2) return;
    ctx.save();
    if (it.alpha !== undefined) ctx.globalAlpha *= it.alpha;
    const closed = it.closed ?? !!it.fill;
    // K.SKETCH: a place on the whiteboard is line art with a light touch of colour.
    if (K.SKETCH && it.fill) ctx.globalAlpha *= 0.22;
    if (it.fill && p >= 1) {
      // Ink: the colour comes in just after its outline, then coloured pencil shades the side away from the light
      // (lower right) and a light hatch gives the paper's tooth.
      if (FIN === 'ink' && it.fill[0] === '#') {
        ctx.save(); ctx.globalAlpha *= wash; ctx.fillStyle = it.fill; K.trace(pts, true); ctx.fill();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        const size = Math.min(x1 - x0, y1 - y0);
        if (size > 16 * u && !K.SKETCH) {
          ctx.clip();
          const d = Math.max(3 * u, size * 0.13), dark = K.mix(it.fill, '#1B1B2F', 0.4);
          ctx.beginPath(); ctx.rect(x0 - 2 * d, y0 - 2 * d, x1 - x0 + 4 * d, y1 - y0 + 4 * d);
          pts.forEach(([x, y], k) => (k ? ctx.lineTo(x - d, y - d) : ctx.moveTo(x - d, y - d))); ctx.closePath();
          ctx.fillStyle = K.alpha(dark, 0.32); ctx.fill('evenodd');
          ctx.strokeStyle = K.alpha(dark, 0.16); ctx.lineWidth = 1.3 * u; ctx.beginPath();
          for (let k = x0 - (y1 - y0); k < x1; k += 6 * u) { ctx.moveTo(k, y1); ctx.lineTo(k + (y1 - y0), y0); }
          ctx.stroke();
        }
        ctx.restore();
      }
      else {
        // Under the pen the colour comes in just after its outline; storybook colours sit back into the paper.
        if (K.PEN || FIN === 'board' || FIN === 'wb') ctx.globalAlpha *= wash;
        if (it.glow) { ctx.shadowColor = it.glow; ctx.shadowBlur = 30 * u; }
        // Whiteboard looks: black marker keeps the board white inside its lines, pencil colours lightly, and dry-erase
        // markers colour in with visible strokes over the white.
        const wbFill = FIN === 'wb' && it.fill[0] === '#' ? (K.WB === 'marker' ? '#FFFFFF' : K.WB === 'pencil' ? K.mix(it.fill, '#FFFFFF', 0.68) : K.WB === 'dry-erase' ? '#FFFFFF' : it.fill) : null;
        ctx.fillStyle = wbFill || (FIN === 'story' && it.fill[0] === '#' ? K.mix(it.fill, K.PAL.bg, 0.22) : it.fill); K.trace(pts, true); ctx.fill(); ctx.shadowBlur = 0;
        if (FIN === 'wb' && K.WB === 'dry-erase' && it.fill[0] === '#' && it.fill.toUpperCase() !== '#FFFFFF') {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
          // Walls, floors and skies stay board-white: only the drawings are coloured in.
          if ((x1 - x0) * (y1 - y0) <= 0.25 * K.W * K.H) {
          ctx.save(); K.trace(pts, true); ctx.clip();
          const rand = K.seeded(seed * 7 + 3), gap = 6.5 * u, span = y1 - y0;
          ctx.strokeStyle = it.fill; ctx.lineWidth = 5.2 * u; ctx.lineCap = 'round'; ctx.globalAlpha *= 0.92;
          ctx.beginPath();
          for (let k = x0 - span; k < x1 + gap; k += gap) { const j = (rand() - 0.5) * 2.4 * u; ctx.moveTo(k + j, y1 + 2 * u); ctx.lineTo(k + span * 0.55 + j, y0 - 2 * u); }
          ctx.stroke(); ctx.restore();
          }
        }
      }
    }
    if (it.stroke !== false && !(FIN === 'flat' && it.fill && !it.line)) {
      const part = K.partial(pts, p), width = it.px || (it.width || 1) * K.LW();
      if (p > 0 && p < 1 && part.length) K.penAt(...part[part.length - 1]);
      ctx.strokeStyle = it.color || K.PAL.line; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (it.dash) ctx.setLineDash(it.dash.map(v => v * u));
      if (FIN === 'ink') {
        // An illustrator's ink line: one confident stroke with the slight unevenness of a pen, the same every frame.
        const rand = K.seeded(seed * 31 + 977);
        K.trace(part, closed && p >= 1, () => (rand() - 0.5) * 0.9 * u * 2);
        ctx.lineWidth = width * 0.85; ctx.stroke();
      } else if (FIN === 'wb') {
        // A whiteboard marker: one confident line; a pencil: two light graphite passes.
        const pencil = K.WB === 'pencil', rand = K.seeded(seed * 29 + 151);
        if (pencil && !it.color) ctx.strokeStyle = K.mix(K.PAL.line, '#FFFFFF', 0.22);
        for (let pass = 0; pass < (pencil ? 2 : 1); pass++) {
          const amp = (pencil ? (pass ? 1.6 : 0.8) : 0.7) * u;
          K.trace(part, closed && p >= 1, () => (rand() - 0.5) * amp * 2);
          ctx.lineWidth = pencil ? width * (pass ? 0.5 : 0.85) : width; ctx.stroke();
        }
      } else if (FIN === 'doodle') {
        // A felt marker: one uneven line, the same on every frame (no boil).
        for (let pass = 0; pass < 2; pass++) {
          const rand = K.seeded(seed * 17 + pass * 389), amp = (pass ? 1.5 : 0.7) * u;
          K.trace(part, closed && p >= 1, () => (rand() - 0.5) * amp * 2);
          ctx.lineWidth = pass ? width * 0.55 : width; ctx.stroke();
        }
      } else {
        if (it.glow && FIN === 'flat') { ctx.shadowColor = it.glow; ctx.shadowBlur = 22 * u; }
        K.trace(part, closed && p >= 1); ctx.lineWidth = width; ctx.stroke();
      }
    }
    ctx.restore();
  };
  // Draws items in order; a draw-on progress is shared out by stroke length, the way a hand draws.
  // World-kit items (kit.js, P06j): shapes in unit space, drawn as ordinary items so each engine gives them its own
  // finish. K.KIT is the shot's kit; a "kit:<id>" prop draws like any library prop (standing or held).
  K.KIT = {};
  K.kitShapes = (name, map) => (K.KIT[String(name).slice(4)]?.shapes || []).map(shape => ({pts: shape.pts.map(map), ...(shape.fill ? {fill: shape.fill} : {})}));
  K.propOf = name => (String(name).startsWith('kit:') ? (b => K.kitShapes(name, ([x, y]) => b.p(x, y))) : K.PROPS[name]);
  K.render = (list, progress = 1, seed = 1) => {
    const lengths = list.map(it => (it.draw || it.stroke === false ? 0 : K.polyLen(it.pts || [])));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let done = 0;
    list.forEach((it, k) => {
      const share = lengths[k] / total, p = progress >= 1 ? 1 : share ? clamp01((progress - done) / share) : (progress >= Math.min(0.999, done + 0.02) ? 1 : 0);
      done += share;
      if (p <= 0) return;
      const wash = progress >= 1 ? 1 : clamp01((progress - done) / 0.12);
      if (it.draw) { K.ctx.save(); if (it.alpha !== undefined) K.ctx.globalAlpha *= it.alpha; it.draw(p); K.ctx.restore(); } else K.paint(it, p, seed + k * 13, wash);
    });
  };

  // ------------------------------------------------------------ geometry in a local frame
  // A frame maps local coordinates (size 1 = s pixels, x mirrored by dir, rotated by rot) onto the canvas.
  K.frame = (cx, cy, s, dir = 1, rot = 0) => {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const p = (x, y) => { const X = x * s * dir, Y = y * s; return [cx + X * c - Y * sn, cy + X * sn + Y * c]; };
    const arc = (x, y, rx, ry, a0, a1, n = 36) => Array.from({length: n + 1}, (_, k) => { const a = a0 + (a1 - a0) * k / n; return p(x + rx * Math.cos(a), y + ry * Math.sin(a)); });
    return {
      p, cx, cy, s, dir, rot, arc,
      pts: list => list.map(([x, y]) => p(x, y)),
      ring: (x, y, rx, ry = rx, n = 40) => arc(x, y, rx, ry, 0, Math.PI * 2, n),
      rect: (x, y, w, h) => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h), p(x, y)],
      rrect: (x, y, w, h, r) => {
        r = Math.min(r, w / 2, h / 2);
        const q = Math.PI / 2;
        return [...arc(x + w - r, y + r, r, r, -q, 0, 6), ...arc(x + w - r, y + h - r, r, r, 0, q, 6), ...arc(x + r, y + h - r, r, r, q, 2 * q, 6), ...arc(x + r, y + r, r, r, 2 * q, 3 * q, 6), p(x + w - r, y)];
      },
      curve: (x1, y1, qx, qy, x2, y2, n = 16) => Array.from({length: n + 1}, (_, k) => { const t = k / n; return p((1 - t) ** 2 * x1 + 2 * (1 - t) * t * qx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * qy + t * t * y2); }),
      star: (x, y, r1, r2, n = 5, a0 = -Math.PI / 2) => Array.from({length: n * 2 + 1}, (_, k) => { const a = a0 + Math.PI * k / n, r = k % 2 ? r2 : r1; return p(x + r * Math.cos(a), y + r * Math.sin(a)); }),
      blob: (x, y, rx, ry, bumps, depth, n = 64) => Array.from({length: n + 1}, (_, k) => { const a = 2 * Math.PI * k / n, r = 1 + depth * Math.abs(Math.sin(bumps * a / 2)); return p(x + rx * r * Math.cos(a), y + ry * r * Math.sin(a)); }),
      wave: (x1, x2, y, amp, waves, phase = 0, n = 40) => Array.from({length: n + 1}, (_, k) => { const t = k / n; return p(x1 + (x2 - x1) * t, y + amp * Math.sin((t * waves + phase) * Math.PI * 2)); }),
    };
  };
  K.font = (size, {heading = true, weight = 700} = {}) => `${weight} ${size}px "${heading ? (K.FIN === 'ink' || K.FIN === 'wb' ? K.P.fonts.hand : K.P.fonts.heading) : K.P.fonts.body}", "Segoe UI", Arial, sans-serif`;
  // Text that never leaves the frame and stays readable: a white edge on light styles, a glow on dark ones.
  K.text = (value, x, y, size, {color = K.PAL.ink, align = 'center', weight = 800, heading = true, outline = true, baseline = 'middle', maxWidth = null} = {}) => {
    const {ctx, u} = K;
    ctx.save();
    ctx.font = K.font(size, {heading, weight});
    const width = ctx.measureText(value).width, fit = maxWidth && width > maxWidth ? maxWidth / width : 1;
    if (fit < 1) ctx.font = K.font(size * fit, {heading, weight});
    ctx.textAlign = align; ctx.textBaseline = baseline; ctx.lineJoin = 'round';
    if (outline) {
      // Dark palettes: a glow and a dark edge, so light words also read over a bright place (motion designs draw places
      // at full strength since 0.36). The edge is nearly solid (live plan 2026-10-19: pale words with a soft edge vanished
      // into a white cloud and a pale map).
      if (K.DARK) { ctx.shadowColor = K.alpha('#000000', 0.55); ctx.shadowBlur = 10 * u; ctx.strokeStyle = K.alpha('#000000', 0.85); ctx.lineWidth = Math.max(3.5 * u, size * fit * 0.13); ctx.strokeText(value, x, y); }
      else { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(4 * u, size * fit * 0.16); ctx.strokeText(value, x, y); }
    }
    ctx.fillStyle = color; ctx.fillText(value, x, y);
    ctx.restore();
    return width * fit;
  };
  // A label that reads over any set: the words on a white rounded chip, kept inside the frame.
  K.pill = (value, x, y, size, {color = K.PAL.ink} = {}) => {
    const {ctx, u} = K, w = K.measure(value, size, {weight: 800}) + size * 0.9, h = size * 1.45, px = Math.min(K.W - K.M - w / 2, Math.max(K.M + w / 2, x));
    ctx.save(); ctx.fillStyle = K.alpha('#FFFFFF', 0.94); ctx.strokeStyle = K.alpha(K.PAL.ink, 0.85); ctx.lineWidth = Math.max(2 * u, size * 0.06);
    ctx.beginPath(); ctx.roundRect(px - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.stroke(); ctx.restore();
    // The chip is white, so light words (a dark palette's ink) are written dark (motion demo 2026-10-17: unreadable labels).
    K.text(value, px, y, size, {color: K.lum(K.col(color)) > 0.62 ? '#23272E' : color, outline: false});
  };
  K.measure = (value, size, opts = {}) => { K.ctx.save(); K.ctx.font = K.font(size, opts); const w = K.ctx.measureText(value).width; K.ctx.restore(); return w; };
}());
