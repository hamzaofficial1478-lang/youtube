// P06h - The atelier runtime, loaded into the page before a composition (motion.js loadComposition). It follows
// the HyperFrames clip contract: an element with data-start/data-duration is shown only inside that half-open
// window (a clip that runs to the end also owns the last instant), and the registered paused gsap timeline is
// seeked to the frame's time. Random numbers are seeded, so even a slip in a composition renders the same twice.
(function () {
  'use strict';
  let seed = 7;
  Math.random = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  window.__timelines = {};
  try { gsap.registerPlugin(SplitText, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, CustomEase, TextPlugin, ScrambleTextPlugin); } catch (error) { /* a missing plugin only limits what compositions may use */ }
  gsap.ticker.lagSmoothing(0);
  const A = window.__atelier = {id: null, duration: 0, width: 0, height: 0, clips: [], errors: []};
  window.addEventListener('error', event => { A.errors.push(String(event.message || event.error || 'script error').slice(0, 300)); });
  const shown = (t, start, end, total) => (t >= start - 1e-6 && t < end - 1e-6) || (t >= start - 1e-6 && end >= total - 1e-6);
  A.timeline = () => window.__timelines[A.id] || Object.values(window.__timelines)[0] || null;
  A.init = (id, duration, width, height) => {
    Object.assign(A, {id, duration, width, height});
    defs();
    const root = document.querySelector('[data-composition-id]');
    A.clips = [...document.querySelectorAll('[data-start]')].filter(el => el !== root).map(el => {
      const start = Number(el.getAttribute('data-start')) || 0, length = Number(el.getAttribute('data-duration'));
      return {el, start, end: Number.isFinite(length) && length > 0 ? start + length : Infinity};
    });
    return true;
  };
  A.status = () => ({ready: !!A.timeline(), timelineSeconds: A.timeline() ? Math.round(A.timeline().duration() * 1000) / 1000 : null, clips: A.clips.length, errors: A.errors.slice(0, 5)});

  // ---------------------------------------------------------------- paper collage (0.89)
  // The paper a collage is made of, as SVG filters and fills any shape can use: url(#at-torn) a torn piece (a white
  // fibrous rim along parts of its edge, mottled paper, a soft depth shadow), url(#at-cut) a scissor-cut piece,
  // url(#at-torn-kraft) torn kraft with fibres, url(#at-lift) a piece held above the stack (a wider, farther shadow),
  // url(#at-crayon) waxy crayon grain for small accents; fills url(#at-newsprint) and url(#at-notebook). Seeded noise
  // only, so every frame is the same on every render (claude-drawing-skill papercut, MIT, restated in SVG).
  const NS = 'http://www.w3.org/2000/svg';
  const shadow = (blur, dx, dy, opacity) => `<feGaussianBlur in="fat" stdDeviation="${blur}" result="soft"/><feOffset in="soft" dx="${dx}" dy="${dy}" result="off"/><feFlood flood-color="#000" flood-opacity="${opacity}"/><feComposite in2="off" operator="in" result="shadow"/>`;
  const mottle = (seed, depth) => `<feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="${seed}" result="mn"/><feColorMatrix in="mn" type="matrix" values="${depth} 0 0 0 ${1 - depth * 0.55}  ${depth} 0 0 0 ${1 - depth * 0.55}  ${depth} 0 0 0 ${1 - depth * 0.55}  0 0 0 0 1" result="mott"/>`;
  const piece = (id, {tear, rim, fibre = 0, blur = 5, dx = 5, dy = 7, opacity = 0.3}) => `<filter id="${id}" x="-25%" y="-25%" width="155%" height="165%" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="3" result="n1"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="n1" scale="${tear}" xChannelSelector="R" yChannelSelector="G" result="torn"/>`
    + `<feMorphology in="SourceAlpha" operator="dilate" radius="${rim ? 3 : 1}" result="fat0"/><feDisplacementMap in="fat0" in2="n1" scale="${tear + (rim ? 6 : 0)}" xChannelSelector="G" yChannelSelector="R" result="fat"/>`
    + shadow(blur, dx, dy, opacity)
    + (rim ? `<feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="1" seed="9" result="gn"/><feColorMatrix in="gn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  7 0 0 0 -3.1" result="gate"/><feComposite in="fat" in2="gate" operator="in" result="rimg"/><feFlood flood-color="#F7F1E4"/><feComposite in2="rimg" operator="in" result="rim"/>` : '')
    + mottle(11, fibre ? 0.18 : 0.09)
    + (fibre ? `<feTurbulence type="turbulence" baseFrequency="0.9 0.06" numOctaves="2" seed="21" result="fn"/><feColorMatrix in="fn" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.2  1.2 0 0 0 -0.85" result="fib"/><feComposite in="fib" in2="mott" operator="over" result="mott2"/>` : '')
    + `<feComposite in="torn" in2="${fibre ? 'mott2' : 'mott'}" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="paint"/><feComposite in="paint" in2="torn" operator="in" result="paper"/>`
    + `<feMerge><feMergeNode in="shadow"/>${rim ? '<feMergeNode in="rim"/>' : ''}<feMergeNode in="paper"/></feMerge></filter>`;
  const PAPER = piece('at-torn', {tear: 10, rim: true}) + piece('at-torn-kraft', {tear: 10, rim: true, fibre: 1}) + piece('at-cut', {tear: 1.5, rim: false, blur: 4, dx: 4, dy: 5, opacity: 0.28})
    + piece('at-lift', {tear: 1.5, rim: false, blur: 11, dx: 14, dy: 20, opacity: 0.22})
    + '<filter id="at-crayon" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.4 0.35" numOctaves="2" seed="5" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 2.9" result="wax"/><feComposite in="SourceGraphic" in2="wax" operator="in"/></filter>'
    + '<pattern id="at-newsprint" width="120" height="22" patternUnits="userSpaceOnUse"><rect width="120" height="22" fill="#EBE6DA"/><rect x="2" y="7" width="38" height="5" fill="#8F8B84"/><rect x="45" y="7" width="22" height="5" fill="#A29E96"/><rect x="72" y="7" width="44" height="5" fill="#8F8B84"/><rect x="8" y="17" width="30" height="4" fill="#A29E96"/><rect x="43" y="17" width="50" height="4" fill="#8F8B84"/></pattern>'
    + '<pattern id="at-notebook" width="40" height="36" patternUnits="userSpaceOnUse"><rect width="40" height="36" fill="#FBF8EF"/><rect y="34" width="40" height="2" fill="#B6C9E8"/></pattern>';

  // ---------------------------------------------------------------- pixel art (0.89)
  // Cells on the shot's grid, in its palette: rects, a 3x5 bitmap font, ASCII sprites, ordered (Bayer 4x4) dithers,
  // dithered glows and banded skies (claude-drawing-skill pixelart, MIT; anidoodle pixelArt, Apache-2.0; restated).
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const GLYPHS = {A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101011', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010', ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '%': '101001010100101', '/': '001001010100100', "'": '010010000000000', ' ': '000000000000000'};
  const defs = () => {
    let holder = document.getElementById('at-defs');
    if (!holder) {
      holder = document.createElementNS(NS, 'svg');
      holder.setAttribute('id', 'at-defs'); holder.setAttribute('width', '0'); holder.setAttribute('height', '0'); holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      holder.innerHTML = `<defs>${PAPER}</defs>`;
      (document.body || document.documentElement).appendChild(holder);
    }
    return holder.firstChild;
  };
  A.defs = defs;
  const rectIn = (parent, x, y, w, h, fill) => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', Math.round(x)); r.setAttribute('y', Math.round(y)); r.setAttribute('width', Math.max(1, Math.round(w))); r.setAttribute('height', Math.max(1, Math.round(h))); r.setAttribute('fill', fill); parent.appendChild(r); return r; };
  const group = parent => { const g = document.createElementNS(NS, 'g'); parent.appendChild(g); return g; };
  const hexOf = colour => String(colour).replace('#', '').toUpperCase();
  A.pixel = {
    rect: (parent, x, y, w, h, colour) => rectIn(parent, x, y, w, h, colour),
    // Capitals, digits and a little punctuation; returns the group (animate it, or its rects one by one).
    text(parent, text, x, y, colour, scale = 1, spacing = 1) {
      const g = group(parent); let cx = Math.round(x);
      for (const ch of String(text).toUpperCase()) {
        const bits = GLYPHS[ch] || GLYPHS[' '];
        for (let r = 0; r < 5; r++) { let c = 0; while (c < 3) { if (bits[r * 3 + c] !== '1') { c++; continue; } let run = 1; while (c + run < 3 && bits[r * 3 + c + run] === '1') run++; rectIn(g, cx + c * scale, y + r * scale, run * scale, scale, colour); c += run; } }
        cx += (3 + spacing) * scale;
      }
      return g;
    },
    // rows: strings of the same length; colours: {char: colour}; "." and " " are empty cells.
    sprite(parent, rows, colours, x = 0, y = 0) {
      const g = group(parent);
      rows.forEach((row, r) => { let c = 0; while (c < row.length) { const ch = row[c]; if (ch === '.' || ch === ' ' || !colours[ch]) { c++; continue; } let run = 1; while (c + run < row.length && row[c + run] === ch) run++; rectIn(g, x + c, y + r, run, 1, colours[ch]); c += run; } });
      return g;
    },
    // A 4x4 ordered dither of two colours (level: the share of colour B), as a fill url.
    dither(a, b, level = 0.5) {
      const steps = Math.max(1, Math.min(15, Math.round(level * 16))), id = `at-px-${hexOf(a)}-${hexOf(b)}-${steps}`;
      if (!document.getElementById(id)) {
        const p = document.createElementNS(NS, 'pattern');
        p.setAttribute('id', id); p.setAttribute('width', '4'); p.setAttribute('height', '4'); p.setAttribute('patternUnits', 'userSpaceOnUse');
        rectIn(p, 0, 0, 4, 4, a);
        for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) if (BAYER[yy][xx] < steps) rectIn(p, xx, yy, 1, 1, b);
        defs().appendChild(p);
      }
      return `url(#${id})`;
    },
    // A glow that thins cell by cell (no blend): cells where the falloff beats the dither threshold.
    glow(parent, cx, cy, r, colour, strength = 0.5, squash = 1) {
      const g = group(parent), R = Math.max(1, Math.round(r));
      for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
        const d = Math.hypot(xx, yy / Math.max(0.1, squash)) / R; if (d >= 1) continue;
        const px = Math.round(cx) + xx, py = Math.round(cy) + yy, alpha = (1 - d) ** 1.6 * strength;
        if (alpha > (BAYER[((py % 4) + 4) % 4][((px % 4) + 4) % 4] + 0.5) / 16) rectIn(g, px, py, 1, 1, colour);
      }
      return g;
    },
    // A vertical gradient in steps bands of the two colours' palette mixes is not allowed (closed palette), so the
    // bands alternate the two colours through dithers: top colour, 1/4, 1/2, 3/4, bottom colour.
    band(parent, x, y, w, h, top, bottom, steps = 5) {
      const g = group(parent), n = Math.max(2, Math.min(9, Math.round(steps)));
      for (let k = 0; k < n; k++) {
        const y0 = Math.round(y + h * k / n), y1 = Math.round(y + h * (k + 1) / n), level = k / (n - 1);
        rectIn(g, x, y0, w, y1 - y0, level <= 0.06 ? top : level >= 0.94 ? bottom : A.pixel.dither(top, bottom, level));
      }
      return g;
    },
  };
  // Seek, then wait two animation frames so the page has painted what the timeline set.
  A.seek = t => {
    for (const clip of A.clips) clip.el.style.visibility = shown(t, clip.start, clip.end, A.duration) ? '' : 'hidden';
    const tl = A.timeline();
    if (tl) tl.seek(Math.max(0, Math.min(t, tl.duration())), false);
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
  };
  // Layout findings at the given times: visible text running off the frame, or sitting in the caption band.
  // Share of a screenshot's pixels that the render's black-frame check (ffmpeg blackdetect, pix_th 0.10 on TV
  // range, so full-range luma 25.5 or less) calls black; 0.98 or more makes the picture black.
  A.blackShare = async url => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let black = 0;
    for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] <= 25.5) black++;
    return black / (d.length / 4);
  };
  A.audit = async times => {
    const findings = new Set(), band = A.height * 0.83;
    for (const t of times) {
      await A.seek(t);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement, text = node.textContent.trim();
        if (!text || !el || el.closest('script,style')) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || el.closest('[style*="visibility: hidden"]')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        // Only the part a viewer can see counts: a masked window (a rolling counter's waiting digits) hides the
        // rest. The frame itself is not a mask, so text cut by the frame's edge is still reported.
        let l = box.left, top = box.top, r = box.right, b = box.bottom, alpha = 1;
        const root = el.closest('[data-composition-id]');
        for (let up = el; up && up !== root; up = up.parentElement) {
          const s = getComputedStyle(up), clip = up.getBoundingClientRect();
          alpha *= Number(s.opacity);
          if (s.overflowX !== 'visible') { l = Math.max(l, clip.left); r = Math.min(r, clip.right); }
          if (s.overflowY !== 'visible') { top = Math.max(top, clip.top); b = Math.min(b, clip.bottom); }
        }
        if (alpha < 0.05 || r - l < 1 || b - top < 1) continue;
        const W = A.width, H = A.height, label = text.slice(0, 40);
        const off = l < -4 || top < -4 || r > W + 4 || b > H + 4 || (box.left < l - 4 && l <= 4) || (box.top < top - 4 && top <= 4) || (box.right > r + 4 && r >= W - 4) || (box.bottom > b + 4 && b >= H - 4);
        if (off) findings.add(`"${label}" runs off the frame at ${t.toFixed(1)} s`);
        else if (b > band + 4) findings.add(`"${label}" sits in the caption band (bottom 17%) at ${t.toFixed(1)} s`);
      }
    }
    return [...findings].slice(0, 10);
  };
}());
