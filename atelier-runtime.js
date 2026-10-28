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
    const root = document.querySelector('[data-composition-id]');
    A.clips = [...document.querySelectorAll('[data-start]')].filter(el => el !== root).map(el => {
      const start = Number(el.getAttribute('data-start')) || 0, length = Number(el.getAttribute('data-duration'));
      return {el, start, end: Number.isFinite(length) && length > 0 ? start + length : Infinity};
    });
    return true;
  };
  A.status = () => ({ready: !!A.timeline(), timelineSeconds: A.timeline() ? Math.round(A.timeline().duration() * 1000) / 1000 : null, clips: A.clips.length, errors: A.errors.slice(0, 5)});
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
