'use strict';
// P06d - Drawing toolkit for drawn shots, shared by drawn-props.js, drawn-figures.js, drawn-sets.js and
// drawn-engine.js. Runs inside the local headless browser (injected by motion.js); our own code, no network.
// Every frame is a pure function of time: no Math.random, clocks or timers; randomness is seeded.
// Three finishes: cartoon (stickman: bold clean outlines, flat colour), ink (hand-drawn: wobbly double line
// that boils on twos, washed colour, paper) and flat (motion graphics: filled shapes, no outlines, glow).
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
    Object.assign(K, {ctx, P, W, H, M, u: Math.min(W, H) / 1080, FIN: P.finish || 'cartoon', DARK: dark,
      PAL: {bg: P.palette.bg, ink: P.palette.ink, accent: P.palette.accent, line: P.palette.ink, // Faces stay light with dark features on every palette (live 0.25 run: dark-palette faces read as black).
      head: dark ? '#F3EEE4' : '#FFFFFF', face: dark ? '#1F1F1F' : P.palette.ink, shadow: dark ? 'rgba(0,0,0,0.35)' : K.alpha(P.palette.ink, 0.13)}});
  };
  K.LW = () => (K.FIN === 'ink' ? 4.4 : K.FIN === 'flat' ? 4.2 : 5.2) * K.u;
  // Background colours sit back so the foreground reads: pastel on light styles, dim on dark ones.
  K.tone = (c, k = 0.3) => K.mix(K.col(c), K.PAL.bg, K.DARK ? 0.72 : k);

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
  K.paint = (it, p, seed) => {
    const {ctx, u, FIN} = K, pts = it.pts;
    if (!pts || pts.length < 2) return;
    ctx.save();
    if (it.alpha !== undefined) ctx.globalAlpha *= it.alpha;
    const closed = it.closed ?? !!it.fill;
    if (it.fill && p >= 1) {
      if (FIN === 'ink' && it.fill[0] === '#') { ctx.save(); ctx.translate(2.6 * u, 2 * u); ctx.fillStyle = K.alpha(K.mix(it.fill, '#FFFFFF', 0.12), 0.8); K.trace(pts, true); ctx.fill(); ctx.restore(); }
      else { if (it.glow) { ctx.shadowColor = it.glow; ctx.shadowBlur = 30 * u; } ctx.fillStyle = it.fill; K.trace(pts, true); ctx.fill(); ctx.shadowBlur = 0; }
    }
    if (it.stroke !== false && !(FIN === 'flat' && it.fill && !it.line)) {
      const part = K.partial(pts, p), width = it.px || (it.width || 1) * K.LW();
      ctx.strokeStyle = it.color || K.PAL.line; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (FIN === 'ink') {
        const boil = Math.floor(K.T * 12);
        for (let pass = 0; pass < 2; pass++) {
          const rand = K.seeded(seed * 31 + pass * 977 + boil * 7919), amp = (pass ? 2.4 : 1.3) * u;
          K.trace(part, closed && p >= 1, () => (rand() - 0.5) * amp * 2);
          ctx.lineWidth = pass ? width * 0.45 : width * 0.9; ctx.stroke();
        }
      } else {
        if (it.glow && FIN === 'flat') { ctx.shadowColor = it.glow; ctx.shadowBlur = 22 * u; }
        K.trace(part, closed && p >= 1); ctx.lineWidth = width; ctx.stroke();
      }
    }
    ctx.restore();
  };
  // Draws items in order; a draw-on progress is shared out by stroke length, the way a hand draws.
  K.render = (list, progress = 1, seed = 1) => {
    const lengths = list.map(it => (it.draw || it.stroke === false ? 0 : K.polyLen(it.pts || [])));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let done = 0;
    list.forEach((it, k) => {
      const share = lengths[k] / total, p = progress >= 1 ? 1 : share ? clamp01((progress - done) / share) : (progress >= Math.min(0.999, done + 0.02) ? 1 : 0);
      done += share;
      if (p <= 0) return;
      if (it.draw) { K.ctx.save(); if (it.alpha !== undefined) K.ctx.globalAlpha *= it.alpha; it.draw(p); K.ctx.restore(); } else K.paint(it, p, seed + k * 13);
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
  K.font = (size, {heading = true, weight = 700} = {}) => `${weight} ${size}px "${heading ? (K.FIN === 'ink' ? K.P.fonts.hand : K.P.fonts.heading) : K.P.fonts.body}", "Segoe UI", Arial, sans-serif`;
  // Text that never leaves the frame and stays readable: a white edge on light styles, a glow on dark ones.
  K.text = (value, x, y, size, {color = K.PAL.ink, align = 'center', weight = 800, heading = true, outline = true, baseline = 'middle', maxWidth = null} = {}) => {
    const {ctx, u} = K;
    ctx.save();
    ctx.font = K.font(size, {heading, weight});
    const width = ctx.measureText(value).width, fit = maxWidth && width > maxWidth ? maxWidth / width : 1;
    if (fit < 1) ctx.font = K.font(size * fit, {heading, weight});
    ctx.textAlign = align; ctx.textBaseline = baseline; ctx.lineJoin = 'round';
    if (outline) {
      if (K.DARK) { ctx.shadowColor = K.alpha('#000000', 0.6); ctx.shadowBlur = 14 * u; }
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
    K.text(value, px, y, size, {color, outline: false});
  };
  K.measure = (value, size, opts = {}) => { K.ctx.save(); K.ctx.font = K.font(size, opts); const w = K.ctx.measureText(value).width; K.ctx.restore(); return w; };
}());
