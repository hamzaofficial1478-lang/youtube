'use strict';
// 0.67 - The sketch reveal (owner request 2026-10-29: whiteboard-animation-vi draws a picture by hand more accurately
// and more steadily). A painted picture is drawn as a whiteboard artist draws it: its lines first (the main subject,
// then lettering left to right, then the remaining outlines, each region finished before the pen moves on), then its
// colours (the subject first, each colour from the top, brushed in slanted lanes on the shortest route), every pixel
// coloured the moment the brush passes it.
// A port of letuandat131/whiteboard-animation-vi (CC0), pinned c689bf7: handdraw/v181d_plan.py, grid.py,
// grid_stream.py, v181d_cluster.py, v181d_palette.py, v181d_subject_fill.py, v181e_background_fill.py and pixels.py;
// grid_stream.py derives from SRT Whiteboard (MIT, notice in vendor/whiteboard-animation/LICENSE). Changes: plain
// JavaScript on typed arrays; the ISNet subject model is replaced by a border rule (`subjectOf`); k-means is seeded and
// fitted on a sample; the pen position is computed for any moment instead of sampled. Pure: the same picture gives the
// same plan, and the same moment the same frame (no clock, no Math.random). Runs in the drawing page (window.DREVEAL)
// and in Node for the tests.
(function (root) {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const MAX_SIDE = 1280;
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ------------------------------------------------------------ image filters (OpenCV semantics)
  // A copy with an r-pixel reflected border (BORDER_REFLECT_101), so the filters below never test the edges.
  function pad(src, w, h, r, ch) {
    const pw = w + 2 * r, out = new Uint8ClampedArray(pw * (h + 2 * r) * ch), ref = (i, n) => (n === 1 ? 0 : i < 0 ? Math.min(n - 1, -i) : i >= n ? Math.max(0, 2 * n - 2 - i) : i);
    for (let y = -r; y < h + r; y++) for (let x = -r; x < w + r; x++) {
      const s = (ref(y, h) * w + ref(x, w)) * ch, d = ((y + r) * pw + x + r) * ch;
      for (let c = 0; c < ch; c++) out[d + c] = src[s + c];
    }
    return out;
  }
  // cv2.bilateralFilter: a disc of diameter d; colour distance is the sum of the channel differences.
  function bilateral(src, w, h, d, sigmaColor, sigmaSpace, ch = 1) {
    const r = d >> 1, pw = w + 2 * r, P = pad(src, w, h, r, ch), offs = [], wsp = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const q = dx * dx + dy * dy; if (q <= r * r) { offs.push((dy * pw + dx) * ch); wsp.push(Math.exp(-q / (2 * sigmaSpace * sigmaSpace))); } }
    const wc = new Float64Array(256 * ch);
    for (let k = 0; k < wc.length; k++) wc[k] = Math.exp(-k * k / (2 * sigmaColor * sigmaColor));
    const out = new Uint8ClampedArray(w * h * ch), n = wsp.length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c0 = ((y + r) * pw + x + r) * ch;
      let s0 = 0, s1 = 0, s2 = 0, norm = 0;
      for (let k = 0; k < n; k++) {
        const j = c0 + offs[k];
        let diff = Math.abs(P[j] - P[c0]);
        if (ch === 3) diff += Math.abs(P[j + 1] - P[c0 + 1]) + Math.abs(P[j + 2] - P[c0 + 2]);
        const wt = wsp[k] * wc[diff];
        norm += wt; s0 += wt * P[j];
        if (ch === 3) { s1 += wt * P[j + 1]; s2 += wt * P[j + 2]; }
      }
      const o = (y * w + x) * ch;
      out[o] = Math.round(s0 / norm);
      if (ch === 3) { out[o + 1] = Math.round(s1 / norm); out[o + 2] = Math.round(s2 / norm); }
    }
    return out;
  }
  // cv2.createCLAHE(clip, tiles x tiles): clipped tile histograms, interpolated between tile centres.
  function clahe(src, w, h, clip = 2, tiles = 8) {
    const tw = Math.ceil(w / tiles), th = Math.ceil(h / tiles), area = tw * th, limit = Math.max(1, Math.floor(clip * area / 256));
    const luts = [], at = (x, y) => src[Math.max(0, y < h ? y : 2 * h - 2 - y) * w + Math.max(0, x < w ? x : 2 * w - 2 - x)];
    for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
      const hist = new Int32Array(256);
      for (let y = ty * th; y < (ty + 1) * th; y++) for (let x = tx * tw; x < (tx + 1) * tw; x++) hist[at(x, y)]++;
      let excess = 0;
      for (let k = 0; k < 256; k++) if (hist[k] > limit) { excess += hist[k] - limit; hist[k] = limit; }
      const batch = Math.floor(excess / 256);
      let residual = excess - batch * 256;
      for (let k = 0; k < 256; k++) hist[k] += batch;
      for (let k = 0, step = Math.max(Math.floor(256 / Math.max(1, residual)), 1); k < 256 && residual > 0; k += step, residual--) hist[k]++;
      const lut = new Uint8ClampedArray(256);
      for (let k = 0, sum = 0; k < 256; k++) { sum += hist[k]; lut[k] = Math.round(sum * 255 / area); }
      luts.push(lut);
    }
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const fy = y / th - 0.5, y1 = Math.floor(fy), ya = fy - y1, t1 = Math.max(y1, 0), t2 = Math.min(y1 + 1, tiles - 1);
      for (let x = 0; x < w; x++) {
        const fx = x / tw - 0.5, x1 = Math.floor(fx), xa = fx - x1, s1 = Math.max(x1, 0), s2 = Math.min(x1 + 1, tiles - 1), v = src[y * w + x];
        out[y * w + x] = Math.round((luts[t1 * tiles + s1][v] * (1 - xa) + luts[t1 * tiles + s2][v] * xa) * (1 - ya) + (luts[t2 * tiles + s1][v] * (1 - xa) + luts[t2 * tiles + s2][v] * xa) * ya);
      }
    }
    return out;
  }
  // cv2.adaptiveThreshold(GAUSSIAN_C, BINARY, block 15, C): ink where the pixel is C darker than its Gaussian mean.
  const KERNEL = (() => { const sigma = 0.3 * ((15 - 1) * 0.5 - 1) + 0.8, k = []; for (let i = -7; i <= 7; i++) k.push(Math.exp(-i * i / (2 * sigma * sigma))); const sum = k.reduce((a, b) => a + b); return k.map(v => v / sum); })();
  function adaptive(src, w, h, C) {
    const tmp = new Float32Array(w * h), mean = new Float32Array(w * h), ink = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -7; k <= 7; k++) s += KERNEL[k + 7] * src[y * w + clamp(x + k, 0, w - 1)]; tmp[y * w + x] = s; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -7; k <= 7; k++) s += KERNEL[k + 7] * tmp[clamp(y + k, 0, h - 1) * w + x]; mean[y * w + x] = Math.round(s); }
    const delta = Math.ceil(C);
    for (let i = 0; i < w * h; i++) ink[i] = src[i] - mean[i] <= -delta ? 1 : 0;
    return ink;
  }
  // cv2.resize INTER_AREA (fractional box average) for the coarse line checks.
  function resizeArea(src, w, h, nw, nh) {
    const out = new Uint8ClampedArray(nw * nh), sx = w / nw, sy = h / nh;
    for (let y = 0; y < nh; y++) {
      const y0 = y * sy, y1 = y0 + sy;
      for (let x = 0; x < nw; x++) {
        const x0 = x * sx, x1 = x0 + sx;
        let sum = 0, area = 0;
        for (let yy = Math.floor(y0); yy < Math.min(h, Math.ceil(y1)); yy++) {
          const fy = Math.min(yy + 1, y1) - Math.max(yy, y0);
          for (let xx = Math.floor(x0); xx < Math.min(w, Math.ceil(x1)); xx++) { const f = fy * (Math.min(xx + 1, x1) - Math.max(xx, x0)); sum += f * src[yy * w + xx]; area += f; }
        }
        out[y * nw + x] = Math.round(sum / area);
      }
    }
    return out;
  }
  function dilate(mask, w, h, k) {
    const r = k >> 1, tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const xx = x + d; if (xx >= 0 && xx < w) v = mask[y * w + xx]; } tmp[y * w + x] = v; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const yy = y + d; if (yy >= 0 && yy < h) v = tmp[yy * w + x]; } out[y * w + x] = v; }
    return out;
  }
  // 8-connected components of equal values (value < 0 is background), numbered in scan order like OpenCV.
  function label(values, w, h) {
    const labels = new Int32Array(w * h), stack = new Int32Array(w * h), areas = [0];
    let count = 0;
    for (let start = 0; start < w * h; start++) {
      if (values[start] < 0 || labels[start]) continue;
      const v = values[start];
      labels[start] = ++count;
      let top = 0, area = 0;
      stack[top++] = start;
      while (top) {
        const i = stack[--top], x = i % w, y = (i - x) / w;
        area++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy, j = yy * w + xx;
          if ((dx || dy) && xx >= 0 && xx < w && yy >= 0 && yy < h && !labels[j] && values[j] === v) { labels[j] = count; stack[top++] = j; }
        }
      }
      areas.push(area);
    }
    return {labels, count, areas};
  }
  const maskValues = mask => { const out = new Int32Array(mask.length); for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 1 : -1; return out; };

  // ------------------------------------------------------------ the line map (build_v181d_ink_map)
  // Edge-preserving smoothing and local contrast, an adaptive threshold, kept only where coarser scales also see a
  // line, and specks too small and too short removed.
  function inkMap(gray, w, h) {
    let g = bilateral(gray, w, h, 7, 12, 3);
    g = clahe(g, w, h, 2, 8);
    g = bilateral(g, w, h, 5, 12, 2);
    const ink = adaptive(g, w, h, 10), support = new Uint8Array(w * h);
    for (const [factor, C] of [[0.5, 5], [1 / 3, 4]]) {
      const rw = Math.max(1, Math.round(w * factor)), rh = Math.max(1, Math.round(h * factor)), coarse = adaptive(resizeArea(g, w, h, rw, rh), rw, rh, C), restored = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) restored[y * w + x] = coarse[Math.min(rh - 1, Math.floor(y * rh / h)) * rw + Math.min(rw - 1, Math.floor(x * rw / w))];
      const grown = dilate(restored, w, h, 3);
      for (let i = 0; i < w * h; i++) support[i] |= grown[i];
    }
    const both = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) both[i] = ink[i] & support[i];
    const {labels, count} = label(maskValues(both), w, h), minX = new Int32Array(count + 1).fill(w), maxX = new Int32Array(count + 1).fill(-1), minY = new Int32Array(count + 1).fill(h), maxY = new Int32Array(count + 1).fill(-1), area = new Int32Array(count + 1);
    for (let i = 0; i < w * h; i++) { const l = labels[i]; if (!l) continue; const x = i % w, y = (i - x) / w; area[l]++; if (x < minX[l]) minX[l] = x; if (x > maxX[l]) maxX[l] = x; if (y < minY[l]) minY[l] = y; if (y > maxY[l]) maxY[l] = y; }
    const s = h / 720, minArea = Math.max(2, Math.round(4 * s * s)), minSpan = Math.max(3, Math.round(8 * s)), out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const l = labels[i]; if (l && (area[l] >= minArea || Math.max(maxX[l] - minX[l] + 1, maxY[l] - minY[l] + 1) >= minSpan)) out[i] = 1; }
    return out;
  }

  // ------------------------------------------------------------ the drawing order of the lines (grid_stream.py)
  // Cells are [row, col]; the grid marks every cell that holds ink.
  const boundsOf = cells => { let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity; for (const [r, c] of cells) { if (r < r0) r0 = r; if (c < c0) c0 = c; if (r > r1) r1 = r; if (c > c1) c1 = c; } return [r0, c0, r1, c1]; };
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  // A baseline or arrow can join separate objects into one component: split it at the broadest thin valley.
  function splitBridge(cells, minSide = 20) {
    if (cells.length < minSide * 2) return [cells];
    const [r0, c0, r1, c1] = boundsOf(cells), height = r1 - r0 + 1, width = c1 - c0 + 1;
    if (width < 16 || height < 10) return [cells];
    const counts = new Map();
    for (let c = c0; c <= c1; c++) counts.set(c, 0);
    for (const [, c] of cells) counts.set(c, counts.get(c) + 1);
    const limit = Math.max(3, Math.ceil(height * 0.3)), guard = 4, valleys = [];
    let start = null;
    for (let c = c0; c <= c1 + 1; c++) {
      const low = c <= c1 && counts.get(c) <= limit;
      if (low && start === null) start = c;
      else if (!low && start !== null) { const end = c - 1; if (end - start + 1 >= 2 && start > c0 + guard && end < c1 - guard) valleys.push([start, end]); start = null; }
    }
    if (!valleys.length) return [cells];
    const [vs, ve] = valleys.reduce((best, band) => (band[1] - band[0] > best[1] - best[0] || (band[1] - band[0] === best[1] - best[0] && band[0] < best[0]) ? band : best));
    const cut = Math.floor((vs + ve) / 2), left = cells.filter(([, c]) => c <= cut), right = cells.filter(([, c]) => c > cut);
    if (left.length < minSide || right.length < minSide) return [cells];
    return [...splitBridge(left, minSide), ...splitBridge(right, minSide)];
  }
  // Fragments of a few cells join the nearest big component, so a word is never left half drawn for a speck.
  function mergeSmall(components, threshold) {
    const big = components.filter(c => c.length > threshold), small = components.filter(c => c.length <= threshold);
    if (!small.length || !big.length) return components;
    const centroid = cells => [cells.reduce((s, c) => s + c[0], 0) / cells.length, cells.reduce((s, c) => s + c[1], 0) / cells.length];
    const centres = big.map(centroid), merged = big.map(cells => [...cells]);
    for (const cells of small) {
      const at = centroid(cells);
      let best = 0;
      centres.forEach((c, i) => { if (d2(c, at) < d2(centres[best], at)) best = i; });
      merged[best].push(...cells);
    }
    return merged;
  }
  // The largest region is the subject (drawn first), wide dense rows are lettering, the rest are outlines.
  function classify(active, rows, cols) {
    const {labels, count} = label(maskValues(active), cols, rows), byLabel = Array.from({length: count + 1}, () => []);
    for (let i = 0; i < rows * cols; i++) if (labels[i]) byLabel[labels[i]].push([Math.floor(i / cols), i % cols]);
    let components = byLabel.slice(1).filter(c => c.length).flatMap(c => splitBridge(c));
    if (!components.length) return [];
    const total = components.reduce((s, c) => s + c.length, 0);
    components = mergeSmall(components, Math.max(3, Math.floor(total * 0.005)));
    let subject = 0;
    components.forEach((c, i) => { if (c.length > components[subject].length) subject = i; });
    const groups = components.map((cells, i) => {
      const [r0, c0, r1, c1] = boundsOf(cells), height = r1 - r0 + 1, width = c1 - c0 + 1, density = cells.length / (height * width);
      const [kind, rank] = i === subject ? ['subject', 0] : height >= 2 && width / height >= 2.2 && density >= 0.5 ? ['text', 1] : ['contour', 2];
      return {kind, cells, key: [rank, r0, c0], i};
    });
    groups.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.i - b.i);
    return groups;
  }
  // Overlapping boxes (a label, its letters and its arrow) are one region, drawn in one go.
  function groupAdjacent(groups) {
    const touch = (a, b) => !(a[3] + 2 < b[1] || b[3] + 2 < a[1] || a[2] + 2 < b[0] || b[2] + 2 < a[0]);
    const grow = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
    const regions = [], boxes = [];
    for (const group of groups) {
      const box = boundsOf(group.cells), touching = boxes.map((b, i) => (touch(box, b) ? i : -1)).filter(i => i >= 0);
      if (!touching.length) { regions.push([group]); boxes.push(box); continue; }
      const target = touching[0];
      regions[target].push(group);
      boxes[target] = grow(boxes[target], box);
      for (const index of touching.slice(1).reverse()) { regions[target].push(...regions.splice(index, 1)[0]); boxes[target] = grow(boxes[target], boxes.splice(index, 1)[0]); }
    }
    return regions;
  }
  // Outlines follow the ink: start where it is densest, keep going where most ink is left with the least turn, and
  // jump to the nearest cell only when the line ends.
  function gradientWalk(cells, cols) {
    const key = (r, c) => r * (cols + 2) + c, set = new Set(cells.map(([r, c]) => key(r, c))), visited = new Set();
    let seed = cells[0], best = -1;
    for (const [r, c] of cells) {
      let score = 0;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (set.has(key(r + dr, c + dc))) score++;
      if (score > best) { best = score; seed = [r, c]; }
    }
    const path = [seed];
    visited.add(key(...seed));
    let current = seed, prev = [0, 0];
    while (visited.size < cells.length) {
      let next = null, nextKey = null;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = current[0] + dr, c = current[1] + dc, k = key(r, c);
        if (!(dr || dc) || !set.has(k) || visited.has(k)) continue;
        let local = 0;
        for (let er = -1; er <= 1; er++) for (let ec = -1; ec <= 1; ec++) { const kk = key(r + er, c + ec); if (set.has(kk) && !visited.has(kk)) local++; }
        const turn = (dr - prev[0]) ** 2 + (dc - prev[1]) ** 2, cost = [-local, turn, r, c];
        if (!nextKey || cost[0] < nextKey[0] || (cost[0] === nextKey[0] && (cost[1] < nextKey[1] || (cost[1] === nextKey[1] && (cost[2] < nextKey[2] || (cost[2] === nextKey[2] && cost[3] < nextKey[3])))))) { next = [r, c]; nextKey = cost; }
      }
      if (!next) {
        let bestD = Infinity;
        for (const cell of cells) {
          if (visited.has(key(...cell))) continue;
          const d = d2(cell, current);
          if (d < bestD || (d === bestD && (cell[0] < next[0] || (cell[0] === next[0] && cell[1] < next[1])))) { bestD = d; next = cell; }
        }
      }
      prev = [next[0] - current[0], next[1] - current[1]];
      path.push(next);
      visited.add(key(...next));
      current = next;
    }
    return path;
  }
  function nearestOrder(cells, seed) {
    const remaining = [...cells], ordered = [];
    let current = remaining.includes(seed) ? seed : remaining[0];
    while (remaining.length) {
      ordered.push(current);
      remaining.splice(remaining.indexOf(current), 1);
      if (!remaining.length) break;
      const last = ordered.at(-1);
      current = remaining.reduce((a, b) => (d2(b, last) < d2(a, last) ? b : a));
    }
    return ordered;
  }
  // Lettering is written: bands four cells wide, left to right, each followed along its own ink.
  function textOrder(cells, segment = 4) {
    const left = Math.min(...cells.map(c => c[1])), buckets = new Map();
    for (const cell of cells) { const k = Math.floor((cell[1] - left) / segment); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(cell); }
    const ordered = [];
    let tail = null;
    for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
      const seg = buckets.get(k), seed = tail ? seg.reduce((a, b) => (d2(b, tail) < d2(a, tail) ? b : a)) : seg.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a));
      const order = nearestOrder(seg, seed);
      ordered.push(...order);
      tail = order.at(-1);
    }
    return ordered;
  }
  // Paths joined nearest exit to nearest entry, a path turned round when its far end is nearer.
  function chain(paths, bothEnds = true) {
    const remaining = paths.filter(p => p.length), ordered = [];
    let tail = null;
    while (remaining.length) {
      let pick = 0;
      // Inside a region either end may be the entry; between regions only a stream's start (_chain_region_paths vs cluster_ink_streams).
      const entry = path => (bothEnds ? Math.min(d2(path[0], tail), d2(path.at(-1), tail)) : d2(path[0], tail));
      if (tail) remaining.forEach((path, i) => { if (entry(path) < entry(remaining[pick])) pick = i; });
      let path = remaining.splice(pick, 1)[0];
      if (tail && path.length > 1 && d2(path.at(-1), tail) < d2(path[0], tail)) path = [...path].reverse();
      ordered.push(path);
      tail = path.at(-1);
    }
    return ordered;
  }
  function lineOrder(active, rows, cols) {
    if (!active.some(Boolean)) return [];
    const regions = groupAdjacent(classify(active, rows, cols));
    const streams = regions.map(region => chain(region.map(g => (g.kind === 'text' ? textOrder(g.cells) : gradientWalk(g.cells, cols)))).flat());
    return chain(streams.filter(s => s.length), false).flat();
  }

  // ------------------------------------------------------------ colour (v181d_cluster.py, v181d_palette.py)
  // sRGB to OpenCV's 8-bit Lab (L scaled to 0-255, a and b offset by 128).
  function toLab(rgb, n) {
    const lin = new Float64Array(256);
    for (let k = 0; k < 256; k++) { const c = k / 255; lin[k] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116), out = new Uint8ClampedArray(n * 3);
    for (let i = 0; i < n; i++) {
      const r = lin[rgb[i * 3]], g = lin[rgb[i * 3 + 1]], b = lin[rgb[i * 3 + 2]];
      const X = (0.412453 * r + 0.357580 * g + 0.180423 * b) / 0.950456, Y = 0.212671 * r + 0.715160 * g + 0.072169 * b, Z = (0.019334 * r + 0.119193 * g + 0.950227 * b) / 1.088754;
      const L = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
      out[i * 3] = Math.round(L * 255 / 100); out[i * 3 + 1] = Math.round(500 * (f(X) - f(Y)) + 128); out[i * 3 + 2] = Math.round(200 * (f(Y) - f(Z)) + 128);
    }
    return out;
  }
  // Seeded k-means++ (three candidates per centre, the best of three attempts), like cv2.kmeans with PP centres.
  function kmeans(points, k, {seed = 42, iterations = 10, eps = 1, attempts = 3} = {}) {
    const n = points.length / 3, random = rng(seed), dist = (i, c, C) => (points[i * 3] - C[c * 3]) ** 2 + (points[i * 3 + 1] - C[c * 3 + 1]) ** 2 + (points[i * 3 + 2] - C[c * 3 + 2]) ** 2;
    let best = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const C = new Float64Array(k * 3), near = new Float64Array(n).fill(Infinity), labels = new Int32Array(n);
      const put = (c, i) => { C[c * 3] = points[i * 3]; C[c * 3 + 1] = points[i * 3 + 1]; C[c * 3 + 2] = points[i * 3 + 2]; };
      put(0, Math.floor(random() * n));
      for (let c = 1; c < k; c++) {
        let total = 0;
        for (let i = 0; i < n; i++) { near[i] = Math.min(near[i], dist(i, c - 1, C)); total += near[i]; }
        let pick = 0, potential = Infinity;
        for (let trial = 0; trial < 3; trial++) {
          let target = random() * total, i = 0;
          while (i < n - 1 && (target -= near[i]) > 0) i++;
          let sum = 0;
          for (let j = 0; j < n; j++) sum += Math.min(near[j], (points[j * 3] - points[i * 3]) ** 2 + (points[j * 3 + 1] - points[i * 3 + 1]) ** 2 + (points[j * 3 + 2] - points[i * 3 + 2]) ** 2);
          if (sum < potential) { potential = sum; pick = i; }
        }
        put(c, pick);
      }
      for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < n; i++) { let bc = 0, bd = Infinity; for (let c = 0; c < k; c++) { const d = dist(i, c, C); if (d < bd) { bd = d; bc = c; } } labels[i] = bc; }
        const S = new Float64Array(k * 3), N = new Int32Array(k);
        for (let i = 0; i < n; i++) { const c = labels[i]; N[c]++; S[c * 3] += points[i * 3]; S[c * 3 + 1] += points[i * 3 + 1]; S[c * 3 + 2] += points[i * 3 + 2]; }
        let move = 0;
        for (let c = 0; c < k; c++) {
          if (!N[c]) { let far = 0, fd = -1; for (let i = 0; i < n; i++) { const d = dist(i, labels[i], C); if (d > fd) { fd = d; far = i; } } put(c, far); continue; }
          const nc = [S[c * 3] / N[c], S[c * 3 + 1] / N[c], S[c * 3 + 2] / N[c]];
          move = Math.max(move, (nc[0] - C[c * 3]) ** 2 + (nc[1] - C[c * 3 + 1]) ** 2 + (nc[2] - C[c * 3 + 2]) ** 2);
          C[c * 3] = nc[0]; C[c * 3 + 1] = nc[1]; C[c * 3 + 2] = nc[2];
        }
        if (move <= eps) break;
      }
      let score = 0;
      for (let i = 0; i < n; i++) { let bd = Infinity; for (let c = 0; c < k; c++) bd = Math.min(bd, dist(i, c, C)); score += bd; }
      if (!best || score < best.score) best = {score, C};
    }
    return best.C;
  }
  const nearestCentre = (C, k, a, b, c) => { let best = 0, bd = Infinity; for (let j = 0; j < k; j++) { const d = (a - C[j * 3]) ** 2 + (b - C[j * 3 + 1]) ** 2 + (c - C[j * 3 + 2]) ** 2; if (d < bd) { bd = d; best = j; } } return best; };
  // Colour regions bounded by the lines (_region_ids), then up to eight palette colours over the regions' mean
  // colours, weighted by area (_palette_regions). Returns the raw region ids, the palette (1-8) and its colours.
  function palette(rgb, ink, visible, w, h, seed) {
    const n = w * h, lab = toLab(bilateral(rgb, w, h, 9, 75, 75, 3), n), shown = [];
    for (let i = 0; i < n; i++) if (visible[i]) shown.push(i);
    const distinct = new Set();
    for (let k = 0; k < shown.length && distinct.size < 16; k++) { const i = shown[k]; distinct.add((lab[i * 3] << 16) | (lab[i * 3 + 1] << 8) | lab[i * 3 + 2]); }
    const k = distinct.size, colors = new Int32Array(n);
    if (k > 1) {
      // shortcut: fitted on at most 40,000 evenly spaced pixels, then every pixel takes its nearest centre.
      const step = Math.max(1, Math.floor(shown.length / 40000)), sample = [];
      for (let q = 0; q < shown.length; q += step) { const i = shown[q]; sample.push(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]); }
      const C = kmeans(Float64Array.from(sample), k, {seed});
      for (const i of shown) colors[i] = nearestCentre(C, k, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
    }
    const barrier = dilate(ink, w, h, 3);
    for (let i = 0; i < n; i++) if (barrier[i] || !visible[i]) colors[i] = -1;
    const {labels, count, areas} = label(colors, w, h), lookup = new Int32Array(count + 1);
    let next = 0;
    for (let l = 1; l <= count; l++) if (areas[l] >= 80) lookup[l] = ++next;
    let ids = new Int32Array(n);
    for (let i = 0; i < n; i++) ids[i] = lookup[labels[i]];
    if (!next) ids.fill(1);
    else ids = fillNearest(ids, w, h);
    for (let i = 0; i < n; i++) if (!visible[i]) ids[i] = 0;
    // The palette: region means, clustered in Lab into at most eight colours.
    const regions = ids.reduce((m, v) => Math.max(m, v), 0), sum = new Float64Array((regions + 1) * 3), area = new Float64Array(regions + 1);
    for (const i of shown) { const r = ids[i]; area[r]++; sum[r * 3] += rgb[i * 3]; sum[r * 3 + 1] += rgb[i * 3 + 1]; sum[r * 3 + 2] += rgb[i * 3 + 2]; }
    const active = [];
    for (let r = 1; r <= regions; r++) if (area[r]) active.push(r);
    const means = Uint8ClampedArray.from(active.flatMap(r => [sum[r * 3] / area[r], sum[r * 3 + 1] / area[r], sum[r * 3 + 2] / area[r]]).map(Math.round));
    const meanLab = toLab(means, active.length), uniques = new Set(active.map((r, j) => (meanLab[j * 3] << 16) | (meanLab[j * 3 + 1] << 8) | meanLab[j * 3 + 2]));
    const count8 = Math.min(8, uniques.size), assign = new Int32Array(regions + 1);
    if (count8 > 1) {
      const total = active.reduce((s, r) => s + area[r], 0), samples = [];
      active.forEach((r, j) => { for (let q = Math.max(1, Math.round(area[r] / total * 2048)); q > 0; q--) samples.push(meanLab[j * 3], meanLab[j * 3 + 1], meanLab[j * 3 + 2]); });
      const C = kmeans(Float64Array.from(samples), count8, {seed, iterations: 20, eps: 0.5});
      active.forEach((r, j) => { assign[r] = nearestCentre(C, count8, meanLab[j * 3], meanLab[j * 3 + 1], meanLab[j * 3 + 2]); });
    }
    const pal = new Int32Array(n).fill(-1), colourSum = new Float64Array(9 * 3), colourArea = new Float64Array(9);
    for (const i of shown) { const p = assign[ids[i]] + 1; pal[i] = p; colourArea[p]++; colourSum[p * 3] += rgb[i * 3]; colourSum[p * 3 + 1] += rgb[i * 3 + 1]; colourSum[p * 3 + 2] += rgb[i * 3 + 2]; }
    const hex = v => Math.round(v).toString(16).padStart(2, '0'), colours = [null];
    for (let p = 1; p <= 8; p++) colours.push(colourArea[p] ? `#${hex(colourSum[p * 3] / colourArea[p])}${hex(colourSum[p * 3 + 1] / colourArea[p])}${hex(colourSum[p * 3 + 2] / colourArea[p])}`.toUpperCase() : null);
    return {ids, palette: pal, colours};
  }
  // Pixels on a line take the region nearest to them (a breadth-first stand-in for the exact distance transform).
  function fillNearest(ids, w, h) {
    const out = Int32Array.from(ids), queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    for (let i = 0; i < w * h; i++) if (out[i]) queue[tail++] = i;
    while (head < tail) {
      const i = queue[head++], x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && !out[j]) { out[j] = out[i]; queue[tail++] = j; }
      }
    }
    return out;
  }
  // The subject without a segmentation model: palette patches that touch the border and are large are the
  // background; the rest is the subject. A picture that is nearly all one or the other has no subject phase.
  function subjectOf(pal, w, h) {
    const {labels, count, areas} = label(pal, w, h), background = new Uint8Array(count + 1), n = w * h;
    const edge = i => { const l = labels[i]; if (l && areas[l] >= 0.02 * n) background[l] = 1; };
    for (let x = 0; x < w; x++) { edge(x); edge((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { edge(y * w); edge(y * w + w - 1); }
    const subject = new Uint8Array(n);
    let share = 0, shown = 0;
    for (let i = 0; i < n; i++) if (pal[i] > 0) { shown++; if (!background[labels[i]]) { subject[i] = 1; share++; } }
    return share < 0.03 * shown || share > 0.85 * shown ? null : subject;
  }

  // ------------------------------------------------------------ the colour route (v181d_subject_fill.py)
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // ends: [[begin, end], ...]; a route is [[stroke, reversed], ...]; a stroke reversed starts at its end.
  const head = (ends, [i, r]) => ends[i][r], tailOf = (ends, [i, r]) => ends[i][1 - r];
  function greedyRoute(ends, tip) {
    const left = new Set(ends.map((e, i) => i)), route = [];
    while (left.size) {
      let best = null, bestScore = Infinity;
      for (const i of left) for (let r = 0; r < 2; r++) { const p = ends[i][r], score = dist(p, tip) + 0.08 * Math.max(tip[1] - p[1], 0); if (score < bestScore) { bestScore = score; best = [i, r]; } }
      left.delete(best[0]); route.push(best); tip = tailOf(ends, best);
    }
    return route;
  }
  // The best direction for every stroke of an order, by dynamic programming over the two ways round.
  function orient(ends, order, tip, exitCost = null) {
    let costs = [dist(ends[order[0]][0], tip), dist(ends[order[0]][1], tip)];
    const parents = [];
    for (let k = 1; k < order.length; k++) {
      const prev = order[k - 1], cur = order[k], next = [Infinity, Infinity], parent = [0, 0];
      for (let r = 0; r < 2; r++) for (let pr = 0; pr < 2; pr++) { const c = costs[pr] + dist(ends[prev][1 - pr], ends[cur][r]); if (c < next[r]) { next[r] = c; parent[r] = pr; } }
      parents.push(parent); costs = next;
    }
    if (exitCost) costs = costs.map((c, r) => c + exitCost[order.at(-1)][1 - r]);
    let r = costs[0] <= costs[1] ? 0 : 1;
    const total = costs[r], route = [[order.at(-1), r]];
    for (let k = order.length - 2; k >= 0; k--) { r = parents[k][r]; route.push([order[k], r]); }
    return {route: route.reverse(), cost: total};
  }
  // Greedy, and with three-choice lookahead; then oriented and improved by reversing short blocks (2-opt).
  function route(ends, tip, exits = null) {
    const n = ends.length;
    if (!n) return [];
    const exitCost = ends.map(pair => pair.map(p => (exits?.length ? Math.min(...exits.map(e => dist(p, e))) : 0)));
    const orders = [];
    for (const lookahead of [false, true]) {
      const left = new Set(ends.map((e, i) => i)), order = [];
      let at = tip;
      while (left.size) {
        const scored = new Map();
        let pick = null;
        for (const i of left) {
          const pair = [0, 1].map(r => { const p = ends[i][r], cost = dist(p, at); return {i, r, cost, score: cost + 0.08 * Math.max(at[1] - p[1], 0)}; });
          scored.set(i, pair);
          for (const item of pair) if (!pick || item.score < pick.score) pick = item;
        }
        if (lookahead && left.size > 1) {
          const byStroke = [...left].map(i => ({i, s: Math.min(scored.get(i)[0].score, scored.get(i)[1].score)})).sort((a, b) => a.s - b.s || a.i - b.i).slice(0, 3);
          let bestChoice = null;
          for (const {i: first} of byStroke) for (let dir = 0; dir < 2; dir++) {
            const out = ends[first][1 - dir], rest = [...left].filter(j => j !== first);
            const nextCost = rest.map(j => [dist(out, ends[j][0]), dist(out, ends[j][1])]);
            const nearby = rest.map((j, q) => ({j, q, m: Math.min(...nextCost[q])})).sort((a, b) => a.m - b.m || a.j - b.j).slice(0, 3);
            let bestTail = Infinity;
            for (const {j: second, q} of nearby) for (let sd = 0; sd < 2; sd++) {
              const out2 = ends[second][1 - sd];
              const tailCost = rest.length > 1 ? Math.min(...rest.filter(j => j !== second).flatMap(j => [dist(out2, ends[j][0]), dist(out2, ends[j][1])])) : exitCost[second][1 - sd];
              bestTail = Math.min(bestTail, nextCost[q][sd] + tailCost);
            }
            const own = scored.get(first)[dir], choice = [own.cost + bestTail, own.score, first, dir];
            if (!bestChoice || choice[0] < bestChoice[0] || (choice[0] === bestChoice[0] && (choice[1] < bestChoice[1] || (choice[1] === bestChoice[1] && (choice[2] < bestChoice[2] || (choice[2] === bestChoice[2] && choice[3] < bestChoice[3])))))) bestChoice = choice;
          }
          pick = {i: bestChoice[2], r: bestChoice[3]};
        }
        order.push(pick.i); left.delete(pick.i); at = ends[pick.i][1 - pick.r];
      }
      orders.push(orient(ends, order, tip, exitCost));
    }
    let {route: best} = orders.reduce((a, b) => (b.cost < a.cost ? b : a));
    for (let pass = 0; pass < 2; pass++) {
      let gain = 0, change = null;
      for (let left = 0; left < n; left++) {
        const before = left ? tailOf(ends, best[left - 1]) : tip, first = best[left];
        for (let right = left + 1; right < Math.min(n, left + 13); right++) {
          const last = best[right];
          let old = dist(before, head(ends, first)), now = dist(before, tailOf(ends, last));
          if (right + 1 < n) { old += dist(tailOf(ends, last), head(ends, best[right + 1])); now += dist(head(ends, first), head(ends, best[right + 1])); }
          else { old += exitCost[last[0]][1 - last[1]]; now += exitCost[first[0]][first[1]]; }
          if (old - now > gain + 1e-9) { gain = old - now; change = [left, right]; }
        }
      }
      if (!change) break;
      const [l, r] = change;
      best.splice(l, r - l + 1, ...best.slice(l, r + 1).reverse().map(([i, rev]) => [i, 1 - rev]));
      best = orient(ends, best.map(([i]) => i), tip, exitCost).route;
    }
    return best;
  }
  // Across the colours: orient again and reverse short blocks inside one colour only (_compact_route).
  function compactRoute(ends, tip, boundaries) {
    const n = ends.length;
    if (!n) return [];
    let order = ends.map((e, i) => i), best = orient(ends, order, tip).route;
    for (let pass = 0; pass < 12; pass++) {
      let gain = 0, change = null;
      for (const [low, high] of boundaries) for (let left = low; left < high; left++) {
        const first = best[left], entering = p => (left ? dist(tailOf(ends, best[left - 1]), p) : dist(tip, p));
        for (let right = left + 1; right < Math.min(high, left + 25); right++) {
          const last = best[right];
          let old = entering(head(ends, first)), now = entering(tailOf(ends, last));
          if (right + 1 < n) { old += dist(tailOf(ends, last), head(ends, best[right + 1])); now += dist(head(ends, first), head(ends, best[right + 1])); }
          if (old - now > gain + 1e-9) { gain = old - now; change = [left, right]; }
        }
      }
      if (!change) break;
      order = best.map(([i]) => i);
      order.splice(change[0], change[1] - change[0] + 1, ...order.slice(change[0], change[1] + 1).reverse());
      best = orient(ends, order, tip).route;
    }
    return best;
  }
  // Short neighbouring spans that fit one brush corridor become one stroke.
  function mergeShort(pending, U, V, bw, cos, sin) {
    const active = [...pending];
    for (let i = 0; i < active.length; i++) {
      if (!active[i] || active[i].v1 - active[i].v0 > bw * 0.65) continue;
      let {sel, begin, end, v0, v1} = active[i];
      for (let j = i + 1; j < active.length; j++) {
        const item = active[j];
        if (!item || item.v1 - item.v0 > bw * 0.65) continue;
        const low = Math.min(v0, item.v0), high = Math.max(v1, item.v1), gap = Math.max(v0 - item.v1, item.v0 - v1, 0);
        const endGap = Math.min(dist(begin, item.begin), dist(begin, item.end), dist(end, item.begin), dist(end, item.end));
        if (gap > bw * 0.75 || high - low > bw * 1.5 || endGap > bw) continue;
        const combined = Int32Array.from([...sel, ...item.sel]);
        let lu = Infinity, hu = -Infinity;
        for (const p of combined) { if (U[p] < lu) lu = U[p]; if (U[p] > hu) hu = U[p]; }
        if (hu - lu > bw) continue;
        const lane = (lu + hu) / 2;
        begin = [lane * cos - low * sin, lane * sin + low * cos]; end = [lane * cos - high * sin, lane * sin + high * cos];
        sel = combined; v0 = low; v1 = high;
        active[i] = {sel, begin, end, v0, v1}; active[j] = null;
        if (v1 - v0 > bw * 0.65) break;
      }
    }
    return active.filter(Boolean);
  }
  // The colour plan: for each phase (subject, then the rest) each palette colour from the top, swept in slanted lanes;
  // the route with the least travel wins; times weigh travel (1.5 times faster than colouring) against stroke length.
  function fillPlan(pal, colours, subject, w, h, tip, {quick = false, ids = null} = {}) {
    const n = w * h, bw = Math.max(24, Math.min(92, Math.min(w, h) * 0.12)), cos = Math.cos(12 * Math.PI / 180), sin = Math.sin(12 * Math.PI / 180);
    const groups = [], phases = subject ? [1, 0] : [null], U = new Float64Array(n), V = new Float64Array(n);
    for (const phase of phases) {
      const byColour = new Map();
      for (let i = 0; i < n; i++) if (pal[i] > 0 && (phase === null || subject[i] === phase)) { const c = pal[i]; if (!byColour.has(c)) byColour.set(c, []); byColour.get(c).push(i); }
      if (!byColour.size) continue;
      const pct = list => { const f = 0.05 * (list.length - 1), lo = Math.floor(f), y = i => Math.floor(list[i] / w); return y(lo) + (f - lo) * (y(Math.ceil(f)) - y(lo)); };
      const order = [...byColour.keys()].sort((a, b) => pct(byColour.get(a)) - pct(byColour.get(b)) || a - b);
      for (const colour of order) {
        const pixels = byColour.get(colour);
        let umin = Infinity;
        for (const p of pixels) { const x = p % w, y = (p - x) / w; U[p] = x * cos + y * sin; V[p] = -x * sin + y * cos; if (U[p] < umin) umin = U[p]; }
        const lanes = new Map();
        for (const p of pixels) { const l = Math.floor((U[p] - umin) / bw); if (!lanes.has(l)) lanes.set(l, []); lanes.get(l).push(p); }
        let pending = [];
        for (const l of [...lanes.keys()].sort((a, b) => a - b)) {
          const sorted = lanes.get(l).slice().sort((a, b) => V[a] - V[b] || a - b);
          let start = 0;
          for (let k = 1; k <= sorted.length; k++) {
            if (k < sorted.length && V[sorted[k]] - V[sorted[k - 1]] <= bw * 0.75) continue;
            const sel = Int32Array.from(sorted.slice(start, k));
            let lu = Infinity, hu = -Infinity;
            for (const p of sel) { if (U[p] < lu) lu = U[p]; if (U[p] > hu) hu = U[p]; }
            const lane = (lu + hu) / 2, v0 = V[sel[0]], v1 = V[sel[sel.length - 1]];
            pending.push({sel, begin: [lane * cos - v0 * sin, lane * sin + v0 * cos], end: [lane * cos - v1 * sin, lane * sin + v1 * cos], v0, v1});
            start = k;
          }
        }
        pending = mergeShort(pending, U, V, bw, cos, sin);
        groups.push({phase, colour, V, pending});
      }
    }
    // Three routes (greedy, local, looking at the next colour), each also compacted; the least travel wins.
    const build = (routes, from) => {
      let at = from;
      const strokes = [];
      groups.forEach((g, gi) => routes[gi].forEach(([index, rev]) => {
        const item = g.pending[index], begin = rev ? item.end : item.begin, end = rev ? item.begin : item.end, v0 = rev ? item.v1 : item.v0, v1 = rev ? item.v0 : item.v1;
        strokes.push({sel: item.sel, V: g.V, v0, v1, begin, end, from: at, travel: dist(begin, at), length: Math.max(Math.abs(v1 - v0), bw * 0.35), colour: colours[g.colour], phase: g.phase});
        at = end;
      }));
      return strokes;
    };
    const candidates = [];
    for (const mode of ['greedy', 'local', 'exit']) {
      let at = tip;
      const routes = groups.map((g, gi) => {
        const ends = g.pending.map(item => [item.begin, item.end]), exits = mode === 'exit' && gi + 1 < groups.length ? groups[gi + 1].pending.flatMap(item => [item.begin, item.end]) : null;
        const r = mode === 'greedy' ? greedyRoute(ends, at) : route(ends, at, exits);
        if (r.length) at = tailOf(ends, r.at(-1));
        return r;
      });
      candidates.push(build(routes, tip));
    }
    const boundaries = [];
    let offset = 0;
    for (const g of groups) { boundaries.push([offset, offset + g.pending.length]); offset += g.pending.length; }
    for (const original of candidates.slice()) {
      const ends = original.map(s => [s.begin, s.end]), r = compactRoute(ends, tip, boundaries);
      let at = tip;
      candidates.push(r.map(([index, rev]) => { const s = original[index], begin = rev ? s.end : s.begin, end = rev ? s.begin : s.end; const out = {...s, begin, end, v0: rev ? s.v1 : s.v0, v1: rev ? s.v0 : s.v1, from: at, travel: dist(begin, at)}; at = end; return out; }));
    }
    let strokes = candidates.reduce((a, b) => (b.reduce((s, x) => s + x.travel, 0) < a.reduce((s, x) => s + x.travel, 0) ? b : a));
    if (quick && subject && ids) strokes = backgroundLeftToRight(strokes, ids, subject, w, h, bw);
    return {strokes: time(strokes, bw), bw};
  }
  // Quick mode for a painted place (v181e_background_fill.py): after the subject, the background is coloured
  // region by region from left to right, each region's strokes on the nearest route.
  function backgroundLeftToRight(strokes, ids, subject, w, h, bw) {
    const first = strokes.findIndex(s => s.phase === 0);
    if (first < 0) return strokes;
    const values = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) values[i] = subject[i] ? -1 : ids[i];
    const {labels} = label(values, w, h), groups = new Map();
    for (const s of strokes.slice(first)) {
      const parts = new Map();
      for (const p of s.sel) { const l = labels[p]; if (!parts.has(l)) parts.set(l, []); parts.get(l).push(p); }
      for (const [l, list] of parts) {
        const sel = Int32Array.from(list), prog = p => (Math.abs(s.v1 - s.v0) > 1e-6 ? (s.V[p] - s.v0) / (s.v1 - s.v0) : 0.5);
        let lo = Infinity, hi = -Infinity;
        for (const p of sel) { const q = prog(p); if (q < lo) lo = q; if (q > hi) hi = q; }
        const a = [s.begin[0] + lo * (s.end[0] - s.begin[0]), s.begin[1] + lo * (s.end[1] - s.begin[1])], b = [s.begin[0] + hi * (s.end[0] - s.begin[0]), s.begin[1] + hi * (s.end[1] - s.begin[1])];
        // The part's own progress runs 0-1 over its span (a part at one spot is coloured at mid-stroke).
        const v0 = s.v0 + lo * (s.v1 - s.v0), v1 = s.v0 + hi * (s.v1 - s.v0), span = hi - lo > 1e-12 ? {v0, v1} : {v0: v0 - 1, v1: v0 + 1};
        if (!groups.has(l)) groups.set(l, []);
        groups.get(l).push({...s, sel, begin: a, end: b, ...span, length: Math.max(dist(a, b), bw * 0.35)});
      }
    }
    const centre = list => { let sum = 0, count = 0; for (const s of list) for (const p of s.sel) { sum += p % w; count++; } return sum / count; };
    const ordered = strokes.slice(0, first);
    let at = first ? strokes[first - 1].end : strokes[0].from;
    for (const l of [...groups.keys()].sort((a, b) => centre(groups.get(a)) - centre(groups.get(b)) || a - b)) {
      const list = groups.get(l), ends = list.map(s => [s.begin, s.end]);
      for (const [index, rev] of greedyRoute(ends, at)) {
        const s = list[index], begin = rev ? s.end : s.begin, end = rev ? s.begin : s.end;
        ordered.push({...s, begin, end, v0: rev ? s.v1 : s.v0, v1: rev ? s.v0 : s.v1, from: at, travel: dist(begin, at)});
        at = end;
      }
    }
    return ordered;
  }
  // One eased timeline for the pen and the colour: a stroke travels (pen up, lifted on an arc), then paints; a pixel
  // is coloured exactly when the eased nib reaches it (contact = acos(1 - 2p) / pi).
  function time(strokes, bw) {
    const weights = strokes.map(s => [Math.max(s.travel / 1.5, bw * 0.04), s.length]), total = weights.reduce((sum, [a, b]) => sum + a + b, 0) || 1;
    let now = 0;
    return strokes.map((s, k) => { const t0 = now, t1 = t0 + weights[k][0] / total, t2 = t1 + weights[k][1] / total; now = t2; return {...s, t0, t1, t2}; });
  }

  // ------------------------------------------------------------ the plan and the frames
  // rgba: the picture's pixels (any alpha is laid on white paper). Returns everything a frame needs.
  function plan(rgba, w, h, {quick = false, seed = 42} = {}) {
    const n = w * h, rgb = new Uint8ClampedArray(n * 3), gray = new Uint8ClampedArray(n), src = new Uint8ClampedArray(n * 4), visible = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = rgba[i * 4 + 3] / 255;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(rgba[i * 4 + c] * a + 255 * (1 - a));
      gray[i] = Math.round(0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]);
      // The picture's white paper (near white, nearly grey) is the board itself: never drawn, never coloured in
      // (the original's visible mask), so no pale box shows round a picture and the brush only lays real colour.
      const lo = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]), hi = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
      visible[i] = lo >= 236 && hi - lo <= 14 ? 0 : 1;
      src[i * 4] = rgb[i * 3]; src[i * 4 + 1] = rgb[i * 3 + 1]; src[i * 4 + 2] = rgb[i * 3 + 2]; src[i * 4 + 3] = visible[i] ? 255 : 0;
    }
    const ink = inkMap(gray, w, h);
    for (let i = 0; i < n; i++) ink[i] &= visible[i];
    // The grid: 10-pixel cells at 1920 pixels across (the original's size), scaled with the picture.
    const edge = Math.max(4, Math.round(10 * Math.max(w, h) / 1920)), rows = Math.ceil(h / edge), cols = Math.ceil(w / edge), active = new Uint8Array(rows * cols);
    for (let i = 0; i < n; i++) if (ink[i]) { const x = i % w, y = (i - x) / w; active[Math.floor(y / edge) * cols + Math.floor(x / edge)] = 1; }
    const cells = lineOrder(active, rows, cols), structure = new Uint8Array(n).fill(255), inkPath = new Float32Array(cells.length * 2);
    cells.forEach(([r, c], index) => {
      const value = Math.round(index / Math.max(1, cells.length - 1) * 254);
      for (let y = r * edge; y < Math.min(h, (r + 1) * edge); y++) for (let x = c * edge; x < Math.min(w, (c + 1) * edge); x++) if (ink[y * w + x]) structure[y * w + x] = value;
      inkPath[index * 2] = Math.min(w - 1, c * edge + edge / 2); inkPath[index * 2 + 1] = Math.min(h - 1, r * edge + edge / 2);
    });
    const {ids, palette: pal, colours} = palette(rgb, ink, visible, w, h, seed), subject = subjectOf(pal, w, h);
    const tip = cells.length ? [inkPath[cells.length * 2 - 2], inkPath[cells.length * 2 - 1]] : [(w - 1) / 2, (h - 1) / 2];
    const {strokes, bw} = fillPlan(pal, colours, subject, w, h, tip, {quick, ids});
    const contact = new Float32Array(n).fill(Infinity), last = Math.fround(1 - 1e-6);
    for (const s of strokes) {
      const span = s.t2 - s.t1;
      for (const p of s.sel) {
        const q = Math.abs(s.v1 - s.v0) > 1e-6 ? clamp((s.V[p] - s.v0) / (s.v1 - s.v0), 0, 1) : 0.5;
        contact[p] = Math.min(last, s.t1 + Math.acos(1 - 2 * q) / Math.PI * span);
      }
    }
    return {
      w, h, edge, src, structure, contact, inkPath, cells: cells.length, inkEnd: cells.length ? 0.45 : 0, subject: !!subject, brush: bw,
      strokes: strokes.map(s => ({t0: s.t0, t1: s.t1, t2: s.t2, from: s.from, begin: s.begin, end: s.end, colour: s.colour})),
    };
  }
  // One moment of the reveal (q from 0 to 1) into an RGBA buffer: colour where the brush has passed, ink where the pen
  // has drawn, clear paper elsewhere (pixels.py).
  function frame(p, q, out, ink = [30, 30, 30]) {
    const {structure: S, contact: C, src} = p, n = S.length;
    const limit = Math.round((p.inkEnd > 0 ? clamp(q / p.inkEnd, 0, 1) : 1) * 254), paint = q >= 1 ? 1 : q < p.inkEnd ? -1 : clamp((q - p.inkEnd) / (1 - p.inkEnd), 0, 1);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      if (C[i] <= paint) { out[j] = src[j]; out[j + 1] = src[j + 1]; out[j + 2] = src[j + 2]; out[j + 3] = src[j + 3]; }
      else if (S[i] <= limit) { out[j] = ink[0]; out[j + 1] = ink[1]; out[j + 2] = ink[2]; out[j + 3] = 255; }
      else out[j + 3] = 0;
    }
    return out;
  }
  const cosEase = f => 0.5 - 0.5 * Math.cos(Math.PI * f);
  // Where the pen is at q, in picture pixels, and how high it is lifted (0 on the paper, 1 at the top of a hop);
  // `colour` is the colour being laid, for the hand's marker.
  function pen(p, q) {
    if (q >= 1) return null;
    if (q < p.inkEnd) {
      const P = p.inkPath;
      if (p.cells < 2) return {x: P[0], y: P[1], lift: 0, colour: null};
      const f = clamp(q / p.inkEnd, 0, 1) * (p.cells - 1), k = Math.min(p.cells - 2, Math.floor(f));
      const g = f - k, ax = P[k * 2], ay = P[k * 2 + 1], bx = P[k * 2 + 2], by = P[k * 2 + 3], hop = Math.hypot(bx - ax, by - ay) > 1.5 * p.edge;
      return {x: ax + (bx - ax) * g, y: ay + (by - ay) * g, lift: hop ? Math.sin(Math.PI * g) : 0, colour: null};
    }
    const t = p.inkEnd < 1 ? (q - p.inkEnd) / (1 - p.inkEnd) : 1, S = p.strokes;
    if (!S.length) return null;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S[mid].t2 < t) lo = mid + 1; else hi = mid; }
    const s = S[lo];
    if (t < s.t1) { const f = clamp((t - s.t0) / Math.max(1e-9, s.t1 - s.t0), 0, 1), e = cosEase(f); return {x: s.from[0] + e * (s.begin[0] - s.from[0]), y: s.from[1] + e * (s.begin[1] - s.from[1]), lift: Math.sin(Math.PI * f), colour: s.colour}; }
    const e = cosEase(clamp((t - s.t1) / Math.max(1e-9, s.t2 - s.t1), 0, 1));
    return {x: s.begin[0] + e * (s.end[0] - s.begin[0]), y: s.begin[1] + e * (s.end[1] - s.begin[1]), lift: 0, colour: s.colour};
  }
  // In the drawing page: the plan of a decoded picture, made once per picture (by its SHA-256) and size.
  const cache = new Map();
  function cached(key, image, quick = false) {
    const s = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight)), w = Math.max(1, Math.round(image.naturalWidth * s)), h = Math.max(1, Math.round(image.naturalHeight * s)), id = `${key}|${w}x${h}|${quick}`;
    if (!cache.has(id)) {
      const canvas = new OffscreenCanvas(w, h), c = canvas.getContext('2d');
      c.drawImage(image, 0, 0, w, h);
      cache.set(id, plan(c.getImageData(0, 0, w, h).data, w, h, {quick}));
    }
    return cache.get(id);
  }
  const R = {VERSION: 'reveal/1', plan, frame, pen, cached, inkMap, lineOrder};
  if (typeof module === 'object' && module.exports) module.exports = R;
  else root.DREVEAL = R;
})(typeof window !== 'undefined' ? window : globalThis);
