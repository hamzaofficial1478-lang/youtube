'use strict';
// P06d - The scene engine for drawn shots. It lays out one shot from sketch.js's vocabulary and draws any frame
// of it as a pure function of time: the set (with parallax), characters and props arriving on the narrator's
// words, pose and expression changes, walks, kinetic text, motion effects, the camera (moves, focus, punches,
// shakes) and the opening transition. Engines: stickman = cartoon finish, handdrawn = ink, motion = flat.
(function () {
  const K = window.DK, C = K.COL, TAU = Math.PI * 2, clamp01 = K.clamp01, ease = K.ease;
  const FINISH = {stickman: 'cartoon', handdrawn: 'wb', motion: 'flat'};
  // The stickman engine's looks (the style's drawing.look): each its own finish.
  const LOOKS = {classic: 'cartoon', whiteboard: 'board', storybook: 'story', doodle: 'doodle', illustrated: 'ink', chronicle: 'chron'};
  // Finishes whose words and labels are handwritten.
  const handwritten = () => K.FIN === 'ink' || K.FIN === 'wb';
  const WRITTEN = new Set(['title', 'label', 'highlight', 'keyword']);
  // Words are written out at a writing pace.
  const writeSeconds = text => Math.min(1.6, Math.max(0.4, 0.25 + String(text).length * 0.045));
  const PROP_SIZE = {s: 150, m: 230, l: 330, xl: 460};
  const TEXT_BASE = {statement: 88, poster: 300, title: 84, note: 54, number: 150, counter: 140, stamp: 96, highlight: 70, pop: 84, label: 42, headline: 60, chapter: 80, sticky: 40, tag: 46, callout: 50, keyword: 120, versus: 72};
  const TEXT_SCALE = {s: 0.7, m: 1, l: 1.35, xl: 1.8};
  // How far a word's drawn shape reaches past its letters, in font sizes [each side, half height] (documentary demo
  // 2026-10-22: tags, labels and stamps were taller than their boxes and the camera's push cropped them).
  const TEXT_BOX = {tag: [0.75, 1.15], callout: [0.75, 1.15], sticky: [0.75, 1.15], label: [0.4, 0.75], stamp: [0.35, 0.8]};
  const FX_SIZE = {s: 120, m: 200, l: 300, xl: 420};
  const ENTER_SECONDS = {pop: 0.4, slide: 0.4, drop: 0.42, draw: 0.75, fade: 0.3, grow: 0.5, mask: 0.6, swing: 0.55, blur: 0.5, rise: 0.45, land: 0.42, none: 0};
  // Drawing-on is the hand-drawn look and takes its time there; elsewhere a drawing is on screen quickly.
  const enterSeconds = (enter, engine = D?.engine) => (enter === 'draw' && engine !== 'handdrawn' && !PEN ? 0.45 : ENTER_SECONDS[enter] ?? 0.34);
  const SCREEN_FX = new Set(['flash', 'confetti', 'money-rain', 'rain', 'snow', 'glitch', 'wind']);
  const BACKDROP_FX = new Set(['burst', 'glow', 'speedlines', 'shockwave', 'pulse', 'nightfall']);
  // Places under the open sky (nightfall draws its sun, moon and stars only there).
  const OUTDOOR_SETS = new Set(['none', 'abstract', 'street', 'city', 'road', 'park', 'nature', 'mountains', 'desert', 'beach', 'night', 'storm', 'castle', 'harbor', 'market', 'village', 'battlefield']);
  const MARKS = new Set(['underline', 'circle', 'cross', 'check', 'spotlight']);
  // The doodle look's ground: a bold strip under the action, coloured by the place.
  const DOODLE_GROUND = {park: '#7BC043', nature: '#7BC043', mountains: '#7BC043', storm: '#6FA53A', night: '#3F6E2E', beach: '#F2C14E', desert: '#F2C14E', street: '#B8BCC2', road: '#B8BCC2', city: '#B8BCC2', stage: '#C98B4E', classroom: '#D9B38C', home: '#D9B38C', room: '#D9B38C', office: '#C9CDD2', kitchen: '#D9B38C', bedroom: '#D9B38C', shop: '#D9B38C', bank: '#C9CDD2', hospital: '#C9CDD2', lab: '#C9CDD2'};
  // PEN: the shot is drawn on line by line, one thing after another (whiteboard look, or the hand is on);
  // HAND: the drawing hand is shown holding the pen.
  let D, P, LAYOUT, layerCanvas, layerCtx, lastKey = null, PEN = false, HAND = false, LASTHAND = null;

  // ------------------------------------------------------------ layout and timing (once per shot)
  function autoEnter(el, engine) {
    if (el.kind === 'picture') return 'draw';
    if (['chart', 'timeline', 'network', 'map', 'crowd', 'quote', 'document', 'gauge', 'loupe', 'ruler'].includes(el.kind) || (el.kind === 'text' && ['statement', 'poster'].includes(el.style))) return 'none';
    if (el.kind === 'text' && ['chapter', 'versus'].includes(el.style)) return 'none';
    if (engine === 'handdrawn' || PEN || K.FIN === 'ink') return el.kind === 'fx' ? 'pop' : 'draw';
    if (el.kind === 'arrow') return 'draw';
    if (el.kind === 'figure') return engine === 'motion' ? 'slide' : 'pop';
    if (el.kind === 'text' && ['stamp', 'number', 'counter', 'note', 'headline', 'chapter', 'versus'].includes(el.style)) return 'none';
    return 'pop';
  }
  const figureH = el => K.FIGURE_SIZE[el.size || 'm'] * K.u;
  const propS = el => PROP_SIZE[el.size || 'm'] * K.u;
  const textSize = el => TEXT_BASE[el.style] * TEXT_SCALE[el.size || 'm'] * K.u;
  // A picture (0.33): its width from its size, its height from its own proportions, kept inside the frame.
  const PICTURE_W = {s: 0.3, m: 0.42, l: 0.56, xl: 0.74};
  // The hand traces a picture's outlines in 2.2-4.2 s (more shapes take longer), but never more than 45% of the time
  // the picture is on screen, so the finished picture holds for most of it (demo review 2026-10-16: colour arrived
  // just before the cut, and a picture cued on a later word only finished as the shot ended).
  // A painted picture (ChatGPT, 2026-10-22) is decoded on the page before drawing (window.DIMG, by its SHA-256).
  const painted = el => (el?.image && window.DIMG?.[el.image]?.naturalWidth ? window.DIMG[el.image] : null);
  const pictureSeconds = (el, ts = 0) => (painted(el) ? (el.backdrop ? 0.4 : 1.1) : el.art ? Math.min(4.2, Math.max(2.2, 1.2 + 0.018 * el.art.paths.length), Math.max(0.8, 0.45 * (P.duration - ts))) : 0.5);
  function estimate(el) {
    // A map (0.36) at size xl is the whole frame; smaller maps are panels like charts.
    if (el.kind === 'map' && (el.size || 'xl') === 'xl') return {box: [0, 0, K.W, K.H], center: [K.W / 2, K.H / 2], r: K.H / 2, w: K.W, h: K.H};
    if (el.kind === 'map') {
      const w = PICTURE_W[el.size] * K.W * 1.15, h = w * 0.62, x = Math.min(K.W - K.M - w / 2, Math.max(K.M + w / 2, el.x * K.W)), y = Math.min(0.84 * K.H - h / 2, Math.max(0.06 * K.H + h / 2, el.y * K.H));
      return {box: [x - w / 2, y - h / 2, x + w / 2, y + h / 2], center: [x, y], r: Math.min(w, h) / 2, w, h};
    }
    if (el.kind === 'crowd') { const h = K.FIGURE_SIZE[el.size || 's'] * K.u * 1.15, w = el.width * K.W, x = Math.min(K.W - w / 2, Math.max(w / 2, el.x * K.W)), y = el.y * K.H; return {box: [x - w / 2, y - h, x + w / 2, y], center: [x, y - h / 2], r: w / 2, w, h}; }
    if (el.kind === 'chart' || el.kind === 'network') {
      const w = PICTURE_W[el.size || 'l'] * K.W * (el.kind === 'network' ? 1.15 : 1), h = Math.min(0.7 * K.H, w * (el.kind === 'network' ? 0.55 : 0.62));
      const x = Math.min(K.W - K.M - w / 2, Math.max(K.M + w / 2, el.x * K.W)), y = Math.min(0.84 * K.H - h / 2, Math.max(0.06 * K.H + h / 2, el.y * K.H));
      return {box: [x - w / 2, y - h / 2, x + w / 2, y + h / 2], center: [x, y], r: Math.min(w, h) / 2, w, h};
    }
    if (el.kind === 'timeline') { const y = el.y * K.H, h = 0.24 * K.H; return {box: [0.08 * K.W, y - h / 2, 0.92 * K.W, y + h / 2], center: [K.W / 2, y], r: h / 2}; }
    // 0.39 evidence and measure tools: panels like a chart, a lens, a measured line.
    if (['quote', 'document', 'gauge'].includes(el.kind)) {
      const w = PICTURE_W[el.size || (el.kind === 'quote' ? 'l' : 'm')] * K.W * (el.kind === 'quote' ? 1.15 : el.kind === 'gauge' ? 0.72 : 1), h = Math.min(0.72 * K.H, w * (el.kind === 'quote' ? 0.38 : el.kind === 'gauge' ? 0.95 : el.doc === 'newspaper' ? 0.66 : 0.8));
      const x = Math.min(K.W - K.M - w / 2, Math.max(K.M + w / 2, el.x * K.W)), y = Math.min(0.82 * K.H - h / 2, Math.max(0.06 * K.H + h / 2, el.y * K.H));
      return {box: [x - w / 2, y - h / 2, x + w / 2, y + h / 2], center: [x, y], r: Math.min(w, h) / 2, w, h};
    }
    if (el.kind === 'loupe') { const R = {s: 0.1, m: 0.14, l: 0.19, xl: 0.24}[el.size || 'm'] * K.H, x = Math.min(K.W - R - K.M, Math.max(R + K.M, el.x * K.W)), y = Math.min(0.82 * K.H - R, Math.max(0.06 * K.H + R, el.y * K.H)); return {box: [x - R, y - R, x + R, y + R], center: [x, y], r: R}; }
    if (el.kind === 'ruler') {
      const pt = ref => (Array.isArray(ref) ? [ref[0] * K.W, ref[1] * K.H] : [K.W / 2, K.H / 2]), a = pt(el.from), b = pt(el.to), pad = 60 * K.u;
      return {box: [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad], center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r: Math.hypot(b[0] - a[0], b[1] - a[1]) / 2};
    }
    if (el.kind === 'picture' && el.backdrop && painted(el)) return {box: [K.W / 2, K.H / 2, K.W / 2, K.H / 2], center: [K.W / 2, K.H / 2], r: 0, w: K.W, h: K.H};
    if (el.kind === 'picture') {
      const image = painted(el), [vw, vh] = image ? [image.naturalWidth, image.naturalHeight] : el.art?.viewBox || [3, 2], maxH = 0.72 * K.H;
      let w = PICTURE_W[el.size || 'l'] * K.W, h = w * vh / vw;
      if (h > maxH) { w *= maxH / h; h = maxH; }
      const x = Math.min(K.W - K.M - w / 2, Math.max(K.M + w / 2, el.x * K.W)), y = Math.min(0.86 * K.H - h / 2, Math.max(0.06 * K.H + h / 2, el.y * K.H));
      return {box: [x - w / 2, y - h / 2, x + w / 2, y + h / 2], center: [x, y], r: Math.min(w, h) / 2, w, h};
    }
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
    const solid = d.elements.map((el, i) => (['figure', 'prop', 'picture', 'crowd'].includes(el.kind) && !(el.kind === 'prop' && ['cloud', 'rainbow'].includes(el.prop)) ? est[i].box : null)).filter(Boolean);
    // A character's name chip counts as a drawing, and a keyword (pinned to a top corner) stops short of one (live plan
    // 2026-10-19: "LIKE A COUNTRY" ran into "Company governor").
    const chips = d.elements.map((el, i) => { if (el.kind !== 'figure' || !el.label) return null; const [hx, hy, hr] = est[i].head, s = 46 * K.u, w = K.measure(el.label, s, {weight: 800}) + s * 0.9, y = hy - hr * 1.7; return [hx - w / 2, y - s * 0.73, hx + w / 2, y + s * 0.73]; }).filter(Boolean);
    solid.push(...chips);
    // Words never leave the frame or sit on a drawing: they move to the free height that covers least.
    const textAt = d.elements.map((el, i) => {
      if (el.kind !== 'text') return null;
      if (el.style === 'statement' || el.style === 'poster') {
        // Kinetic type (0.35): the sentence wraps into at most four centred lines; a poster is one line across the frame.
        // Key words are a *span*: every word from the opening star to the closing one lights up (0.38: "*redrew the
        // map*" lit only its first and last words).
        let open = false;
        const words = el.text.split(/\s+/).filter(Boolean).map(word => {
          const starts = /^[^\w]*\*/.test(word), ends = /\*[^\w]*$/.test(word) && (!starts || word.replace(/[^*]/g, '').length > 1), hot = open || word.includes('*');
          if (starts && !ends) open = true;
          if (ends) open = false;
          return {text: word.replace(/\*/g, ''), hot};
        }).filter(word => word.text);
        let size = TEXT_BASE[el.style] * TEXT_SCALE[el.size || 'm'] * K.u, lines = wrapStatement(words, size, el.style === 'poster' ? Infinity : 0.84 * K.W);
        if (el.style === 'poster') size *= Math.min(1, 0.94 * K.W / Math.max(1, lines[0].width));
        else for (let k = 0; k < 6 && (lines.length > 4 || lines.some(line => line.width > 0.9 * K.W)); k++) { size *= 0.86; lines = wrapStatement(words, size, 0.84 * K.W); }
        lines = wrapStatement(words, size, el.style === 'poster' ? Infinity : 0.84 * K.W);
        const width = Math.max(...lines.map(line => line.width)), height = lines.length * size * 1.18, x = K.W / 2;
        const y = Math.min(0.82 * K.H - height / 2, Math.max(0.06 * K.H + height / 2, el.y * K.H));
        est[i] = {box: [x - width / 2, y - height / 2, x + width / 2, y + height / 2], center: [x, y], r: width / 2};
        return {x, y, size, width, lines};
      }
      // Words always fit inside the frame, even at the camera's closest zoom: a long line gets a smaller font.
      // Words placed side by side (a split: "this" left, "that" right) share the width instead of sliding together
      // (motion demo 2026-10-17: two titles of a split were drawn over each other).
      const split = d.elements.reduce((m, o, j) => (j !== i && o.kind === 'text' && !['statement', 'poster', 'chapter', 'headline', 'versus'].includes(o.style) && Math.abs(o.x - el.x) >= 0.2 && Math.abs(o.y - el.y) < 0.12 ? Math.min(m, Math.abs(o.x - el.x) * K.W * 0.92) : m), Infinity);
      const base = textSize(el), band = [0.13 * K.H - base * 0.7, 0.13 * K.H + base * 0.7], edge = K.M + 0.05 * K.W + 0.02 * K.W;
      const room = el.style !== 'keyword' ? Infinity : chips.filter(c => c[3] > band[0] && c[1] < band[1]).reduce((m, c) => Math.min(m, el.x <= 0.5 ? c[0] - edge : K.W - edge - c[2]), Infinity);
      const [padX, padY] = TEXT_BOX[el.style] || [0, 0.55], shown = ['keyword', 'stamp'].includes(el.style) ? el.text.toUpperCase() : el.text;
      const safe = Math.min((K.W - 2 * K.M) / 1.12, split, room > 0.3 * K.W ? room : Infinity), natural = K.measure(shown, base, {weight: 800}) * 1.08 + 2 * padX * base;
      const size = base * Math.min(1, safe / natural), width = Math.min(safe, natural * size / base) - 2 * padX * size, half = width / 2 + padX * size;
      const halfH = size * padY + (el.style === 'stamp' ? 0.12 * half : 0);
      const x = ['headline', 'chapter'].includes(el.style) ? K.W / 2 : el.style === 'keyword' ? (el.x <= 0.5 ? K.M + 0.05 * K.W + half : K.W - K.M - 0.05 * K.W - half) : el.style === 'versus' ? Math.min(0.8, Math.max(0.2, el.x)) * K.W : Math.min(K.W - K.M - half, Math.max(K.M + half, el.x * K.W));
      // When a word has to move off its spot, earlier words count too, so it picks a free height instead of pushing one
      // off (documentary demo 2026-10-22: a stamp moved onto the "London" tag). A word asked for an earlier word's spot
      // replaces it (below), and one that leaves on a cue (until) makes way by itself.
      const said = d.elements.map((o, j) => (j < i && o.kind === 'text' && o.style !== 'poster' && !o.until ? est[j].box : null)).filter(Boolean);
      const cover = (y, moved = false) => [...solid, ...(moved ? said : [])].reduce((sum, [x1, y1, x2, y2]) => sum + Math.max(0, Math.min(x + half, x2) - Math.max(x - half, x1)) * Math.max(0, Math.min(y + halfH, y2) - Math.max(y - halfH, y1)), 0);
      // Big words keep room above them for the camera's push (live 0.25 run: an xl counter touched the top edge).
      const limit = 0.8 * K.H - halfH, top = 0.07 * K.H + halfH;
      const y = ['chapter', 'versus'].includes(el.style) ? K.H / 2 : el.style === 'keyword' ? Math.max(top, 0.13 * K.H) : el.style === 'headline' ? Math.max(top, 0.09 * K.H) : [el.y * K.H, 0.12 * K.H, 0.22 * K.H, 0.34 * K.H, 0.5 * K.H].map(v => Math.min(limit, Math.max(top, v))).map((v, k) => [v, cover(v, k > 0)]).reduce((a, b) => (b[1] < a[1] - 1 ? b : a))[0];
      est[i] = {box: [x - half, y - halfH, x + half, y + halfH], center: [x, y], r: half};
      return {x, y, size, width};
    });
    // A name chip sits above the head; when a word covers it or the frame cuts it (a big character), it moves beside the
    // head, then beside the shoulders, never onto the face (documentary demo 2026-10-22: the keyword "THE LEGEND" sat
    // on "Kaldi, goat herder").
    d.elements.forEach((el, i) => {
      if (el.kind !== 'figure' || !el.label) return;
      const [hx, hy, hr] = est[i].head, s = 46 * K.u, w = K.measure(el.label, s, {weight: 800}) + s * 0.9, h = s * 1.46;
      const covered = (x, y) => d.elements.some((o, j) => o.kind === 'text' && o.style !== 'poster' && est[j].box[0] < x + w / 2 && est[j].box[2] > x - w / 2 && est[j].box[1] < y + h / 2 && est[j].box[3] > y - h / 2);
      const onFace = (x, y) => Math.abs(x - hx) < hr + w / 2 - 1 && Math.abs(y - hy) < hr + h / 2;
      const beside = k => Math.min(K.W - K.M - w / 2, Math.max(K.M + w / 2, hx + k * (hr * 1.4 + w / 2))), toward = hx > K.W / 2 ? -1 : 1;
      const spots = [[hx, hy - hr * 1.7], [beside(toward), hy - hr * 0.3], [beside(-toward), hy - hr * 0.3], [beside(toward), hy + hr * 0.9], [beside(-toward), hy + hr * 0.9]];
      est[i].chip = spots.find(([x, y]) => y - h / 2 >= 0.02 * K.H && !covered(x, y) && !onFace(x, y)) || [hx, Math.max(hy - hr * 1.7, 0.02 * K.H + h / 2)];
    });
    // A chart, network or map makes room for words above it (motion demo 2026-10-17: a counter sat on a chart's title).
    d.elements.forEach((item, i) => {
      if (!['chart', 'network', 'map', 'quote', 'document', 'gauge'].includes(item.kind)) return;
      const e = est[i];
      let top = e.box[1];
      // Only a word that ends in the chart's upper half is above it (documentary demo 2026-10-22: a big "1/3" beside a
      // donut squeezed it into the bottom quarter); a word beside it is stepped around below.
      const above = j => est[j].box[3] < e.center[1];
      d.elements.forEach((other, j) => { const b = est[j].box; if (other.kind === 'text' && other.style !== 'poster' && b[2] > e.box[0] && b[0] < e.box[2] && b[3] > e.box[1] && above(j)) top = Math.max(top, b[3] + 0.02 * K.H); });
      if (top > e.box[1]) {
        const h = Math.max(0.25 * K.H, e.box[3] - top), w = (e.box[2] - e.box[0]) * h / (e.box[3] - e.box[1]), cx = e.center[0];
        est[i] = {...e, box: [cx - w / 2, top, cx + w / 2, top + h], center: [cx, top + h / 2], r: Math.min(w, h) / 2, w, h};
      }
      // ...and steps aside for a character beside it, shrinking only when the frame has no room (demo: a rating panel
      // covered a customer).
      let [x1, y1, x2, y2] = est[i].box;
      d.elements.forEach((other, j) => {
        if (other.kind !== 'figure' && !(other.kind === 'text' && !['poster', 'statement'].includes(other.style) && !above(j))) return;
        const f = est[j].box;
        if (Math.min(x2, f[2]) - Math.max(x1, f[0]) <= 0 || Math.min(y2, f[3]) - Math.max(y1, f[1]) <= 0) return;
        if ((f[0] + f[2]) / 2 > (x1 + x2) / 2) { const right = f[0] - 0.01 * K.W, shift = Math.min(x1 - K.M, x2 - right); x1 -= shift; x2 -= shift; if (x2 > right) x2 = right; }
        else { const left = f[2] + 0.01 * K.W, shift = Math.min(K.W - K.M - x2, left - x1); x1 += shift; x2 += shift; if (x1 < left) x1 = left; }
      });
      if (x2 - x1 < (est[i].box[2] - est[i].box[0]) - 1 || x1 !== est[i].box[0]) {
        const w = Math.max(0.2 * K.W, x2 - x1), h = (y2 - y1) * Math.min(1, w / (est[i].box[2] - est[i].box[0])), cy = (y1 + y2) / 2;
        est[i] = {...est[i], box: [x1, cy - h / 2, x1 + w, cy + h / 2], center: [x1 + w / 2, cy], r: Math.min(w, h) / 2, w, h};
      }
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
      const drawsOn = engine === 'handdrawn' || PEN || K.FIN === 'ink';
      if (ts == null && item.kind === 'figure' && (!item.enter || item.enter === 'auto')) { ts = drawsOn ? 0.05 : 0; if (!drawsOn) enter = 'none'; }
      if (ts == null) { ts = drawsOn ? 0.05 + order * Math.min(0.5, Math.max(0.18, dur * 0.45 / Math.max(1, uncued))) : 0.03 + order * 0.08; order++; }
      ts = Math.max(0, Math.min(ts, dur - 0.3));
      const te = cue.t1 != null && cue.t1 > ts + 0.25 ? cue.t1 : null;
      // A change of pose or face anticipates its word by a beat, as an animator would key it.
      const steps = (item.then || []).map((step, k) => ({...step, t: cue.then?.[k] != null ? Math.max(ts, cue.then[k] - 0.1) : ts + (k + 1) * (dur - ts) / (item.then.length + 1)})).sort((a, b) => a.t - b.t);
      // A map's areas, routes and pins arrive on their own words, one after another when they have none.
      let last = ts + 0.15;
      const marks = item.kind === 'map' ? item.steps.map((step, k) => (last = cue.then?.[k] != null ? Math.max(ts + 0.1, cue.then[k] - 0.15) : last + (k ? 0.7 : 0.9))) : null;
      return {ts, te, enter, steps, marks, cued: cue.t0 != null, seed: K.hashText(`${item.kind}${i}${item.who || item.prop || item.text || item.effect || ''}`)};
    });
    // Two words never sit on each other: when a later text lands on an earlier one, the earlier one leaves as it comes.
    d.elements.forEach((a, i) => d.elements.forEach((b, j) => {
      if (a.kind !== 'text' || b.kind !== 'text' || a.style === 'poster' || b.style === 'poster' || el[j].ts <= el[i].ts) return;
      const p = est[i].box, q = est[j].box;
      if (Math.min(p[2], q[2]) > Math.max(p[0], q[0]) && Math.min(p[3], q[3]) > Math.max(p[1], q[1]) && (el[i].te == null || el[i].te > el[j].ts)) el[i].te = Math.max(el[i].ts + 0.4, el[j].ts - 0.12);
    }));
    // A shot never opens on an empty frame: when nothing would be on screen for the first 0.35 s, the first
    // character (or else the first thing) is there from the start.
    const shownIdx = d.elements.map((item, i) => i).filter(i => !['fx', 'arrow'].includes(d.elements[i].kind));
    if (shownIdx.length && Math.min(...shownIdx.map(i => el[i].ts)) > 0.35) el[shownIdx.find(i => d.elements[i].kind === 'figure') ?? shownIdx.reduce((a, b) => (el[b].ts < el[a].ts ? b : a))].ts = 0.05;
    // One pen draws one thing at a time: under the pen a drawing waits for the one before it to finish (a drawing on
    // a word waits a moment only, so it never drifts far from its word).
    if (PEN) {
      let end = 0;
      d.elements.map((item, i) => i).filter(i => el[i].enter === 'draw').sort((a, b) => el[a].ts - el[b].ts).forEach(i => {
        const item = d.elements[i], busy = item.kind === 'text' && WRITTEN.has(item.style) ? writeSeconds(item.text) : item.kind === 'picture' ? pictureSeconds(item, el[i].ts) : enterSeconds('draw', engine) * (item.kind === 'figure' ? 1.25 : 1);
        if (el[i].ts < end && (!el[i].cued || end - el[i].ts <= 0.6)) el[i].ts = Math.min(end, dur - 0.3);
        end = Math.max(end, el[i].ts + busy);
      });
    }
    // A lone object on a plain backdrop gets a stage: a lit disc with slow rays behind it, so it never reads as a
    // still icon pasted on a page.
    const props = d.elements.map((item, i) => i).filter(i => d.elements[i].kind === 'prop' && !['cloud', 'rainbow'].includes(d.elements[i].prop));
    const stage = !d.elements.some(item => item.kind === 'figure') && (!d.set || ['abstract', 'none'].includes(d.set)) && props.length && props.length <= 2 ? props.reduce((a, b) => (est[b].r > est[a].r ? b : a)) : null;
    const focus = (d.focus || []).map((item, k) => ({...item, t: times.focus?.[k] != null ? Math.max(0, times.focus[k] - 0.15) : dur * (k + 1) / ((d.focus || []).length + 1)})).sort((a, b) => a.t - b.t);
    const impulses = [];
    d.elements.forEach((item, i) => {
      if (item.kind === 'fx' && ['shake', 'punch'].includes(item.effect)) impulses.push({kind: item.effect, t: el[i].ts});
      if (item.kind === 'text' && item.style === 'stamp') impulses.push({kind: 'shake', t: el[i].ts + 0.16, amount: 0.6});
      if (item.kind === 'text' && item.animate === 'slam') impulses.push({kind: 'shake', t: el[i].ts + 0.2, amount: 0.7});
      if (item.kind === 'prop' && el[i].enter === 'drop' && ['l', 'xl'].includes(item.size)) impulses.push({kind: 'shake', t: el[i].ts + ENTER_SECONDS.drop, amount: 0.5});
      if (item.kind === 'fx' && item.effect === 'flash') impulses.push({kind: 'punch', t: el[i].ts, amount: 0.5});
      if (item.kind === 'fx' && item.effect === 'explosion') impulses.push({kind: 'shake', t: el[i].ts + 0.05, amount: 1.1});
      if (item.kind === 'fx' && item.effect === 'impact') impulses.push({kind: 'punch', t: el[i].ts, amount: 0.7});
      if (item.kind === 'fx' && item.effect === 'lightning') impulses.push({kind: 'shake', t: el[i].ts, amount: 0.5});
    });
    if (d.transition === 'shake') impulses.push({kind: 'shake', t: 0, amount: 1.2});
    return {est, textAt, el, focus, impulses, stage, anchors: [], pics: []};
  }

  // ------------------------------------------------------------ camera
  function camera(t) {
    const {W, H} = K, dur = Math.max(0.1, P.duration), e = ease.inOutSine(clamp01(t / dur));
    let z = 1, ox = 0, oy = 0;
    switch (D.camera) {
      case 'push': z = K.zlerp(1, 1.07, e); break;
      case 'pull': z = K.zlerp(1.08, 1, e); break;
      case 'drift': z = 1.04; ox = (0.5 - e) * 0.035 * W; break;
      case 'punch': z = 1.02 + 0.03 * e + 0.1 * Math.exp(-t * 6); break;
      case 'shake': z = 1.05; ox = K.noise(t * 7) * 0.008 * W; oy = K.noise(t * 9 + 4) * 0.008 * H; break;
      case 'pan-left': z = 1.08; ox = (e - 0.5) * 0.07 * W; break;
      case 'pan-right': z = 1.08; ox = (0.5 - e) * 0.07 * W; break;
      case 'tilt-up': z = 1.08; oy = (e - 0.5) * 0.07 * H; break;
      case 'tilt-down': z = 1.08; oy = (0.5 - e) * 0.07 * H; break;
      case 'crash-zoom': z = K.zlerp(1, 1.16, ease.outExpo(clamp01(t / 0.35))); break;
      case 'dolly-in': z = K.zlerp(1, 1.15, e); break;
      case 'handheld': z = 1.05; ox = K.noise(t * 1.3) * 0.006 * W; oy = K.noise(t * 1.1 + 9) * 0.006 * H; break;
      case 'ken-burns': z = K.zlerp(1.02, 1.08, e); ox = (0.5 - e) * 0.03 * W; oy = (0.5 - e) * 0.02 * H; break;
      default: break;
    }
    const cur = {x: W / 2, y: H / 2, z: 1};
    for (const f of LAYOUT.focus) { if (t < f.t) break; const q = ease.inOutCubic(clamp01((t - f.t) / 0.45)); cur.x = K.lerp(cur.x, f.x * W, q); cur.y = K.lerp(cur.y, f.y * H, q); cur.z = K.zlerp(cur.z, f.zoom, q); }
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
      case 'whip-up': oy += (1 - ease.outCubic(q(0.24))) * H * 0.85; break;
      case 'whip-down': oy -= (1 - ease.outCubic(q(0.24))) * H * 0.85; break;
      case 'slide-down': oy -= (1 - ease.outCubic(q(0.26))) * H; break;
      case 'slide-left': ox += (1 - ease.outCubic(q(0.26))) * W; break;
      case 'slide-right': ox -= (1 - ease.outCubic(q(0.26))) * W; break;
      case 'zoom-out': Z *= 1 + 0.45 * (1 - ease.inOutCubic(q(0.45))); break;
      case 'drop': oy -= (1 - ease.outBack(q(0.38))) * H * 0.55; break;
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
    if (handwritten() || rx <= 0) return;
    const {ctx} = K;
    ctx.save(); ctx.fillStyle = K.alpha('#000000', K.DARK ? 0.28 : 0.13); ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.16, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawFigure(el, i, t, local, p) {
    const s = figureState(el, i, t), pose = K.POSE[s.pose] || {};
    if (!['lie', 'sleep', 'fall'].includes(s.pose)) shadow(s.x * K.W, el.y * K.H, 0.24 * figureH(el) * (1 - Math.min(0.5, Math.max(0, s.A.lift || 0) * 3)) * p);
    // Lip sync (owner review 2026-10-21): at render time the shot knows when words are spoken; the mouth moves only then.
    const speaking = Array.isArray(D.speech) ? D.speech.some(([from, to]) => t >= from - 0.03 && t <= to) : null;
    const a = K.drawFigure({x: s.x * K.W, y: el.y * K.H, dir: s.facing === 'left' ? -1 : 1, size: el.size, A: s.A, pose: s.pose, expression: s.expression, emote: s.emote, talk: !!pose.talk, speaking, holds: el.holds, tl: local, seed: LAYOUT.el[i].seed, look: el.look, engine: D.engine}, p);
    LAYOUT.anchors[i] = {center: [(a.box[0] + a.box[2]) / 2, (a.box[1] + a.box[3]) / 2], r: (a.box[2] - a.box[0]) / 2, box: a.box, head: a.head};
    if (el.label && p >= 1) { const [cx, cy] = LAYOUT.est[i].chip || [a.head[0], a.head[1] - a.head[2] * 1.7], dx = cx - (LAYOUT.est[i].head?.[0] ?? cx), dy = cy - (LAYOUT.est[i].head?.[1] ?? cy); K.pill(el.label, a.head[0] + dx, a.head[1] + dy, 46 * K.u); }
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
    // A cute face on the object (the illustrated look's smiling trucks).
    if (el.face && p >= 1) {
      const eye = 0.034 * s, blink = (local + LAYOUT.el[i].seed % 5) % 3.3 < 0.1;
      ctx.fillStyle = K.PAL.face; ctx.strokeStyle = K.PAL.face; ctx.lineCap = 'round';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * 0.09 * s, cy - 0.04 * s, eye * 0.8, blink ? eye * 0.15 : eye, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.lineWidth = Math.max(2 * K.u, 0.022 * s); ctx.beginPath(); ctx.arc(cx, cy + 0.0 * s, 0.075 * s, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
    ctx.restore();
    LAYOUT.anchors[i] = LAYOUT.est[i];
    if (el.label && el.prop !== 'sign' && p >= 1) {
      if (!handwritten()) K.pill(el.label, cx, cy - 0.62 * s, 46 * K.u, {color: el.accent ? K.PAL.accent : K.PAL.ink});
      else {
        // Illustrated: a handwritten capital label beside the thing, with a small curved arrow to it.
        const size = 40 * K.u, w = K.measure(el.label.toUpperCase(), size, {weight: 700}), ly = Math.max(K.M * 0.6 + size, cy - 0.62 * s);
        const crowd = sx => LAYOUT.textAt.reduce((sum, at) => sum + (at ? Math.max(0, Math.min(sx + w / 2, at.x + at.width / 2 + at.size) - Math.max(sx - w / 2, at.x - at.width / 2 - at.size)) * Math.max(0, Math.min(ly + size, at.y + at.size) - Math.max(ly - size, at.y - at.size)) : 0), 0);
        const fitsRight = cx + 0.35 * s + w < K.W - K.M, fitsLeft = cx - 0.35 * s - w > K.M, rx = cx + 0.32 * s + w / 2, lxLeft = cx - 0.32 * s - w / 2;
        const right = fitsRight && (!fitsLeft || crowd(rx) <= crowd(lxLeft)), lx = right ? rx : lxLeft;
        K.text(el.label.toUpperCase(), lx, ly, size, {color: el.accent ? K.PAL.accent : K.PAL.ink, weight: 700, outline: false});
        const sx = right ? lx - w / 2 - 8 * K.u : lx + w / 2 + 8 * K.u, tx = cx + (right ? 0.22 : -0.22) * s, ty = cy - 0.3 * s;
        K.render([{pts: K.frame(0, 0, 1).curve(sx, ly + size * 0.3, (sx + tx) / 2, ly + size * 0.3, tx, ty, 14), px: 3 * K.u}, {pts: [[tx - 10 * K.u, ty - 14 * K.u], [tx, ty], [tx + (right ? -14 : 14) * K.u, ty - 4 * K.u]], px: 3 * K.u}], 1, 3);
      }
    }
  }
  const NUMBER = /(-?\d[\d,]*(?:\.\d+)?)/;
  // Words wrapped into lines no wider than max.
  function wrapStatement(words, size, max) {
    const space = K.measure(' ', size, {weight: 900}), lines = [];
    let line = {words: [], width: 0};
    for (const word of words) {
      const w = K.measure(word.text, size, {weight: 900});
      if (line.words.length && line.width + space + w > max) { lines.push(line); line = {words: [], width: 0}; }
      line.width += (line.words.length ? space : 0) + w; line.words.push({...word, w});
    }
    lines.push(line);
    return lines;
  }
  function wrapWords(text, size, max) {
    const lines = []; let line = '';
    for (const word of String(text).split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && K.measure(next, size, {weight: 800}) > max) { lines.push(line); line = word; } else line = next; }
    return [...lines, line].slice(0, 4);
  }
  // ------------------------------------------------------------ motion design (0.35; research/motion-graphics-references.md)
  // Each design's backdrop, from the video's own palette so every design stays the same film. Pure functions of time.
  function drawBackdrop(t) {
    const {ctx, W, H, u} = K, bg = K.PAL.bg, acc = K.PAL.accent, ink = K.DARK ? '#FFFFFF' : K.PAL.ink;
    ctx.save();
    if (K.DESIGN === 'vector') {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.42, H * 0.05, W * 0.5, H * 0.5, H * 0.95);
      g.addColorStop(0, K.mix(bg, acc, 0.22)); g.addColorStop(1, K.mix(bg, '#000000', 0.35)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const rand = K.seeded(41);
      for (let k = 0; k < 22; k++) {
        const x0 = rand() * W, y0 = rand() * H, s = (2 + rand() * 5) * u, speed = 0.01 + rand() * 0.03, y = (((y0 / H - t * speed) % 1) + 1) % 1 * H;
        ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3 + k)); ctx.fillStyle = K.mix(acc, '#FFFFFF', 0.5); ctx.shadowColor = acc; ctx.shadowBlur = 10 * u;
        ctx.beginPath(); ctx.arc(x0 + Math.sin(t * 0.5 + k) * 12 * u, y, s, 0, TAU); ctx.fill();
      }
    } else if (K.DESIGN === 'infographic') {
      ctx.fillStyle = K.alpha(ink, 0.05);
      for (let y = 24 * u, row = 0; y < H; y += 48 * u, row++) for (let x = (row % 2) * 24 * u; x < W; x += 48 * u) { ctx.beginPath(); ctx.arc(x, y, 3 * u, 0, TAU); ctx.fill(); }
    } else if (K.DESIGN === 'kinetic') {
      for (let k = 0; k < 3; k++) { const a = t * 0.15 + k * 2.1; ctx.fillStyle = K.alpha(acc, 0.08); ctx.beginPath(); ctx.arc(W * (0.2 + k * 0.3) + Math.cos(a) * 40 * u, H * (0.5 + 0.3 * Math.sin(k * 1.7)) + Math.sin(a) * 30 * u, H * (0.35 + k * 0.15), 0, TAU); ctx.fill(); }
    } else if (K.DESIGN === 'data') {
      ctx.fillStyle = K.mix(bg, '#000000', 0.2); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = K.alpha(ink, 0.06); ctx.lineWidth = 1.5 * u; ctx.beginPath();
      for (let x = 0; x < W; x += 64 * u) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y < H; y += 64 * u) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (K.DESIGN === 'collage') {
      // A bold colour field with halftone dots fading across it, paper grain and a dark edge.
      ctx.fillStyle = K.mix(acc, bg, 0.15); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = K.alpha('#000000', 0.09);
      for (let y = 11 * u; y < H; y += 22 * u) for (let x = 11 * u; x < W; x += 22 * u) { ctx.beginPath(); ctx.arc(x, y, 3.2 * u * (x / W), 0, TAU); ctx.fill(); }
      const rand = K.seeded(57); ctx.fillStyle = K.alpha('#3B2A14', 0.06);
      for (let k = 0; k < 320; k++) ctx.fillRect(rand() * W, rand() * H, 2 * u, 2 * u);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.4)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  // Panels for charts, from the design: a dark data panel, a white card, or nothing on a kinetic field.
  function panelStyle() {
    if (K.DESIGN === 'data' || K.DARK) return {fill: K.mix(K.PAL.bg, '#000000', 0.35), line: K.alpha('#FFFFFF', 0.12), text: '#F2F4F5', sub: K.alpha('#F2F4F5', 0.65)};
    if (K.DESIGN === 'kinetic') return {fill: null, line: null, text: K.PAL.ink, sub: K.alpha(K.PAL.ink, 0.65)};
    return {fill: K.alpha('#FFFFFF', 0.94), line: K.FIN === 'info' ? K.PAL.ink : K.alpha(K.PAL.ink, 0.14), text: K.PAL.ink, sub: K.alpha(K.PAL.ink, 0.62)};
  }
  const fmtValue = (v, unit) => { const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10) / 10); return unit ? (/^[$£€¥₹]/.test(unit) ? unit + n : n + unit) : n; };
  const SERIES = () => [K.PAL.accent, C.blue, C.green, C.yellow, C.pink, C.purple, C.orange, C.teal];
  // A chart builds on its words: bars grow one after another, a line draws, a pie sweeps, stars fill.
  function drawChart(el, i, local) {
    const {ctx, u} = K, [x0, y0, x1, y1] = LAYOUT.est[i].box, w = x1 - x0, h = y1 - y0, st = panelStyle(), acc = K.PAL.accent;
    const inQ = ease.outCubic(clamp01(local / 0.3)), pad = Math.min(w, h) * 0.08, titleH = el.title ? h * 0.13 : 0, labelH = el.labels ? h * 0.1 : 0;
    const px0 = x0 + pad, px1 = x1 - pad, py0 = y0 + pad + titleH + h * 0.04, py1 = y1 - pad - labelH, n = el.values.length, t0 = 0.25;
    const muted = K.mix(st.text, st.fill || K.PAL.bg, 0.55), colours = SERIES();
    ctx.save(); ctx.globalAlpha *= inQ; ctx.translate(0, (1 - inQ) * 24 * u);
    if (st.fill) { ctx.fillStyle = st.fill; ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 18 * u); ctx.fill(); if (st.line) { ctx.strokeStyle = st.line; ctx.lineWidth = 3 * u; ctx.stroke(); } }
    if (el.title) K.text(el.title, x0 + pad, y0 + pad + titleH * 0.45, titleH * 0.62, {color: st.text, align: 'left', outline: false, maxWidth: w - 2 * pad});
    const label = (k, x, max) => { if (el.labels?.[k]) K.text(el.labels[k], x, py1 + labelH * 0.55, Math.min(h * 0.055, max * 0.2), {color: st.sub, weight: 700, outline: false, maxWidth: max * 0.95}); };
    if (el.type === 'bar') {
      const max = Math.max(...el.values.map(Math.abs), 1e-9), slot = (px1 - px0) / n, bw = slot * 0.62, vh = (py1 - py0) * 0.86;
      el.values.forEach((v, k) => {
        const q = ease.outCubic(clamp01((local - t0 - k * 0.12) / 0.6)), bh = vh * Math.max(0, v) / max * q, bx = px0 + slot * k + (slot - bw) / 2;
        ctx.fillStyle = el.highlight === k || (el.highlight === undefined && n === 1) ? acc : el.highlight === undefined ? K.mix(acc, muted, 0.35) : muted;
        if (bh > 0) { ctx.beginPath(); ctx.roundRect(bx, py1 - bh, bw, bh, Math.min(10 * u, bw / 4, bh / 2)); ctx.fill(); }
        if (q > 0.5) K.text(fmtValue(v * q, el.unit), bx + bw / 2, py1 - bh - 20 * u, Math.min(bw * 0.4, h * 0.075), {color: st.text, outline: false, maxWidth: slot});
        label(k, bx + bw / 2, slot);
      });
      ctx.strokeStyle = K.alpha(st.text, 0.3); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(px0, py1); ctx.lineTo(px1, py1); ctx.stroke();
    } else if (el.type === 'line' || el.type === 'area') {
      const min = Math.min(...el.values, 0), max = Math.max(...el.values), span = max - min || 1;
      const pts = el.values.map((v, k) => [px0 + (px1 - px0) * (n === 1 ? 0.5 : k / (n - 1)), py1 - (py1 - py0) * 0.86 * (v - min) / span]);
      const q = ease.inOutSine(clamp01((local - t0) / 1.1)), part = K.partial(pts, q);
      if (el.type === 'area' && part.length > 1) { ctx.fillStyle = K.alpha(acc, 0.28); ctx.beginPath(); ctx.moveTo(part[0][0], py1); part.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(part[part.length - 1][0], py1); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = acc; ctx.lineWidth = 7 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); part.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      pts.forEach((p, k) => {
        label(k, p[0], (px1 - px0) / n);
        if (n > 1 && q < k / (n - 1)) return;
        ctx.fillStyle = el.highlight === k ? acc : st.fill || K.PAL.bg; ctx.strokeStyle = acc; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(p[0], p[1], 9 * u, 0, TAU); ctx.fill(); ctx.stroke();
        if (k === n - 1 || el.highlight === k) K.text(fmtValue(el.values[k], el.unit), p[0], p[1] - 34 * u, h * 0.08, {color: st.text, outline: false});
      });
    } else if (el.type === 'pie' || el.type === 'donut') {
      const single = el.values.length === 1, values = single ? [el.values[0], Math.max(0, 100 - el.values[0])] : el.values, total = values.reduce((a, b) => a + b, 0) || 1;
      const r = Math.min((px1 - px0) * (el.labels ? 0.32 : 0.45), (y1 - pad - py0) * 0.48), cx = el.labels ? px0 + r * 1.1 : (px0 + px1) / 2, cy = (py0 + y1 - pad) / 2, q = ease.inOutCubic(clamp01((local - t0) / 1.0));
      let a = -Math.PI / 2;
      values.forEach((v, k) => {
        const sweep = TAU * v / total * q;
        ctx.fillStyle = single && k === 1 ? K.alpha(st.text, 0.12) : el.highlight === undefined || el.highlight === k ? colours[k % colours.length] : muted;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + sweep); ctx.closePath(); ctx.fill(); a += sweep;
      });
      // A part of a whole reads as its share (documentary demo 2026-10-22: "about a third" as [1, 2] showed "1" and
      // "Brazil 1"); a unit other than % keeps the number it names.
      const share = !el.unit || el.unit === '%', shown = k => (share ? `${Math.round(values[k] * 100 / total)}%` : fmtValue(values[k], el.unit));
      if (el.type === 'donut') { const k = single ? 0 : el.highlight ?? 0; ctx.fillStyle = st.fill || K.PAL.bg; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, TAU); ctx.fill(); K.text(share ? `${Math.round(values[k] * 100 / total * q)}%` : fmtValue(values[k] * q, el.unit), cx, cy, r * 0.38, {color: st.text, outline: false}); }
      (el.labels || []).forEach((name, k) => {
        if (!name) return;
        const ly = cy - r * 0.8 + k * Math.min(r * 0.42, 52 * u), lx = cx + r * 1.25;
        ctx.fillStyle = el.highlight === undefined || el.highlight === k ? colours[k % colours.length] : muted; ctx.beginPath(); ctx.roundRect(lx, ly - 12 * u, 24 * u, 24 * u, 6 * u); ctx.fill();
        K.text(`${name} ${shown(k)}`, lx + 36 * u, ly, Math.min(36 * u, h * 0.07), {color: st.text, align: 'left', weight: 700, outline: false, maxWidth: x1 - pad - lx - 36 * u});
      });
    } else if (el.type === 'units') {
      // A unit chart (0.39, isotype): the whole as identical marks, the part lit in the accent while the rest dims -
      // "1 in 10" as something the eye can count. At most 100 marks; a bigger whole names what one mark stands for.
      const part = Math.max(0, Math.round(el.values[0])), whole = Math.max(part, 1, Math.round(el.values[1] ?? 100)), shown = Math.min(whole, 100), lit = Math.min(shown, Math.round(part * shown / whole));
      const cols = Math.max(1, Math.ceil(Math.sqrt(shown * (px1 - px0) / Math.max(1, py1 - py0)))), rows = Math.ceil(shown / cols), cell = Math.min((px1 - px0) / cols, (py1 - py0) / rows);
      const ox = (px0 + px1) / 2 - cell * cols / 2, oy = (py0 + py1) / 2 - cell * rows / 2, built = t0 + shown * 0.012 + 0.2, glow = ease.softLand(clamp01((local - built) / 0.45));
      for (let k = 0; k < shown; k++) {
        const born = clamp01((local - t0 - k * 0.012) / 0.18);
        if (born <= 0) continue;
        const cx = ox + cell * (k % cols + 0.5), cy = oy + cell * (Math.floor(k / cols) + 0.5), r = cell * 0.36 * (1 + 0.25 * (1 - ease.snapSettle(born)));
        ctx.fillStyle = k < lit ? K.mix(muted, acc, glow) : K.mix(muted, st.fill || K.PAL.bg, 0.45 * glow);
        ctx.beginPath();
        if (el.icon === 'person') { ctx.arc(cx, cy - r * 0.48, r * 0.36, 0, TAU); ctx.roundRect(cx - r * 0.48, cy - r * 0.04, r * 0.96, r * 0.98, r * 0.4); }
        else ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
      }
      if (whole > shown) K.text(`1 mark = ${fmtValue(whole / shown, '')}`, (px0 + px1) / 2, y1 - pad * 0.55, Math.min(30 * u, h * 0.05), {color: st.sub, weight: 700, outline: false});
    } else if (el.type === 'rating') {
      const v = el.values[0], q = clamp01((local - t0) / 0.9), size = Math.min((px1 - px0) / 5.6, (py1 - py0) * 0.6), cy = (py0 + py1) / 2, start = (px0 + px1) / 2 - size * 2.5;
      const star = (cx, fill) => { const pts = K.frame(cx, cy, size * 0.46).star(0, 0, 1, 0.45, 5); ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
      for (let k = 0; k < 5; k++) {
        const cx = start + size * (k + 0.5), part = clamp01(v * q - k);
        star(cx, K.alpha(st.text, 0.15));
        if (part > 0) { ctx.save(); ctx.beginPath(); ctx.rect(cx - size / 2, cy - size / 2, size * part, size); ctx.clip(); star(cx, C.yellow); ctx.restore(); }
      }
      K.text(`${(v * q).toFixed(1)} / 5`, (px0 + px1) / 2, Math.min(py1 + labelH * 0.5, cy + size * 0.85), size * 0.38, {color: st.text, outline: false});
    }
    ctx.restore();
  }
  // A timeline: the bar draws left to right, each event's medallion pops as the bar reaches it, the current one in the accent.
  function drawTimeline(el, i, local) {
    const {ctx, u} = K, [x0, , x1] = LAYOUT.est[i].box, y = LAYOUT.est[i].center[1], st = panelStyle(), n = el.events.length, acc = K.PAL.accent;
    const q = ease.inOutSine(clamp01(local / (0.6 + 0.25 * n))), xb = x0 + (x1 - x0) * q, slot = (x1 - x0) / n, nowX = el.now !== undefined ? x0 + slot * (el.now + 0.5) : null;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = K.alpha(st.text, 0.25); ctx.lineWidth = 14 * u; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xb, y); ctx.stroke();
    if (nowX !== null) { ctx.strokeStyle = acc; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(Math.min(xb, nowX), y); ctx.stroke(); }
    el.events.forEach((ev, k) => {
      const ex = x0 + slot * (k + 0.5), p = clamp01((xb - ex) / (slot * 0.4) + 0.5);
      if (p <= 0) return;
      const hot = el.now === k, r = (hot ? 34 : 26) * u * ease.outBack(p);
      ctx.save(); ctx.globalAlpha *= clamp01(p * 1.5);
      ctx.fillStyle = hot ? acc : st.fill || K.mix(K.PAL.bg, '#FFFFFF', 0.2); ctx.strokeStyle = hot ? '#FFFFFF' : acc; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(ex, y, Math.max(0.5, r), 0, TAU); ctx.fill(); ctx.stroke();
      K.text(ev.label, ex, y + (k % 2 ? 74 : -74) * u, 34 * u, {color: st.fill && !K.DARK ? K.PAL.ink : st.text, maxWidth: slot * 0.95});
      if (ev.when) K.pill(ev.when, ex, y + (k % 2 ? -64 : 64) * u, 28 * u, {color: hot ? acc : K.mix(st.text, K.PAL.bg, 0.25)});
      ctx.restore();
    });
    ctx.restore();
  }
  // ------------------------------------------------------------ maps (0.36)
  // Natural Earth country shapes (maps.js, window.DMAP) on a Mercator view fitted to the map's box. Countries colour in
  // from their middle on their words, routes sweep as arrows, pins drop; a country with a face reacts.
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-80, Math.min(84, lat)) * Math.PI / 360));
  let mapBoxes = null;
  const shapeBoxes = () => (mapBoxes ??= Object.fromEntries(Object.entries(window.DMAP?.countries || {}).map(([name, polys]) => [name, polys.map(poly => { const r = poly[0]; return [Math.min(...r.map(p => p[0])), Math.max(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[1]))]; })])));
  function mapView(el, box, zoom = 1, view = el.view) {
    const [w, s, e, n] = view, [x0, y0, x1, y1] = box, want = (x1 - x0) / (y1 - y0), R = Math.PI / 180;
    let a0 = w * R, a1 = e * R, b0 = mercY(s), b1 = mercY(n);
    if ((a1 - a0) / (b1 - b0) < want) { const c = (a0 + a1) / 2, half = (b1 - b0) * want / 2; a0 = c - half; a1 = c + half; }
    else { const c = (b0 + b1) / 2, half = (a1 - a0) / want / 2; b0 = c - half; b1 = c + half; }
    if (zoom !== 1) { const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2; [a0, a1, b0, b1] = [ca - (ca - a0) * zoom, ca + (a1 - ca) * zoom, cb - (cb - b0) * zoom, cb + (b1 - cb) * zoom]; }
    const k = (x1 - x0) / (a1 - a0);
    return {k, west: a0 / R, east: a1 / R, P: ([lon, lat]) => [x0 + (lon * R - a0) * k, y0 + (b1 - mercY(lat)) * k]};
  }
  // Traces a country (every part, and its copy across the date line when the view shows it) into the current path.
  function traceCountry(name, view) {
    const {ctx} = K, polys = window.DMAP?.countries?.[name], boxes = shapeBoxes()[name];
    if (!polys) return;
    polys.forEach((poly, k) => {
      for (const shift of [0, -360, 360]) {
        const [lo, hi] = boxes[k];
        if (hi + shift < view.west - 1 || lo + shift > view.east + 1) continue;
        poly.forEach(ring => ring.forEach(([lon, lat], j) => { const [x, y] = view.P([lon + shift, lat]); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }));
      }
    });
  }
  function mapStyle(el) {
    const F = K.FIN;
    // 0.38: a map may name its style - atlas (black land on grid paper, small-caps labels), satellite, paper, night.
    if (el?.style === 'atlas') return {sea: '#F3F1EA', land: '#1F1F1F', border: '#4A4A4A', coast: '#111111', lw: 1.1, grid: true, caps: true};
    if (el?.style === 'satellite') return {sea: '#0E2A45', land: '#41603C', border: '#7F9268', coast: '#A9BC8C', lw: 1.2, relief: true};
    if (el?.style === 'paper') return {sea: '#9CC6D4', land: '#EFE2BF', border: '#A08B63', coast: '#5E4E36', lw: 1.6, paper: true};
    if (el?.style === 'night') return {sea: '#07111D', land: '#162636', border: '#2F4C66', coast: '#5D86AA', lw: 1.2, glow: true};
    if (F === 'wb' || F === 'board' || F === 'doodle') return {sea: K.PAL.bg, land: '#FFFFFF', border: K.PAL.ink, coast: K.PAL.ink, lw: 2.4, ink: true};
    if (F === 'story' || F === 'chron' || F === 'ink') return {sea: '#9CC6D4', land: '#EFE2BF', border: '#A08B63', coast: '#5E4E36', lw: 1.6, paper: true};
    if (K.DARK) return {sea: K.mix(K.PAL.bg, '#0B3B5C', 0.55), land: K.mix(K.PAL.bg, '#FFFFFF', 0.16), border: K.mix(K.PAL.bg, '#FFFFFF', 0.34), coast: K.mix(K.PAL.bg, '#FFFFFF', 0.5), lw: 1.4};
    return {sea: '#BFE1F2', land: '#F5F1E6', border: '#B7B0A0', coast: '#7F7A6C', lw: 1.5};
  }
  function drawMap(el, i, local) {
    // The map flies in: it opens a little wider and settles on its view in 1.4 s (0.37: maps felt too quick to read).
    const {ctx, u} = K, est = LAYOUT.est[i], [x0, y0, x1, y1] = est.box, full = (el.size || 'xl') === 'xl', st = mapStyle(el), marks = LAYOUT.el[i].marks || [];
    // 0.38: on a step with "zoom" the camera flies to that country or pin (the globe-zoom of explainer maps).
    let box = el.view;
    el.steps.forEach((step, k) => {
      if (!step.zoom) return;
      const q = ease.inOutCubic(clamp01((local - marks[k]) / 1.3));
      if (q <= 0) return;
      let target;
      if (step.type === 'pin') target = [step.place[0] - 9, step.place[1] - 6, step.place[0] + 9, step.place[1] + 6];
      else { const boxes = step.countries.map(name => { const all = shapeBoxes()[name] || [[0, 0, 0, 0]]; return all.reduce((a, b) => ((b[1] - b[0]) * (b[3] - b[2]) > (a[1] - a[0]) * (a[3] - a[2]) ? b : a)); }); const [w, e, s0, n] = [Math.min(...boxes.map(b => b[0])), Math.max(...boxes.map(b => b[1])), Math.min(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))], px = Math.max(4, (e - w) * 0.35), py = Math.max(3, (n - s0) * 0.35); target = [w - px, s0 - py, e + px, n + py]; }
      box = box.map((v, n) => v + (target[n] - v) * q);
    });
    const view = mapView(el, est.box, 1 + 0.45 * (1 - ease.inOutSine(clamp01(local / 1.4))), box);
    // Once an area lights up, the rest of the land steps back.
    const firstArea = el.steps.findIndex(step => step.type === 'area'), dim = firstArea < 0 ? 0 : 0.3 * ease.outCubic(clamp01((local - marks[firstArea]) / 0.6));
    const all = Object.keys(window.DMAP?.countries || {}), q0 = clamp01(local / 0.35), placed = [];
    // Labels never pile up: one that would sit on another moves down (or up) until it is free.
    const pill = (text, x, y, size, color) => {
      const w = K.measure(text, size, {weight: 800}) + size * 0.9, h = size * 1.5;
      let py = y;
      for (let n = 0; n < 6; n++) { if (!placed.some(b => Math.abs(b[0] - x) < (b[2] + w) / 2 && Math.abs(b[1] - py) < (b[3] + h) / 2)) break; py = y + (n % 2 ? -1 : 1) * Math.ceil((n + 1) / 2) * h * 1.05; }
      placed.push([x, py, w, h]); K.pill(text, x, py, size, color ? {color} : {});
    };
    ctx.save(); ctx.globalAlpha *= q0;
    if (!full) { ctx.fillStyle = K.alpha('#000000', 0.18); ctx.beginPath(); ctx.roundRect(x0 + 8 * u, y0 + 12 * u, x1 - x0, y1 - y0, 22 * u); ctx.fill(); }
    ctx.beginPath(); if (full) ctx.rect(x0 - K.W, y0 - K.H, (x1 - x0) + 2 * K.W, (y1 - y0) + 2 * K.H); else ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 22 * u); ctx.clip();
    ctx.fillStyle = st.sea; ctx.fillRect(x0 - K.W, y0 - K.H, 3 * K.W, 3 * K.H);
    if (st.grid) { ctx.strokeStyle = K.alpha('#1F1F1F', 0.08); ctx.lineWidth = 1.2 * u; ctx.beginPath(); for (let gx = x0; gx < x1; gx += 30 * u) { ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); } for (let gy = y0; gy < y1; gy += 30 * u) { ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); } ctx.stroke(); }
    // Faint latitude lines on the sea, and the land with its borders.
    ctx.strokeStyle = K.alpha(st.coast, 0.12); ctx.lineWidth = 1.5 * u; ctx.beginPath();
    for (let lat = -60; lat <= 80; lat += 20) { const y = view.P([0, lat])[1]; ctx.moveTo(x0 - K.W, y); ctx.lineTo(x1 + K.W, y); }
    ctx.stroke();
    ctx.beginPath(); all.forEach(name => traceCountry(name, view));
    ctx.fillStyle = K.mix(st.land, st.sea, dim); ctx.fill('evenodd'); ctx.lineJoin = 'round';
    if (st.glow) { ctx.save(); ctx.shadowColor = st.coast; ctx.shadowBlur = 14 * u; ctx.strokeStyle = K.alpha(st.coast, 0.5); ctx.lineWidth = 2 * u; ctx.stroke(); ctx.restore(); }
    if (st.relief) { const rand = K.seeded(83); ctx.save(); ctx.clip('evenodd'); ctx.fillStyle = 'rgba(20,40,20,0.18)'; for (let k = 0; k < 700; k++) ctx.fillRect(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), (2 + rand() * 6) * u, (1 + rand() * 3) * u); ctx.restore(); }
    ctx.strokeStyle = st.border; ctx.lineWidth = st.lw * u; ctx.stroke();
    if (st.paper) { const rand = K.seeded(71); ctx.fillStyle = K.alpha('#7A5A40', 0.05); for (let k = 0; k < 500; k++) ctx.fillRect(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 2 * u, 2 * u); }
    // Areas colour in from their middle, then get a darker edge.
    el.steps.forEach((step, k) => {
      if (step.type !== 'area') return;
      const q = ease.outCubic(clamp01((local - marks[k]) / 0.55));
      if (q <= 0) return;
      const col = K.col(step.color), [cx, cy] = areaSpot(step, view, est.box).point;
      ctx.save(); ctx.beginPath(); step.countries.forEach(name => traceCountry(name, view)); ctx.clip('evenodd');
      ctx.fillStyle = st.ink ? K.alpha(col, 0.72) : st.paper ? K.mix(col, st.land, 0.18) : col;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, q * Math.hypot(K.W, K.H)), 0, TAU); ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); step.countries.forEach(name => traceCountry(name, view)); ctx.globalAlpha *= q; ctx.strokeStyle = K.mix(col, '#000000', 0.45); ctx.lineWidth = 3.2 * u; ctx.stroke(); ctx.restore();
    });
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= q0;
    // Routes sweep as thick arrows on a curve; pins drop; then the labels and faces.
    el.steps.forEach((step, k) => {
      if (step.type !== 'route') return;
      const q = ease.inOutSine(clamp01((local - marks[k]) / 0.9));
      if (q <= 0) return;
      const a = view.P(step.from), b = view.P(step.to), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, bend = 0.18 * len;
      const c = [(a[0] + b[0]) / 2 + (a[1] - b[1]) / len * bend * Math.sign(b[0] - a[0] || 1), (a[1] + b[1]) / 2 - Math.abs(b[0] - a[0]) / len * bend];
      const at = f => [(1 - f) ** 2 * a[0] + 2 * (1 - f) * f * c[0] + f * f * b[0], (1 - f) ** 2 * a[1] + 2 * (1 - f) * f * c[1] + f * f * b[1]];
      const pts = Array.from({length: 41}, (_, n) => at(q * n / 40)), tip = pts[40], prev = at(Math.max(0, q - 0.03)), ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
      const red = st.ink ? C.red : K.FIN === 'flat' || K.FIN === 'info' ? K.PAL.accent : '#C8302A', wdt = Math.min(16 * u, Math.max(8 * u, len * 0.035));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 0.38: with an icon, a traveller (a sailing ship, a plane, an army) moves along a dashed trail.
      if (step.icon && K.propOf(step.icon)) {
        ctx.save(); ctx.setLineDash([wdt * 1.4, wdt * 1.1]); ctx.lineDashOffset = -local * 40 * u; ctx.strokeStyle = red; ctx.lineWidth = wdt * 0.6; ctx.beginPath(); pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
        const sz = Math.min(190 * u, Math.max(115 * u, len * 0.24)), facing = Math.cos(ang) < 0 ? -1 : 1;
        ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(Math.cos(ang) < 0 ? ang + Math.PI : ang); ctx.translate(-tip[0], -tip[1]);
        K.render(K.propOf(step.icon)(K.frame(tip[0], tip[1] - sz * 0.25, sz, facing), {tl: local, seed: k}), 1, 61 + k); ctx.restore();
        if (step.label && q >= 1) pill(step.label, at(0.5)[0], at(0.5)[1] - wdt * 2.4, 30 * u);
        return;
      }
      for (const [col, w] of [[K.alpha('#000000', 0.55), wdt + 5 * u], [red, wdt]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.fillStyle = col; const s = w * 1.9; ctx.beginPath(); ctx.moveTo(tip[0] + Math.cos(ang) * s, tip[1] + Math.sin(ang) * s); ctx.lineTo(tip[0] + Math.cos(ang + 2.3) * s, tip[1] + Math.sin(ang + 2.3) * s); ctx.lineTo(tip[0] + Math.cos(ang - 2.3) * s, tip[1] + Math.sin(ang - 2.3) * s); ctx.closePath(); ctx.fill();
      }
      if (step.label && q >= 1) pill(step.label, at(0.5)[0], at(0.5)[1] - wdt * 2.4, 30 * u);
    });
    el.steps.forEach((step, k) => {
      const q = clamp01((local - marks[k]) / 0.4);
      if (q <= 0) return;
      if (step.type === 'pin') {
        const [x, y] = view.P(step.place), dy = (1 - ease.outBack(q)) * -60 * u, r = 15 * u;
        ctx.save(); ctx.translate(x, y + dy);
        ctx.fillStyle = K.alpha('#000000', 0.25 * q); ctx.beginPath(); ctx.ellipse(0, -dy, r * 0.8, r * 0.3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = C.red; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3.5 * u; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, -2.2 * r, r, Math.PI * 0.78, Math.PI * 2.22); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, -2.2 * r, r * 0.4, 0, TAU); ctx.fill(); ctx.restore();
        // 0.38: pulse rings go out from a pin that has landed.
        if (q >= 1) for (let n = 0; n < 2; n++) { const f = (((local - marks[k] - 0.4) * 0.65 + n * 0.5) % 1 + 1) % 1; ctx.save(); ctx.strokeStyle = K.alpha(C.red, 0.7 * (1 - f)); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.ellipse(x, y, r * (0.6 + f * 3.4), r * (0.3 + f * 1.7), 0, 0, TAU); ctx.stroke(); ctx.restore(); }
        if (step.label && q >= 1) pill(st.caps ? step.label.toUpperCase() : step.label, x, y - 4.6 * r, 30 * u);
      }
      if (step.type === 'area' && (step.label || step.face) && q > 0.5) {
        const {point: [x, y], size} = areaSpot(step, view, est.box), z = ease.outBack(clamp01((q - 0.5) * 2));
        let ly = y;
        if (step.face) { const R = Math.min(130 * u, Math.max(52 * u, size * 0.26)) * z; K.faceAt(x, y, Math.max(1, R), step.face, {tl: local, seed: k}); ly = y + R * 1.5; }
        if (step.label) { ctx.save(); ctx.translate(x, ly); ctx.scale(z, z); ctx.translate(-x, -ly); pill(st.caps ? step.label.toUpperCase() : step.label, x, ly, 34 * u, K.mix(K.col(step.color), '#000000', 0.35)); ctx.restore(); }
      }
    });
    if (!full) { ctx.strokeStyle = st.ink ? K.PAL.ink : K.alpha(st.coast, 0.6); ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 22 * u); ctx.stroke(); }
    ctx.restore();
    LAYOUT.anchors[i] = est;
  }
  // A country's middle (its main shape's centroid), from the page's own data.
  const labelPoints = {};
  function countryPoint(name) {
    if (labelPoints[name]) return labelPoints[name];
    const polys = window.DMAP?.countries?.[name] || [[[[0, 0]]]], area = r => Math.abs(r.reduce((sum, [x, y], k) => { const [x2, y2] = r[(k + 1) % r.length]; return sum + x * y2 - x2 * y; }, 0));
    const main = polys.map(p => p[0]).reduce((a, b) => (area(b) > area(a) ? b : a));
    let cx = 0, cy = 0, a2 = 0;
    main.forEach(([x, y], k) => { const [x2, y2] = main[(k + 1) % main.length], f = x * y2 - x2 * y; a2 += f; cx += (x + x2) * f; cy += (y + y2) * f; });
    return (labelPoints[name] = a2 ? [cx / (3 * a2), cy / (3 * a2)] : main[0], labelPoints[name]);
  }
  function areaSpot(step, view, box) {
    const [x0, y0, x1, y1] = box, inside = ([x, y]) => x > x0 + 0.06 * (x1 - x0) && x < x1 - 0.06 * (x1 - x0) && y > y0 + 0.1 * (y1 - y0) && y < y1 - 0.16 * (y1 - y0);
    const spots = step.countries.map(name => { const boxes = shapeBoxes()[name] || [[0, 0]], [lon, lat] = countryPoint(name), span = boxes.reduce((m, [lo, hi]) => Math.max(m, hi - lo), 0), a = view.P([lon - span / 2, lat]), b = view.P([lon + span / 2, lat]); return {point: view.P([lon, lat]), size: Math.min(b[0] - a[0], (y1 - y0) * 0.5)}; });
    const best = (spots.filter(spot => inside(spot.point)).length ? spots.filter(spot => inside(spot.point)) : spots).reduce((a, b) => (b.size > a.size ? b : a));
    return {point: [Math.min(x1 - 0.1 * (x1 - x0), Math.max(x0 + 0.1 * (x1 - x0), best.point[0])), Math.min(y1 - 0.22 * (y1 - y0), Math.max(y0 + 0.14 * (y1 - y0), best.point[1]))], size: best.size};
  }

  // ------------------------------------------------------------ crowds (0.36)
  // A nation, an army or a mob: rows of people (the style's own characters) with varied looks, the front row
  // biggest, each with its own rhythm; a banner held up over them.
  const CROWD_HAIR = ['short', 'messy', 'bald', 'curly', 'long', 'side-part', 'bun', 'spiky'], CROWD_COLOURS = ['blue', 'red', 'green', 'grey', 'brown', 'purple', 'orange', 'teal'];
  function drawCrowd(el, i, local) {
    const {ctx, u} = K, est = LAYOUT.est[i], [x0, , x1] = est.box, rows = el.count <= 6 ? 1 : el.count <= 14 ? 2 : 3, seed = LAYOUT.el[i].seed, rand = K.seeded(seed);
    const people = Array.from({length: el.count}, (_, k) => ({k, row: rows - 1 - (k % rows)})), dir = el.facing === 'left' ? -1 : 1;
    // Back rows first, so the front row stands in front.
    for (let row = rows - 1; row >= 0; row--) {
      const inRow = people.filter(p => p.row === row), scale = 1 - row * 0.12, y = est.box[3] - row * 0.055 * K.H;
      inRow.forEach((person, n) => {
        const q = clamp01((local - person.k * 0.035) / 0.3);
        if (q <= 0) return;
        const x = x0 + (x1 - x0) * ((n + 0.5 + (row % 2) * 0.35) / (inRow.length + (row % 2) * 0.35)) + (rand() - 0.5) * 18 * u;
        const look = {body: 'stick', hair: CROWD_HAIR[(seed + person.k * 3) % CROWD_HAIR.length], hairColor: ['black', 'brown', 'blonde', 'ginger', 'grey'][(seed + person.k) % 5], headwear: el.headwear || 'none', eyewear: 'none', facial: person.k % 4 === 1 ? 'mustache' : 'none', outfit: el.colors?.length && el.headwear !== 'none' ? 'uniform' : 'none', mark: 'none', color: el.colors?.length ? el.colors[person.k % el.colors.length] : CROWD_COLOURS[(seed + person.k * 5) % CROWD_COLOURS.length]};
        const tl = local + person.k * 0.41, A = K.poseAngles(el.pose, tl, person.k);
        ctx.save(); ctx.translate(x, y); ctx.scale(scale * ease.outBack(q), scale * ease.outBack(q)); ctx.translate(-x, -y);
        K.drawFigure({x, y, dir, size: el.size || 's', A, pose: el.pose, expression: el.expression, emote: 'none', talk: el.pose === 'talk', tl, seed: seed + person.k, look, engine: D.engine}, 1);
        ctx.restore();
      });
    }
    if (el.banner && local > 0.3) {
      const z = ease.outBack(clamp01((local - 0.3) / 0.35)), cx = (x0 + x1) / 2, top = est.box[1] - 0.02 * K.H, size = 40 * u, w = K.measure(el.banner, size, {weight: 800}) + size * 1.2, h = size * 1.7;
      ctx.save(); ctx.translate(cx, top); ctx.scale(z, z); ctx.rotate(Math.sin(local * 2.2) * 0.03);
      ctx.strokeStyle = '#7A5230'; ctx.lineWidth = 7 * u; ctx.beginPath(); [-1, 1].forEach(side => { ctx.moveTo(side * w * 0.36, 0); ctx.lineTo(side * w * 0.36, 0.2 * K.H); }); ctx.stroke();
      ctx.fillStyle = '#FFF8E7'; ctx.strokeStyle = K.DARK ? '#23272E' : K.PAL.ink; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.rect(-w / 2, -h, w, h); ctx.fill(); ctx.stroke();
      K.text(el.banner, 0, -h / 2, size, {color: '#23272E', outline: false, maxWidth: w - size * 0.6});
      ctx.restore();
    }
    LAYOUT.anchors[i] = est;
  }

  // A network: nodes pop in around the centre, then their links draw with a pulse flowing along each one.
  function drawNetwork(el, i, local) {
    const {ctx, u} = K, est = LAYOUT.est[i], [cx, cy] = est.center, n = el.nodes.length, st = panelStyle(), acc = K.PAL.accent;
    const rx = est.w * 0.38, ry = est.h * 0.36, r = Math.min(76 * u, est.h * 0.17);
    const at = k => (n === 2 ? [cx + (k ? 1 : -1) * rx, cy] : [cx + Math.cos(-Math.PI / 2 + k * TAU / n) * rx, cy + Math.sin(-Math.PI / 2 + k * TAU / n) * ry]);
    ctx.save(); ctx.lineCap = 'round';
    el.links.forEach(([a, b], j) => {
      const q = ease.inOutSine(clamp01((local - 0.15 * n - j * 0.18) / 0.5));
      if (q <= 0) return;
      // Links name their nodes from 1, as the planner wrote them (checking a stored plan again gives the same links).
      const pa = at(a - 1), pb = at(b - 1), end = [pa[0] + (pb[0] - pa[0]) * q, pa[1] + (pb[1] - pa[1]) * q];
      ctx.strokeStyle = acc; ctx.lineWidth = 5 * u; ctx.shadowColor = acc; ctx.shadowBlur = 12 * u; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(end[0], end[1]); ctx.stroke(); ctx.shadowBlur = 0;
      if (q >= 1) { const f = (local * 0.6 + j * 0.37) % 1; ctx.fillStyle = K.mix(acc, '#FFFFFF', 0.5); ctx.beginPath(); ctx.arc(pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f, 7 * u, 0, TAU); ctx.fill(); }
    });
    el.nodes.forEach((node, k) => {
      const p = ease.outBack(clamp01((local - k * 0.15) / 0.35));
      if (p <= 0) return;
      const [x, y] = at(k);
      ctx.save(); ctx.translate(x, y); ctx.scale(p, p);
      ctx.fillStyle = st.fill || K.mix(K.PAL.bg, '#FFFFFF', 0.15); ctx.strokeStyle = acc; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (node.icon && p > 0.6) K.render(K.propOf(node.icon)(K.frame(x, y, r * 1.55, 1), {tl: local, seed: k}), 1, 31 + k);
      if (p > 0.3) K.pill(node.label, x, y + r + 38 * u, 38 * u, {color: K.mix(st.text, K.PAL.bg, 0.2)});
    });
    ctx.restore();
  }

  // ------------------------------------------------------------ evidence and measuring tools (0.39)
  // From the documentary channels (quote cards, documents, a dial for a list's position) and lemo-opuscar's evidence
  // films (one reading per screen, the loupe, the range line). Their words and numbers come from the narration.
  const numberIn = text => { const m = String(text || '').match(NUMBER); return m ? {value: Number(m[1].replace(/,/g, '')), raw: m[1]} : null; };
  // A number rolls one value per frame with shrinking steps and lands on its value; it never slides.
  function rolled(text, local, span = 0.8) {
    const n = numberIn(text);
    // A year is a date, not a quantity: it lands as it is (audit 2026-10-19: 1602 counted up from 0).
    if (!n || !Number.isFinite(n.value) || (/^(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})$/.test(n.raw) && !/[$£€¥₹%]/.test(text))) return text;
    const q = ease.softLand(clamp01(Math.floor(Math.max(0, local) * 24) / 24 / span)), decimals = (n.raw.split('.')[1] || '').length;
    return String(text).replace(n.raw, (n.value * q).toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: n.raw.includes(',') || Math.abs(n.value) >= 10000}));
  }
  // Words with their key words (*between stars*) marked.
  const hotWords = text => {
    let open = false;
    return String(text).split(/\s+/).filter(Boolean).map(word => {
      const starts = /^[^\w]*\*/.test(word), ends = /\*[^\w]*$/.test(word) && (!starts || word.replace(/[^*]/g, '').length > 1), hot = open || word.includes('*');
      if (starts && !ends) open = true;
      if (ends) open = false;
      return {text: word.replace(/\*/g, ''), hot};
    }).filter(word => word.text);
  };
  function drawQuote(el, i, local) {
    const {ctx, u} = K, est = LAYOUT.est[i], [x1, y1] = est.box, w = est.w, h = est.h, st = panelStyle(), acc = K.PAL.accent, q = ease.snapSettle(clamp01(local / 0.45));
    ctx.save(); ctx.globalAlpha *= clamp01(local / 0.18); ctx.translate(0, (1 - q) * 0.035 * K.H);
    if (st.fill) { ctx.fillStyle = st.fill; ctx.beginPath(); ctx.roundRect(x1, y1, w, h, 18 * u); ctx.fill(); if (st.line) { ctx.strokeStyle = st.line; ctx.lineWidth = 2 * u; ctx.stroke(); } }
    // The speaker: a portrait in a ring (a cast member's own look) with a name tag.
    const R = Math.min(h * 0.3, w * 0.13), px = x1 + 0.05 * w + R, py = y1 + h * 0.42, fh = 2.6 * R, s = fh / (K.FIGURE_SIZE.m * u);
    ctx.save(); ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.clip();
    ctx.fillStyle = K.mix(K.PAL.bg, acc, 0.22); ctx.fillRect(px - R, py - R, 2 * R, 2 * R);
    ctx.translate(px, py + 0.8 * fh - 0.08 * R); ctx.scale(s, s);
    K.drawFigure({x: 0, y: 0, dir: 1, size: 'm', A: K.poseAngles('talk', local, 0), pose: 'talk', expression: el.expression || 'neutral', emote: 'none', talk: true, tl: local, seed: LAYOUT.el[i].seed, look: el.look || {}, engine: D.engine}, 1);
    ctx.restore();
    ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.stroke(); ctx.restore();
    if (el.name) K.pill(el.name, px, py + R + 34 * u, 30 * u);
    // The words arrive at a speaking pace; key words (*stars*) in the accent.
    const tx = px + R + 0.05 * w, tw = x1 + w - 0.04 * w - tx, fs = Math.min(56 * u, h * 0.13), space = K.measure(' ', fs, {weight: 700}), lines = [[]];
    K.text('“', tx + fs * 0.3, y1 + h * 0.2, fs * 2.2, {color: acc, outline: false, weight: 900});
    let lw = 0;
    for (const word of hotWords(el.text)) { const ww = K.measure(word.text, fs, {weight: 700}); if (lines.at(-1).length && lw + space + ww > tw) { lines.push([]); lw = 0; } lines.at(-1).push({...word, w: ww}); lw += (lw ? space : 0) + ww; }
    const shown = lines.slice(0, 5), lh = fs * 1.28, top = y1 + h * 0.52 - (shown.length - 1) * lh / 2;
    let k = 0;
    shown.forEach((line, li) => { let cx = tx; for (const word of line) { const r = ease.softLand(clamp01((local - 0.25 - k * 0.06) / 0.3)); if (r > 0) { ctx.save(); ctx.globalAlpha *= r; K.text(word.text, cx, top + li * lh + (1 - r) * fs * 0.4, fs, {color: word.hot ? acc : st.text, align: 'left', weight: 700, outline: false}); ctx.restore(); } cx += word.w + space; k++; } });
    if (el.source) K.text(el.source, tx, y1 + h * 0.9, fs * 0.55, {color: st.sub, align: 'left', weight: 600, outline: false, maxWidth: tw});
    ctx.restore();
    LAYOUT.anchors[i] = est;
  }
  // A document on the desk: the source's name, a headline, grey lines (never invented text) and one real line that
  // lights up while the camera reads it (archive films; the narration's own words).
  function drawDocument(el, i, local) {
    const {ctx, u} = K, est = LAYOUT.est[i], [cx, cy] = est.center, w = est.w, h = est.h, news = el.doc === 'newspaper', ink = '#1E1B18', rand = K.seeded(LAYOUT.el[i].seed);
    const q = ease.snapSettle(clamp01(local / 0.4)), tilt = (LAYOUT.el[i].seed % 2 ? 1 : -1) * 0.022;
    ctx.save(); ctx.translate(cx, cy + (1 - q) * 0.05 * K.H); ctx.rotate(tilt); ctx.globalAlpha *= clamp01(local / 0.15);
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u;
    ctx.fillStyle = news ? '#EDE6D6' : el.doc === 'post' ? '#FFFFFF' : '#FBF8F1'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, el.doc === 'post' ? 22 * u : 3 * u); ctx.fill(); ctx.shadowColor = 'transparent';
    const pad = 0.07 * w, left = -w / 2 + pad, right = w / 2 - pad, centred = news;
    let y = -h / 2 + pad;
    if (el.doc === 'post') { ctx.fillStyle = K.mix('#FFFFFF', K.PAL.accent, 0.5); ctx.beginPath(); ctx.arc(left + 26 * u, y + 26 * u, 26 * u, 0, TAU); ctx.fill(); }
    if (el.source) {
      const fs = Math.min(30 * u, h * 0.06), sx = el.doc === 'post' ? left + 66 * u : centred ? 0 : left;
      K.text(el.doc === 'post' ? el.source : el.source.toUpperCase(), sx, y + fs * 0.6, fs, {color: ink, weight: 800, outline: false, align: centred ? 'center' : 'left', maxWidth: right - sx});
      y += fs * (el.doc === 'post' ? 2.2 : 1.4);
      if (news) { ctx.fillStyle = ink; ctx.fillRect(left, y, right - left, 3 * u); ctx.fillRect(left, y + 6 * u, right - left, 1.2 * u); y += 18 * u; }
    }
    if (el.headline) {
      const fs = Math.min(62 * u, h * 0.105), lines = wrapWords(el.headline, fs, right - left).slice(0, 2);
      lines.forEach((line, k) => K.text(line, centred ? 0 : left, y + fs * (0.6 + k * 1.1), fs, {color: ink, weight: 900, outline: false, align: centred ? 'center' : 'left', maxWidth: right - left}));
      y += fs * (lines.length * 1.1 + 0.45);
    }
    const lineH = Math.max(12 * u, h * 0.034), cols = news ? 3 : 1, gap = 0.04 * w, colW = (right - left - gap * (cols - 1)) / cols;
    const rows = Math.max(3, Math.floor((h / 2 - pad - y) / (lineH * 1.9))), hi = Math.min(rows - 2, Math.max(0, Math.floor(rows * 0.4)));
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      if (el.line && (r === hi || r === hi + 1)) continue;
      ctx.fillStyle = 'rgba(30,27,24,0.2)'; ctx.fillRect(left + c * (colW + gap), y + r * lineH * 1.9, colW * (r === rows - 1 ? 0.5 : 0.8 + rand() * 0.2), lineH * 0.55);
    }
    if (el.line) {
      const fs = Math.min(40 * u, h * 0.065), ly = y + hi * lineH * 1.9 + fs * 0.3, lines = wrapWords(el.line, fs, right - left).slice(0, 2), widest = Math.max(...lines.map(line => K.measure(line, fs, {weight: 800})));
      const r = ease.inOutCubic(clamp01((local - 0.55) / 0.45)), mark = K.lum(K.PAL.accent) > 0.45 ? K.PAL.accent : C.yellow;
      if (r > 0) { ctx.fillStyle = K.alpha(mark, 0.5); ctx.fillRect(left - 6 * u, ly - fs * 0.68, (widest + 12 * u) * r, fs * 1.15 * lines.length + fs * 0.2); }
      lines.forEach((line, k) => K.text(line, left, ly + k * fs * 1.15, fs, {color: ink, weight: 800, outline: false, align: 'left', maxWidth: right - left}));
    }
    ctx.restore();
    LAYOUT.anchors[i] = est;
  }
  // A dial: a reading on its scale (the needle leans past its mark and settles), or a list's position (item 3 of 7).
  function drawGauge(el, i, local) {
    const {ctx, u} = K, est = LAYOUT.est[i], cx = est.center[0], w = est.w, h = est.h, st = panelStyle(), acc = K.PAL.accent;
    const R = Math.min(w * 0.42, h * 0.5), oy = est.box[1] + h * 0.1 + R, a0 = Math.PI * 0.85, span = Math.PI * 1.3;
    ctx.save(); ctx.globalAlpha *= clamp01(local / 0.25); ctx.lineCap = 'round';
    if (el.steps) {
      const n = el.steps, k = Math.min(n, Math.max(1, Math.round(el.value)));
      for (let s = 0; s < n; s++) {
        const r = ease.popOver(clamp01((local - 0.12 - s * 0.05) / 0.4)), now = s === k - 1;
        ctx.strokeStyle = now ? acc : s < k ? K.mix(acc, st.text, 0.55) : K.alpha(st.text, 0.16); ctx.lineWidth = (now ? 30 : 22) * u * Math.max(0.01, r);
        ctx.beginPath(); ctx.arc(cx, oy, R, a0 + span * s / n + 0.03, a0 + span * (s + 1) / n - 0.03); ctx.stroke();
      }
      K.text(`${k}/${n}`, cx, oy, R * 0.5, {color: acc, weight: 900});
    } else {
      const min = el.min ?? 0, max = el.max ?? 100, f = clamp01((el.value - min) / ((max - min) || 1)), n = ease.popOver(clamp01((local - 0.2) / 0.9)) * f, an = a0 + span * n;
      ctx.strokeStyle = K.alpha(st.text, 0.16); ctx.lineWidth = 22 * u; ctx.beginPath(); ctx.arc(cx, oy, R, a0, a0 + span); ctx.stroke();
      ctx.strokeStyle = acc; ctx.beginPath(); ctx.arc(cx, oy, R, a0, a0 + span * Math.max(0.0001, Math.min(f, n))); ctx.stroke();
      ctx.strokeStyle = K.alpha(st.text, 0.5); ctx.lineWidth = 3 * u;
      for (let s = 0; s <= 10; s++) { const a = a0 + span * s / 10, r1 = R - 20 * u, r2 = R - (s % 5 ? 32 : 44) * u; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, oy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, oy + Math.sin(a) * r2); ctx.stroke(); }
      ctx.strokeStyle = st.text; ctx.lineWidth = 7 * u; ctx.beginPath(); ctx.moveTo(cx, oy); ctx.lineTo(cx + Math.cos(an) * (R - 40 * u), oy + Math.sin(an) * (R - 40 * u)); ctx.stroke();
      ctx.fillStyle = st.text; ctx.beginPath(); ctx.arc(cx, oy, 12 * u, 0, TAU); ctx.fill();
      K.text(rolled(fmtValue(el.value, el.unit), local - 0.2, 0.9), cx, oy + R * 0.4, R * 0.3, {color: acc, weight: 900});
    }
    if (el.label) K.pill(el.label, cx, oy + R * 0.86, 32 * u);
    ctx.restore();
    LAYOUT.anchors[i] = est;
  }
  // The loupe: a lens lands beside the spot and shows it magnified, with a leader to what it reads (two scales at once).
  function drawLoupe(el, i, local) {
    const {ctx, u} = K, est = LAYOUT.est[i], [lx, ly] = est.center, R = est.r, acc = K.PAL.accent, zoom = el.zoom || 2.5;
    const target = anchorOf(el.on, {center: [K.W / 2, K.H / 2]}).center, q = ease.popOver(clamp01(local / 0.42)), r = R * Math.max(0.01, q), line = K.DARK ? '#FFFFFF' : K.PAL.ink;
    const dx = target[0] - lx, dy = target[1] - ly, d = Math.hypot(dx, dy) || 1, spot = R / zoom;
    ctx.save(); ctx.strokeStyle = line; ctx.lineWidth = 3 * u; ctx.globalAlpha *= 0.85 * clamp01(local / 0.3);
    if (d > r + spot) { ctx.beginPath(); ctx.moveTo(lx + dx / d * r, ly + dy / d * r); ctx.lineTo(target[0] - dx / d * spot, target[1] - dy / d * spot); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(target[0], target[1], spot, 0, TAU); ctx.stroke(); ctx.restore();
    // What the frame shows so far, read back through the same transform and drawn larger inside the lens.
    const m = ctx.getTransform(), src = m.transformPoint(new DOMPoint(target[0], target[1])), dst = m.transformPoint(new DOMPoint(lx, ly)), scale = Math.hypot(m.a, m.b), rd = r * scale, rs = rd / zoom;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.arc(dst.x, dst.y, rd, 0, TAU); ctx.clip();
    ctx.fillStyle = K.PAL.bg; ctx.fillRect(dst.x - rd, dst.y - rd, 2 * rd, 2 * rd);
    ctx.drawImage(ctx.canvas, src.x - rs, src.y - rs, 2 * rs, 2 * rs, dst.x - rd, dst.y - rd, 2 * rd, 2 * rd);
    ctx.restore();
    ctx.save(); ctx.lineWidth = 12 * u; ctx.strokeStyle = '#1B1D21'; ctx.beginPath(); ctx.arc(lx, ly, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3 * u; ctx.strokeStyle = K.alpha('#FFFFFF', 0.55); ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, r - 5 * u), Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    ctx.strokeStyle = acc; ctx.beginPath(); ctx.arc(lx, ly, r + 8 * u, 0, TAU); ctx.stroke(); ctx.restore();
    if (el.label && q > 0.6) K.pill(el.label, lx, ly + r + 36 * u, 32 * u);
    LAYOUT.anchors[i] = est;
  }
  // The range line: a measured line grows from A to B with its ticks while the reading rides it and lands on the number.
  function drawRuler(el, i, local) {
    const {ctx, u} = K, acc = K.PAL.accent, a = anchorOf(el.from, {center: [0.2 * K.W, 0.6 * K.H]}).center, b = anchorOf(el.to, {center: [0.8 * K.W, 0.6 * K.H]}).center;
    const q = ease.snapSettle(clamp01(local / 0.9)), tip = [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const bar = (p, s) => { ctx.beginPath(); ctx.moveTo(p[0] - nx * s, p[1] - ny * s); ctx.lineTo(p[0] + nx * s, p[1] + ny * s); ctx.stroke(); };
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = acc; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = K.DARK ? '#FFFFFF' : K.PAL.ink; ctx.lineWidth = 3 * u; bar(a, 22 * u);
    for (let k = 1; k < 10; k++) if (k / 10 <= q) bar([a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10], (k === 5 ? 14 : 9) * u);
    if (q > 0.98) bar(b, 22 * u);
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(tip[0], tip[1], 9 * u, 0, TAU); ctx.fill(); ctx.restore();
    const flip = ny > 0 ? -1 : 1, mid = [(a[0] + tip[0]) / 2 + flip * nx * 56 * u, (a[1] + tip[1]) / 2 + flip * ny * 56 * u];
    if (el.value) { const z = 1 + 0.12 * Math.exp(-Math.max(0, local - 0.9) * 8) * (local > 0.9 ? 1 : 0); ctx.save(); ctx.translate(mid[0], mid[1]); ctx.scale(z, z); K.text(rolled(el.value, local, 0.9), 0, 0, 58 * u, {color: acc, weight: 900}); ctx.restore(); }
    if (el.label) K.pill(el.label, mid[0], mid[1] - 64 * u, 30 * u);
    LAYOUT.anchors[i] = LAYOUT.est[i];
  }

  // ------------------------------------------------------------ film looks (0.39): one finish over the whole frame
  // The way a medium prints the finished picture, after lemo-opuscar's film styles (MIT, pinned 508848a; their
  // style prompts are restated in our own words in docs/research/lemo-opuscar-and-motionmaxxing.md). Where the medium
  // allows it, the accent colour survives (the hero keeps its colour). Pure functions of time; randomness is seeded.
  const SOLID_TYPE = new Set(['newsprint', 'riso', 'engraving']);
  const FILMS = {silent: 1, noir: 1, sepia: 1, selective: 1, newsprint: 1, riso: 1, blueprint: 1, woodcut: 1, kinescope: 1, technicolor: 1, album: 1, screenprint: 1, engraving: 1, deco: 1};
  let filmCanvas = null, filmCtx = null, smallCanvas = null, smallCtx = null;
  const scratch = (w, h) => {
    if (!filmCanvas || filmCanvas.width !== w || filmCanvas.height !== h) { filmCanvas = document.createElement('canvas'); filmCanvas.width = w; filmCanvas.height = h; filmCtx = filmCanvas.getContext('2d'); }
    filmCtx.setTransform(1, 0, 0, 1, 0, 0); filmCtx.filter = 'none'; filmCtx.globalAlpha = 1; filmCtx.globalCompositeOperation = 'source-over'; filmCtx.clearRect(0, 0, w, h);
    return filmCtx;
  };
  // The frame at a low resolution, for the printed looks that sample it (dots, engraved lines).
  function sample(cell) {
    const canvas = K.ctx.canvas, w = Math.ceil(canvas.width / cell), h = Math.ceil(canvas.height / cell);
    if (!smallCanvas || smallCanvas.width !== w || smallCanvas.height !== h) { smallCanvas = document.createElement('canvas'); smallCanvas.width = w; smallCanvas.height = h; smallCtx = smallCanvas.getContext('2d', {willReadFrequently: true}); }
    smallCtx.drawImage(canvas, 0, 0, w, h);
    return {w, h, px: smallCtx.getImageData(0, 0, w, h).data};
  }
  const hueOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (hh * 60 + 360) % 360; };
  const smooth = x => x * x * (3 - 2 * x);
  function drawFilm(name, t) {
    const {ctx} = K, canvas = ctx.canvas, cw = canvas.width, ch = canvas.height, v = ch / 1080, rand = K.seeded(Math.floor(t * 24) * 131 + 7), shot = K.seeded((K.SEED || 1) + 17);
    const [ar, ag, ab] = K.hexRgb(K.PAL.accent), accH = hueOf(ar, ag, ab), accentOk = Math.max(ar, ag, ab) - Math.min(ar, ag, ab) > 50;
    // How much a pixel belongs to the accent (the hero's colour): 0-1.
    const keep = (r, g, b) => { if (!accentOk) return 0; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 90 || mx < 110) return 0; const dh = Math.abs(hueOf(r, g, b) - accH), dd = Math.min(dh, 360 - dh); return dd < 24 ? 1 - dd / 24 : 0; };
    const pixels = f => { const img = ctx.getImageData(0, 0, cw, ch), px = img.data; for (let k = 0; k < px.length; k += 4) f(px, k, px[k], px[k + 1], px[k + 2], 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]); ctx.putImageData(img, 0, 0); };
    const mixTo = (px, k, R, G, B, r, g, b, h) => { px[k] = R + (r - R) * h; px[k + 1] = G + (g - G) * h; px[k + 2] = B + (b - B) * h; };
    const grain = (count, alpha) => { for (let k = 0; k < count; k++) { ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`; const s = (1 + rand() * 1.5) * v; ctx.fillRect(rand() * cw, rand() * ch, s, s); } };
    const vignette = (alpha, rgb = '0,0,0', inner = 0.42) => { const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * inner, cw / 2, ch / 2, ch); g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${alpha})`); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); };
    const corners = (r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.roundRect(0, 0, cw, ch, r); ctx.fill('evenodd'); };
    const blobs = (n, dark, light) => { for (let k = 0; k < n; k++) { const x = shot() * cw, y = shot() * ch, rr = (0.08 + shot() * 0.2) * ch, g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, shot() > 0.5 ? dark : light); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); } };
    const dots = (S, cell, color, value, dx = 0, dy = 0) => {
      ctx.fillStyle = color; ctx.beginPath();
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
        const k = (y * S.w + x) * 4, d = value(S.px[k], S.px[k + 1], S.px[k + 2]);
        if (d < 0.1) continue;
        const r = cell * 0.66 * Math.sqrt(Math.min(1, d)), cx = (x + 0.5 + (y % 2) * 0.5) * cell + dx, cy = (y + 0.5) * cell + dy;
        ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU);
      }
      ctx.fill();
    };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    switch (name) {
      case 'silent': {
        // Orthochromatic silver with whites half-way to amber, flicker, gate weave, scratches, dust and the rounded gate.
        const flick = 1 + 0.05 * K.noise(t * 9);
        pixels((px, k, r, g, b, L) => { const x = Math.min(255, smooth(L / 255) * flick * 255), w = x / 255; mixTo(px, k, x, x * (1 - 0.1 * w), x * (1 - 0.25 * w), r, g, b, keep(r, g, b) * 0.7); });
        const wx = Math.round(K.noise(t * 3) * 1.6 * v), wy = Math.round(K.noise(t * 2.3 + 5) * 1.6 * v);
        if (wx || wy) { scratch(cw, ch).drawImage(canvas, 0, 0); ctx.fillStyle = '#0D0B08'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(filmCanvas, wx, wy); }
        grain(2400, 0.08);
        ctx.strokeStyle = 'rgba(255,248,230,0.32)'; ctx.lineWidth = 1.2 * v;
        for (let k = 0; k < 3; k++) if (rand() < 0.4) { const x = rand() * cw; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rand() - 0.5) * 8 * v, ch); ctx.stroke(); }
        ctx.fillStyle = 'rgba(20,14,8,0.5)'; for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.arc(rand() * cw, rand() * ch, (1 + rand() * 3) * v, 0, TAU); ctx.fill(); }
        vignette(0.55, '20,14,8', 0.36); corners(26 * v, '#0D0B08');
        break;
      }
      case 'noir': {
        // Studio black-and-white: deep blacks, glowing small whites, a diffusion glow and slatted shadows of blinds.
        pixels((px, k, r, g, b, L) => { const x = Math.max(0, Math.min(255, (smooth(L / 255) - 0.5) * 1.4 * 255 + 116)); mixTo(px, k, x, x, x, r, g, b, keep(r, g, b) * 0.8); });
        const c = scratch(cw, ch); c.filter = `blur(${10 * v}px)`; c.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.22; ctx.drawImage(filmCanvas, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(cw * 0.5, ch * 0.5); ctx.rotate(-0.42); ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = -ch; y < ch; y += 64 * v) ctx.fillRect(-cw, y, cw * 2, 22 * v); ctx.restore();
        grain(2200, 0.07); vignette(0.5, '0,0,0', 0.4);
        break;
      }
      case 'sepia': {
        // A toned albumen print: umber blacks, cream whites, a hand-tinted hero, blotchy development.
        pixels((px, k, r, g, b, L) => { const x = L / 255; mixTo(px, k, 46 + 196 * x, 28 + 192 * x, 15 + 165 * x, r, g, b, keep(r, g, b) * 0.65); });
        blobs(26, 'rgba(60,35,15,0.07)', 'rgba(255,240,210,0.07)'); grain(2000, 0.06); vignette(0.6, '120,86,52', 0.34);
        break;
      }
      case 'selective': {
        // Black and white with one colour: only what carries the accent keeps it (the hero, one story object).
        pixels((px, k, r, g, b, L) => { const x = Math.max(0, Math.min(255, (smooth(L / 255) - 0.5) * 1.15 * 255 + 128)); mixTo(px, k, x, x, x, r, g, b, keep(r, g, b)); });
        grain(1600, 0.05); vignette(0.3);
        break;
      }
      case 'newsprint': {
        // A newspaper print: black halftone dots on newsprint, the hero on its own spot plate a little off register.
        const cell = Math.max(5, Math.round(7 * v)), S = sample(cell);
        ctx.fillStyle = '#E8E0CC'; ctx.fillRect(0, 0, cw, ch);
        dots(S, cell, '#17130F', (r, g, b) => (1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255) * (1 - keep(r, g, b) * 0.8));
        dots(S, cell, K.alpha(K.PAL.accent, 0.92), (r, g, b) => keep(r, g, b) * 0.95, 2 * v, 1 * v);
        grain(1200, 0.05); vignette(0.18, '70,55,30', 0.5);
        break;
      }
      case 'riso': {
        // Two translucent spot inks on warm paper, each a halftone at its own offset (fixed for the shot).
        const cell = Math.max(5, Math.round(6 * v)), S = sample(cell), off = [(shot() - 0.5) * 6 * v, (shot() - 0.5) * 6 * v];
        const deep = K.lum(K.PAL.ink) < 0.35 ? K.PAL.ink : '#1F3A93', sat = (r, g, b) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        ctx.fillStyle = '#F4EEE2'; ctx.fillRect(0, 0, cw, ch); ctx.globalCompositeOperation = 'multiply';
        dots(S, cell, K.alpha(K.PAL.accent, 0.85), (r, g, b) => sat(r, g, b) * 1.1 + (1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255) * 0.2, off[0], off[1]);
        dots(S, cell, K.alpha(deep, 0.85), (r, g, b) => Math.max(0, (1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255) - sat(r, g, b) * 0.5));
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(244,238,226,0.5)'; for (let k = 0; k < 900; k++) ctx.fillRect(rand() * cw, rand() * ch, 1.4 * v, 1.4 * v);
        break;
      }
      case 'blueprint': {
        // White lines on Prussian-blue paper: what was drawn dark prints white; the hero keeps its colour.
        pixels((px, k, r, g, b, L) => { const x = Math.pow(K.DARK ? L / 255 : 1 - L / 255, 0.85); mixTo(px, k, 20 + 216 * x, 56 + 188 * x, 116 + 139 * x, r, g, b, keep(r, g, b) * 0.85); });
        blobs(22, 'rgba(5,20,60,0.12)', 'rgba(120,170,230,0.07)');
        ctx.strokeStyle = 'rgba(200,225,255,0.10)'; ctx.lineWidth = 2 * v; ctx.beginPath(); ctx.moveTo(cw * (0.3 + shot() * 0.4), 0); ctx.lineTo(cw * (0.3 + shot() * 0.4), ch); ctx.moveTo(0, ch * (0.4 + shot() * 0.2)); ctx.lineTo(cw, ch * (0.4 + shot() * 0.2)); ctx.stroke();
        vignette(0.4, '4,14,40', 0.42);
        break;
      }
      case 'woodcut': {
        // Black is the wood, white is what the knife cut away; one colour plate prints only the hero's colour.
        pixels((px, k, r, g, b, L) => {
          const n = (((k >> 2) % cw) * 7 + (((k >> 2) / cw) | 0) * 13) % 17 / 17 * 40 - 20, h = keep(r, g, b);
          if (h > 0.35) { px[k] = ar; px[k + 1] = ag; px[k + 2] = ab; } else if (L + n > 118) { px[k] = 232; px[k + 1] = 223; px[k + 2] = 202; } else { px[k] = 23; px[k + 1] = 19; px[k + 2] = 15; }
        });
        ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = 'rgba(232,223,202,0.05)'; ctx.lineWidth = 1.5 * v; ctx.beginPath();
        for (let y = 0; y < ch; y += 7 * v) { ctx.moveTo(0, y); for (let x = 0; x <= cw; x += 80 * v) ctx.lineTo(x, y + K.noise(x * 0.004 + y * 0.03) * 4 * v); }
        ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; grain(900, 0.05);
        break;
      }
      case 'kinescope': {
        // A 1950s television picture: soft cool phosphor, scanlines, a rolling hum bar, a ghost and the tube's corners.
        const c = scratch(cw, ch); c.filter = `blur(${1.2 * v}px)`; c.drawImage(canvas, 0, 0); ctx.drawImage(filmCanvas, 0, 0);
        pixels((px, k, r, g, b, L) => { const x = 26 + L * 0.84; mixTo(px, k, x * 0.86, x * 0.9, x * 0.92, r, g, b, keep(r, g, b) * 0.7); });
        ctx.globalAlpha = 0.12; ctx.drawImage(canvas, 5 * v, 0); ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < ch; y += 3 * v) ctx.fillRect(0, y, cw, Math.max(1, 1.1 * v));
        const bar = ((t * 0.18) % 1.3 - 0.15) * ch, g = ctx.createLinearGradient(0, bar - 60 * v, 0, bar + 60 * v); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, bar - 60 * v, cw, 120 * v);
        grain(1500, 0.06); vignette(0.45, '0,0,0', 0.38); corners(64 * v, 'rgba(8,10,12,0.96)');
        break;
      }
      case 'technicolor': {
        // A saturated three-strip print: warm, rich, a little contrast and a soft bloom.
        const c = scratch(cw, ch); c.filter = 'saturate(1.4) contrast(1.08) sepia(0.12)'; c.drawImage(canvas, 0, 0); ctx.drawImage(filmCanvas, 0, 0);
        const b = scratch(cw, ch); b.filter = `blur(${12 * v}px) brightness(1.1)`; b.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.12; ctx.drawImage(filmCanvas, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        grain(1400, 0.04); vignette(0.28, '60,20,0', 0.45);
        break;
      }
      case 'album': {
        // A 1970s snapshot in an album: faded dyes, teal-grey blacks, creamy highlights, soft, a white print border.
        const c = scratch(cw, ch); c.filter = `blur(${0.8 * v}px) saturate(0.62)`; c.drawImage(canvas, 0, 0); ctx.drawImage(filmCanvas, 0, 0);
        pixels((px, k, r, g, b) => { px[k] = 53 + r * 0.8; px[k + 1] = 58 + g * 0.74; px[k + 2] = 58 + b * 0.66; });
        grain(1600, 0.05); vignette(0.22, '90,60,30', 0.45);
        const bw = 0.022 * ch; ctx.fillStyle = '#F7F3EA'; ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.rect(bw, bw, cw - 2 * bw, ch - 2 * bw); ctx.fill('evenodd');
        break;
      }
      case 'screenprint': {
        // A silkscreen poster: values stepped into flat bands (no gradients), a key printed a little off register, paper.
        pixels((px, k, r, g, b, L) => { const s = L > 1 ? (Math.round(L / 255 * 4) / 4 * 255) / L : 0; px[k] = r * s; px[k + 1] = g * s; px[k + 2] = b * s; });
        const c = scratch(cw, ch); c.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.22; ctx.drawImage(filmCanvas, 2 * v, 2 * v); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(240,226,192,0.35)'; for (let k = 0; k < 1400; k++) ctx.fillRect(rand() * cw, rand() * ch, 1.4 * v, 1.4 * v);
        break;
      }
      case 'engraving': {
        // A copperplate: every tone made of engraved lines that swell where it is dark, cross-hatched in the darks, then
        // hand-coloured with thin washes.
        const c = scratch(cw, ch); c.drawImage(canvas, 0, 0);
        const sp = Math.max(4, Math.round(5 * v)), S = sample(sp), lum = (x, y) => { const k = (y * S.w + Math.min(S.w - 1, x)) * 4; return (0.299 * S.px[k] + 0.587 * S.px[k + 1] + 0.114 * S.px[k + 2]) / 255; };
        ctx.fillStyle = '#EFE3C4'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#1C1610';
        for (let y = 0; y < S.h; y++) {
          const top = [], bottom = [];
          for (let x = 0; x <= S.w; x++) { const d = Math.pow(1 - lum(x, y), 1.1) * sp * 0.46, cy = (y + 0.5) * sp + K.noise(x * 0.15 + y * 0.7) * sp * 0.15; top.push([x * sp, cy - d]); bottom.push([x * sp, cy + d]); }
          ctx.beginPath(); top.forEach(([x, yy], k) => (k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); for (let k = bottom.length - 1; k >= 0; k--) ctx.lineTo(bottom[k][0], bottom[k][1]); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#1C1610'; ctx.lineWidth = Math.max(1, 0.9 * v); ctx.beginPath();
        for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (lum(x, y) < 0.36) { ctx.moveTo(x * sp, (y + 1) * sp); ctx.lineTo((x + 1) * sp, y * sp); }
        ctx.stroke();
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.4; ctx.filter = 'saturate(1.25) brightness(1.2)'; ctx.drawImage(filmCanvas, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        vignette(0.2, '90,60,30', 0.5);
        break;
      }
      case 'deco': {
        // Art deco metal: tones become gold in hard bands on warm black (a light palette prints in reverse, so the ground
        // is black lacquer and the lines are gold), the hero keeps its colour, a few glints.
        const BANDS = [[10, 9, 8], [58, 46, 20], [138, 110, 46], [214, 181, 96], [243, 226, 162]];
        pixels((px, k, r, g, b, L) => { const c = BANDS[Math.min(4, Math.floor((K.DARK ? L : 255 - L) / 255 * 5))]; mixTo(px, k, c[0], c[1], c[2], r, g, b, keep(r, g, b)); });
        ctx.fillStyle = 'rgba(255,240,200,0.8)';
        for (let k = 0; k < 6; k++) { const x = shot() * cw, y = shot() * ch, s = (6 + 10 * Math.max(0, Math.sin(t * 2.4 + k * 1.7))) * v; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.16, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.16, y); ctx.closePath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.16); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.16); ctx.closePath(); ctx.fill(); }
        grain(1200, 0.04); vignette(0.45, '0,0,0', 0.42);
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ pictures (0.33)
  // A picture's shapes as Path2D with their lengths and boxes, measured once per shot on hidden SVG paths (the
  // path data was checked in Node: commands and numbers only).
  let SVG_ROOT = null;
  function pictureGeom(el, i) {
    if (!el.art) return null;
    if (LAYOUT.pics[i]) return LAYOUT.pics[i];
    const NS = 'http://www.w3.org/2000/svg';
    if (!SVG_ROOT || !SVG_ROOT.isConnected) { SVG_ROOT = document.createElementNS(NS, 'svg'); SVG_ROOT.setAttribute('width', '0'); SVG_ROOT.setAttribute('height', '0'); (document.body || document.documentElement).appendChild(SVG_ROOT); }
    const est = LAYOUT.est[i], [vw, vh] = el.art.viewBox, s = Math.min(est.w / vw, est.h / vh);
    let total = 0;
    const paths = el.art.paths.map(item => {
      const node = document.createElementNS(NS, 'path');
      node.setAttribute('d', item.d); SVG_ROOT.appendChild(node);
      const len = item.stroke !== 'none' ? node.getTotalLength() : 0;
      let box = [0, 0, vw, vh];
      try { const b = node.getBBox(); box = [b.x, b.y, b.width, b.height]; } catch { /* an empty shape keeps the whole box */ }
      // A background shape that fills the picture (sky, wall, ground) is laid down as colour, never outlined, so a
      // picture never reads as a card stuck on the board (demo review 2026-10-16).
      const backdrop = box[2] >= 0.9 * vw && box[3] >= 0.5 * vh, traced = backdrop ? 0 : len;
      const from = total; total += traced;
      return {...item, ...(backdrop ? {stroke: 'none'} : {}), p2d: new Path2D(item.d), len: traced, from, node, box, big: box[2] * box[3] > 0.04 * vw * vh};
    });
    LAYOUT.pics[i] = {x0: est.center[0] - vw * s / 2, y0: est.center[1] - vh * s / 2, s, paths, total};
    return LAYOUT.pics[i];
  }
  // The hand traces every outline in the illustrator's order (later shapes cover earlier lines, as on paper), then the
  // colour washes in. Each whiteboard look shows it its own way: black marker keeps it line art, pencil is grey and
  // pale, dry-erase colours the big shapes in with marker strokes.
  // A painted backdrop fills the frame behind the whole shot, a little larger than the frame so camera moves never
  // show an edge, and fades in only when it opens a place; a painted picture is a card that wipes in (hand-made
  // looks) or lands (motion design).
  function drawPainted(el, i, local, enter) {
    const image = painted(el), {ctx, u, W, H} = K;
    if (el.backdrop) {
      const s = Math.max(W / image.naturalWidth, H / image.naturalHeight) * 1.06, w = image.naturalWidth * s, h = image.naturalHeight * s;
      ctx.save(); if (enter === 'draw' || enter === 'fade') ctx.globalAlpha *= ease.inOutSine(clamp01(local / 0.4)); ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h); ctx.restore();
      return;
    }
    const est = LAYOUT.est[i], [x0, y0, x1, y1] = est.box, w = x1 - x0, h = y1 - y0, q = ease.inOutSine(clamp01(local / pictureSeconds(el, LAYOUT.el[i].ts))), pad = 7 * u;
    ctx.save();
    if (['flat', 'info'].includes(K.FIN)) { const z = 0.88 + 0.12 * ease.outBack(q); ctx.globalAlpha *= clamp01(q * 1.6); ctx.translate(est.center[0], est.center[1]); ctx.scale(z, z); ctx.translate(-est.center[0], -est.center[1]); }
    else { ctx.beginPath(); ctx.rect(x0 - 30 * u, y0 - 30 * u, (w + 60 * u) * q, h + 60 * u); ctx.clip(); }
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 20 * u; ctx.shadowOffsetY = 7 * u;
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 16 * u); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.roundRect(x0 + pad, y0 + pad, w - 2 * pad, h - 2 * pad, 11 * u); ctx.clip();
    ctx.drawImage(image, x0 + pad, y0 + pad, w - 2 * pad, h - 2 * pad);
    ctx.restore();
  }
  function drawPicture(el, i, local, enter) {
    if (painted(el)) return drawPainted(el, i, local, enter);
    const g = pictureGeom(el, i);
    if (!g) return;
    // Each engine shows a picture its own way (0.34): the whiteboard looks, the stickman looks, motion design.
    const {ctx, u} = K, look = K.FIN === 'wb' ? K.WB : {board: 'marker', story: 'story', doodle: 'doodle', ink: 'ink', flat: 'flat', paint: 'flat'}[K.FIN] || 'cartoon', draws = enter === 'draw', lines = draws ? pictureSeconds(el, LAYOUT.el[i].ts) : 0;
    if (look === 'flat') return buildPicture(g, draws ? lines : 0, local);
    const q = lines ? clamp01(local / lines) : 1, done = q * g.total;
    // Each shape's colour washes in just behind the pen, once its outline is done (a shape without one, when the pen
    // reaches its place in the drawing order).
    const colourOf = path => (draws ? ease.inOutSine(clamp01((local - lines * (path.from + path.len) / Math.max(1, g.total) - 0.12) / 0.4)) : 1);
    const ink = K.DARK ? '#F2F2F2' : '#1E1E1E', paper = K.PAL.bg;
    const strokeOf = path => (['marker', 'doodle', 'ink'].includes(look) ? ink : look === 'pencil' ? K.mix(path.stroke, '#FFFFFF', 0.3) : path.stroke);
    const fillOf = path => (look === 'marker' ? null : look === 'pencil' ? K.mix(path.fill, '#FFFFFF', 0.55) : look === 'story' ? K.mix(path.fill, K.PAL.bg, 0.22) : look === 'ink' ? K.mix(path.fill, '#FFFFFF', 0.2) : path.fill);
    const widthOf = path => Math.max(1.1 * u / g.s, path.width * ({pencil: 0.7, 'dry-erase': 1.3, doodle: 1.8, ink: 0.85}[look] || 1));
    ctx.save(); ctx.translate(g.x0, g.y0); ctx.scale(g.s, g.s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const path of g.paths) {
      const traced = path.len ? clamp01((done - path.from) / path.len) : 0, colour = colourOf(path);
      if (path.fill !== 'none') {
        // A finished outline hides the lines behind it (paper inside it); its colour arrives with the wash.
        if (path.stroke !== 'none' && traced >= 1) { ctx.globalAlpha = 1; ctx.fillStyle = paper; ctx.fill(path.p2d); }
        const paint = fillOf(path);
        if (paint && colour > 0 && (path.stroke === 'none' || traced >= 1)) {
          ctx.globalAlpha = colour;
          if (look === 'dry-erase' && path.big) {
            const [bx, by, bw, bh] = path.box, gap = 6.5 * u / g.s;
            ctx.save(); ctx.clip(path.p2d); ctx.strokeStyle = paint; ctx.lineWidth = gap * 0.85; ctx.beginPath();
            for (let x = bx - bh; x < bx + bw + gap; x += gap) { ctx.moveTo(x, by + bh + gap); ctx.lineTo(x + bh * 0.55, by - gap); }
            ctx.stroke(); ctx.restore();
          } else { ctx.fillStyle = paint; ctx.fill(path.p2d); }
          ctx.globalAlpha = 1;
        }
      }
      if (path.stroke !== 'none' && traced > 0) {
        ctx.strokeStyle = strokeOf(path); ctx.lineWidth = widthOf(path);
        if (traced < 1) ctx.setLineDash([traced * path.len, path.len + 1]);
        ctx.stroke(path.p2d); ctx.setLineDash([]);
        if (traced < 1) { const pt = path.node.getPointAtLength(traced * path.len); K.penAt(pt.x, pt.y); }
      }
    }
    ctx.restore();
  }
  // Motion design: the picture builds in shape by shape, each growing into place from its own centre (no hand, no
  // tracing); a background shape fades in. Outlines come with their shape.
  function buildPicture(g, seconds, local) {
    const {ctx} = K, n = g.paths.length;
    ctx.save(); ctx.translate(g.x0, g.y0); ctx.scale(g.s, g.s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Documentary collage: the picture is a cut-out with a white sticker edge and a soft shadow (under every shape that is in).
    if (K.DESIGN === 'collage') {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18 * K.u / g.s; ctx.shadowOffsetY = 6 * K.u; ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 16 * K.u / g.s;
      g.paths.forEach((path, k) => { if (!seconds || local >= seconds * k / n) { ctx.stroke(path.p2d); ctx.fill(path.p2d); } });
      ctx.restore();
    }
    g.paths.forEach((path, k) => {
      const p = seconds ? clamp01((local - seconds * k / n) / 0.32) : 1;
      if (p <= 0) return;
      const backdrop = path.stroke === 'none' && path.box[2] * path.box[3] > 0.45 * g.paths[0].box[2] * g.paths[0].box[3] && k < 3;
      const z = backdrop ? 1 : ease.outBack(p), cx = path.box[0] + path.box[2] / 2, cy = path.box[1] + path.box[3] / 2;
      ctx.save(); ctx.globalAlpha *= backdrop ? p : Math.min(1, p * 2);
      ctx.translate(cx, cy); ctx.scale(Math.max(0.001, z), Math.max(0.001, z)); ctx.translate(-cx, -cy);
      if (path.fill !== 'none') { ctx.fillStyle = path.fill; ctx.fill(path.p2d); }
      if (path.stroke !== 'none') { ctx.strokeStyle = path.stroke; ctx.lineWidth = Math.max(1.1 * K.u / g.s, path.width); ctx.stroke(path.p2d); }
      ctx.restore();
    });
    ctx.restore();
  }
  // A framed whiteboard: an aluminium frame round the picture and the marker tray along the bottom.
  function drawBoardFrame(context) {
    const {ctx} = K, cw = ctx.canvas.width, ch = ctx.canvas.height, b = ch * 0.03;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#E4E7EA'); g.addColorStop(0.5, '#B9BEC4'); g.addColorStop(1, '#D6DADE');
    ctx.fillStyle = g; ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.roundRect(b, b, cw - 2 * b, ch - 2 * b, b * 0.4); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(60,66,74,0.55)'; ctx.lineWidth = b * 0.12; ctx.beginPath(); ctx.roundRect(b, b, cw - 2 * b, ch - 2 * b, b * 0.4); ctx.stroke();
    const ty = ch - b * 0.95; ctx.fillStyle = '#A9AFB6'; ctx.fillRect(cw * 0.3, ty - b * 0.35, cw * 0.4, b * 0.7);
    [['#1E1E1E', 0.4], ['#2F6FE0', 0.47], ['#D9534F', 0.54]].forEach(([colour, x]) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.roundRect(cw * x, ty - b * 0.3, cw * 0.055, b * 0.36, b * 0.18); ctx.fill(); });
    ctx.restore();
  }
  // ------------------------------------------------------------ the drawing hand (stickman and hand-drawn option)
  // Where the pen is through the whole shot: the elements are drawn once per shot on a throwaway canvas at 15
  // samples a second and the pen's tip is kept. A pure function of the shot, so every frame agrees on it.
  function penTrack(context) {
    const dry = new OffscreenCanvas(4, 4).getContext('2d'), main = K.ctx, step = 1 / 15, tips = [];
    for (let k = 0; k * step <= P.duration + 1e-6; k++) {
      const tt = k * step;
      K.ctx = dry; dry.setTransform(context.scale, 0, 0, context.scale, 0, 0); K.TIP = null; K.T = tt; LAYOUT.anchors = [];
      dry.save(); applyCamera(dry, camera(tt), 1);
      D.elements.forEach((el, i) => { if (!(el.kind === 'fx' && (BACKDROP_FX.has(el.effect) || SCREEN_FX.has(el.effect)))) drawElement(el, i, tt); });
      dry.restore();
      tips.push(K.TIP);
    }
    K.ctx = main; K.TIP = null;
    return {step, tips};
  }
  // The hand between strokes: it comes in from the corner before the first line, lifts and travels on an arc to
  // the next stroke, steps back to rest during a long pause, and leaves when the drawing is done.
  function handAt(t, now, context) {
    const {tips, step} = LAYOUT.track, n = tips.length, Wd = context.ctx.canvas.width, Hd = context.ctx.canvas.height;
    if (now) return {at: now, lift: 0, tilt: 0};
    const k = Math.max(0, Math.min(n - 1, Math.floor(t / step)));
    let a = k; while (a >= 0 && !tips[a]) a--;
    let b = k + 1; while (b < n && !tips[b]) b++;
    if (a >= 0 && a * step > t) a = -1;
    const off = [Wd * 1.12, Hd * 1.2], lerp = (p, q, f) => [K.lerp(p[0], q[0], f), K.lerp(p[1], q[1], f)];
    if (a < 0 && b >= n) return null;
    if (a < 0) { const f = 1 - (b * step - t) / 0.55; return f <= 0 ? null : {at: lerp(off, tips[b], ease.outCubic(f)), lift: 1 - f, tilt: 0}; }
    if (b >= n) { const f = (t - a * step) / 0.6; return f >= 1 ? null : {at: lerp(tips[a], off, ease.inCubic(f)), lift: f, tilt: 0}; }
    const A = tips[a], B = tips[b], gap = (b - a) * step, f = clamp01((t - a * step) / gap), dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (gap <= 1.1) {
      const e = ease.inOutSine(f), arc = Math.sin(Math.PI * f), at = lerp(A, B, e);
      return {at: [at[0], at[1] - arc * Math.min(0.08 * Hd, dist * 0.25)], lift: arc, tilt: Math.max(-1, Math.min(1, (B[0] - A[0]) / Wd * 4)) * arc};
    }
    // A long pause: back off to rest beside the drawing, wait, then go to the next stroke.
    const rest = [Math.min(Wd * 0.92, A[0] + Wd * 0.06), Math.min(Hd * 0.9, A[1] + Hd * 0.1)], go = 0.35 / gap;
    if (f < go) return {at: lerp(A, rest, ease.inOutSine(f / go)), lift: Math.sin(Math.PI * f / go / 2), tilt: 0};
    if (f > 1 - go) { const g = (f - (1 - go)) / go; return {at: lerp(rest, B, ease.inOutSine(g)), lift: Math.cos(Math.PI * g / 2), tilt: 0}; }
    return {at: [rest[0], rest[1] + Math.sin(t * 2.2) * Hd * 0.004], lift: 1, tilt: 0};
  }
  // The hand: a cartoon hand holding a marker, drawn from smooth outlines (pen frame: the tip at 0,0, the marker
  // along +x, the folded fingers' knuckles on the -y side), in device pixels over everything but screen effects.
  const HAND_PATH = {
    shadow: 'M 40 -10 C 80 -40 110 -110 180 -120 C 230 -124 260 -100 260 -60 L 520 -110 L 520 80 L 200 50 C 140 40 90 20 40 6 Z',
    nib: 'M 0 0 L 17 -8 L 17 8 Z', collar: 'M 17 -11 L 34 -11 L 34 11 L 17 11 Z', barrel: 'M 34 -12 L 230 -12 L 230 12 L 34 12 Z',
    sleeve: 'M 232 -100 C 320 -104 420 -110 540 -112 L 540 70 C 420 62 320 52 236 42 C 228 10 226 -60 232 -100 Z',
    cuff: 'M 232 -100 C 242 -101 252 -102 262 -103 C 256 -60 258 0 266 45 C 256 44 246 43 236 42 C 228 10 226 -60 232 -100 Z',
    back: 'M 116 -18 C 100 -26 96 -44 104 -54 C 100 -68 108 -80 120 -82 C 120 -96 132 -106 146 -104 C 152 -116 170 -122 186 -116 C 214 -110 236 -96 246 -78 L 248 24 C 222 38 196 40 176 32 C 156 24 132 8 116 -18 Z',
    shade: 'M 100 -6 C 150 22 200 26 260 10 L 260 60 L 100 60 Z', light: 'M 160 -96 C 186 -104 214 -96 232 -82 C 210 -84 186 -84 166 -78 Z',
    knuckles: ['M 112 -50 C 120 -48 126 -50 130 -56', 'M 128 -78 C 136 -76 142 -80 146 -86', 'M 150 -100 C 158 -98 164 -102 168 -108'],
    index: 'M 150 -40 C 124 -36 100 -30 78 -24 C 58 -19 50 -6 58 2 C 68 8 92 4 112 0 C 130 -4 144 -8 156 -10 Z',
    indexLine: 'M 150 -40 C 124 -36 100 -30 78 -24 C 58 -19 50 -6 58 2 C 68 8 92 4 112 0 C 130 -4 144 -8 150 -9',
    indexNail: 'M 62 -14 C 68 -21 80 -21 84 -14 C 86 -8 80 -3 72 -3 C 64 -4 60 -8 62 -14 Z', indexJoint: 'M 110 -28 C 114 -22 114 -14 110 -8',
    thumb: 'M 186 28 C 156 36 128 38 100 32 C 78 28 68 16 76 8 C 88 0 112 6 136 6 C 156 6 174 10 186 28 Z',
    thumbLine: 'M 182 29 C 156 36 128 38 100 32 C 78 28 68 16 76 8 C 88 0 112 6 136 6 C 150 6 160 8 168 12',
    thumbNail: 'M 78 15 C 82 9 92 9 96 15 C 98 21 92 25 86 25 C 80 24 76 21 78 15 Z', thumbJoint: 'M 128 14 C 132 18 132 26 128 32',
  };
  let handPaths = null;
  function drawHand(t, context) {
    const pose = LASTHAND = handAt(t, K.TIP, context);
    if (!pose) return;
    handPaths = handPaths || Object.fromEntries(Object.entries(HAND_PATH).map(([key, d]) => [key, Array.isArray(d) ? d.map(x => new Path2D(x)) : new Path2D(d)]));
    const {ctx} = K, H = handPaths, s = 1.05 * context.H * (context.scale || 1) / 1080 * (1 + 0.05 * pose.lift);
    const angle = 0.86 + 0.08 * pose.tilt + (pose.lift ? 0 : Math.sin(t * 8.3) * 0.022), OUT = '#4A3428', SKIN = '#F6CFB0';
    const shape = (path, fill, lw = 2.8) => { if (fill) { ctx.fillStyle = fill; ctx.fill(path); } if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke(path); } };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(pose.at[0], pose.at[1]); ctx.rotate(angle); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.translate(10 + 16 * pose.lift, 12 + 18 * pose.lift); ctx.globalAlpha = 0.15 - 0.05 * pose.lift; ctx.fillStyle = '#000000'; ctx.fill(H.shadow); ctx.restore();
    const pencil = K.FIN === 'wb' && K.WB === 'pencil';
    shape(H.nib, pencil ? '#5A5A5A' : '#1E1E1E', 2); shape(H.collar, pencil ? '#E8C9A0' : K.PAL.ink === '#1F1F1F' ? K.PAL.accent : K.PAL.ink, 2.4); shape(H.barrel, pencil ? '#F2C14E' : '#F4F4F2', 2.4);
    shape(H.sleeve, '#3D5A80'); shape(H.cuff, '#2F4766');
    shape(H.back, SKIN, 0);
    ctx.save(); ctx.clip(H.back); ctx.fillStyle = '#E7AE8C'; ctx.fill(H.shade); ctx.fillStyle = '#FBE0CB'; ctx.fill(H.light); ctx.restore();
    shape(H.back, null);
    H.knuckles.forEach(path => shape(path, null, 2));
    shape(H.index, SKIN, 0); shape(H.indexLine, null); shape(H.indexNail, '#FCE7DC', 1.6); shape(H.indexJoint, null, 1.8);
    shape(H.thumb, SKIN, 0); shape(H.thumbLine, null); shape(H.thumbNail, '#FCE7DC', 1.6); shape(H.thumbJoint, null, 1.8);
    ctx.restore();
  }
  // ------------------------------------------------------------ animated words (0.38, the motion layer)
  // research/motion-graphics-references.md "Motion layer animation": words rise from a mask line, letters pop in, a
  // typewriter, a highlighter that sweeps and reveals, a slam with trails, a tracked title, a glitch, a focus pull and
  // the word focus effect. Pure functions of the time since the words arrived.
  const ANIMATED = new Set(['title', 'note', 'number', 'pop', 'keyword', 'statement', 'poster', 'highlight']);
  // A word's colour (0.41): the one Claude chose (sketch.js WORD_COLORS), else the accent when marked, else the fallback.
  const tint = (el, fallback) => (el.color ? (el.color === 'accent' ? K.PAL.accent : el.color === 'ink' ? K.PAL.ink : K.col(el.color)) : el.accent ? K.PAL.accent : fallback);
  function animText(el, i, local) {
    const at = LAYOUT.textAt[i], {ctx, u} = K, {size} = at, kind = el.animate;
    const statement = el.style === 'statement' || el.style === 'poster', weight = statement ? 900 : 800, upper = el.style === 'keyword';
    const color = tint(el, ['number', 'poster'].includes(el.style) ? K.PAL.accent : K.PAL.ink), onAccent = K.lum(K.PAL.accent) > 0.55 ? '#141414' : '#FFFFFF';
    // Lines of words with their widths (a statement's own lines; one line otherwise, fitted to the frame).
    const lines = statement ? at.lines.map(line => line.words) : [hotWords(upper ? el.text.toUpperCase() : el.text).map(word => ({...word, w: K.measure(word.text, size, {weight})}))];
    const space = K.measure(' ', size, {weight}), lh = size * 1.18, widths = lines.map(words => words.reduce((sum, w) => sum + w.w, 0) + space * (words.length - 1));
    const fit = Math.min(1, (K.W - 2 * K.M) / Math.max(1, ...widths)), sz = size * fit;
    const letterCount = lines.flat().reduce((n, w) => n + w.text.length, 0), typed = kind === 'typewriter' ? Math.floor(local * 24) : Infinity;
    const lastIndex = lines.flat().length - 1, built = 0.5 + lastIndex * 0.07, settle = kind === 'focus' ? ease.inOutSine(clamp01((local - built) / 0.45)) : 0;
    const word = (w, cx, cy, extra = {}) => {
      const bar = w.hot && el.style === 'statement';
      if (bar) { ctx.fillStyle = K.PAL.accent; ctx.beginPath(); ctx.roundRect(cx - w.w * fit / 2 - sz * 0.12, cy - sz * 0.6, w.w * fit + sz * 0.24 + (w.joined ? space * fit : 0), sz * 1.14, sz * 0.12); ctx.fill(); }
      K.text(w.text, cx, cy, sz, {color: w.hot ? (bar ? onAccent : K.PAL.accent) : color, weight, outline: !bar, ...extra});
    };
    let k = 0, n = 0, cursor = null;
    lines.forEach((words, li) => {
      const cy = at.y + (li - (lines.length - 1) / 2) * lh * fit;
      let cx = at.x - widths[li] * fit / 2;
      for (const [wi, w0] of words.entries()) {
        const w = {...w0, joined: w0.hot && words[wi + 1]?.hot}, wx = cx + w.w * fit / 2, delay = k * 0.07;
        ctx.save();
        if (kind === 'rise' || kind === 'focus') {
          const q = ease.outCubic(clamp01((local - delay) / 0.38));
          ctx.beginPath(); ctx.rect(cx - sz * 0.3, cy - sz * 0.72, w.w * fit + sz * 0.6, sz * 1.44); ctx.clip();
          if (kind === 'focus' && settle > 0 && !w.hot) { ctx.globalAlpha *= 1 - 0.45 * settle; ctx.filter = `blur(${(settle * 1.4 * u).toFixed(2)}px)`; }
          if (q > 0) word(w, wx, cy + (1 - q) * sz * 1.2);
        } else if (kind === 'letters' || kind === 'track' || kind === 'typewriter') {
          // Letter by letter, from each letter's own place on the line.
          let lx = cx;
          for (const ch of w.text) {
            const cw = K.measure(ch, sz, {weight}), mid = lx + cw / 2;
            if (kind === 'letters') { const q = clamp01((local - n * 0.028) / 0.3); if (q > 0) { const z = ease.outBack(q); ctx.save(); ctx.globalAlpha *= clamp01(q * 2); ctx.translate(mid, cy + (1 - q) * sz * 0.3); ctx.scale(z, z); K.text(ch, 0, 0, sz, {color: w.hot ? K.PAL.accent : color, weight}); ctx.restore(); } }
            if (kind === 'track') { const q = ease.outCubic(clamp01(local / 1.1)), spread = (1 - q) * sz * 0.55 * (n - (letterCount - 1) / 2); ctx.save(); ctx.globalAlpha *= clamp01(q * 1.6); K.text(ch, mid + spread, cy, sz, {color: w.hot ? K.PAL.accent : color, weight}); ctx.restore(); }
            if (kind === 'typewriter' && n < typed) { K.text(ch, mid, cy, sz, {color: w.hot ? K.PAL.accent : color, weight}); cursor = [lx + cw + sz * 0.06, cy]; }
            lx += cw; n++;
          }
          n++;
        } else if (kind === 'wipe') {
          // A highlighter bar sweeps across the line, then pulls back and leaves the words behind it.
          const a = ease.inOutCubic(clamp01((local - delay * 0.4) / 0.3)), b = ease.inOutCubic(clamp01((local - delay * 0.4 - 0.3) / 0.32)), left = cx - sz * 0.14, right = cx + w.w * fit + sz * 0.14;
          if (b > 0) { ctx.save(); ctx.beginPath(); ctx.rect(left, cy - sz, (right - left) * b, sz * 2); ctx.clip(); word(w, wx, cy); ctx.restore(); }
          const from = left + (right - left) * b, to = left + (right - left) * a;
          if (to > from + 0.5 && b < 1) { ctx.fillStyle = K.alpha(el.accent ? K.PAL.accent : C.yellow, 0.9); ctx.fillRect(from, cy - sz * 0.56, to - from, sz * 1.12); }
        } else if (kind === 'slam') {
          const q = clamp01((local - delay * 0.5) / 0.2);
          if (q > 0) {
            if (q < 1) for (let g = 3; g >= 1; g--) { const z = 1 + (1 - q) * 1.8 + g * 0.18 * (1 - q); ctx.save(); ctx.globalAlpha *= 0.12 * (1 - q); ctx.translate(wx, cy); ctx.scale(z, z); ctx.translate(-wx, -cy); word(w, wx, cy); ctx.restore(); }
            const z = 1 + (1 - q) * (1 - q) * 1.8; ctx.globalAlpha *= clamp01(q * 3); ctx.translate(wx, cy); ctx.scale(z, z); ctx.translate(-wx, -cy); word(w, wx, cy);
          }
        } else if (kind === 'glitch') {
          const q = clamp01((local - delay) / 0.25);
          if (q > 0) {
            if (local - delay < 0.55) { const rand = K.seeded(Math.floor(local * 24) * 31 + k), j = (rand() - 0.5) * sz * 0.22; ctx.save(); ctx.globalAlpha *= 0.7; K.text(w.text, wx + j + sz * 0.05, cy, sz, {color: '#FF2D55', weight, outline: false}); K.text(w.text, wx - j - sz * 0.05, cy, sz, {color: '#18E0FF', weight, outline: false}); ctx.restore(); ctx.translate((rand() - 0.5) * sz * 0.1, 0); ctx.globalAlpha *= 0.5 + 0.5 * (rand() > 0.3 ? 1 : 0); }
            word(w, wx, cy);
          }
        } else if (kind === 'redact') {
          // A redacted file (0.39): black bars print over the words and lift one by one; key words lift last.
          const lift = 0.35 + (w.hot ? lastIndex + 2 : k) * 0.16, q = ease.accelExit(clamp01((local - lift) / 0.14));
          word(w, wx, cy);
          if (q < 1) { const left = cx - sz * 0.08, bw = (w.w * fit + sz * 0.16) * (1 - q); ctx.fillStyle = K.DARK ? '#050505' : '#111111'; ctx.fillRect(left + (w.w * fit + sz * 0.16) * q, cy - sz * 0.55, bw, sz * 1.1); }
        } else if (kind === 'blur') {
          const q = ease.outCubic(clamp01((local - delay * 0.5) / 0.6));
          if (q > 0) { ctx.globalAlpha *= q; if (q < 1) ctx.filter = `blur(${((1 - q) * 14 * u).toFixed(2)}px)`; const z = 1.08 - 0.08 * q; ctx.translate(wx, cy); ctx.scale(z, z); ctx.translate(-wx, -cy); word(w, wx, cy); }
        }
        ctx.restore();
        cx += (w.w + space) * fit; k++;
      }
    });
    if (cursor && (local * 24 < letterCount + 4 || (local % 1) < 0.5)) { ctx.save(); ctx.fillStyle = tint(el, K.PAL.ink); ctx.fillRect(cursor[0], cursor[1] - sz * 0.5, Math.max(3 * u, sz * 0.08), sz); ctx.restore(); }
    LAYOUT.anchors[i] = LAYOUT.est[i];
    return true;
  }
  function drawText(el, i, t, local, p) {
    if (el.animate && ANIMATED.has(el.style) && !handwritten() && animText(el, i, local)) return;
    const at = LAYOUT.textAt[i], {ctx, u} = K, color = tint(el, ['number', 'counter', 'poster'].includes(el.style) ? K.PAL.accent : K.PAL.ink);
    const {x, y, size} = at;
    switch (el.style) {
      case 'statement': case 'poster': {
        // Word by word: a statement pops each word in with key words on an accent bar; a poster lands as one block.
        const lh = size * 1.18, space = K.measure(' ', size, {weight: 900}), onAccent = K.lum(K.PAL.accent) > 0.55 ? '#141414' : '#FFFFFF';
        let k = 0;
        at.lines.forEach((line, li) => {
          const ly = y + (li - (at.lines.length - 1) / 2) * lh;
          let cx = x - line.width / 2;
          for (const [wi, word] of line.words.entries()) {
            const joined = word.hot && line.words[wi + 1]?.hot; // neighbouring key words share one bar
            const q = el.style === 'poster' ? clamp01(local / 0.4) : clamp01((local - k * 0.08) / 0.22);
            k++;
            if (q > 0) {
              const z = el.style === 'poster' ? 1 + 0.18 * (1 - ease.outCubic(q)) : ease.outBack(q);
              ctx.save(); ctx.translate(cx + word.w / 2, ly); ctx.scale(z, z); ctx.globalAlpha *= clamp01(q * 2);
              if (word.hot && el.style === 'statement') { ctx.fillStyle = K.PAL.accent; ctx.beginPath(); ctx.roundRect(-word.w / 2 - size * 0.12, -size * 0.6, word.w + size * 0.24 + (joined ? space : 0), size * 1.14, size * 0.12); ctx.fill(); }
              K.text(word.text, 0, 0, size, {color: word.hot && el.style === 'statement' ? onAccent : el.style === 'poster' ? color : word.hot ? K.PAL.accent : color, weight: 900, outline: !(word.hot && el.style === 'statement')});
              ctx.restore();
            }
            cx += word.w + space;
          }
        });
        break;
      }
      // Typed words grow from the full line's left edge at the full line's size (0.41, from video-use: centring the
      // partial string made the line slide left while it typed).
      case 'note': { const n = Math.ceil(el.text.length * clamp01(local * 28 / Math.max(1, el.text.length))), full = K.measure(el.text, size, {weight: 700}), sz = size * Math.min(1, (K.W - 2 * K.M) / Math.max(1, full)), left = Math.max(K.M, x - full * sz / size / 2); K.text(el.text.slice(0, n), left, y, sz, {color, weight: 700, align: 'left'}); break; }
      case 'number': { const q = clamp01(local / 0.25), z = 1 + 0.7 * (1 - ease.outCubic(q)); ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08 * (1 - q)); ctx.scale(z, z); ctx.globalAlpha *= clamp01(q * 3); K.text(el.text, 0, 0, size, {color, maxWidth: K.W - 2 * K.M}); ctx.restore(); break; }
      case 'counter': {
        // One value per frame with shrinking steps, landing on the number with a small pop (0.39: a counter steps like
        // a real readout instead of sliding).
        const shown = rolled(el.text, local, 0.85), z = 1 + 0.1 * Math.exp(-Math.max(0, local - 0.85) * 8) * (local > 0.85 ? 1 : 0);
        ctx.save(); ctx.translate(x, y); ctx.scale(z, z); K.text(shown, 0, 0, size, {color, maxWidth: K.W - 2 * K.M}); ctx.restore();
        break;
      }
      case 'stamp': {
        const q = clamp01(local / 0.16), z = 1 + 1.4 * (1 - ease.inCubic(q)), stamp = tint(el, C.red);
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12); ctx.scale(z, z); ctx.globalAlpha *= clamp01(q * 2);
        const w = Math.min(K.W - 2 * K.M, at.width) / 2 + size * 0.3, h = size * 0.75;
        ctx.strokeStyle = stamp; ctx.lineWidth = size * 0.08; ctx.strokeRect(-w, -h, w * 2, h * 2); ctx.lineWidth = size * 0.03; ctx.strokeRect(-w + size * 0.12, -h + size * 0.12, w * 2 - size * 0.24, h * 2 - size * 0.24);
        K.text(el.text.toUpperCase(), 0, 0, size, {color: stamp, maxWidth: w * 2 - size * 0.4});
        ctx.restore();
        break;
      }
      case 'highlight': {
        const q = ease.outCubic(clamp01(local / 0.45)), w = at.width;
        ctx.save(); ctx.fillStyle = K.alpha(tint(el, C.yellow), 0.55); ctx.beginPath(); ctx.moveTo(x - w / 2 - 12 * u, y - size * 0.42); ctx.lineTo(x - w / 2 - 12 * u + (w + 24 * u) * q, y - size * 0.46); ctx.lineTo(x - w / 2 - 12 * u + (w + 24 * u) * q, y + size * 0.46); ctx.lineTo(x - w / 2 - 12 * u, y + size * 0.42); ctx.fill(); ctx.restore();
        K.text(el.text, x, y, size, {color: K.PAL.ink, outline: false, maxWidth: K.W - 2 * K.M});
        break;
      }
      case 'pop': {
        const words = el.text.split(' '), widths = words.map(word => K.measure(`${word} `, size)), total = widths.reduce((a, b) => a + b, 0), fit = Math.min(1, (K.W - 2 * K.M) / total);
        let cursor = x - total * fit / 2;
        words.forEach((word, k) => { const q = clamp01((local - k * 0.1) / 0.25); if (q > 0) { const z = ease.outBack(q); ctx.save(); ctx.translate(cursor + widths[k] * fit / 2, y); ctx.scale(z, z); K.text(word, 0, 0, size * fit, {color: k === words.length - 1 && el.accent ? K.PAL.accent : color}); ctx.restore(); } cursor += widths[k] * fit; });
        break;
      }
      case 'label': if (handwritten()) { K.text(el.text.toUpperCase(), x, y, size * 1.15, {color: tint(el, K.PAL.ink), weight: 700, outline: false, maxWidth: K.W - 2 * K.M}); break; } { const w = at.width + size * 0.8, h = size * 1.5; ctx.save(); ctx.fillStyle = el.accent ? K.PAL.accent : K.PAL.ink; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.restore(); K.text(el.text, x, y, size, {color: K.PAL.bg, outline: false}); break; }
      case 'sticky': case 'tag': case 'callout': {
        // Illustrated annotations: a sticky note, a price tag on its string, an arrow-shaped callout. They pop on.
        const q = clamp01(local / 0.3), z = ease.outBack(q), rand = K.seeded(LAYOUT.el[i].seed), pad = size * 0.55;
        const lines = el.style === 'sticky' ? wrapWords(el.text.toUpperCase(), size, size * 6.5) : [el.text], w = Math.max(...lines.map(line => K.measure(line, size, {weight: 800}))) + pad * 2, h = lines.length * size * 1.2 + pad * 1.4;
        const bx = Math.min(K.W - K.M - w / 2, Math.max(K.M + w / 2, x));
        ctx.save(); ctx.translate(bx, y); ctx.scale(z, z); ctx.rotate(el.style === 'sticky' ? (rand() - 0.5) * 0.12 : 0);
        // Paper, tags and callouts are light, so a dark palette's light ink is written dark on them.
        const ink = K.DARK ? '#23272E' : K.PAL.ink, lw = Math.max(2.5 * u, size * 0.06);
        ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.lineJoin = 'round';
        if (el.style === 'sticky') {
          const paper = el.color || el.accent ? K.mix(tint(el, K.PAL.accent), '#FFFFFF', 0.55) : ['#FFE680', '#BDE8B0', '#B9DDF5', '#FFC9A8'][LAYOUT.el[i].seed % 4], fold = size * 0.7;
          ctx.fillStyle = K.alpha('#000000', 0.12); ctx.fillRect(-w / 2 + 6 * u, -h / 2 + 8 * u, w, h);
          ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2 - fold); ctx.lineTo(w / 2 - fold, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
          ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(w / 2, h / 2 - fold); ctx.lineTo(w / 2 - fold * 0.8, h / 2 - fold * 0.8); ctx.lineTo(w / 2 - fold, h / 2); ctx.fillStyle = K.mix(paper, '#000000', 0.12); ctx.fill(); ctx.stroke();
          lines.forEach((line, k) => K.text(line, 0, -h / 2 + pad * 0.7 + size * 0.6 + k * size * 1.2, size, {color: ink, outline: false, weight: 800}));
        } else if (el.style === 'tag') {
          const nose = h * 0.45;
          ctx.beginPath(); ctx.moveTo(-w / 2 - nose, 0); ctx.lineTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
          ctx.fillStyle = el.color || el.accent ? K.mix(tint(el, K.PAL.accent), '#FFFFFF', 0.75) : '#F7EBD3'; ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(-w / 2 - nose * 0.35, 0, size * 0.13, 0, Math.PI * 2); ctx.fillStyle = K.PAL.bg; ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-w / 2 - nose * 0.35, 0); ctx.bezierCurveTo(-w / 2 - nose * 1.4, -h * 0.2, -w / 2 - nose * 1.6, -h * 0.9, -w / 2 - nose * 2.2, -h * 0.75); ctx.lineWidth = lw * 0.7; ctx.stroke();
          K.text(el.text, nose * 0.1, 0, size, {color: ink, outline: false, weight: 800, maxWidth: w - pad});
        } else {
          const nose = h * 0.55;
          ctx.beginPath(); ctx.moveTo(-w / 2 - nose, 0); ctx.lineTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
          ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = lw * 1.3; ctx.stroke();
          K.text(el.text, 0, 0, size, {color: el.color || el.accent ? K.mix(tint(el, K.PAL.accent), '#000000', 0.35) : ink, outline: false, weight: 800, maxWidth: w - pad});
        }
        ctx.restore();
        break;
      }
      case 'keyword': { K.text(el.text.toUpperCase(), x, y, size, {color: tint(el, K.PAL.ink), weight: 700, outline: !handwritten(), maxWidth: K.W * 0.5}); break; }
      case 'versus': {
        // A comparison divider: a hand-drawn line down the frame with the word in a circle at its middle.
        const q = clamp01(local / 0.5), r = size * 0.85, rand = K.seeded(LAYOUT.el[i].seed), line = Array.from({length: 13}, (_, k) => [x + (rand() - 0.5) * 6 * u, K.H * (0.08 + 0.84 * k / 12)]);
        K.render([{pts: K.partial(line, q), px: 5 * u}], 1, 7);
        if (q > 0.4) {
          const z = ease.outBack(clamp01((q - 0.4) / 0.6));
          ctx.save(); ctx.translate(x, y); ctx.scale(z, z);
          K.render([{pts: K.frame(0, 0, 1).ring(0, 0, r, r, 40), fill: K.PAL.bg, px: 4.5 * u}], 1, 9);
          K.text(el.text.toUpperCase(), 0, 0, size, {color: tint(el, K.PAL.ink), weight: 800, outline: false, maxWidth: r * 1.7});
          ctx.restore();
        }
        break;
      }
      case 'chapter': {
        // A chapter card (storybook "Level 1: The Runner"): the frame goes to a dark card and the words fade in on it.
        const q = clamp01(local / 0.35);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= clamp01(local / 0.2); ctx.fillStyle = '#1D2433'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
        ctx.save(); ctx.globalAlpha *= q; K.text(el.text, x, y, size, {color: '#F1F1EE', outline: false, weight: 700, heading: false, maxWidth: K.W - 2 * K.M}); ctx.restore();
        break;
      }
      case 'headline': { const q = ease.outCubic(clamp01(local / 0.35)), h = size * 1.6, yy = y - (1 - q) * (y + h); ctx.save(); ctx.fillStyle = tint(el, K.PAL.ink); ctx.fillRect(K.M * 0.5, yy - h / 2, K.W - K.M, h); ctx.restore(); K.text(el.text, K.W / 2, yy, size, {color: K.PAL.bg, outline: false, maxWidth: K.W - 2 * K.M}); break; }
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
    K.render([{pts: K.partial(pts, p), color, px: w, ...(el.dashed ? {dash: [18, 14]} : {})}], 1, 5);
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
    // An effect on a picture keeps its own size: it marks a spot in the picture, never covers all of it (0.33 demo).
    const onPicture = Number.isInteger(el.on) && D.elements[el.on - 1]?.kind === 'picture';
    const fit = Math.min(Math.max(g.w, g.h), Math.min(g.w, g.h) * 2.2) * 0.62, r = onPicture ? Math.min(fit, FX_SIZE[el.size || 'm'] * K.u * 0.62) : fit;
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
      // 0.32 effects (owner review 2026-10-16).
      case 'impact': { const z = ease.outBack(clamp01(local / 0.18)), fade = 1 - clamp01((local - 0.6) / 0.3), f = K.frame(g.cx, g.cy, r * z, 1, 0.2); if (fade <= 0) break; K.render([{pts: f.star(0, 0, 1.15, 0.55, 11), fill: '#FFFFFF', color: color || C.red, px: 7 * u, alpha: fade}, {pts: f.star(0, 0, 0.72, 0.38, 11), fill: color || C.yellow, stroke: false, alpha: fade}]); ctx.save(); ctx.strokeStyle = K.alpha(K.PAL.ink, 0.7 * fade); ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; for (let k = 0; k < 10; k++) { const a = k * TAU / 10 + 0.15, d0 = r * (1.25 + 0.15 * ease.outCubic(clamp01(local / 0.3))); ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a) * d0, g.cy + Math.sin(a) * d0); ctx.lineTo(g.cx + Math.cos(a) * (d0 + r * 0.35), g.cy + Math.sin(a) * (d0 + r * 0.35)); ctx.stroke(); } ctx.restore(); break; }
      case 'lightning': { if (local > 0.9) break; const rand = K.seeded(seed + Math.floor(local * 12)), top = Math.max(0, g.cy - H * 0.75), pts = [[g.cx + (rand() - 0.5) * r, top]]; for (let k = 1; k <= 6; k++) pts.push([g.cx + (k % 2 ? 1 : -1) * r * 0.22 * (0.6 + rand() * 0.6), top + (g.cy - g.h * 0.3 - top) * k / 6]); pts[6][0] = g.cx; const on = K.noise(local * 30 + seed) > -0.6 ? 1 : 0.25; ctx.save(); ctx.shadowColor = C.yellow; ctx.shadowBlur = 26 * u; K.render([{pts: K.partial(pts, ease.outCubic(clamp01(local / 0.12))), color: C.yellow, px: 16 * u, alpha: on}, {pts: K.partial(pts, ease.outCubic(clamp01(local / 0.12))), color: '#FFFFFF', px: 6 * u, alpha: on}]); ctx.restore(); break; }
      case 'explosion': { const z = ease.outBack(clamp01(local / 0.28)), fade = 1 - clamp01((local - 0.9) / 0.5), f = K.frame(g.cx, g.cy, r * 1.35 * z, 1, local * 0.3); // Smoke rolls out from behind the fireball and stays when it fades.
        for (let k = 0; k < 7; k++) { const q = clamp01((local - 0.2 - k * 0.04) / 1.3); if (q <= 0 || q >= 1) continue; const a = k * TAU / 7 + 0.3, d = r * (0.9 + 1.1 * ease.outCubic(q)); K.render([{pts: K.frame(g.cx + Math.cos(a) * d, g.cy + Math.sin(a) * d * 0.7 - q * r * 0.4, r * (0.3 + 0.25 * q)).ring(0, 0, 1, 1, 24), fill: '#D9D9D9', color: K.alpha(K.PAL.ink, 0.5), px: 3 * u, alpha: 1 - q}]); }
        if (fade > 0) K.render([{pts: f.blob(0, 0, 1, 1, 9, 0.35), fill: C.fire, color: K.PAL.ink, px: 6 * u, alpha: fade}, {pts: f.blob(0, 0, 0.68, 0.68, 7, 0.3), fill: C.orange, stroke: false, alpha: fade}, {pts: f.blob(0, 0, 0.38, 0.38, 6, 0.25), fill: C.flame, stroke: false, alpha: fade}]); break; }
      case 'fire': { const base = g.cy + g.h * 0.45, w = Math.max(r * 0.9, g.w * 0.7); for (let k = 0; k < 5; k++) { const x = g.cx + (k - 2) / 2 * w * 0.5, hgt = r * (0.75 + 0.35 * K.noise(local * 6 + k * 3)) * (k === 2 ? 1.35 : 1), sw = w * 0.22; const flame = (s, colour) => ({pts: [[x - sw * s, base], ...K.frame(0, 0, 1).curve(x - sw * s, base, x - sw * 0.6 * s + K.noise(local * 5 + k) * 8 * u, base - hgt * s * 0.6, x + K.noise(local * 7 + k) * 10 * u, base - hgt * s, 12), ...K.frame(0, 0, 1).curve(x, base - hgt * s, x + sw * 0.6 * s, base - hgt * s * 0.5, x + sw * s, base, 12), [x - sw * s, base]], fill: colour, stroke: false}); K.render([flame(1, C.fire), flame(0.66, C.orange), flame(0.36, C.flame)]); } break; }
      case 'dust': for (let k = 0; k < 8; k++) { const q = clamp01((local - k * 0.03) / 0.9); if (q <= 0 || q >= 1) continue; const side = k % 2 ? 1 : -1, d = (g.w * 0.4 + r * 0.9 * ease.outCubic(q)) * side, y = g.cy + g.h * 0.48 - q * r * 0.25 * (1 + (k % 3) * 0.3); K.render([{pts: K.frame(g.cx + d * (0.6 + (k % 4) * 0.15), y, r * (0.14 + 0.2 * q)).ring(0, 0, 1, 0.8, 22), fill: '#E6DCCB', color: K.alpha(K.PAL.ink, 0.35), px: 2.5 * u, alpha: 1 - q}]); } break;
      case 'spiral': { const pts = Array.from({length: 120}, (_, k) => { const a = k * 0.17 - local * 5, rr = r * 0.9 * k / 120; return [g.cx + Math.cos(a) * rr, g.cy + Math.sin(a) * rr]; }); K.render([{pts: K.partial(pts, ease.outCubic(clamp01(local / 0.4))), color: color || C.purple, px: 6 * u}]); break; }
      case 'crack': { const rand = K.seeded(seed), q = ease.outCubic(clamp01(local / 0.3)), lines = []; for (let k = 0; k < 7; k++) { let a = k * TAU / 7 + rand() * 0.5, x = g.cx, y = g.cy; const pts = [[x, y]], n = 5, len = r * (1 + rand() * 0.7); for (let s = 1; s <= n; s++) { a += (rand() - 0.5) * 0.7; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; pts.push([x, y]); } lines.push({pts: K.partial(pts, q), color: K.PAL.ink, px: (5 - k % 3) * u}); } K.render(lines); break; }
      // Day turns into night on its word (owner review 2026-10-21): the sky darkens behind the scene, the sun sinks,
      // the moon rises and the stars come out one by one and twinkle. Drawn behind characters and words.
      case 'nightfall': {
        const q = ease.inOutSine(clamp01(local / 3)), big = Math.max(W, H) * 3, rand = K.seeded(seed);
        // The sky goes darker than the ground, so the place's own daytime sun disappears and people still read.
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, `rgba(10,16,46,${0.9 * q})`); sky.addColorStop(0.5, `rgba(14,22,56,${0.72 * q})`); sky.addColorStop(1, `rgba(14,22,56,${0.5 * q})`);
        ctx.save(); ctx.fillStyle = sky; ctx.fillRect(-big / 3, -big / 3, big, big); ctx.restore();
        // Indoors the room only darkens: no sun, moon or stars inside a bedroom (2026-10-21 render).
        if (!OUTDOOR_SETS.has(D.set) && !/camp|field|river|valley|village|street|road|forest|plain|shore|coast|harbou?r|market|square|hill|garden|yard|beach|desert|mountain|city/.test(String(D.set))) break;
        if (q < 1) K.render([{pts: K.frame(W * 0.82, H * (0.16 + 0.62 * q), 72 * u).ring(0, 0, 1, 1, 36), fill: K.mix(C.yellow, C.orange, q), stroke: false, alpha: 1 - 0.9 * q}]);
        const mq = ease.outCubic(clamp01((local - 1.2) / 2.2)), mx = W * 0.2, my = H * (0.52 - 0.34 * mq);
        if (mq > 0) {
          const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 150 * u); glow.addColorStop(0, `rgba(255,250,220,${0.35 * mq})`); glow.addColorStop(1, 'rgba(255,250,220,0)');
          ctx.save(); ctx.fillStyle = glow; ctx.fillRect(mx - 150 * u, my - 150 * u, 300 * u, 300 * u); ctx.restore();
          K.render([{pts: K.frame(mx, my, 54 * u).ring(0, 0, 1, 1, 36), fill: '#F6F2DC', stroke: false, alpha: mq}]);
        }
        for (let k = 0; k < 28; k++) {
          const x = rand() * W, y = rand() * H * 0.42, appear = 1.4 + rand() * 1.8, s = (5 + rand() * 7) * u, sq = clamp01((local - appear) / 0.4);
          if (sq > 0) K.render([{pts: K.frame(x, y, s).star(0, 0, 1, 0.42, 4), fill: '#FFF7D1', stroke: false, alpha: sq * (0.55 + 0.45 * Math.sin(local * 3.1 + k * 1.7))}]);
        }
        break;
      }
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
      case 'wind': ctx.save(); ctx.strokeStyle = K.alpha(K.DARK ? '#FFFFFF' : K.PAL.ink, 0.28); ctx.lineCap = 'round'; for (let k = 0; k < 16; k++) { const y = rand() * H, l = (0.12 + rand() * 0.18) * W, x = ((local * (0.9 + rand() * 0.6) + rand()) % 1.4 - 0.2) * W; ctx.lineWidth = (2 + rand() * 3) * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + l * 0.4, y - 12 * u, x + l * 0.7, y + 10 * u, x + l, y - 4 * u); ctx.stroke(); } ctx.restore(); break;
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

  // ------------------------------------------------------------ textures (0.38): the finish laid over the whole frame
  function drawTexture(name, t) {
    const {ctx} = K, cw = ctx.canvas.width, ch = ctx.canvas.height, v = ch / 1080, frameNo = Math.floor(t * 24);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const grain = (count, alpha, seed = 13) => { const rand = K.seeded(frameNo * 7 + seed); for (let k = 0; k < count; k++) { ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`; const sq = (1 + rand() * 1.6) * v; ctx.fillRect(rand() * cw, rand() * ch, sq, sq); } };
    const vignette = (alpha, color = '0,0,0') => { const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.4, cw / 2, ch / 2, ch * 1.02); g.addColorStop(0, `rgba(${color},0)`); g.addColorStop(1, `rgba(${color},${alpha})`); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); };
    switch (name) {
      case 'grain': grain(2600, 0.07); break;
      case 'film': {
        const rand = K.seeded(frameNo * 3 + 5);
        ctx.fillStyle = `rgba(255,236,200,${0.03 + 0.04 * rand()})`; ctx.fillRect(0, 0, cw, ch);
        grain(2200, 0.09); vignette(0.38);
        ctx.strokeStyle = 'rgba(30,20,10,0.35)'; ctx.lineWidth = 1.4 * v;
        for (let k = 0; k < 3; k++) if (rand() < 0.45) { const x = rand() * cw, y = rand() * ch, l = (8 + rand() * 30) * v; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + l * 0.5, y + (rand() - 0.5) * l, x + l, y + (rand() - 0.5) * l); ctx.stroke(); }
        if (rand() < 0.3) { const x = rand() * cw; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rand() - 0.5) * 6 * v, ch); ctx.stroke(); }
        break;
      }
      case 'paper': { const rand = K.seeded(41); ctx.fillStyle = 'rgba(240,222,190,0.08)'; ctx.fillRect(0, 0, cw, ch); ctx.strokeStyle = 'rgba(120,90,50,0.07)'; ctx.lineWidth = 1 * v; ctx.beginPath(); for (let k = 0; k < 900; k++) { const x = rand() * cw, y = rand() * ch, a = rand() * Math.PI, l = (3 + rand() * 9) * v; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); } ctx.stroke(); vignette(0.16, '90,60,30'); break; }
      case 'vhs': {
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.14; ctx.drawImage(ctx.canvas, 3 * v, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,0.09)'; for (let y = 0; y < ch; y += 4 * v) ctx.fillRect(0, y, cw, 1.4 * v);
        const band = ((t * 0.23) % 1.2 - 0.1) * ch, rand = K.seeded(frameNo + 77); for (let k = 0; k < 180; k++) { ctx.fillStyle = `rgba(255,255,255,${0.12 * rand()})`; ctx.fillRect(rand() * cw, band + rand() * 22 * v, (4 + rand() * 30) * v, 1.5 * v); }
        break;
      }
      case 'duotone': {
        ctx.filter = 'grayscale(1) contrast(1.12)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.filter = 'none';
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = K.alpha(K.mix(K.PAL.accent, '#000000', 0.1), 0.6); ctx.fillRect(0, 0, cw, ch);
        ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(255,236,205,0.16)'; ctx.fillRect(0, 0, cw, ch); ctx.globalCompositeOperation = 'source-over'; grain(1200, 0.05);
        break;
      }
      case 'leak': {
        ctx.globalCompositeOperation = 'screen';
        [[0.07, 0, '255,150,60'], [0.05, 2.1, '255,90,120']].forEach(([speed, ph, rgb]) => { const x = cw * (0.5 + 0.55 * Math.sin(t * speed * 6 + ph)), y = ch * (0.3 + 0.2 * Math.cos(t * 0.4 + ph)), r = ch * 0.75, g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${0.42 + 0.12 * Math.sin(t * 1.3 + ph)})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); });
        break;
      }
      default: break;
    }
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
    if (d && local < d && el.kind !== 'picture') {
      // 0.39: each role its own measured curve - a pop leans past its size late and only a little (8%), a slide does
      // most of its travel in the first frames and then settles, a growth lands softly.
      const q = local / d;
      // A pop starts at half size and fades in quickly (as measured: popping from nothing with this curve looked slow).
      if (enter === 'pop') { sx = sy = 0.5 + 0.5 * ease.popOver(q); a = clamp01(q * 4); }
      if (enter === 'grow') sx = sy = ease.softLand(q);
      if (enter === 'slide') dx = (1 - ease.snapSettle(q)) * (LAYOUT.est[i].center[0] < K.W / 2 ? -1 : 1) * 0.6 * K.W;
      if (enter === 'drop') dy = -(1 - ease.inCubic(q)) * 0.75 * K.H;
      if (enter === 'fade') a = q;
      if (enter === 'draw') p = el.kind === 'figure' ? clamp01(local / (d * 1.25)) : q;
    }
    if (enter === 'draw' && el.kind === 'figure') p = clamp01(local / (d * 1.25));
    // 0.38 entrances: a growing circle reveals it, it swings in from its top, it focuses in from a blur, or it rises.
    let reveal = null, swing = 0, focus = 0;
    if (d && local < d && el.kind !== 'picture') {
      const q = local / d;
      if (enter === 'mask') reveal = ease.inOutCubic(q);
      if (enter === 'swing') { swing = (1 - ease.outBack(q)) * -0.7; a *= clamp01(q * 2); }
      if (enter === 'blur') { focus = 1 - ease.outCubic(q); a *= clamp01(q * 1.6); }
      if (enter === 'rise') { dy = (1 - ease.softLand(q)) * 0.12 * K.H; a *= clamp01(q * 1.8); }
      // Lands from oversize: it arrives big and soft and settles to its size (never grows from nothing).
      if (enter === 'land') { const s = 1 + 0.6 * (1 - ease.snapSettle(q)); sx *= s; sy *= s; focus = Math.max(focus, (1 - ease.snapSettle(q)) * 0.8); a *= clamp01(q * 2.5); }
    }
    if (enter === 'drop' && local >= d && local < d + 0.18) { const s = Math.sin(Math.PI * (local - d) / 0.18); sy = 1 - 0.14 * s; sx = 1 + 0.1 * s; }
    // Leaving is quicker than arriving and accelerates away (motionmaxxing: exits ease in).
    if (exitAt !== null && t > exitAt) { const q = clamp01((t - exitAt) / 0.2); sx *= 1 - ease.accelExit(q); sy *= 1 - ease.accelExit(q); a *= 1 - ease.gentleIn(q); }
    const est = LAYOUT.est[i], [ax, ay] = el.kind === 'figure' ? [el.x * K.W, el.y * K.H] : est.center;
    const {ctx} = K;
    ctx.save();
    ctx.globalAlpha *= a;
    // Depth layers (0.38): the back layer moves slower with the camera and goes soft, the front layer moves faster.
    if (el.layer && LAYOUT.cam) {
      const c = LAYOUT.cam, f = el.layer === 'back' ? 0.8 : 1.25;
      ctx.translate(c.cx, c.cy); ctx.scale(1 / c.Z, 1 / c.Z); ctx.translate(-(K.W / 2 + c.ox), -(K.H / 2 + c.oy)); applyCamera(ctx, c, f);
      // Words only soften a little: a back-layer poster blurred out of reading (live plan 2026-10-19).
      if (el.layer === 'back') focus = Math.max(focus, el.kind === 'text' ? 0.05 : Math.min(0.45, 0.15 + Math.max(0, c.Z - 1) * 3));
    }
    if (focus > 0.01) ctx.filter = `blur(${(focus * 12 * K.u).toFixed(2)}px)`;
    if (reveal !== null) { const [x1, y1, x2, y2] = est.box, r = Math.hypot(x2 - x1, y2 - y1) * 0.62 * reveal; ctx.beginPath(); ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, Math.max(0.5, r), 0, TAU); ctx.clip(); }
    if (swing) { const top = el.kind === 'figure' ? ay - figureH(el) : est.box[1]; ctx.translate(ax, top); ctx.rotate(swing); ctx.translate(-ax, -top); }
    // Hand-drawn: words are written out left to right by the pen, at a writing pace.
    if ((handwritten() || PEN) && enter === 'draw' && el.kind === 'text' && WRITTEN.has(el.style)) {
      const at = LAYOUT.textAt[i], q = clamp01(local / writeSeconds(el.text));
      if (q < 1) {
        const half = at.width / 2 + at.size * 0.6, left = at.x - half, edge = left + 2 * half * q;
        ctx.beginPath(); ctx.rect(left, at.y - at.size * 1.3, edge - left, at.size * 2.6); ctx.clip();
        // The pen forms each letter: up and down through the letter's height as it moves along the line.
        const letters = Math.max(1, el.text.replace(/\s/g, '').length), loop = Math.sin(q * letters * Math.PI * 2);
        K.penAt(edge - at.size * 0.12 * (1 + loop) * 0.5, at.y + at.size * (0.05 + 0.28 * loop));
      }
    }
    ctx.translate(ax + dx, ay + dy); ctx.scale(Math.max(0.001, sx), Math.max(0.001, sy)); ctx.translate(-ax, -ay);
    if (el.kind === 'figure') drawFigure(el, i, t, local, p);
    else if (el.kind === 'prop') drawProp(el, i, t, local, p);
    else if (el.kind === 'text') drawText(el, i, t, local, p);
    else if (el.kind === 'arrow') drawArrow(el, i, t, local, p);
    else if (el.kind === 'bubble') drawBubble(el, i, t, local, p);
    else if (el.kind === 'picture') drawPicture(el, i, local, tm.enter);
    else if (el.kind === 'chart') drawChart(el, i, local);
    else if (el.kind === 'timeline') drawTimeline(el, i, local);
    else if (el.kind === 'network') drawNetwork(el, i, local);
    else if (el.kind === 'map') drawMap(el, i, local);
    else if (el.kind === 'crowd') drawCrowd(el, i, local);
    else if (el.kind === 'quote') drawQuote(el, i, local);
    else if (el.kind === 'document') drawDocument(el, i, local);
    else if (el.kind === 'gauge') drawGauge(el, i, local);
    else if (el.kind === 'ruler') drawRuler(el, i, local);
    else if (el.kind === 'loupe') drawLoupe(el, i, local);
    else if (el.kind === 'fx' && !SCREEN_FX.has(el.effect) && !['shake', 'punch'].includes(el.effect)) drawFx(el, i, t, local, p);
    ctx.restore();
  }
  // Fast moments get a film camera's motion blur (0.41, after Remotion's CameraMotionBlur): the frame is the average
  // of a few moments across half a frame's time (a 180-degree shutter). Only when something moves fast (the camera, a
  // whip in, a slide, a drop or a slam), so still frames cost nothing extra. On by default for the Documentary engine's
  // designed shots (motion design blurs fast moves); hand-made looks show speed with their own smears, so it is off
  // there unless the style turns it on (drawing.motionBlur). A style may animate on twos or threes
  // instead (drawing.cadence: the stepped motion of hand-made 2D animation), which keeps every frame crisp.
  const FAST_ENTERS = new Set(['slide', 'drop', 'swing', 'land']);
  let blurCanvas = null;
  function frame(t, context) {
    const fps = context.P.fps || 24, cadence = {twos: 2, threes: 3}[context.P.drawing?.cadence] || 1;
    if (cadence > 1) t = Math.floor(t * fps / cadence + 1e-6) * cadence / fps;
    const drawn = drawOnce(t, context), blurOn = context.P.drawing?.motionBlur ?? context.P.data?.engine === 'motion', speed = cadence > 1 || !blurOn ? 0 : fastAt(t, fps);
    if (!speed) return drawn;
    // Enough samples that neighbouring copies sit about 3 device pixels apart (at most 10), so the smear is smooth.
    const main = context.ctx, canvas = main.canvas, tip = K.TIP, hand = LASTHAND, samples = Math.max(3, Math.min(10, Math.ceil(speed * 0.5 * (canvas.width / K.W) / 3)));
    if (!blurCanvas || blurCanvas.width !== canvas.width || blurCanvas.height !== canvas.height) { blurCanvas = document.createElement('canvas'); blurCanvas.width = canvas.width; blurCanvas.height = canvas.height; }
    const off = blurCanvas.getContext('2d');
    for (let k = 1; k <= samples; k++) {
      off.setTransform(1, 0, 0, 1, 0, 0); off.clearRect(0, 0, canvas.width, canvas.height); off.setTransform(main.getTransform());
      drawOnce(Math.max(0, t - k * 0.5 / fps / samples), {...context, ctx: off});
      main.save(); main.setTransform(1, 0, 0, 1, 0, 0); main.globalAlpha = 1 / (k + 1); main.drawImage(blurCanvas, 0, 0); main.restore();
    }
    K.ctx = main; K.TIP = tip; LASTHAND = hand;
    return drawn;
  }
  // How fast the picture moves at t, in canvas pixels per frame (0 when nothing moves fast).
  function fastAt(t, fps) {
    if (!LAYOUT || t < 0.5 / fps) return 0;
    const a = camera(t), b = camera(t - 1 / fps), moved = Math.abs(a.Z - b.Z) * K.W + Math.abs(a.ox - b.ox) + Math.abs(a.oy - b.oy) + Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    // A sliding, dropping or slammed thing crosses about a tenth of the frame per frame at its fastest.
    const entering = D.elements.some((el, i) => { const s = t - (LAYOUT.el[i]?.ts ?? Infinity); return s >= 0 && s < 0.3 && (FAST_ENTERS.has(el.enter) || (el.kind === 'text' && (el.style === 'stamp' || el.animate === 'slam'))); });
    const speed = Math.max(moved > 0.006 * K.W ? moved : 0, entering ? 0.1 * K.W : 0);
    return speed;
  }
  function drawOnce(t, context) {
    P = context.P; D = P.data;
    K.KIT = D.kit || {};
    K.TIP = null;
    // A stickman shot may name its own look (videos that mix the looks); the style's look otherwise. A motion shot its
    // design (0.35), the same way.
    const own = value => (value && value !== 'mix' && value !== 'footage' ? value : null);
    // A mix of ticked looks (0.62) starts from the first one ticked, not from classic or vector.
    const look = D.engine === 'stickman' ? D.look || own(P.drawing?.look) || P.drawing?.looks?.[0] || 'classic' : null;
    const design = D.engine === 'motion' ? own(D.design) || own(P.drawing?.design) || P.drawing?.designs?.find(own) || 'vector' : null;
    // Documentary looks with their own finish (0.37): the cartoon documentary (finish chron) and the painted story (paint).
    const params = {...P, finish: (look && LOOKS[look]) || ({infographic: 'info', cartoon: 'chron', painted: 'paint'}[design]) || FINISH[D.engine] || 'cartoon'};
    K.bind({ctx: context.ctx, P: params, W: context.W, H: context.H, M: context.M});
    if (D.board) K.WB = D.board;
    K.DESIGN = design;
    // The shot's own seed: an abstract backdrop picks its pattern from it, so neighbouring shots differ.
    K.SEED = K.hashText((D.elements || []).map(item => `${item.kind}${item.text || item.prop || item.effect || ''}`).join('|'));
    HAND = (D.engine === 'stickman' || D.engine === 'handdrawn') && P.drawing?.hand === true;
    PEN = HAND || look === 'whiteboard';
    K.PEN = HAND; LASTHAND = null;
    const key = P;
    if (lastKey !== key) { LAYOUT = layout(D); lastKey = key; LAYOUT.track = HAND ? penTrack(context) : null; }
    K.T = t;
    LAYOUT.anchors = [];
    const {ctx, W, H, u} = K;
    ctx.fillStyle = K.PAL.bg; ctx.fillRect(0, 0, W, H);
    if (K.FIN === 'ink') { const rand = K.seeded(11); ctx.fillStyle = K.alpha(K.PAL.ink, 0.018); for (let k = 0; k < 420; k++) ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2); }
    if (K.FIN === 'wb') {
      const g = ctx.createRadialGradient(W * 0.45, H * 0.4, H * 0.2, W / 2, H / 2, H * 1.1);
      g.addColorStop(0, K.alpha('#FFFFFF', 0)); g.addColorStop(1, K.alpha('#8A96A3', 0.12)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const rand = K.seeded(31); ctx.fillStyle = K.alpha('#7F8C99', 0.035);
      for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(rand() * W, rand() * H, (0.05 + rand() * 0.12) * W, (0.02 + rand() * 0.05) * H, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
    }
    if (K.DESIGN) drawBackdrop(t);
    // Grid paper behind everything (0.38 texture "grid"; the other textures lie over the finished frame).
    if (D.texture === 'grid') { ctx.save(); ctx.strokeStyle = K.alpha(K.DARK ? '#FFFFFF' : K.PAL.ink, 0.07); ctx.lineWidth = 1.5 * u; ctx.beginPath(); for (let gx = 0; gx < W; gx += 36 * u) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); } for (let gy = 0; gy < H; gy += 36 * u) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); } ctx.stroke(); ctx.strokeStyle = K.alpha(K.DARK ? '#FFFFFF' : K.PAL.ink, 0.12); ctx.beginPath(); for (let gx = 0; gx < W; gx += 180 * u) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); } for (let gy = 0; gy < H; gy += 180 * u) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); } ctx.stroke(); ctx.restore(); }
    // Storybook: warm paper with a fine grain.
    if (K.FIN === 'paint') { const rand = K.seeded(37); ctx.fillStyle = K.alpha('#5A3A1A', 0.035); for (let k = 0; k < 1400; k++) ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2.5, 1 + rand() * 2.5); }
    if (K.FIN === 'chron') { const rand = K.seeded(29); ctx.fillStyle = K.alpha('#7A5A40', 0.03); for (let k = 0; k < 600; k++) ctx.fillRect(rand() * W, rand() * H, 1.5 + rand() * 2, 1.5 + rand() * 2); }
    if (K.FIN === 'story') { const rand = K.seeded(23); ctx.fillStyle = K.alpha('#7A5A40', 0.045); for (let k = 0; k < 900; k++) ctx.fillRect(rand() * W, rand() * H, 1.5 + rand() * 2, 1.5 + rand() * 2); }
    const cam = camera(t);
    LAYOUT.cam = cam;
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
      // Ink draws the place on; under the pen it fades in, so the hand only draws the action.
      const reveal = K.FIN === 'ink' && !PEN && !D.holdSet ? clamp01(t / 0.6) : 1, pen = K.PEN;
      K.PEN = false; K.SKETCH = K.FIN === 'board'; K.WASH = true;
      K.render(setOf(D.set)(t), reveal, 77);
      K.PEN = pen; K.SKETCH = false; K.WASH = false; K.ctx = ctx;
      layerCtx.restore();
      // Storybook places are illustrated, so they are drawn at nearly full strength.
      // Storybook places are illustrated (nearly full strength, warm and muted); a doodle page keeps only a hint of
      // the place and a bold ground.
      // A motion design draws its place as a flat illustration at full strength (motion demo 2026-10-17: a bakery laid
      // back over the dark vector backdrop read as mud); its own backdrop shows only when there is no place.
      const strength = (K.SET_STRENGTH[D.set] ?? 0.55) * (K.DARK ? 0.9 : 1), shown = K.DESIGN || K.FIN === 'chron' ? 1 : K.FIN === 'story' ? Math.min(1, strength + 0.3) : K.FIN === 'doodle' ? strength * 0.45 : K.FIN === 'board' ? Math.min(1, strength + 0.25) : strength;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = shown * (PEN && !D.holdSet ? clamp01(t / 0.3) : 1);
      if (K.FIN === 'story') ctx.filter = 'sepia(0.45) saturate(0.72)';
      // History cartoon places are painted: a little warmer and softer than the classic look.
      if (K.FIN === 'chron') ctx.filter = 'sepia(0.12) saturate(1.05)';
      // The painted story's places: warm, rich and a little contrasty, like golden-hour paintings.
      if (K.FIN === 'paint') ctx.filter = 'sepia(0.28) saturate(1.2) contrast(1.06)';
      ctx.drawImage(layerCanvas, 0, 0); ctx.restore();
      const ground = K.FIN === 'doodle' ? DOODLE_GROUND[D.set] : null;
      if (ground) {
        ctx.save(); applyCamera(ctx, cam, 0.7);
        const edge = K.frame(0, 0, 1).wave(-0.1 * W, 1.1 * W, 0.8 * H, 5 * u, 7, 0.3);
        K.render([{pts: [...edge, [1.1 * W, 1.2 * H], [-0.1 * W, 1.2 * H]], fill: ground, stroke: false}, {pts: edge}], 1, 91);
        ctx.restore();
      }
    }
    // Backdrop effects (a burst, a glow, speed lines, rings) sit behind everything else, so they never hide a word.
    ctx.save(); applyCamera(ctx, cam, 1);
    if (LAYOUT.stage !== null) drawStage(t);
    const backdrop = el => el.kind === 'picture' && el.backdrop && painted(el);
    D.elements.forEach((el, i) => { if (backdrop(el)) drawElement(el, i, t); });
    D.elements.forEach((el, i) => { if (el.kind === 'fx' && BACKDROP_FX.has(el.effect)) drawElement(el, i, t); });
    // A loupe magnifies what is already drawn, so it comes last.
    // Words sit above the mood's light and colour (live plan 2026-10-19: hope rays and a dark grade washed keywords
    // out); a poster or words on the back layer stay part of the picture.
    const above = el => el.kind === 'text' && el.style !== 'poster' && el.layer !== 'back' && !!D.mood && D.mood !== 'none';
    D.elements.forEach((el, i) => { if (!(el.kind === 'fx' && BACKDROP_FX.has(el.effect)) && !backdrop(el) && el.kind !== 'loupe' && !above(el)) drawElement(el, i, t); });
    D.elements.forEach((el, i) => { if (el.kind === 'loupe') drawElement(el, i, t); });
    ctx.restore();
    K.mood(D.mood, t);
    if (D.elements.some(above)) { ctx.save(); applyCamera(ctx, cam, 1); D.elements.forEach((el, i) => { if (above(el)) drawElement(el, i, t); }); ctx.restore(); }
    if (K.FIN === 'paint') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const cw = ctx.canvas.width, ch = ctx.canvas.height, g = ctx.createRadialGradient(cw * 0.5, ch * 0.42, ch * 0.35, cw / 2, ch / 2, ch * 1.0); g.addColorStop(0, 'rgba(255,200,120,0.06)'); g.addColorStop(1, 'rgba(60,30,10,0.32)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); ctx.restore(); }
    if (K.FIN === 'chron') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const cw = ctx.canvas.width, ch = ctx.canvas.height, g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.5, cw / 2, ch / 2, ch * 1.05); g.addColorStop(0, 'rgba(70,45,25,0)'); g.addColorStop(1, 'rgba(70,45,25,0.12)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); ctx.restore(); }
    if (K.FIN === 'story') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const cw = ctx.canvas.width, ch = ctx.canvas.height, g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.45, cw / 2, ch / 2, ch * 1.05); g.addColorStop(0, 'rgba(60,40,25,0)'); g.addColorStop(1, 'rgba(60,40,25,0.16)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); ctx.restore(); }
    if (HAND) drawHand(t, context);
    if (K.FIN === 'wb' && K.WB === 'framed') drawBoardFrame(context);
    D.elements.forEach((el, i) => { if (el.kind === 'fx' && SCREEN_FX.has(el.effect)) drawScreenFx(el, i, t); });
    // The film look (0.39): the shot's own, or the style's for every drawn shot.
    const film = D.film && D.film !== 'none' ? D.film : P.drawing?.film && !['none', 'choose'].includes(P.drawing.film) && D.film !== 'none' ? P.drawing.film : null;
    if (film && FILMS[film]) {
      drawFilm(film, t);
      // Type prints solid over a halftone or engraved picture, as on a real press: words stay sharp and readable.
      if (SOLID_TYPE.has(film)) { ctx.save(); applyCamera(ctx, cam, 1); D.elements.forEach((el, i) => { if (['text', 'quote', 'document', 'gauge', 'ruler', 'chart', 'timeline'].includes(el.kind)) drawElement(el, i, t); }); ctx.restore(); }
    }
    if (D.texture && D.texture !== 'grid') drawTexture(D.texture, t);
    // The opening transition's own marks: speed streaks on a whip, an ink wipe, a glitch, a flash on a pop.
    const tr = D.transition;
    if ((tr === 'whip-left' || tr === 'whip-right') && t < 0.24) { const q = 1 - t / 0.24, rand = K.seeded(5); ctx.save(); ctx.strokeStyle = K.alpha(K.DARK ? '#FFFFFF' : K.PAL.ink, 0.35 * q); ctx.lineCap = 'round'; for (let k = 0; k < 22; k++) { const y = rand() * H, l = (0.2 + rand() * 0.5) * W, x = rand() * W; ctx.lineWidth = (2 + rand() * 7) * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y); ctx.stroke(); } ctx.restore(); }
    if (tr === 'ink' && t < 0.3) { const rr = Math.hypot(W, H) * (0.12 + 0.5 * ease.outCubic(t / 0.3)), f = K.frame(W / 2, H / 2, 1); ctx.save(); ctx.fillStyle = K.PAL.bg; ctx.beginPath(); ctx.rect(0, 0, W, H); const ring = f.blob(0, 0, rr, rr, 9, 0.08, 72); ring.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill('evenodd'); ctx.restore(); }
    if (tr === 'glitch' && t < 0.25) glitch(Math.floor(t * 30) + 3);
    if (tr === 'iris' && t < 0.4) { const rr = Math.hypot(W, H) * 0.55 * ease.inOutCubic(t / 0.4); ctx.save(); ctx.fillStyle = K.DARK ? '#000000' : K.PAL.ink; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, Math.max(1, rr), 0, TAU, true); ctx.fill('evenodd'); ctx.restore(); }
    if (tr === 'flash' && t < 0.2) { ctx.fillStyle = `rgba(255,255,255,${0.95 * (1 - t / 0.2)})`; ctx.fillRect(0, 0, W, H); }
    if ((tr === 'whip-up' || tr === 'whip-down') && t < 0.24) { const q = 1 - t / 0.24, rand = K.seeded(6); ctx.save(); ctx.strokeStyle = K.alpha(K.DARK ? '#FFFFFF' : K.PAL.ink, 0.35 * q); ctx.lineCap = 'round'; for (let k = 0; k < 22; k++) { const x = rand() * W, l = (0.2 + rand() * 0.5) * H, y = rand() * H; ctx.lineWidth = (2 + rand() * 7) * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + l); ctx.stroke(); } ctx.restore(); }
    if (tr === 'pop' && t < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - t / 0.12)})`; ctx.fillRect(0, 0, W, H); }
    return true;
  }
  const catalog = () => ({props: Object.keys(K.PROPS).sort(), sets: Object.keys(K.SETS).sort(), poses: [...K.POSES].sort(), expressions: [...K.EXPRESSIONS].sort()});
  // layout(): the last frame's measured boxes, the pen's tip and the hand, read by the tests.
  window.DRAWN = {frame, catalog, layout: () => (LAYOUT ? {est: LAYOUT.est, tip: K.TIP, hand: LASTHAND} : null)};
}());
