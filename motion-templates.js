'use strict';
// P06b - Canvas motion-graphics templates. This file runs inside a headless browser page (injected by
// motion.js); it is our own code and never fetches anything. Every frame is a pure function of time:
// renderFrame(t) resets the canvas and draws from scratch, so any frame can be re-rendered on its own.
// No Math.random, clocks, timers or animation frames: the hand-drawn finish uses a seeded generator.
// Layout is designed at 1920x1080 (1080x1920 for Shorts) and scaled to the canvas size.
(function () {
  const ease = {
    outCubic: x => 1 - (1 - x) ** 3,
    inCubic: x => x ** 3,
    inOutCubic: x => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
    inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
    // Long-tail settle, no overshoot (HyperFrames motion doctrine: smooth beats bouncy; power3.out).
    outQuart: x => 1 - (1 - x) ** 4,
    outExpo: x => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  };
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const phase = (t, start, duration) => clamp01((t - start) / duration);
  function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let r = Math.imul(a ^ (a >>> 15), 1 | a); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  const hashText = text => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  let canvas, ctx, P, W, H, M, scale;
  function setup(params) {
    P = params;
    W = P.vertical ? 1080 : 1920; H = P.vertical ? 1920 : 1080; M = P.vertical ? 96 : 144;
    canvas = document.getElementById('stage') || document.body.appendChild(Object.assign(document.createElement('canvas'), {id: 'stage'}));
    canvas.width = P.width; canvas.height = P.height;
    ctx = canvas.getContext('2d');
    scale = P.width / W;
    window.DURATION = P.duration; window.FPS = P.fps;
    return true;
  }
  const font = (size, weight = 600, family = P.fonts.body) => `${weight} ${size}px "${family}", "Segoe UI", Arial, sans-serif`;
  const headingFont = (size, weight = 700) => (P.finish === 'hand-drawn' ? font(size, 400, P.fonts.hand) : font(size, weight, P.fonts.heading));
  const alpha = (hex, a) => { const v = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] || 'ffffff'; return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`; };

  // Hand-drawn finish: every stroke is drawn twice with small seeded wobbles, the way a marker sketch looks.
  function line(x1, y1, x2, y2, {color, width = 4, progress = 1, seed = 1}) {
    if (progress <= 0) return;
    const ex = x1 + (x2 - x1) * progress, ey = y1 + (y2 - y1) * progress;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    if (P.finish !== 'hand-drawn') { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke(); return; }
    const rand = seeded(seed);
    for (let pass = 0; pass < 2; pass++) {
      const j = () => (rand() - 0.5) * 5;
      ctx.beginPath(); ctx.moveTo(x1 + j(), y1 + j());
      ctx.quadraticCurveTo((x1 + ex) / 2 + j() * 1.5, (y1 + ey) / 2 + j() * 1.5, ex + j(), ey + j());
      ctx.stroke();
    }
  }
  function box(x, y, w, h, {fill, stroke, width = 4, radius = 18, seed = 1}) {
    if (P.finish === 'hand-drawn') {
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(x + 3, y + 3, w - 6, h - 6); }
      if (stroke) { line(x, y, x + w, y, {color: stroke, width, seed}); line(x + w, y, x + w, y + h, {color: stroke, width, seed: seed + 1}); line(x + w, y + h, x, y + h, {color: stroke, width, seed: seed + 2}); line(x, y + h, x, y, {color: stroke, width, seed: seed + 3}); }
      return;
    }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function text(value, x, y, {size, color, align = 'left', baseline = 'alphabetic', weight = 600, heading = false, opacity = 1, maxWidth}) {
    ctx.save(); ctx.globalAlpha *= opacity;
    ctx.font = heading ? headingFont(size, weight) : font(size, weight);
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
    ctx.fillText(value, x, y, maxWidth);
    ctx.restore();
  }
  function wrap(value, maxWidth, size, heading = false) {
    ctx.font = heading ? headingFont(size) : font(size);
    const words = String(value).split(/\s+/), lines = [];
    let current = '';
    for (const word of words) { const next = current ? `${current} ${word}` : word; if (ctx.measureText(next).width > maxWidth && current) { lines.push(current); current = word; } else current = next; }
    if (current) lines.push(current);
    return lines;
  }
  const formatValue = (item, fraction) => `${item.prefix}${(item.value * fraction).toLocaleString('en-US', {minimumFractionDigits: item.decimals, maximumFractionDigits: item.decimals})}${item.suffix ? (/^[%a-z]/i.test(item.suffix) && item.suffix.length < 3 ? '' : ' ') + item.suffix : ''}`;
  function title(t, value) {
    if (!value) return;
    const p = ease.outCubic(phase(t, 0.1, 0.5));
    const lines = wrap(value, W - 2 * M, P.vertical ? 64 : 58, true);
    lines.slice(0, 2).forEach((lineText, k) => text(lineText, M, M + (P.vertical ? 140 : 70) + k * 70 + 20 * (1 - p), {size: P.vertical ? 64 : 58, color: P.palette.ink, heading: true, opacity: p}));
  }

  // ------------------------------------------------------------ templates
  const templates = {
    'bar-chart'(t, d) {
      title(t, d.title);
      const items = d.items, n = items.length, max = Math.max(...items.map(item => Math.abs(item.value)), 1e-9);
      const top = M + (P.vertical ? 330 : 230), bottom = H - M - (P.vertical ? 200 : 40);
      const labelWidth = P.vertical ? 300 : 420, x0 = M + labelWidth, right = W - M - (P.vertical ? 170 : 240);
      const slot = (bottom - top) / n, barHeight = Math.min(P.vertical ? 110 : 84, slot * 0.62);
      const best = items.reduce((k, item, index) => (item.value > items[k].value ? index : k), 0);
      line(x0, top - 20, x0, bottom, {color: alpha(P.palette.ink, 0.5), width: 3, progress: ease.outCubic(phase(t, 0, 0.35)), seed: 7});
      items.forEach((item, k) => {
        const start = 0.35 + k * 0.12, p = ease.outCubic(phase(t, start, 0.75)), y = top + slot * k + (slot - barHeight) / 2;
        const width = (right - x0) * Math.abs(item.value) / max * p, color = k === best ? P.palette.accent : alpha(P.palette.ink, 0.72);
        text(item.label, x0 - 24, y + barHeight / 2, {size: P.vertical ? 40 : 36, color: P.palette.ink, align: 'right', baseline: 'middle', opacity: phase(t, start - 0.1, 0.3), maxWidth: labelWidth - 30});
        if (width > 0.5) box(x0, y, width, barHeight, {fill: color, radius: 8, seed: 20 + k});
        text(formatValue(item, p), x0 + width + 18, y + barHeight / 2, {size: P.vertical ? 42 : 38, color: k === best ? P.palette.accent : P.palette.ink, baseline: 'middle', weight: 700, opacity: phase(t, start, 0.3)});
      });
    },
    'line-chart'(t, d) {
      title(t, d.title);
      const items = d.items, n = items.length, values = items.map(item => item.value);
      const lo = Math.min(0, ...values), hi = Math.max(...values) * 1.1 || 1;
      const left = M + 40, right = W - M - 40, top = M + (P.vertical ? 360 : 250), bottom = H - M - (P.vertical ? 260 : 110);
      const xs = items.map((item, k) => left + (right - left) * (n === 1 ? 0.5 : k / (n - 1)));
      const ys = values.map(value => bottom - (bottom - top) * (value - lo) / (hi - lo));
      line(left, bottom, right, bottom, {color: alpha(P.palette.ink, 0.5), width: 3, progress: ease.outCubic(phase(t, 0, 0.4)), seed: 3});
      const segments = xs.slice(1).map((x, k) => Math.hypot(x - xs[k], ys[k + 1] - ys[k])), total = segments.reduce((sum, value) => sum + value, 0);
      let drawn = total * ease.inOutSine(phase(t, 0.4, Math.min(2.2, P.duration * 0.45)));
      ctx.save(); ctx.strokeStyle = P.palette.accent; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
      const reached = [0];
      for (let k = 0; k < segments.length && drawn > 0; k++) {
        const part = Math.min(1, drawn / segments[k]);
        ctx.lineTo(xs[k] + (xs[k + 1] - xs[k]) * part, ys[k] + (ys[k + 1] - ys[k]) * part);
        if (part >= 0.999) reached.push(k + 1);
        drawn -= segments[k];
      }
      ctx.stroke(); ctx.restore();
      const peak = values.indexOf(Math.max(...values));
      items.forEach((item, k) => {
        text(item.label, xs[k], bottom + (P.vertical ? 70 : 56), {size: P.vertical ? 38 : 32, color: alpha(P.palette.ink, 0.8), align: 'center', opacity: phase(t, 0.2, 0.4)});
        if (!reached.includes(k)) return;
        const pop = ease.outQuart(phase(t, 0.4 + k * 0.05, 0.3));
        ctx.save(); ctx.fillStyle = k === peak ? P.palette.accent : P.palette.ink; ctx.beginPath(); ctx.arc(xs[k], ys[k], 11 * pop, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        if (k === 0 || k === n - 1 || k === peak) text(formatValue(item, 1), xs[k], ys[k] - 32, {size: P.vertical ? 44 : 40, color: k === peak ? P.palette.accent : P.palette.ink, align: 'center', weight: 700, opacity: pop});
      });
    },
    timeline(t, d) {
      title(t, d.title);
      const items = d.items, n = items.length, axis = H * (P.vertical ? 0.5 : 0.58);
      const left = M + 60, right = W - M - 60;
      const years = items.map(item => item.year), lo = Math.min(...years), hi = Math.max(...years);
      const proportional = hi > lo && d.proportional !== false;
      const xs = items.map((item, k) => (proportional ? left + (right - left) * (item.year - lo) / (hi - lo) : left + (right - left) * (n === 1 ? 0.5 : k / (n - 1))));
      line(left - 40, axis, right + 40, axis, {color: alpha(P.palette.ink, 0.55), width: 4, progress: ease.outCubic(phase(t, 0, 0.8)), seed: 11});
      const gap = Math.min(1.1, Math.max(0.35, (P.duration - 2.2) / n));
      items.forEach((item, k) => {
        const start = 0.8 + k * gap, pop = ease.outQuart(phase(t, start, 0.3)), rise = ease.outCubic(phase(t, start + 0.1, 0.4));
        if (pop <= 0) return;
        const current = t < 0.8 + (k + 1) * gap && t >= start;
        ctx.save(); ctx.fillStyle = current || k === n - 1 ? P.palette.accent : P.palette.ink; ctx.beginPath(); ctx.arc(xs[k], axis, 14 * pop, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        const above = k % 2 === 0, labelWidth = Math.min(380, (right - left) / Math.max(2, n - 1) * 1.6);
        text(item.display, xs[k], axis + (above ? -48 : 78) + (above ? 1 : -1) * 14 * (1 - rise), {size: P.vertical ? 46 : 42, color: P.palette.accent, align: 'center', weight: 700, opacity: rise});
        wrap(item.label, labelWidth, P.vertical ? 36 : 30).slice(0, 2).forEach((lineText, row) => text(lineText, xs[k], axis + (above ? -100 - (1 - row) * 38 : 126 + row * 38), {size: P.vertical ? 36 : 30, color: P.palette.ink, align: 'center', opacity: rise}));
      });
    },
    list(t, d) {
      title(t, d.title);
      const items = d.items, n = items.length, top = M + (P.vertical ? 360 : 250);
      // Horizontal content stays above the caption band (bottom 17%, skill captions.keep-out-band).
      const gap = Math.min(0.7, Math.max(0.3, (P.duration - 1.6) / n)), row = Math.min(P.vertical ? 190 : 140, ((P.vertical ? H - M : H * 0.83 - 20) - top) / n);
      items.forEach((item, k) => {
        const start = 0.5 + k * gap, p = ease.outCubic(phase(t, start, 0.35));
        if (p <= 0) return;
        const latest = t < 0.5 + (k + 1) * gap || k === n - 1, done = t > 0.5 + n * gap + 0.4;
        const opacity = p * (latest || done ? 1 : 0.6), y = top + k * row + 22 * (1 - p);
        ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = P.palette.accent; ctx.beginPath(); ctx.arc(M + 26, y + row * 0.32, 18, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        text(String(k + 1), M + 26, y + row * 0.32 + 1, {size: 24, color: P.palette.bg, align: 'center', baseline: 'middle', weight: 800, opacity});
        wrap(item.label, W - 2 * M - 90, P.vertical ? 50 : 46).slice(0, 2).forEach((lineText, line2) => text(lineText, M + 80, y + row * 0.32 + 16 + line2 * 54, {size: P.vertical ? 50 : 46, color: P.palette.ink, opacity}));
      });
    },
    comparison(t, d) {
      const [a, b] = d.items, mid = P.vertical ? H / 2 : W / 2;
      line(P.vertical ? M : mid, P.vertical ? mid : M + 40, P.vertical ? W - M : mid, P.vertical ? mid : H - M - 40, {color: alpha(P.palette.ink, 0.45), width: 4, progress: ease.outCubic(phase(t, 0, 0.5)), seed: 5});
      [a, b].forEach((side, k) => {
        const start = k === 0 ? 0.5 : 1.4, p = ease.outCubic(phase(t, start, 0.45));
        if (p <= 0) return;
        const cx = P.vertical ? W / 2 : (k === 0 ? mid / 2 : mid + mid / 2), cy = P.vertical ? (k === 0 ? mid / 2 : mid + mid / 2) : H / 2;
        const color = k === 1 ? P.palette.accent : P.palette.ink, width = P.vertical ? W - 2 * M : mid - 2 * M + 40;
        wrap(side.label, width, P.vertical ? 76 : 70, true).slice(0, 2).forEach((lineText, row) => text(lineText, cx, cy - 40 + row * 80 + 24 * (1 - p), {size: P.vertical ? 76 : 70, color, align: 'center', heading: true, opacity: p}));
        if (side.detail) wrap(side.detail, width, P.vertical ? 40 : 36).slice(0, 3).forEach((lineText, row) => text(lineText, cx, cy + 90 + row * 46, {size: P.vertical ? 40 : 36, color: alpha(P.palette.ink, 0.8), align: 'center', opacity: ease.outCubic(phase(t, start + 0.2, 0.4))}));
      });
    },
    flow(t, d) {
      title(t, d.title);
      const items = d.items, n = items.length, vertical = P.vertical || n > 4;
      const top = M + (P.vertical ? 330 : 230), width = vertical ? Math.min(760, W - 2 * M) : (W - 2 * M - (n - 1) * 90) / n, height = vertical ? Math.min(150, (H - M - top - (n - 1) * 70) / n) : 220;
      const step = Math.min(1.1, Math.max(0.45, (P.duration - 1.8) / n));
      const pos = k => (vertical ? {x: (W - width) / 2, y: top + k * (height + 70)} : {x: M + k * (width + 90), y: H / 2 - height / 2 + 40});
      items.forEach((item, k) => {
        const start = 0.4 + k * step, pop = ease.outQuart(phase(t, start, 0.3));
        if (pop <= 0) return;
        const {x, y} = pos(k), current = t >= start && t < start + step && k < n - 1;
        ctx.save(); ctx.globalAlpha = clamp01(pop); ctx.translate(x + width / 2, y + height / 2); ctx.scale(0.86 + 0.14 * pop, 0.86 + 0.14 * pop); ctx.translate(-(x + width / 2), -(y + height / 2));
        box(x, y, width, height, {fill: alpha(P.palette.ink, 0.08), stroke: current || k === n - 1 ? P.palette.accent : alpha(P.palette.ink, 0.7), width: 5, seed: 40 + k});
        wrap(item.label, width - 40, P.vertical ? 46 : 40).slice(0, 3).forEach((lineText, row, all) => text(lineText, x + width / 2, y + height / 2 + (row - (all.length - 1) / 2) * 48, {size: P.vertical ? 46 : 40, color: P.palette.ink, align: 'center', baseline: 'middle'}));
        ctx.restore();
        if (k === n - 1) return;
        const next = pos(k + 1), q = ease.inOutCubic(phase(t, start + 0.25, 0.4));
        const [x1, y1, x2, y2] = vertical ? [x + width / 2, y + height + 8, x + width / 2, next.y - 12] : [x + width + 10, y + height / 2, next.x - 14, y + height / 2];
        line(x1, y1, x2, y2, {color: P.palette.accent, width: 5, progress: q, seed: 60 + k});
        if (q >= 1) { ctx.save(); ctx.fillStyle = P.palette.accent; ctx.beginPath(); if (vertical) { ctx.moveTo(x2, y2 + 10); ctx.lineTo(x2 - 14, y2 - 10); ctx.lineTo(x2 + 14, y2 - 10); } else { ctx.moveTo(x2 + 10, y2); ctx.lineTo(x2 - 10, y2 - 14); ctx.lineTo(x2 - 10, y2 + 14); } ctx.fill(); ctx.restore(); }
      });
    },
  };

  // ------------------------------------------------------------ drawn scenes (P06c)
  // A drawn shot for the Stickman, Hand-drawn Canvas and Motion Graphics styles: stick figures, props, labels,
  // arrows and bubbles from sketch.js's closed vocabulary. Every element is a list of strokes revealed by length,
  // so it is drawn on the way a hand sketches it; afterwards it idles (breathing, waving, a flashing bolt).
  const polyLength = pts => { let n = 0; for (let k = 1; k < pts.length; k++) n += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return n; };
  function stroke(pts, {color, width = 6, progress = 1, seed = 1, fill = null, fillAlpha = 1}) {
    if (progress <= 0 || pts.length < 2) return;
    const hand = P.finish === 'hand-drawn', target = polyLength(pts) * Math.min(1, progress);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    if (fill && progress >= 1) { ctx.save(); ctx.globalAlpha *= fillAlpha; ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.restore(); }
    for (let pass = 0; pass < (hand ? 2 : 1); pass++) {
      const rand = seeded(seed * 31 + pass * 977), j = () => (hand ? (rand() - 0.5) * (pass ? 4.5 : 2.5) : 0);
      let drawn = 0;
      ctx.beginPath(); ctx.moveTo(pts[0][0] + j(), pts[0][1] + j());
      for (let k = 1; k < pts.length; k++) {
        const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], length = Math.hypot(x1 - x0, y1 - y0);
        if (drawn + length >= target) { const f = length ? (target - drawn) / length : 0; ctx.lineTo(x0 + (x1 - x0) * f + j(), y0 + (y1 - y0) * f + j()); break; }
        ctx.lineTo(x1 + j(), y1 + j()); drawn += length;
      }
      ctx.lineWidth = pass ? width * 0.5 : width; ctx.stroke();
    }
  }
  // Draws a list of strokes in order: the element's draw-on progress is shared out by stroke length.
  function strokes(list, progress, seed) {
    const lengths = list.map(item => polyLength(item.pts)), total = lengths.reduce((a, b) => a + b, 0) || 1;
    let done = 0;
    list.forEach((item, k) => { const share = lengths[k] / total; stroke(item.pts, {...item, progress: share ? clamp01((progress - done) / share) : 1, seed: seed + k}); done += share; });
  }
  const ring = (cx, cy, rx, ry = rx, turns = 1, start = -Math.PI / 2, n = 44) => Array.from({length: n + 1}, (_, k) => { const a = start + turns * 2 * Math.PI * k / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  const curve = (x1, y1, cx, cy, x2, y2, n = 18) => Array.from({length: n + 1}, (_, k) => { const s = k / n; return [(1 - s) ** 2 * x1 + 2 * (1 - s) * s * cx + s * s * x2, (1 - s) ** 2 * y1 + 2 * (1 - s) * s * cy + s * s * y2]; });
  const bumpy = (cx, cy, rx, ry, bumps, depth, n = 64) => Array.from({length: n + 1}, (_, k) => { const a = 2 * Math.PI * k / n, r = 1 + depth * Math.abs(Math.sin(bumps * a / 2)); return [cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]; });
  const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

  // Pose angles in degrees from hanging straight down, positive towards the way the figure faces:
  // f/b = front/back arm [upper, lower], lf/lb = front/back leg [thigh, shin].
  const POSE = {
    stand: {f: [16, 8], b: [-16, -8], lf: [7, 0], lb: [-7, 0]},
    point: {f: [92, 88], b: [-14, -4], lf: [7, 0], lb: [-7, 0]},
    think: {f: [35, 155], b: [-8, 70], lf: [6, 0], lb: [-6, 0], tilt: 10},
    shock: {f: [118, 152], b: [-118, -152], lf: [20, 8], lb: [-20, -8], lean: -6},
    cheer: {f: [128, 160], b: [-128, -160], lf: [12, 0], lb: [-12, 0]},
    walk: {f: [-22, -12], b: [22, 32], lf: [22, 6], lb: [-22, -36], cycle: 5},
    run: {f: [-50, 40], b: [60, 100], lf: [48, -18], lb: [-35, -85], cycle: 9, lean: 12},
    sit: {f: [30, 70], b: [-10, 25], lf: [88, 2], lb: [82, 8], sit: true},
    wave: {f: [118, 165], b: [-14, -4], lf: [7, 0], lb: [-7, 0], wave: true},
    shrug: {f: [55, 145], b: [-55, -145], lf: [7, 0], lb: [-7, 0], tilt: -6},
  };
  const limb = (x, y, a, length, dir) => [x + Math.sin(a * Math.PI / 180) * length * dir, y + Math.cos(a * Math.PI / 180) * length];
  function figure(el, t, local, ink, accent, u) {
    const h = {s: 270, m: 390, l: 530}[el.size] * u, dir = el.facing === 'left' ? -1 : 1, pose = POSE[el.pose];
    const swing = pose.cycle ? Math.sin(t * pose.cycle) : 0, bob = Math.sin(t * 2.2) * h * 0.006 + (pose.cycle ? Math.abs(swing) * h * 0.012 : 0);
    const fx = el.x * W, fy = el.y * H - bob, r = h * 0.115, hip = pose.sit ? -0.27 * h : -0.46 * h;
    const neck = hip - 0.33 * h, shoulder = neck + 0.075 * h, lean = (pose.lean || 0) * dir * Math.PI / 180;
    const top = [fx + Math.sin(lean) * (hip - neck) * -1, fy + neck];
    const head = [top[0] + Math.sin((pose.tilt || 0) * dir * Math.PI / 180) * r, top[1] - r];
    const w = Math.max(5, h * 0.024), arm = h * 0.2, fore = h * 0.19, thigh = h * 0.24, shin = h * 0.23;
    const hipPt = [fx, fy + hip], sh = [top[0] + (fx - top[0]) * 0.15, fy + shoulder];
    const legs = [pose.lf, pose.lb].map((leg, k) => { const s = (k ? -1 : 1) * swing * 22; const knee = limb(hipPt[0], hipPt[1], leg[0] + s, thigh, dir); return [hipPt, knee, limb(knee[0], knee[1], leg[1] + s, shin, dir)]; });
    const arms = [pose.f, pose.b].map((a, k) => { const s = (k ? 1 : -1) * swing * 20, wave = pose.wave && !k ? Math.sin(t * 8) * 22 : 0; const elbow = limb(sh[0], sh[1], a[0] + s, arm, dir); return [sh, elbow, limb(elbow[0], elbow[1], a[1] + s + wave, fore, dir)]; });
    const color = el.accent ? accent : ink;
    const list = [{pts: ring(head[0], head[1], r, r, P.finish === 'hand-drawn' ? 1.06 : 1), color, width: w}, {pts: [top, hipPt], color, width: w}, ...legs.map(pts => ({pts, color, width: w})), ...arms.map(pts => ({pts, color, width: w}))];
    if (pose.sit) list.push({pts: [[hipPt[0] - h * 0.18 * dir, hipPt[1] + h * 0.02], [hipPt[0] + h * 0.12 * dir, hipPt[1] + h * 0.02]], color: alpha(ink, 0.6), width: w * 0.8});
    strokes(list, local, hashText(`${el.pose}${el.x}`));
    if (local >= 1 && el.size !== 's') {
      // A face, small and simple: eyes toward the way it faces, a mouth for the pose.
      ctx.save(); ctx.fillStyle = color; [-0.32, 0.18].forEach(dx => { ctx.beginPath(); ctx.arc(head[0] + (dx + 0.18) * r * dir, head[1] - 0.12 * r, Math.max(2.5, r * 0.08), 0, Math.PI * 2); ctx.fill(); }); ctx.restore();
      const mx = head[0] + 0.22 * r * dir, my = head[1] + 0.38 * r;
      if (el.pose === 'shock') stroke(ring(mx, my, r * 0.14, r * 0.18), {color, width: w * 0.55, seed: 3});
      else if (el.pose === 'think' || el.pose === 'shrug') stroke([[mx - r * 0.2, my], [mx + r * 0.2, my + r * 0.04]], {color, width: w * 0.55, seed: 4});
      else stroke(curve(mx - r * 0.24, my - r * 0.04, mx, my + r * 0.2, mx + r * 0.24, my - r * 0.04), {color, width: w * 0.55, seed: 5});
    }
    return {x: head[0], y: head[1] - r, h};
  }
  // Props, drawn around their centre (cx, cy) at size s.
  function prop(el, t, local, idle, ink, accent, u) {
    const s = {s: 150, m: 230, l: 330}[el.size] * u, cx = el.x * W, cy = el.y * H, w = Math.max(4, s * 0.03), soft = alpha(ink, 0.07);
    const main = el.accent ? accent : ink, tint = el.accent ? alpha(accent, 0.25) : soft, list = [];
    const add = (pts, extra = {}) => list.push({pts, color: main, width: w, ...extra});
    switch (el.prop) {
      case 'sun': add(ring(cx, cy, s * 0.26), {fill: alpha(accent, 0.3)}); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, l = s * (0.36 + 0.06 * Math.sin(idle * 3 + k)); add([[cx + Math.cos(a) * s * 0.33, cy + Math.sin(a) * s * 0.33], [cx + Math.cos(a) * (s * 0.33 + l * 0.5), cy + Math.sin(a) * (s * 0.33 + l * 0.5)]]); } break;
      case 'cloud': case 'storm': {
        const dx = Math.sin(idle * 0.6) * 6 * u;
        add(bumpy(cx + dx, cy, s * 0.4, s * 0.2, 5, 0.32), {fill: el.prop === 'storm' ? alpha(ink, 0.22) : soft});
        if (el.prop === 'storm') for (let k = 0; k < 4; k++) { const off = ((idle * 160 * u + k * 37) % (s * 0.3)); add([[cx - s * 0.24 + k * s * 0.16 + dx, cy + s * 0.3 + off * 0.3], [cx - s * 0.28 + k * s * 0.16 + dx, cy + s * 0.42 + off * 0.3]], {color: alpha(ink, 0.6), width: w * 0.7}); }
        break;
      }
      case 'bolt': {
        const z = [[0.06, -0.5], [-0.16, 0.02], [0.02, 0.02], [-0.1, 0.5], [0.2, -0.08], [0.03, -0.08], [0.16, -0.5], [0.06, -0.5]].map(([x, y]) => [cx + x * s, cy + y * s]);
        const flash = local >= 1 && (idle % 1.7) < 0.14;
        if (flash) { ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 60 * u; }
        add(z, {color: accent, fill: alpha(accent, flash ? 1 : 0.85)});
        if (flash) { strokes(list.splice(0), 1, 41); ctx.restore(); }
        break;
      }
      case 'tree': add([[cx - s * 0.05, cy + s * 0.45], [cx - s * 0.04, cy + s * 0.08]]); add([[cx + s * 0.05, cy + s * 0.45], [cx + s * 0.04, cy + s * 0.08]]); add(bumpy(cx, cy - s * 0.12, s * 0.28, s * 0.24, 6, 0.18), {fill: tint}); break;
      case 'house': add(rectPts(cx - s * 0.3, cy - s * 0.05, s * 0.6, s * 0.45), {fill: soft}); add([[cx - s * 0.38, cy - s * 0.02], [cx, cy - s * 0.38], [cx + s * 0.38, cy - s * 0.02]]); add(rectPts(cx - s * 0.07, cy + s * 0.16, s * 0.14, s * 0.24)); break;
      case 'city': [[-0.42, 0.5], [-0.2, 0.75], [0.04, 0.4], [0.22, 0.62]].forEach(([x, hgt]) => { add(rectPts(cx + x * s, cy + s * 0.4 - hgt * s, s * 0.18, hgt * s), {fill: soft}); for (let r = 0; r < Math.floor(hgt * 5); r++) add([[cx + x * s + s * 0.05, cy + s * 0.34 - r * s * 0.12], [cx + x * s + s * 0.12, cy + s * 0.34 - r * s * 0.12]], {width: w * 0.6}); }); break;
      case 'mountain': add([[cx - s * 0.5, cy + s * 0.35], [cx - s * 0.12, cy - s * 0.35], [cx + s * 0.18, cy + s * 0.1], [cx + s * 0.3, cy - s * 0.1], [cx + s * 0.5, cy + s * 0.35]], {fill: soft}); add([[cx - s * 0.22, cy - s * 0.15], [cx - s * 0.12, cy - s * 0.08], [cx - s * 0.03, cy - s * 0.17]]); break;
      case 'ground': add([[W * 0.04, cy], [W * 0.96, cy]], {color: alpha(ink, 0.7)}); for (let k = 0; k < 9; k++) { const x = W * (0.08 + k * 0.105); add([[x, cy], [x + 10 * u, cy - 14 * u]], {color: alpha(ink, 0.45), width: w * 0.6}); } break;
      case 'globe': { const turn = 0.42 + 0.12 * Math.sin(idle * 0.9); add(ring(cx, cy, s * 0.36), {fill: tint}); add(ring(cx, cy, s * 0.36 * turn, s * 0.36), {width: w * 0.7}); add([[cx, cy - s * 0.36], [cx, cy + s * 0.36]], {width: w * 0.6}); add([[cx - s * 0.36, cy], [cx + s * 0.36, cy]], {width: w * 0.7}); add(curve(cx - s * 0.3, cy - s * 0.19, cx, cy - s * 0.15, cx + s * 0.3, cy - s * 0.19), {width: w * 0.55}); add(curve(cx - s * 0.3, cy + s * 0.19, cx, cy + s * 0.23, cx + s * 0.3, cy + s * 0.19), {width: w * 0.55}); break; }
      case 'clock': { add(ring(cx, cy, s * 0.36), {fill: soft}); for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; add([[cx + Math.cos(a) * s * 0.29, cy + Math.sin(a) * s * 0.29], [cx + Math.cos(a) * s * 0.33, cy + Math.sin(a) * s * 0.33]], {width: w * 0.6}); } const m = idle * 1.6 - Math.PI / 2, hr = idle * 0.13 - Math.PI / 3; add([[cx, cy], [cx + Math.cos(hr) * s * 0.17, cy + Math.sin(hr) * s * 0.17]]); add([[cx, cy], [cx + Math.cos(m) * s * 0.27, cy + Math.sin(m) * s * 0.27]], {color: accent}); break; }
      case 'thermometer': { const top = cy - s * 0.4, bottom = cy + s * 0.22, r = s * 0.06; add([[cx - r, bottom], [cx - r, top], ...curve(cx - r, top, cx, top - r * 1.6, cx + r, top).slice(1), [cx + r, bottom]]); add(ring(cx, bottom + s * 0.1, s * 0.11), {color: accent, fill: alpha(accent, 0.9)}); const level = local >= 1 ? ease.outCubic(phase(idle, 0, 1.4)) : 0; if (level > 0) { ctx.save(); ctx.fillStyle = accent; ctx.fillRect(cx - r * 0.55, bottom - (bottom - top) * 0.92 * level, r * 1.1, (bottom - top) * 0.92 * level + r); ctx.restore(); } break; }
      case 'heart': { const beat = 1 + 0.06 * Math.max(0, Math.sin(idle * 6)); add(Array.from({length: 61}, (_, k) => { const a = Math.PI * 2 * k / 60; return [cx + 16 * Math.sin(a) ** 3 * s * 0.024 * beat, cy - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s * 0.024 * beat]; }), {color: accent, fill: alpha(accent, 0.85)}); break; }
      case 'coin': add(ring(cx, cy, s * 0.3), {fill: alpha(accent, 0.35)}); add(ring(cx, cy, s * 0.22), {width: w * 0.7}); add(ring(cx, cy, s * 0.14, s * 0.14, 0.3, Math.PI * 1.05), {width: w * 0.6}); break;
      case 'money': add(rectPts(cx - s * 0.38, cy - s * 0.2, s * 0.76, s * 0.4), {fill: alpha(accent, 0.25)}); add(ring(cx, cy, s * 0.12), {width: w * 0.7}); add(ring(cx - s * 0.28, cy, s * 0.04), {width: w * 0.6}); add(ring(cx + s * 0.28, cy, s * 0.04), {width: w * 0.6}); break;
      case 'book': add([[cx, cy - s * 0.2], [cx - s * 0.42, cy - s * 0.26], [cx - s * 0.42, cy + s * 0.22], [cx, cy + s * 0.28], [cx, cy - s * 0.2]], {fill: soft}); add([[cx, cy - s * 0.2], [cx + s * 0.42, cy - s * 0.26], [cx + s * 0.42, cy + s * 0.22], [cx, cy + s * 0.28]], {fill: soft}); for (let k = 0; k < 3; k++) { add([[cx - s * 0.34, cy - s * 0.12 + k * s * 0.12], [cx - s * 0.08, cy - s * 0.09 + k * s * 0.12]], {width: w * 0.5}); add([[cx + s * 0.08, cy - s * 0.09 + k * s * 0.12], [cx + s * 0.34, cy - s * 0.12 + k * s * 0.12]], {width: w * 0.5}); } break;
      case 'lightbulb': { add(ring(cx, cy - s * 0.1, s * 0.24, s * 0.24, 0.82, Math.PI * 0.66), {fill: local >= 1 ? alpha(accent, 0.4 + 0.2 * Math.sin(idle * 4)) : soft}); add([[cx - s * 0.11, cy + s * 0.12], [cx - s * 0.1, cy + s * 0.3], [cx + s * 0.1, cy + s * 0.3], [cx + s * 0.11, cy + s * 0.12]]); add([[cx - s * 0.1, cy + s * 0.2], [cx + s * 0.1, cy + s * 0.2]], {width: w * 0.6}); if (local >= 1) for (let k = 0; k < 5; k++) { const a = -Math.PI * (0.15 + k * 0.175); add([[cx + Math.cos(a) * s * 0.33, cy - s * 0.1 + Math.sin(a) * s * 0.33], [cx + Math.cos(a) * s * 0.43, cy - s * 0.1 + Math.sin(a) * s * 0.43]], {color: accent}); } break; }
      case 'flag': { add([[cx - s * 0.25, cy + s * 0.45], [cx - s * 0.25, cy - s * 0.42]]); const wave = k => Math.sin(idle * 4 + k * 2.4) * s * 0.03; add([[cx - s * 0.25, cy - s * 0.42], [cx, cy - s * 0.42 + wave(1)], [cx + s * 0.3, cy - s * 0.42 + wave(2)], [cx + s * 0.3, cy - s * 0.12 + wave(2)], [cx, cy - s * 0.12 + wave(1)], [cx - s * 0.25, cy - s * 0.12]], {color: accent, fill: alpha(accent, 0.5)}); break; }
      case 'chart': { add([[cx - s * 0.4, cy - s * 0.38], [cx - s * 0.4, cy + s * 0.32], [cx + s * 0.42, cy + s * 0.32]]); [0.3, 0.5, 0.8].forEach((hgt, k) => { const grow = local >= 1 ? ease.outCubic(phase(idle, k * 0.2, 0.6)) : 0; if (grow > 0) { ctx.save(); ctx.fillStyle = k === 2 ? accent : alpha(ink, 0.55); ctx.fillRect(cx - s * 0.3 + k * s * 0.25, cy + s * 0.32 - hgt * s * 0.62 * grow, s * 0.16, hgt * s * 0.62 * grow); ctx.restore(); } }); break; }
      case 'magnifier': add(ring(cx - s * 0.06, cy - s * 0.06, s * 0.22), {fill: soft}); add([[cx + s * 0.1, cy + s * 0.1], [cx + s * 0.36, cy + s * 0.36]], {width: w * 1.6}); break;
      case 'sand': { add([...curve(cx - s * 0.48, cy + s * 0.25, cx - s * 0.05, cy - s * 0.4, cx + s * 0.48, cy + s * 0.25), [cx - s * 0.48, cy + s * 0.25]], {fill: alpha(accent, 0.28)}); if (local >= 1) { const rand = seeded(17); ctx.save(); ctx.fillStyle = alpha(ink, 0.55); for (let k = 0; k < 30; k++) { const px = (rand() - 0.5) * 0.8, py = rand(); ctx.beginPath(); ctx.arc(cx + px * s, cy + s * 0.22 - py * s * 0.36 * (1 - Math.abs(px) * 1.6), 2.4 * u, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); } break; }
      case 'glass': add([[cx, cy - s * 0.42], [cx + s * 0.18, cy - s * 0.1], [cx + s * 0.12, cy + s * 0.38], [cx - s * 0.12, cy + s * 0.38], [cx - s * 0.18, cy - s * 0.1], [cx, cy - s * 0.42]], {fill: alpha(accent, 0.2)}); add([[cx, cy - s * 0.42], [cx, cy + s * 0.38]], {width: w * 0.5}); add([[cx - s * 0.18, cy - s * 0.1], [cx + s * 0.18, cy - s * 0.1]], {width: w * 0.5}); break;
      case 'waves': for (let k = 0; k < 3; k++) { const grow = (idle * 0.8 + k / 3) % 1; ctx.save(); ctx.globalAlpha *= local >= 1 ? 1 - grow * 0.7 : 1; stroke(ring(cx - s * 0.3, cy, s * (0.18 + k * 0.14 + (local >= 1 ? grow * 0.08 : 0)), s * (0.18 + k * 0.14 + (local >= 1 ? grow * 0.08 : 0)), 0.3, -Math.PI * 0.15), {color: k ? main : accent, width: w, progress: local, seed: 70 + k}); ctx.restore(); } break;
      case 'question': case 'exclamation': { const pop = ease.outQuart(local); text(el.prop === 'question' ? '?' : '!', cx, cy + s * 0.32, {size: s * 0.9 * (0.6 + 0.4 * pop), color: accent, align: 'center', heading: true, weight: 800, opacity: clamp01(local * 1.5)}); break; }
      default: break;
    }
    strokes(list, local, hashText(`${el.prop}${el.x}${el.y}`));
    return {x: cx, y: cy - s * 0.5, s};
  }
  function textEl(el, local, ink, accent, u) {
    const size = (el.style === 'number' ? {s: 90, m: 130, l: 180} : el.style === 'title' ? {s: 56, m: 78, l: 108} : {s: 42, m: 54, l: 70})[el.size] * u;
    // Text never leaves the frame: it shrinks to fit and its centre moves inside the margins.
    ctx.font = el.style !== 'note' ? headingFont(size, el.style === 'number' ? 800 : 700) : font(size, 700);
    const full = ctx.measureText(el.text).width, fit = Math.min(1, (W - 2 * M) / Math.max(1, full)), sized = size * fit, half = full * fit / 2;
    const shown = el.text.slice(0, Math.ceil(el.text.length * clamp01(local * 1.15)));
    const color = el.accent || el.style === 'number' ? accent : ink, x = Math.min(W - M - half, Math.max(M + half, el.x * W)), y = el.y * H;
    text(shown, x - half, y, {size: sized, color, align: 'left', baseline: 'middle', heading: el.style !== 'note', weight: el.style === 'number' ? 800 : 700});
    if (el.style === 'title' && local >= 0.95) stroke([[x - half, y + sized * 0.62], [x + half, y + sized * 0.58]], {color: accent, width: Math.max(4, sized * 0.07), progress: clamp01((local - 0.95) * 20), seed: 91});
  }
  function labelFor(el, at, local, ink, u) {
    if (!el.label || local < 1) return;
    text(el.label, at.x, at.y - 26 * u, {size: 40 * u, color: ink, align: 'center', heading: true, opacity: clamp01((local - 1) * 3 + 1)});
  }
  function sketchScene(t, d) {
    const darkStyle = (() => { const v = /^#?([0-9a-f]{6})$/i.exec(P.palette.bg)?.[1] || 'ffffff'; return (0.299 * parseInt(v.slice(0, 2), 16) + 0.587 * parseInt(v.slice(2, 4), 16) + 0.114 * parseInt(v.slice(4, 6), 16)) / 255 < 0.45; })();
    const u = Math.min(W, H) / 1080, board = d.background === 'board' && darkStyle;
    const ink = board ? '#F1EFE6' : P.palette.ink, accent = P.palette.accent;
    if (board) { ctx.fillStyle = '#1E2B27'; ctx.fillRect(0, 0, W, H); }
    // The camera: a slow push towards the centre or a gentle drift across the scene.
    const k = clamp01(t / Math.max(0.1, P.duration));
    ctx.save();
    if (d.camera === 'push') { const z = 1 + 0.05 * ease.inOutSine(k); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    if (d.camera === 'drift') ctx.translate((0.5 - k) * 36 * u, 0);
    // The whole drawing appears within its budget (about a third of the shot, 0.8-1.8 s), so the viewer sees the
    // complete picture for most of the shot; elements overlap as a quick hand would draw them.
    const boxes = d.elements.map(el => {
      if (el.kind === 'figure') { const h = {s: 270, m: 390, l: 530}[el.size] * u; return [el.x * W - h * 0.3, el.y * H - h, el.x * W + h * 0.3, el.y * H]; }
      if (el.kind === 'prop' && el.prop !== 'ground') { const s = {s: 150, m: 230, l: 330}[el.size] * u; return [el.x * W - s * 0.5, el.y * H - s * 0.5, el.x * W + s * 0.5, el.y * H + s * 0.5]; }
      return null;
    }).filter(Boolean);
    const place = el => {
      if (el.kind !== 'text') return el;
      const size = (el.style === 'number' ? {s: 90, m: 130, l: 180} : el.style === 'title' ? {s: 56, m: 78, l: 108} : {s: 42, m: 54, l: 70})[el.size] * u;
      ctx.font = el.style !== 'note' ? headingFont(size, el.style === 'number' ? 800 : 700) : font(size, 700);
      const half = Math.min(W - 2 * M, ctx.measureText(el.text).width) / 2, x = Math.min(W - M - half, Math.max(M + half, el.x * W));
      const cover = y => boxes.reduce((sum, [x1, y1, x2, y2]) => sum + Math.max(0, Math.min(x + half, x2) - Math.max(x - half, x1)) * Math.max(0, Math.min(y + size * 0.6, y2) - Math.max(y - size * 0.6, y1)), 0);
      const best = [el.y * H, H * 0.12, H * 0.24, H * 0.36, H * 0.62].reduce((a, b) => (cover(b) < cover(a) ? b : a));
      return {...el, y: best / H};
    };
    d = {...d, elements: d.elements.map(place)};
    const n = d.elements.length, budget = d.drawSeconds || Math.min(1.8, P.duration * 0.3), each = clamp01(budget * 0.55) * 0.6 + 0.25;
    const step = n > 1 ? Math.max(0.05, (budget - each) / (n - 1)) : 0, heads = [];
    d.elements.forEach((el, index) => {
      const start = 0.06 + index * step, length = el.kind === 'figure' ? each * 1.15 : each;
      const local = clamp01((t - start) / length), idle = Math.max(0, t - start - length);
      if (local <= 0 && el.kind !== 'figure') return;
      if (el.kind === 'figure') { if (local <= 0) return; const at = figure(el, t, local, ink, accent, u); heads.push(at); labelFor(el, at, local, ink, u); }
      else if (el.kind === 'prop') labelFor(el, prop(el, t, local, idle, ink, accent, u), local, ink, u);
      else if (el.kind === 'text') textEl(el, local, ink, accent, u);
      else if (el.kind === 'arrow') {
        const [x1, y1] = [el.from[0] * W, el.from[1] * H], [x2, y2] = [el.to[0] * W, el.to[1] * H], bend = Math.hypot(x2 - x1, y2 - y1) * 0.18;
        const pts = curve(x1, y1, (x1 + x2) / 2 - (y2 - y1) / Math.hypot(x2 - x1, y2 - y1 || 1) * bend, (y1 + y2) / 2 + (x2 - x1) / Math.hypot(x2 - x1 || 1, y2 - y1) * bend * 0.4, x2, y2);
        const color = el.accent ? accent : ink, w = 6 * u;
        stroke(pts, {color, width: w, progress: local, seed: 101 + index});
        if (local >= 1) { const [ax, ay] = pts.at(-2), a = Math.atan2(y2 - ay, x2 - ax); stroke([[x2 - Math.cos(a - 0.5) * 30 * u, y2 - Math.sin(a - 0.5) * 30 * u], [x2, y2], [x2 - Math.cos(a + 0.5) * 30 * u, y2 - Math.sin(a + 0.5) * 30 * u]], {color, width: w, seed: 111 + index}); }
        if (el.label && local >= 1) { const length = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (y2 - y1) / length, ny = -(x2 - x1) / length, side = ny > 0 ? -1 : 1; text(el.label, (x1 + x2) / 2 + nx * side * 46 * u, (y1 + y2) / 2 + ny * side * 46 * u, {size: 40 * u, color, align: Math.abs(nx) > 0.7 ? (nx * side > 0 ? 'left' : 'right') : 'center', baseline: 'middle', heading: true}); }
      } else if (el.kind === 'bubble') {
        const size = 46 * u, lines = wrap(el.text, W * 0.3, size, true).slice(0, 2), widest = Math.max(...lines.map(item => { ctx.font = headingFont(size); return ctx.measureText(item).width; }));
        const bw = widest + 60 * u, bh = lines.length * size * 1.25 + 40 * u, bx = el.x * W - bw / 2, by = el.y * H - bh / 2, color = el.accent ? accent : ink;
        stroke(bumpy(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, el.thought ? 10 : 2, el.thought ? 0.08 : 0.0), {color, width: 5 * u, progress: local, seed: 121 + index, fill: board ? alpha('#000000', 0.25) : alpha('#FFFFFF', 0.85)});
        const target = heads[0];
        if (local >= 1 && target) {
          if (el.thought) [0.35, 0.65].forEach((f, k) => stroke(ring(bx + bw / 2 + (target.x - bx - bw / 2) * f, by + bh + (target.y - by - bh) * f, (10 - k * 4) * u), {color, width: 4 * u, seed: 131 + k}));
          else stroke([[bx + bw / 2 - 18 * u, by + bh - 2], [bx + bw / 2 + (target.x - bx - bw / 2) * 0.45, by + bh + Math.max(30 * u, (target.y - by - bh) * 0.45)], [bx + bw / 2 + 18 * u, by + bh - 2]], {color, width: 5 * u, seed: 141});
        }
        if (local >= 0.6) lines.forEach((item, row) => text(item, bx + bw / 2, by + 20 * u + size * 0.62 + row * size * 1.25, {size, color: board ? '#F1EFE6' : P.palette.ink, align: 'center', baseline: 'middle', heading: true, opacity: clamp01((local - 0.6) * 4)}));
      }
    });
    ctx.restore();
  }
  templates['sketch-scene'] = sketchScene;

  function renderFrame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // A cutaway panel fades in over 0.3 s and out over the last 0.3 s; a drawn scene is a whole shot and cuts.
    const fadeIn = clamp01(t / 0.3), fadeOut = clamp01((P.duration - t) / 0.3);
    ctx.globalAlpha = P.template === 'sketch-scene' ? 1 : Math.min(fadeIn, fadeOut);
    ctx.fillStyle = P.palette.bg; ctx.fillRect(0, 0, W, H);
    if (P.finish === 'hand-drawn') {
      const rand = seeded(hashText(P.template));
      ctx.fillStyle = alpha(P.palette.ink, 0.035);
      for (let k = 0; k < 220; k++) ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3);
    }
    templates[P.template](t, P.data);
    ctx.globalAlpha = 1;
    return true;
  }
  window.MOTION = {setup, renderFrame, templates: Object.keys(templates)};
}());
