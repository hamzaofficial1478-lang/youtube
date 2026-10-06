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

  function renderFrame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // A cutaway panel: fades in over 0.3 s and the whole graphic fades out over the last 0.3 s.
    const fadeIn = clamp01(t / 0.3), fadeOut = clamp01((P.duration - t) / 0.3);
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
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
