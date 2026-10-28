'use strict';
// P06d - Characters for drawn shots: stick figures (cartoon), ink figures (hand-drawn) and flat figures
// (motion), with a look (hair, colour, headwear, eyewear, facial hair, outfit, marks; or a creature or robot
// body), 40 poses that move like people do, 26 expressions, emotes and a held prop. Big heads and expressive
// faces in the spirit of explainer stick-figure animation, drawn from our own geometry (no copied character).
(function () {
  const K = window.DK, C = K.COL, TAU = Math.PI * 2, D = Math.PI / 180;
  // Characters carry the shot: a medium figure stands over 40% of the frame height.
  K.FIGURE_SIZE = {s: 330, m: 470, l: 600, xl: 780};

  // ------------------------------------------------------------ poses
  // Angles in degrees from hanging straight down, positive towards the way the figure faces (90 = forward,
  // 180 = straight up): f/b = front/back arm [upper, fore], lf/lb = front/back leg [thigh, shin].
  const S = {lf: [9, 2], lb: [-9, -2]};
  const POSE = {
    stand: {f: [20, 10], b: [-18, -8], ...S},
    talk: {f: [35, 105], b: [-18, -8], ...S, k1: {f: [55, 140], b: [-20, 12]}, cycle: 0.9, talk: true},
    point: {f: [95, 92], b: [-18, -8], lf: [9, 0], lb: [-6, 0], lean: 4, mode: 'point'},
    present: {f: [50, 78], b: [-18, -8], ...S, k1: {f: [58, 90]}, cycle: 1.6, talk: true},
    think: {f: [28, 170], b: [22, 88], ...S, tilt: 8, look: 'up'},
    shock: {f: [120, 138], b: [-120, -138], lf: [18, 6], lb: [-18, -6], lean: -8, mode: 'tremble'},
    cheer: {f: [128, 150], b: [-128, -150], lf: [8, 0], lb: [-8, 0], mode: 'jump'},
    facepalm: {f: [118, 212], b: [-10, -4], ...S, tilt: 16, lean: 6},
    shrug: {f: [58, 150], b: [-58, -150], ...S, tilt: -8, mode: 'shrug'},
    'cross-arms': {f: [28, 100], b: [18, 96], ...S, lean: -3},
    'hands-hips': {f: [48, -40], b: [-48, 40], lf: [10, 0], lb: [-10, 0]},
    wave: {f: [125, 160], b: [-18, -8], ...S, mode: 'wave'},
    walk: {f: [0, 0], b: [0, 0], lf: [0, 0], lb: [0, 0], mode: 'walk'},
    run: {f: [0, 0], b: [0, 0], lf: [0, 0], lb: [0, 0], lean: 14, mode: 'run'},
    sit: {f: [30, 70], b: [-10, 30], lf: [88, 0], lb: [84, 4], seat: true},
    type: {f: [62, 98], b: [50, 92], lf: [88, 0], lb: [84, 4], seat: true, mode: 'tap', hold: 'laptop', lean: 6},
    hold: {f: [55, 82], b: [-18, -8], ...S},
    carry: {f: [72, 118], b: [64, 112], lf: [8, 0], lb: [-8, 0], hold: 'box', lean: -4, holdAt: 'chest'},
    phone: {f: [22, 165], b: [-18, -8], ...S, talk: true, hold: 'phone', holdScale: 0.55},
    read: {f: [72, 140], b: [62, 132], ...S, hold: 'book', holdAt: 'chest', tilt: 10},
    beg: {f: [112, 150], b: [100, 142], lf: [90, 0], lb: [0, -90], lean: 12, mode: 'beg'},
    fall: {f: [130, 150], b: [-130, -150], lf: [30, 10], lb: [-10, -20], mode: 'fall', rotate: -32},
    lie: {f: [20, 10], b: [-20, -10], lf: [4, 0], lb: [-4, 0], rotate: 90},
    sneak: {f: [70, 135], b: [30, 100], lf: [35, -25], lb: [-25, -60], lean: 18, mode: 'sneak'},
    dance: {f: [150, 170], b: [-40, -100], lf: [15, 0], lb: [-10, 0], k1: {f: [40, 100], b: [-150, -170], lf: [-5, 0], lb: [12, 0]}, cycle: 0.55, mode: 'dance'},
    fist: {f: [135, 165], b: [-18, -8], lf: [10, 0], lb: [-10, 0], mode: 'fist'},
    cower: {f: [140, 215], b: [130, 205], lf: [58, -45], lb: [28, -72], lean: 14, mode: 'tremble'},
    'scratch-head': {f: [150, 230], b: [-18, -8], ...S, tilt: -6, mode: 'scratch', armBehind: true},
    clap: {f: [70, 100], b: [55, 100], ...S, mode: 'clap'},
    'thumbs-up': {f: [55, 165], b: [-18, -8], lf: [8, 0], lb: [-8, 0], thumb: true},
    stop: {f: [92, 178], b: [-18, -8], lf: [8, 0], lb: [-8, 0], lean: -4},
    jump: {f: [135, 155], b: [-135, -155], lf: [40, -30], lb: [10, -50], mode: 'jump'},
    sleep: {f: [20, 10], b: [-20, -10], lf: [4, 0], lb: [-4, 0], rotate: 90},
    fight: {f: [65, 150], b: [45, 140], lf: [20, 0], lb: [-20, 0], lean: 6, mode: 'fight'},
    reach: {f: [130, 128], b: [-20, -10], lf: [4, 0], lb: [-8, 0], lean: 6},
    push: {f: [88, 92], b: [80, 88], lf: [12, 0], lb: [-30, -12], lean: 20},
    pull: {f: [85, 92], b: [80, 90], lf: [28, 10], lb: [0, 0], lean: -16},
    throw: {f: [-120, -150], b: [45, 60], lf: [15, 0], lb: [-15, 0], lean: -6, k1: {f: [130, 120], b: [-30, -20], lean: 12}, cycle: 1.0},
    kneel: {f: [20, 30], b: [-18, -8], lf: [90, 0], lb: [0, -90]},
    lean: {f: [40, -50], b: [-14, -6], lf: [-10, -6], lb: [12, 0], lean: -8},
  };
  K.POSES = Object.keys(POSE);
  K.POSE = POSE;
  const copy = a => ({f: [...a.f], b: [...a.b], lf: [...a.lf], lb: [...a.lb], lean: a.lean || 0, tilt: a.tilt || 0, lift: a.lift || 0, rotate: a.rotate || 0});
  // The joint angles of a pose at `tl` seconds into it: its keyframe cycle plus its own motion.
  K.poseAngles = (name, tl, seed = 0) => {
    const p = POSE[name] || POSE.stand, a = copy(p);
    if (p.k1) { const s = 0.5 - 0.5 * Math.cos(TAU * tl / p.cycle); for (const key of ['f', 'b', 'lf', 'lb']) if (p.k1[key]) a[key] = a[key].map((v, i) => v + (p.k1[key][i] - v) * s); for (const key of ['lean', 'tilt']) if (p.k1[key] !== undefined) a[key] += (p.k1[key] - a[key]) * s; }
    const w = (hz, ph = 0) => Math.sin(tl * TAU * hz + ph);
    switch (p.mode) {
      case 'walk': { const s = w(1.2); a.lf = [24 * s, 24 * s - 28 * Math.max(0, -s)]; a.lb = [-24 * s, -24 * s - 28 * Math.max(0, s)]; a.f = [-22 * s, -22 * s + 14]; a.b = [22 * s, 22 * s + 14]; a.lift = Math.abs(w(2.4)) * 0.012; break; }
      case 'run': { const s = w(2.1); a.lf = [50 * s, 50 * s - 75 * Math.max(0, -s) - 12]; a.lb = [-50 * s, -50 * s - 75 * Math.max(0, s) - 12]; a.f = [-55 * s, -55 * s + 95]; a.b = [55 * s, 55 * s + 95]; a.lift = Math.abs(w(4.2)) * 0.035; break; }
      case 'sneak': { const s = w(0.7); a.lf = [35 + 14 * s, -25 + 10 * s]; a.lb = [-25 - 14 * s, -60 - 10 * s]; a.lift = Math.abs(w(1.4)) * 0.01; break; }
      case 'jump': { const f = (tl % 0.7) / 0.7, air = Math.sin(f * Math.PI); a.lift = air * 0.13; a.lf = [8 + 40 * air, -30 * air]; a.lb = [-8 + 20 * air, -50 * air]; break; }
      case 'tremble': { const j = Math.sin(tl * 47) * 2.2; a.f = a.f.map(v => v + j); a.b = a.b.map(v => v - j); a.lean += Math.sin(tl * 39) * 0.8; break; }
      case 'wave': a.f[1] += w(2.2) * 24; break;
      case 'tap': a.f[1] += Math.sin(tl * 28) * 6; a.b[1] += Math.sin(tl * 28 + Math.PI) * 6; break;
      case 'clap': { const c = (1 + w(2.5)) / 2; a.f[1] = 100 - 22 * c; a.b[1] = 100 + 16 * c; break; }
      case 'fist': a.f[0] += w(4) * 8; a.f[1] += w(4) * 10; break;
      case 'scratch': a.f[1] += w(4) * 10; break;
      case 'shrug': a.tilt += w(0.6) * 4; break;
      case 'point': a.f[0] += w(1.2) * 3; break;
      case 'beg': a.f[0] += w(1.5) * 10; a.b[0] += w(1.5, 0.4) * 10; break;
      case 'dance': a.lean += w(1 / 0.55) * 8; a.lift = Math.abs(w(2 / 0.55)) * 0.02; break;
      case 'fight': a.lift = Math.abs(w(2)) * 0.02; if (tl % 1.2 < 0.18) { a.f = [90, 90]; a.lean += 6; } break;
      case 'fall': a.f[0] += Math.sin(tl * 12) * 25; a.b[0] += Math.sin(tl * 12 + 1) * 25; a.lf[0] += Math.sin(tl * 9) * 12; break;
      default: break;
    }
    // Everyone breathes, and arms never hang dead still.
    a.lift += Math.sin(tl * 2.4 + seed) * 0.004;
    if (!p.mode && !p.k1) { a.f[0] += Math.sin(tl * 1.7 + seed) * 2.5; a.b[0] -= Math.sin(tl * 1.5 + seed) * 2.5; }
    return a;
  };
  K.blendAngles = (a, b, f) => {
    if (f <= 0) return a;
    if (f >= 1) return b;
    const mixList = (x, y) => x.map((v, i) => v + (y[i] - v) * f);
    return {f: mixList(a.f, b.f), b: mixList(a.b, b.b), lf: mixList(a.lf, b.lf), lb: mixList(a.lb, b.lb), lean: K.lerp(a.lean, b.lean, f), tilt: K.lerp(a.tilt, b.tilt, f), lift: K.lerp(a.lift, b.lift, f), rotate: K.lerp(a.rotate, b.rotate, f)};
  };

  // Joints for angles A at height h, facing right, feet on the ground at (0, 0).
  function skeleton(A, h, body) {
    // A whiteboard person ('drawn') has human proportions: longer legs and body, a small head on a neck.
    const drawn = body === 'drawn' || body === 'caricature', chibi = body === 'chibi';
    const thigh = (chibi ? 0.15 : drawn ? 0.22 : 0.19) * h, shin = (chibi ? 0.14 : drawn ? 0.21 : 0.18) * h, torso = (chibi ? 0.23 : drawn ? 0.29 : 0.25) * h, upper = (chibi ? 0.125 : drawn ? 0.16 : 0.155) * h, fore = (chibi ? 0.115 : 0.15) * h;
    const R = (body === 'robot' ? 0.15 : body === 'bean' ? 0.19 : chibi ? 0.2 : body === 'person' ? 0.115 : body === 'caricature' ? 0.13 : drawn ? 0.09 : 0.165) * h, neckGap = drawn ? 0.04 * h : chibi ? 0.01 * h : 0;
    const limb = ([x, y], a, len) => [x + Math.sin(a * D) * len, y + Math.cos(a * D) * len];
    const hip = [0, 0], kf = limb(hip, A.lf[0], thigh), ff = limb(kf, A.lf[1], shin), kb = limb(hip, A.lb[0], thigh), fb = limb(kb, A.lb[1], shin);
    const lean = A.lean * D, neck = [Math.sin(lean) * torso, -Math.cos(lean) * torso], sh = [neck[0] * 0.88, neck[1] * 0.88];
    const tilt = (A.lean + A.tilt) * D, head = [neck[0] + Math.sin(tilt) * (R * 0.98 + neckGap), neck[1] - Math.cos(tilt) * (R * 0.98 + neckGap)];
    const ef = limb(sh, A.f[0], upper), hf = limb(ef, A.f[1], fore), eb = limb(sh, A.b[0], upper), hb = limb(eb, A.b[1], fore);
    const J = {hip, kf, ff, kb, fb, neck, sh, head, ef, hf, eb, hb};
    if (A.rotate) { const r = A.rotate * D, c = Math.cos(r), s = Math.sin(r); for (const key of Object.keys(J)) { const [x, y] = J[key]; J[key] = [x * c - y * s, x * s + y * c]; } }
    const ground = Math.max(...['ff', 'fb', 'kf', 'kb', 'hip', 'head', 'hf', 'hb'].map(key => J[key][1] + (key === 'head' ? R : 0)));
    const shiftX = A.rotate ? -J.hip[0] : 0;
    for (const key of Object.keys(J)) J[key] = [J[key][0] + shiftX, J[key][1] - ground];
    return {...J, R, tiltRad: tilt};
  }

  // ------------------------------------------------------------ faces
  const EXPR = {
    neutral: {eyes: 'dot', mouth: 'small'}, happy: {eyes: 'dot', mouth: 'smile'}, grin: {eyes: 'dot', mouth: 'grin'}, laugh: {eyes: 'happy', mouth: 'laugh'},
    excited: {eyes: 'wide', brows: 'up', mouth: 'grin'}, sad: {eyes: 'dot', brows: 'sad', mouth: 'frown'}, cry: {eyes: 'closed', brows: 'sad', mouth: 'wail', emote: 'tears'},
    angry: {eyes: 'dot', brows: 'angry', mouth: 'gritted'}, rage: {eyes: 'small', brows: 'angry', mouth: 'shout', emote: 'steam', tint: '#FFC9C0'},
    scared: {eyes: 'small', brows: 'sad', mouth: 'teeth-wavy', emote: 'sweat'}, shocked: {eyes: 'small', brows: 'up', mouth: 'O'}, surprised: {eyes: 'white', brows: 'up', mouth: 'o'},
    worried: {eyes: 'dot', brows: 'sad', mouth: 'wavy'}, nervous: {eyes: 'side', brows: 'sad', mouth: 'teeth-wavy', emote: 'sweat'}, smug: {eyes: 'half', brows: 'uneven', mouth: 'smirk'},
    suspicious: {eyes: 'squint', brows: 'uneven', mouth: 'flat'}, confused: {eyes: 'dot', brows: 'uneven', mouth: 'squiggle', emote: 'question'}, thinking: {eyes: 'up', brows: 'uneven', mouth: 'o'},
    sleepy: {eyes: 'closed', mouth: 'o', emote: 'zzz'}, dead: {eyes: 'x', mouth: 'tongue'}, love: {eyes: 'heart', mouth: 'smile', blush: true}, starstruck: {eyes: 'star', mouth: 'grin'},
    evil: {eyes: 'red', brows: 'angry', mouth: 'jagged'}, disgusted: {eyes: 'squint', brows: 'angry', mouth: 'tongue'}, determined: {eyes: 'dot', brows: 'angry', mouth: 'flat'}, bored: {eyes: 'half', mouth: 'flat'},
    panic: {eyes: 'white', brows: 'sad', mouth: 'shout', emote: 'sweat'}, terrified: {eyes: 'small', brows: 'sad', mouth: 'O', emote: 'sweat', tint: '#E1EAF6'},
    furious: {eyes: 'small', brows: 'angry', mouth: 'shout', emote: 'anger', tint: '#FFB8AE'}, exhausted: {eyes: 'half', brows: 'sad', mouth: 'wavy', emote: 'sweat'},
    embarrassed: {eyes: 'side', brows: 'sad', mouth: 'wavy', blush: true, emote: 'sweat'}, proud: {eyes: 'happy', brows: 'up', mouth: 'smile', emote: 'shine'},
    skeptical: {eyes: 'squint', brows: 'uneven', mouth: 'wavy'}, hopeful: {eyes: 'wide', brows: 'sad', mouth: 'smile', emote: 'sparkle'},
    awkward: {eyes: 'dot', brows: 'flat', mouth: 'squiggle', emote: 'sweat'}, relieved: {eyes: 'closed', brows: 'sad', mouth: 'smile'},
    curious: {eyes: 'wide', brows: 'uneven', mouth: 'o'}, amazed: {eyes: 'wide', brows: 'up', mouth: 'O', emote: 'sparkle'},
    jealous: {eyes: 'squint', brows: 'angry', mouth: 'frown', tint: '#D5EFC4'}, guilty: {eyes: 'side', brows: 'sad', mouth: 'frown', emote: 'sweat'},
    sick: {eyes: 'half', brows: 'sad', mouth: 'wavy', tint: '#CDE7B5', emote: 'dizzy'}, dizzy: {eyes: 'x', mouth: 'squiggle', emote: 'dizzy'},
    focused: {eyes: 'squint', brows: 'angry', mouth: 'small'}, shy: {eyes: 'closed', mouth: 'small', blush: true}, mischievous: {eyes: 'half', brows: 'angry', mouth: 'grin'},
  };
  K.EXPRESSIONS = Object.keys(EXPR);
  K.EXPR = EXPR;
  const shape = (pts, {fill, stroke = K.PAL.line, width = 0, closed = true} = {}) => {
    const {ctx} = K;
    if (pts.length < 2) return;
    ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (closed) ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
  };
  // The face, drawn in the head's own frame (radius 1, facing right, turned a little towards the viewer).
  function face(f, R, expression, st, body) {
    const E = EXPR[expression] || EXPR.neutral, ink = body === 'creature' ? '#FFFFFF' : K.PAL.face, lw = Math.max(2.4 * K.u, R * 0.075), ox = 0.17, dark = '#3A1F1F';
    const blink = (st.tl + (st.seed % 7) * 0.53) % 3.7 < 0.11 && ['dot', 'side', 'up', 'white', 'wide'].includes(E.eyes);
    const eyes = [[ox - 0.33, -0.06], [ox + 0.33, -0.06]];
    const ell = (x, y, rx, ry, fill, rot = 0) => shape(f.ring(x, y, rx, ry, 24).map(([px, py]) => [px, py]), {fill});
    const look = E.eyes === 'up' ? [0.02, -0.07] : E.eyes === 'side' ? [-0.07, 0] : [0.05, 0.01];
    const eyesType = body === 'creature' && !['x', 'heart', 'star', 'happy', 'closed'].includes(E.eyes) ? 'red' : body === 'robot' ? 'robot' : K.FIN === 'doodle' && E.eyes === 'dot' ? 'wide' : E.eyes;
    eyes.forEach(([x, y], k) => {
      const inner = Math.sign(ox - x);
      switch (eyesType) {
        case 'dot': case 'side': ell(x + (E.eyes === 'side' ? -0.06 : 0), y, 0.1, blink ? 0.015 : 0.13, ink); break;
        case 'white': case 'up': case 'wide': case 'small': {
          const r = E.eyes === 'wide' ? 0.2 : E.eyes === 'small' ? 0.19 : 0.18;
          shape(f.ring(x, y, r, blink ? 0.03 : r * 1.05, 24), {fill: '#FFFFFF', width: lw * 0.8, stroke: ink});
          if (!blink) { ell(x + look[0], y + look[1], E.eyes === 'small' ? 0.05 : E.eyes === 'wide' ? 0.1 : 0.075, E.eyes === 'small' ? 0.05 : E.eyes === 'wide' ? 0.1 : 0.075, ink); if (E.eyes === 'wide') ell(x + look[0] - 0.03, y + look[1] - 0.04, 0.03, 0.03, '#FFFFFF'); }
          break;
        }
        case 'happy': shape(f.arc(x, y + 0.06, 0.12, 0.12, Math.PI * 1.1, Math.PI * 1.9, 12), {width: lw, stroke: ink, closed: false}); break;
        case 'closed': shape(f.arc(x, y - 0.02, 0.12, 0.08, Math.PI * 0.1, Math.PI * 0.9, 12), {width: lw, stroke: ink, closed: false}); break;
        case 'x': shape([f.p(x - 0.1, y - 0.1), f.p(x + 0.1, y + 0.1)], {width: lw, stroke: ink, closed: false}); shape([f.p(x + 0.1, y - 0.1), f.p(x - 0.1, y + 0.1)], {width: lw, stroke: ink, closed: false}); break;
        case 'heart': { const s = 0.009 * (1 + 0.15 * Math.sin(st.tl * 8)); shape(Array.from({length: 31}, (_, n) => { const a = TAU * n / 30; return f.p(x + 16 * Math.sin(a) ** 3 * s, y - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s); }), {fill: C.red}); break; }
        case 'star': shape(f.star(x, y, 0.18, 0.08, 5, -Math.PI / 2 + st.tl), {fill: C.yellow, width: lw * 0.5, stroke: ink}); break;
        case 'half': ell(x, y + 0.03, 0.1, 0.08, ink); shape([f.p(x - 0.14, y - 0.02), f.p(x + 0.14, y - 0.02)], {width: lw, stroke: ink, closed: false}); break;
        case 'squint': shape([f.p(x - 0.11, y - 0.02 * inner), f.p(x + 0.11, y + 0.02 * inner)], {width: lw * 1.1, stroke: ink, closed: false}); break;
        case 'red': { K.ctx.save(); K.ctx.shadowColor = C.red; K.ctx.shadowBlur = 18 * K.u; shape(f.pts([[x - 0.15 * inner, y - 0.1], [x + 0.14 * inner, y + 0.02], [x - 0.12 * inner, y + 0.08]]), {fill: '#FF3B3B'}); K.ctx.restore(); break; }
        case 'robot': { K.ctx.save(); K.ctx.shadowColor = C.glow; K.ctx.shadowBlur = 14 * K.u; shape(f.rect(x - 0.12, y - (blink ? 0.01 : 0.09), 0.24, blink ? 0.02 : 0.18), {fill: C.glow}); K.ctx.restore(); break; }
        default: ell(x, y, 0.1, 0.13, ink);
      }
      const brow = E.brows === 'uneven' ? (k === 0 ? 'up' : 'flat') : E.brows;
      if (brow && body !== 'robot') {
        const y0 = y - 0.3, pts = brow === 'angry' ? [[x - 0.15 * inner, y0 - 0.07], [x + 0.13 * inner, y0 + 0.05]] : brow === 'sad' ? [[x - 0.15 * inner, y0 + 0.04], [x + 0.13 * inner, y0 - 0.07]] : brow === 'up' ? [[x - 0.13, y0 - 0.08], [x, y0 - 0.12], [x + 0.13, y0 - 0.08]] : [[x - 0.13, y0], [x + 0.13, y0]];
        shape(f.pts(pts), {width: lw * 1.15, stroke: ink, closed: false});
      }
    });
    if (E.blush || st.look.mark === 'blush') eyes.forEach(([x]) => { K.ctx.save(); K.ctx.globalAlpha *= 0.55; ell(x - 0.02, 0.24, 0.12, 0.06, C.pink); K.ctx.restore(); });
    facial(f, st.look, lw);
    // The mouth: talking alternates open shapes on the narration's rhythm.
    const mx = ox + 0.02, my = 0.42;
    let mouth = E.mouth;
    // speaking: false between the narrator's words (the mouth rests), true inside them, null when the times are unknown.
    if (st.talk && st.speaking !== false) { const n = K.noise(st.tl * 9 + st.seed); mouth = n > 0.35 ? 'O' : n > -0.2 ? 'o' : E.mouth === 'O' ? 'o' : E.mouth; }
    if (body === 'robot' && !['O', 'o'].includes(mouth)) { shape(f.rect(mx - 0.22, my - 0.06, 0.44, 0.12), {fill: C.dark}); [0, 1, 2].forEach(n => shape([f.p(mx - 0.11 + n * 0.11, my - 0.06), f.p(mx - 0.11 + n * 0.11, my + 0.06)], {width: lw * 0.4, stroke: C.metal, closed: false})); return; }
    const mouthInk = ink;
    switch (mouth) {
      case 'small': shape(f.curve(mx - 0.13, my - 0.02, mx, my + 0.08, mx + 0.13, my - 0.02), {width: lw, stroke: mouthInk, closed: false}); break;
      case 'smile': shape(f.curve(mx - 0.24, my - 0.06, mx, my + 0.2, mx + 0.24, my - 0.06), {width: lw, stroke: mouthInk, closed: false}); break;
      case 'frown': shape(f.curve(mx - 0.2, my + 0.08, mx, my - 0.12, mx + 0.2, my + 0.08), {width: lw, stroke: mouthInk, closed: false}); break;
      case 'grin': case 'laugh': {
        const w = mouth === 'laugh' ? 0.34 : 0.3, d = mouth === 'laugh' ? 0.36 : 0.28, pts = [f.p(mx - w, my - 0.08), f.p(mx + w, my - 0.08), ...f.curve(mx + w, my - 0.08, mx, my - 0.08 + d * 2, mx - w, my - 0.08)];
        shape(pts, {fill: dark});
        K.ctx.save(); K.ctx.beginPath(); pts.forEach(([x, y], n) => (n ? K.ctx.lineTo(x, y) : K.ctx.moveTo(x, y))); K.ctx.closePath(); K.ctx.clip();
        shape(f.rect(mx - w, my - 0.1, w * 2, 0.11), {fill: '#FFFFFF'});
        if (mouth === 'laugh') shape(f.ring(mx, my + d * 0.8, 0.16, 0.1), {fill: '#E86A6A'});
        K.ctx.restore();
        shape(pts, {width: lw, stroke: mouthInk});
        break;
      }
      case 'wail': shape([...f.curve(mx - 0.18, my + 0.12, mx, my - 0.18, mx + 0.18, my + 0.12)], {fill: dark, width: lw, stroke: mouthInk}); break;
      case 'O': shape(f.ring(mx, my + 0.04, 0.14, 0.18, 20), {fill: dark, width: lw, stroke: mouthInk}); break;
      case 'o': shape(f.ring(mx, my + 0.02, 0.07, 0.08, 16), {fill: dark, width: lw * 0.8, stroke: mouthInk}); break;
      case 'flat': shape([f.p(mx - 0.17, my), f.p(mx + 0.17, my)], {width: lw, stroke: mouthInk, closed: false}); break;
      case 'wavy': shape(f.wave(mx - 0.2, mx + 0.2, my, 0.035, 2), {width: lw, stroke: mouthInk, closed: false}); break;
      case 'squiggle': shape(f.wave(mx - 0.14, mx + 0.14, my, 0.04, 1.5), {width: lw, stroke: mouthInk, closed: false}); break;
      case 'teeth-wavy': {
        const top = f.wave(mx - 0.26, mx + 0.26, my - 0.06, 0.03, 2.5), bottom = f.wave(mx + 0.26, mx - 0.26, my + 0.08, 0.03, 2.5, 0.5);
        shape([...top, ...bottom], {fill: '#FFFFFF', width: lw, stroke: mouthInk});
        [-0.13, 0, 0.13].forEach(x => shape([f.p(mx + x, my - 0.06), f.p(mx + x, my + 0.08)], {width: lw * 0.6, stroke: mouthInk, closed: false}));
        break;
      }
      case 'gritted': shape(f.rect(mx - 0.22, my - 0.08, 0.44, 0.16), {fill: '#FFFFFF', width: lw, stroke: mouthInk}); [-0.11, 0, 0.11].forEach(x => shape([f.p(mx + x, my - 0.08), f.p(mx + x, my + 0.08)], {width: lw * 0.6, stroke: mouthInk, closed: false})); shape([f.p(mx - 0.22, my), f.p(mx + 0.22, my)], {width: lw * 0.6, stroke: mouthInk, closed: false}); break;
      case 'shout': { const pts = f.pts([[mx - 0.26, my - 0.12], [mx + 0.26, my - 0.12], [mx + 0.16, my + 0.24], [mx - 0.16, my + 0.24]]); shape(pts, {fill: dark, width: lw, stroke: mouthInk}); shape(f.rect(mx - 0.22, my - 0.1, 0.44, 0.08), {fill: '#FFFFFF'}); break; }
      case 'smirk': shape(f.curve(mx - 0.16, my + 0.03, mx + 0.06, my + 0.08, mx + 0.22, my - 0.08), {width: lw, stroke: mouthInk, closed: false}); break;
      case 'tongue': shape(f.curve(mx - 0.2, my - 0.02, mx, my + 0.1, mx + 0.2, my - 0.02), {width: lw, stroke: mouthInk, closed: false}); shape([...f.arc(mx + 0.06, my + 0.06, 0.08, 0.12, 0, Math.PI, 12)], {fill: '#E86A6A', width: lw * 0.7, stroke: mouthInk}); break;
      case 'jagged': { const pts = f.ring(mx, my, 0.3, 0.16, 24); shape(pts, {fill: body === 'creature' ? '#120808' : dark}); const teeth = []; for (let n = 0; n <= 8; n++) teeth.push(f.p(mx - 0.27 + n * 0.0675, my + (n % 2 ? 0.02 : -0.1))); shape(teeth, {fill: '#FFFFFF', closed: false}); const low = []; for (let n = 0; n <= 6; n++) low.push(f.p(mx - 0.2 + n * 0.0667, my + (n % 2 ? 0.0 : 0.12))); shape(low, {fill: '#FFFFFF', closed: false}); break; }
      default: shape(f.curve(mx - 0.13, my - 0.02, mx, my + 0.08, mx + 0.13, my - 0.02), {width: lw, stroke: mouthInk, closed: false});
    }
  }
  function facial(f, look, lw) {
    const hair = K.HAIR[look.hairColor] || K.HAIR.brown, ink = K.PAL.line;
    switch (look.facial) {
      case 'mustache': shape([...f.curve(0.19, 0.24, 0.0, 0.18, -0.12, 0.32), ...f.curve(-0.12, 0.32, 0.02, 0.3, 0.19, 0.28), ...f.curve(0.19, 0.28, 0.36, 0.3, 0.5, 0.32), ...f.curve(0.5, 0.32, 0.38, 0.18, 0.19, 0.24)], {fill: hair === K.HAIR.white ? '#DDDDDD' : hair, width: lw * 0.6, stroke: ink}); break;
      case 'beard': shape([...f.arc(0, 0, 1.02, 1.02, Math.PI * 0.08, Math.PI * 0.92, 24), ...f.arc(0.12, 0.08, 0.66, 0.62, Math.PI * 0.86, Math.PI * 0.1, 20)], {fill: hair, width: lw * 0.6, stroke: ink}); break;
      case 'stubble': { const rand = K.seeded(77); for (let n = 0; n < 22; n++) { const a = 0.25 + rand() * 2.3, r = 0.62 + rand() * 0.28; shape(f.ring(0.08 + Math.cos(a) * r, 0.1 + Math.sin(a) * r * 0.8, 0.018, 0.018, 6), {fill: K.alpha(K.PAL.face, 0.6)}); } break; }
      case 'goatee': shape(f.pts([[0.06, 0.62], [0.3, 0.62], [0.18, 0.86]]), {fill: hair, width: lw * 0.6, stroke: ink}); break;
      case 'handlebar': [-1, 1].forEach(sd => { const x = v => 0.17 + sd * v; shape([...f.curve(x(0), 0.26, x(0.22), 0.16, x(0.46), 0.26), ...f.curve(x(0.46), 0.26, x(0.62), 0.3, x(0.6), 0.12), ...f.curve(x(0.6), 0.12, x(0.7), 0.42, x(0.4), 0.38), ...f.curve(x(0.4), 0.38, x(0.18), 0.36, x(0), 0.32)], {fill: hair === K.HAIR.white ? '#DDDDDD' : hair, width: lw * 0.6, stroke: ink}); }); break;
      default: break;
    }
    const mark = look.mark;
    if (mark === 'bandage') { const c = K.frame(...f.p(-0.35, -0.55), f.s, f.dir, f.rot + 0.5 * f.dir); shape(c.rect(-0.28, -0.08, 0.56, 0.16), {fill: '#F3D9B1', width: lw * 0.5, stroke: ink}); const d = K.frame(...f.p(-0.35, -0.55), f.s, f.dir, f.rot - 0.5 * f.dir); shape(d.rect(-0.28, -0.08, 0.56, 0.16), {fill: '#F3D9B1', width: lw * 0.5, stroke: ink}); }
    if (mark === 'scar') { shape(f.pts([[0.42, -0.36], [0.62, 0.06]]), {width: lw * 0.6, stroke: C.red, closed: false}); [0, 1, 2].forEach(n => shape(f.pts([[0.44 + n * 0.07, -0.26 + n * 0.12], [0.56 + n * 0.07, -0.3 + n * 0.12]]), {width: lw * 0.4, stroke: C.red, closed: false})); }
    if (mark === 'freckles') [[0.0, 0.18], [0.08, 0.24], [-0.06, 0.25], [0.42, 0.18], [0.5, 0.24], [0.36, 0.25]].forEach(([x, y]) => shape(f.ring(x, y, 0.022, 0.022, 6), {fill: '#B9764B'}));
  }

  // ------------------------------------------------------------ hair and headwear (head frame: radius 1, facing right)
  // The hair cap runs from the forehead over the crown to the nape; style decides its outline.
  function cap(f, style, seed) {
    const front = style === 'side-part' ? -34 : -28, back = -188, n = 40, rand = K.seeded(seed), jag = Array.from({length: 12}, () => rand());
    const outer = [];
    for (let k = 0; k <= n; k++) {
      const a = (front + (back - front) * k / n) * D, t = k / n;
      let r = 1.07;
      if (style === 'messy') r += 0.13 * Math.abs(Math.sin(t * Math.PI * 7)) * (0.6 + 0.6 * jag[Math.floor(t * 11)]);
      if (style === 'spiky') r += 0.45 * Math.max(0, 1 - Math.abs(((t * 5.5) % 1) - 0.5) * 2.6) * (t > 0.06 && t < 0.92 ? 1 : 0.3);
      if (style === 'side-part') r += 0.14 * Math.exp(-(((t - 0.2) / 0.12) ** 2));
      outer.push(f.p(Math.cos(a) * r, Math.sin(a) * r));
    }
    const inner = f.curve(Math.cos(back * D), Math.sin(back * D) + 0.08, -0.15, -0.8, Math.cos(front * D), Math.sin(front * D) + 0.08);
    return [...outer, ...inner];
  }
  function hairBack(f, look, st) {
    const hair = K.HAIR[look.hairColor] || K.HAIR.brown, L = [];
    const sw = Math.sin(st.tl * 3) * 0.12;
    if (look.hair === 'afro') L.push({pts: f.blob(-0.08, -0.22, 1.42, 1.32, 14, 0.07), fill: hair});
    if (look.hair === 'long') L.push({pts: [...f.arc(-0.05, -0.05, 1.12, 1.1, Math.PI * 1.05, Math.PI * 1.95, 18), f.p(1.0, 0.6), ...f.wave(1.0, -1.15, 1.35, 0.06, 3), f.p(-1.15, 0.2)], fill: hair});
    if (look.hair === 'bob') L.push({pts: [...f.arc(-0.05, -0.05, 1.16, 1.12, Math.PI * 0.88, Math.PI * 2.12, 24), f.p(1.0, 0.62), f.p(-1.12, 0.62)], fill: hair});
    if (look.hair === 'ponytail') { const c = K.frame(...f.p(-0.95, -0.35), f.s, f.dir, f.rot + sw * f.dir); L.push({pts: [...c.curve(0, -0.15, -0.6, 0.0, -0.45, 0.95), ...c.curve(-0.45, 0.95, -0.15, 0.3, 0, 0.15)], fill: hair}); }
    if (look.hair === 'pigtails') [-1, 1].forEach(s => { const c = K.frame(...f.p(s * 0.95 + 0.05, -0.2), f.s, f.dir, f.rot + sw * f.dir * s); L.push({pts: [...c.curve(0, -0.12, s * 0.5, 0.2, s * 0.25, 0.85), ...c.curve(s * 0.25, 0.85, s * 0.05, 0.3, 0, 0.12)], fill: hair}); });
    if (look.hair === 'bun') L.push({pts: f.ring(-0.3, -1.12, 0.34), fill: hair});
    if (look.headwear === 'hood') L.push({pts: f.ring(-0.08, -0.02, 1.32, 1.3), fill: K.col(look.color)});
    return L;
  }
  function hairFront(f, look, st) {
    const hair = K.HAIR[look.hairColor] || K.HAIR.brown, L = [], seed = K.hashText(JSON.stringify(look));
    if (['short', 'messy', 'spiky', 'side-part', 'long', 'bob', 'ponytail', 'pigtails', 'bun'].includes(look.hair)) L.push({pts: cap(f, look.hair === 'long' || look.hair === 'bob' || look.hair === 'ponytail' || look.hair === 'pigtails' || look.hair === 'bun' ? 'short' : look.hair, seed), fill: hair});
    if (look.hair === 'mohawk') L.push({pts: [...Array.from({length: 9}, (_, k) => { const a = (-132 + k * 10.5) * D, r = k % 2 ? 1.0 : 1.42; return f.p(Math.cos(a) * r, Math.sin(a) * r); }), f.p(0.38, -0.86), f.p(-0.62, -0.74)], fill: hair});
    if (look.hair === 'curly') for (let k = 0; k <= 9; k++) { const a = (-24 - k * 14.7) * D; L.push({pts: f.ring(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.24), fill: hair}); }
    if (look.hair === 'afro') L.push({pts: f.arc(0, 0, 1.0, 1.0, -Math.PI * 0.95, -Math.PI * 0.08, 14), fill: undefined, color: K.PAL.line, width: 0.1, stroke: false});
    if (look.hair === 'bald') L.push({pts: f.arc(-0.1, -0.1, 0.62, 0.62, Math.PI * 1.2, Math.PI * 1.45, 6), color: '#D8D8D8', width: 0.8});
    const hw = look.headwear, col = K.col(look.color);
    const brim = (y, w, h, fill, front = 0.25) => ({pts: f.ring(front, y, w, h, 28), fill});
    switch (hw) {
      case 'cap': L.push({pts: [...f.arc(0, -0.05, 1.1, 1.1, Math.PI * 1.06, Math.PI * 1.96, 20), f.p(1.08, -0.35)], fill: col}, {pts: f.pts([[0.55, -0.45], [1.55, -0.34], [1.5, -0.24], [0.5, -0.3]]), fill: col}); break;
      case 'beanie': L.push({pts: [...f.arc(0, -0.42, 1.06, 0.86, Math.PI * 1.0, Math.PI * 2.0, 20)], fill: col}, {pts: f.rrect(-1.1, -0.56, 2.2, 0.26, 0.1), fill: K.mix(col, '#FFFFFF', 0.25)}, {pts: f.ring(0, -1.32, 0.2), fill: K.mix(col, '#FFFFFF', 0.35)}); break;
      case 'fedora': L.push({pts: f.pts([[-0.75, -0.7], [-0.62, -1.35], [-0.1, -1.25], [0.1, -1.38], [0.62, -1.35], [0.75, -0.7]]), fill: col === K.COL.blue ? '#2B2B2B' : K.mix(col, '#000000', 0.45)}, brim(-0.72, 1.45, 0.18, '#2B2B2B', 0.05), {pts: f.rect(-0.73, -0.92, 1.46, 0.16), fill: C.red, stroke: false}); break;
      case 'top-hat': L.push({pts: f.rect(-0.6, -1.95, 1.2, 1.18), fill: '#222222'}, {pts: f.rect(-0.6, -1.0, 1.2, 0.16), fill: C.red, stroke: false}, brim(-0.78, 1.1, 0.16, '#222222', 0)); break;
      case 'hard-hat': L.push({pts: [...f.arc(0, -0.46, 1.0, 0.8, Math.PI * 1.0, Math.PI * 2.0, 20)], fill: C.yellow}, {pts: f.pts([[-1.15, -0.46], [1.4, -0.46]]), width: 1.4, color: '#C99A1D'}, {pts: f.pts([[0, -1.24], [0, -0.5]]), color: '#C99A1D', width: 0.8}); break;
      case 'crown': L.push({pts: f.pts([[-0.7, -0.75], [-0.75, -1.35], [-0.38, -1.0], [0, -1.45], [0.38, -1.0], [0.75, -1.35], [0.7, -0.75], [-0.7, -0.75]]), fill: C.gold}, {pts: f.ring(0, -0.92, 0.1), fill: C.red}); break;
      case 'chef-hat': L.push({pts: f.blob(0, -1.45, 0.82, 0.5, 5, 0.18), fill: '#FFFFFF'}, {pts: f.rect(-0.62, -1.08, 1.24, 0.38), fill: '#FFFFFF'}); break;
      case 'graduation': { const sw = Math.sin(st.tl * 3) * 0.2; L.push({pts: [...f.arc(0, -0.2, 0.95, 0.9, Math.PI * 1.08, Math.PI * 1.92, 16)], fill: '#222222'}, {pts: f.pts([[-1.3, -1.05], [0, -1.35], [1.3, -1.05], [0, -0.78], [-1.3, -1.05]]), fill: '#222222'}, {pts: K.frame(...f.p(0, -1.06), f.s, f.dir, f.rot + sw).pts([[0, 0], [0.9, 0.2], [0.9, 0.75]]), color: C.gold, width: 0.9}); break; }
      case 'cowboy': L.push({pts: f.pts([[-0.6, -0.7], [-0.52, -1.3], [0, -1.15], [0.52, -1.3], [0.6, -0.7]]), fill: '#9C6B3F'}, {pts: [...f.curve(-1.6, -0.95, 0, -0.35, 1.6, -0.95), ...f.curve(1.6, -0.95, 0, -0.6, -1.6, -0.95)], fill: '#9C6B3F'}); break;
      case 'helmet': L.push({pts: [...f.arc(0, -0.36, 1.1, 0.9, Math.PI * 0.98, Math.PI * 2.02, 22)], fill: C.metal}, {pts: f.pts([[-1.1, -0.36], [1.12, -0.36]]), width: 1.2}); break;
      case 'headband': { const sw = Math.sin(st.tl * 4) * 0.2, edge = y => Array.from({length: 9}, (_, n) => { const t = -1 + n / 4; return f.p(t * Math.sqrt(1 - y * y) * 1.04, y + 0.07 * (1 - t * t)); }); L.push({pts: [...edge(-0.76), ...edge(-0.52).reverse()], fill: col === K.COL.blue ? C.red : col}, {pts: K.frame(...f.p(-0.96, -0.62), f.s, f.dir, f.rot + sw).pts([[0, 0], [-0.5, 0.4], [-0.35, 0.05], [-0.55, -0.1], [0, 0]]), fill: col === K.COL.blue ? C.red : col}); break; }
      case 'party-hat': L.push({pts: f.pts([[-0.55, -0.82], [0.1, -2.0], [0.6, -0.82], [-0.55, -0.82]]), fill: C.pink}, ...[0, 1].map(k => ({pts: f.pts([[-0.42 + k * 0.22, -1.08 - k * 0.3], [0.48 - k * 0.12, -1.08 - k * 0.3]]), color: C.yellow, width: 1.1})), {pts: f.ring(0.1, -2.05, 0.16), fill: C.yellow}); break;
      case 'hood': L.push({pts: f.arc(-0.08, -0.02, 1.32, 1.3, Math.PI * 0.62, Math.PI * 1.75, 20), color: K.mix(col, '#000000', 0.25), width: 1.2}); break;
      case 'beret': L.push({pts: K.frame(...f.p(-0.1, -0.88), f.s, f.dir, f.rot - 0.25 * f.dir).ring(0, 0, 1.0, 0.32), fill: col === K.COL.blue ? C.red : col}, {pts: f.pts([[-0.1, -1.22], [-0.05, -1.4]]), width: 1}); break;
      case 'police-cap': L.push({pts: f.pts([[-0.85, -0.62], [-1.0, -1.15], [1.0, -1.15], [0.85, -0.62]]), fill: '#24324F'}, {pts: f.pts([[0.2, -0.62], [1.4, -0.52], [0.9, -0.42], [0.2, -0.5]]), fill: '#111111'}, {pts: f.star(0, -0.88, 0.18, 0.08), fill: C.gold, width: 0.5}); break;
      // 0.36 history headwear.
      case 'tricorn': L.push({pts: f.pts([[-1.3, -0.68], [-0.75, -1.25], [0.05, -1.42], [0.85, -1.22], [1.35, -0.66], [0.62, -0.9], [0.05, -0.8], [-0.6, -0.92], [-1.3, -0.68]]), fill: '#2B2622'}, {pts: f.pts([[-1.22, -0.72], [-0.6, -0.95], [0.05, -0.84], [0.62, -0.93], [1.28, -0.7]]), color: C.gold, width: 0.7}); break;
      case 'bicorne': L.push({pts: [...f.curve(-1.75, -0.72, -0.1, -2.35, 1.75, -0.72), ...f.curve(1.75, -0.72, 0, -1.02, -1.75, -0.72)], fill: '#24211F'}, {pts: f.ring(0.35, -1.12, 0.2, 0.2, 18), fill: C.red}, {pts: f.ring(0.35, -1.12, 0.1, 0.1, 14), fill: '#FFFFFF', stroke: false}); break;
      case 'bowler': L.push({pts: f.arc(0, -0.64, 0.78, 0.66, Math.PI, Math.PI * 2, 22), fill: '#2A2A2A'}, brim(-0.66, 1.12, 0.13, '#2A2A2A', 0.05)); break;
      case 'peaked-cap': L.push({pts: f.pts([[-0.92, -0.62], [-1.22, -1.22], [1.08, -1.3], [0.92, -0.62]]), fill: K.mix(col, '#000000', 0.35)}, {pts: f.rect(-0.94, -0.8, 1.88, 0.2), fill: C.red, stroke: false}, {pts: f.pts([[0.25, -0.62], [1.5, -0.5], [1.0, -0.38], [0.25, -0.5]]), fill: '#141414'}, {pts: f.star(0.05, -1.0, 0.16, 0.07), fill: C.gold, width: 0.5}); break;
      case 'spiked-helmet': L.push({pts: f.arc(0, -0.38, 1.08, 0.98, Math.PI * 0.98, Math.PI * 2.02, 22), fill: '#3B3B3B'}, {pts: f.pts([[0.2, -0.4], [1.42, -0.32], [1.0, -0.22], [0.2, -0.3]]), fill: '#1C1C1C'}, {pts: f.pts([[-0.14, -1.3], [0, -1.95], [0.14, -1.3]]), fill: C.gold}, {pts: f.star(0.1, -0.85, 0.2, 0.09, 6), fill: C.gold, width: 0.5}); break;
      case 'turban': L.push({pts: f.blob(-0.05, -0.72, 1.18, 0.62, 6, 0.07), fill: col === K.COL.blue ? '#F2EEE3' : col}, {pts: f.curve(-1.0, -0.5, -0.1, -1.05, 1.1, -0.62), color: K.alpha(K.PAL.line, 0.5), width: 0.6}, {pts: f.ring(0.62, -0.78, 0.14, 0.16, 14), fill: C.red, width: 0.5}); break;
      case 'laurel': for (let k = 0; k < 9; k++) { const a = (195 + k * 18.5) * D, side = k < 4.5 ? -1 : 1; L.push({pts: K.frame(...f.p(Math.cos(a) * 1.02, Math.sin(a) * 1.02), f.s, f.dir, f.rot + a + side * 0.5).ring(0, 0, 0.2, 0.09, 12), fill: '#6BA539', width: 0.5}); } break;
      case 'wizard': L.push({pts: f.pts([[-0.8, -0.78], [0.35, -2.4], [0.8, -0.78], [-0.8, -0.78]]), fill: C.purple}, brim(-0.78, 1.35, 0.18, C.purple, 0), ...[[0.0, -1.3], [0.3, -1.75], [-0.2, -1.0]].map(([x, y]) => ({pts: f.star(x, y, 0.13, 0.05), fill: C.yellow, stroke: false}))); break;
      default: break;
    }
    return L;
  }
  // Eyewear sits over the eyes, so it is drawn after the face.
  function eyewear(f, look) {
    const L = [], ink = K.PAL.face, eyes = [[0.17 - 0.33, -0.06], [0.17 + 0.33, -0.06]];
    switch (look.eyewear) {
      case 'glasses': L.push(...eyes.map(([x, y]) => ({pts: f.ring(x, y, 0.24, 0.22, 24), color: ink, width: 0.7})), {pts: f.pts([[eyes[0][0] + 0.24, -0.08], [eyes[1][0] - 0.24, -0.08]]), width: 0.6}, {pts: f.pts([[eyes[0][0] - 0.24, -0.08], [-0.9, -0.14]]), width: 0.6}); break;
      case 'sunglasses': L.push(...eyes.map(([x, y]) => ({pts: f.rrect(x - 0.27, y - 0.17, 0.54, 0.34, 0.12), fill: '#151515'})), {pts: f.pts([[eyes[0][0] + 0.27, -0.1], [eyes[1][0] - 0.27, -0.1]]), width: 0.8}, {pts: f.pts([[eyes[0][0] - 0.27, -0.1], [-0.92, -0.16]]), width: 0.7}, {pts: f.pts([[eyes[1][0] - 0.16, -0.14], [eyes[1][0] - 0.04, -0.14]]), color: '#FFFFFF', width: 0.5}); break;
      case 'monocle': L.push({pts: f.ring(eyes[1][0], eyes[1][1], 0.24, 0.24, 24), color: C.gold, width: 0.8}, {pts: f.curve(eyes[1][0] - 0.1, 0.18, 0.2, 0.7, -0.1, 0.95), color: C.gold, width: 0.4}); break;
      case 'eyepatch': L.push({pts: f.pts([[-0.95, -0.38], [eyes[1][0], -0.06], [0.98, 0.1]]), width: 0.5}, {pts: f.ring(eyes[1][0], eyes[1][1], 0.2, 0.18), fill: '#151515'}); break;
      case 'goggles': L.push({pts: f.pts([[-1.0, -0.12], [1.0, -0.12]]), color: K.col(look.color), width: 1.6}, ...eyes.map(([x, y]) => ({pts: f.ring(x, y, 0.25, 0.23, 24), fill: K.alpha('#BFE3FF', 0.7), width: 1.1}))); break;
      default: break;
    }
    return L;
  }

  // ------------------------------------------------------------ outfits (screen points of the body)
  function outfit(J, look, h, dir, layer, st) {
    const col = K.col(look.color), L = [], o = look.outfit;
    const perp = (pt, w) => { const dx = J.neck[0] - J.hip[0], dy = J.neck[1] - J.hip[1], l = Math.hypot(dx, dy) || 1; return [[pt[0] - dy / l * w, pt[1] + dx / l * w], [pt[0] + dy / l * w, pt[1] - dx / l * w]]; };
    const along = f => [J.hip[0] + (J.neck[0] - J.hip[0]) * f, J.hip[1] + (J.neck[1] - J.hip[1]) * f];
    const body = (topW, bottomW, top = 0.92, bottom = 0, fill = col) => { const [a, b] = perp(along(top), topW * h), [c, d] = perp(along(bottom), bottomW * h); return {pts: [a, b, d, c, a], fill}; };
    if (layer === 'back') {
      if (o === 'cape') { const sw = Math.sin(st.tl * 3) * 0.04 * h; const [a, b] = perp(along(0.92), 0.06 * h); L.push({pts: [a, b, [J.hip[0] - 0.16 * h * dir + sw, J.hip[1] + 0.2 * h], [J.hip[0] - 0.02 * h * dir + sw * 0.5, J.hip[1] + 0.24 * h], a], fill: col === K.COL.blue ? C.red : col}); }
      if (o === 'backpack') { const c = along(0.55); L.push({pts: K.frame(c[0] - 0.07 * h * dir, c[1], h, dir).rrect(-0.06, -0.08, 0.1, 0.16, 0.025), fill: col}); }
      return L;
    }
    // A kit outfit (the story's own costume): u across the shoulders, v from the neck (0) to the hips (1) and below.
    if (String(o).startsWith('kit:')) {
      const dx = J.neck[0] - J.hip[0], dy = J.neck[1] - J.hip[1], l = Math.hypot(dx, dy) || 1, top = along(0.92);
      L.push(...K.kitShapes(o, ([u, v]) => { const w = u * 0.375 * h * dir, down = v * 0.92 * l; return [top[0] - dx / l * down - dy / l * w, top[1] - dy / l * down + dx / l * w]; }));
    }
    if (o === 'suit') { L.push(body(0.07, 0.065, 0.92, -0.05, '#2E3440')); const n = along(0.92), t = along(0.45); L.push({pts: [[n[0] - 0.03 * h * dir, n[1]], [n[0] + 0.03 * h * dir, n[1]], [t[0], t[1]], [n[0] - 0.03 * h * dir, n[1]]], fill: '#FFFFFF', stroke: false}, {pts: [n, [n[0] + 0.012 * h, n[1] + 0.03 * h], [t[0], t[1] - 0.02 * h], [n[0] - 0.012 * h, n[1] + 0.03 * h], n], fill: col === K.COL.red ? C.blue : C.red, stroke: false}); }
    if (o === 'lab-coat') { L.push(body(0.075, 0.09, 0.92, -0.22, '#FFFFFF')); const n = along(0.92), m = along(0.3); L.push({pts: [n, m], width: 0.6}); }
    if (o === 'hoodie') L.push(body(0.075, 0.07, 0.92, -0.04, col));
    if (o === 'dress') { const [a, b] = perp(along(0.9), 0.05 * h); L.push({pts: [a, b, [J.hip[0] + 0.15 * h, J.hip[1] + 0.16 * h], [J.hip[0] - 0.15 * h, J.hip[1] + 0.16 * h], a], fill: col}); }
    if (o === 'apron') L.push(body(0.05, 0.06, 0.7, -0.15, '#FFFFFF'), {pts: [along(0.7), along(0.98)], width: 0.6});
    if (o === 'vest') L.push(body(0.065, 0.06, 0.88, 0.2, col));
    if (o === 'uniform') { L.push(body(0.07, 0.065, 0.92, -0.04, col)); const c = along(0.7); L.push({pts: K.frame(c[0] + 0.03 * h * dir, c[1], h, dir).star(0, 0, 0.022, 0.01), fill: C.gold, width: 0.4}); }
    if (o === 'tie') { const n = along(0.92), t = along(0.4); L.push({pts: [n, [n[0] + 0.016 * h, n[1] + 0.03 * h], [t[0], t[1]], [n[0] - 0.016 * h, n[1] + 0.03 * h], n], fill: col === K.COL.blue ? C.red : col, width: 0.5}); }
    if (o === 'bowtie') { const n = along(0.9); L.push({pts: K.frame(n[0], n[1], h, dir).pts([[0, 0], [-0.04, -0.025], [-0.04, 0.025], [0, 0], [0.04, -0.025], [0.04, 0.025], [0, 0]]), fill: col === K.COL.blue ? C.red : col, width: 0.5}); }
    if (o === 'scarf') { const n = along(0.92), sw = Math.sin(st.tl * 4) * 0.02 * h; L.push({pts: [[n[0] - 0.05 * h, n[1] - 0.01 * h], [n[0] + 0.05 * h, n[1] - 0.01 * h], [n[0] + 0.05 * h, n[1] + 0.03 * h], [n[0] - 0.05 * h, n[1] + 0.03 * h]], fill: col === K.COL.blue ? C.red : col}, {pts: [[n[0] - 0.03 * h * dir, n[1] + 0.02 * h], [n[0] - 0.12 * h * dir + sw, n[1] + 0.1 * h], [n[0] - 0.08 * h * dir + sw, n[1] + 0.12 * h], [n[0] - 0.01 * h * dir, n[1] + 0.03 * h]], fill: col === K.COL.blue ? C.red : col}); }
    if (o === 'officer') { L.push(body(0.072, 0.066, 0.92, -0.06, col)); const n = along(0.9); [-1, 1].forEach(side => L.push({pts: K.frame(n[0] + side * 0.06 * h, n[1] + 0.005 * h, h, dir).rrect(-0.03, -0.012, 0.06, 0.024, 0.012), fill: C.gold, width: 0.4})); L.push({pts: [along(0.9), along(0.2)], color: C.red, width: 1.6}); }
    if (o === 'armor') { L.push(body(0.075, 0.068, 0.92, -0.04, C.metal)); [0.66, 0.42].forEach(f => { const [a, b] = perp(along(f), 0.07 * h); L.push({pts: [a, b], width: 0.5}); }); }
    if (o === 'robe') { const [a, b] = perp(along(0.92), 0.06 * h); L.push({pts: [a, b, [J.hip[0] + 0.12 * h, J.hip[1] + 0.3 * h], [J.hip[0] - 0.12 * h, J.hip[1] + 0.3 * h], a], fill: col}); }
    if (o === 'badge') { const c = along(0.72); L.push({pts: K.frame(c[0] + 0.02 * h * dir, c[1], h, dir).star(0, 0, 0.03, 0.013), fill: C.gold, width: 0.4}); }
    return L;
  }

  // ------------------------------------------------------------ emotes
  function emote(name, hx, hy, R, dir, tl) {
    const {ctx, u} = K;
    if (!name || name === 'none') return;
    const drop = (x, y, s, a = 1) => { ctx.save(); ctx.globalAlpha *= a; const f = K.frame(x, y, s, 1); shape([...f.curve(0, -1, -0.15, -0.4, -0.55, 0.2), ...f.arc(0, 0.25, 0.55, 0.55, Math.PI, 0, 12), ...f.curve(0.55, 0.2, 0.15, -0.4, 0, -1)], {fill: '#7CC8F5', width: 2 * u, stroke: K.PAL.line}); ctx.restore(); };
    switch (name) {
      case 'sweat': { const f = (tl % 1.6) / 1.6; drop(hx - 0.92 * R * dir, hy - 0.55 * R + f * 0.6 * R, R * 0.2, 1 - f * 0.6); break; }
      case 'tears': [-0.16, 0.5].forEach((ex, k) => { const x = hx + ex * R * dir; shape([[x, hy + 0.05 * R], [x + 0.04 * R, hy + 0.9 * R]], {width: R * 0.09, stroke: '#7CC8F5', closed: false}); const f = ((tl + k * 0.4) % 0.8) / 0.8; drop(x + 0.04 * R, hy + (0.3 + f * 0.9) * R, R * 0.09, 1 - f); }); break;
      case 'anger': { const s = R * 0.28 * (1 + 0.15 * Math.sin(tl * 9)), x = hx + 0.72 * R * dir, y = hy - 0.86 * R; [0, 1, 2, 3].forEach(k => { const a = k * Math.PI / 2 + Math.PI / 4, c = K.frame(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s, 1, a + Math.PI / 4); shape(c.arc(0, 0, 0.45, 0.45, Math.PI * 0.8, Math.PI * 1.7, 8), {width: R * 0.08, stroke: C.red, closed: false}); }); break; }
      case 'sparkle': [[1.15, -0.9], [-1.1, -0.6], [1.3, 0.1]].forEach(([x, y], k) => { const s = R * 0.22 * Math.max(0.1, Math.sin(tl * 5 + k * 2)); shape(K.frame(hx + x * R * dir, hy + y * R, s).star(0, 0, 1, 0.3, 4), {fill: C.yellow, width: 1.5 * u, stroke: K.PAL.line}); }); break;
      case 'zzz': [0, 1, 2].forEach(k => { const f = ((tl * 0.6 + k / 3) % 1); ctx.save(); ctx.globalAlpha *= 1 - f; K.text('Z', hx + (0.9 + f * 0.7) * R * dir, hy - (0.9 + f * 1.2) * R, R * (0.35 + f * 0.4), {color: K.PAL.line}); ctx.restore(); }); break;
      case 'hearts': [0, 1, 2].forEach(k => { const f = ((tl * 0.5 + k / 3) % 1), x = hx + (0.6 + Math.sin(tl * 3 + k) * 0.25) * R * dir * (k % 2 ? -1 : 1), y = hy - (0.9 + f * 1.4) * R, s = R * 0.012 * (1 - f * 0.3); ctx.save(); ctx.globalAlpha *= 1 - f; shape(Array.from({length: 31}, (_, n) => { const a = TAU * n / 30; return [x + 16 * Math.sin(a) ** 3 * s, y - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s]; }), {fill: C.red}); ctx.restore(); }); break;
      case 'question': K.text('?', hx + 0.2 * R * dir, hy - 1.75 * R + Math.sin(tl * 3) * 0.08 * R, R * 1.0, {color: K.PAL.accent}); break;
      case 'exclamation': { const s = Math.min(1, tl / 0.2); K.text('!', hx + 0.1 * R * dir, hy - 1.8 * R, R * 1.1 * K.ease.outBack(s), {color: C.red}); break; }
      case 'idea': { const f = K.frame(hx + 0.1 * R * dir, hy - 1.95 * R, R * 1.5); K.render(K.PROPS.lightbulb(f, {tl: tl + 0.3, seed: 1}), 1, 3); break; }
      case 'dizzy': [0, 1, 2].forEach(k => { const a = tl * 4 + k * TAU / 3; shape(K.frame(hx + Math.cos(a) * 0.95 * R, hy - 1.05 * R + Math.sin(a) * 0.25 * R, R * 0.17).star(0, 0, 1, 0.42), {fill: C.yellow, width: 1.5 * u, stroke: K.PAL.line}); }); break;
      case 'steam': [-1, 1].forEach(s => [0, 1, 2].forEach(k => { const f = ((tl * 1.5 + k / 3) % 1); ctx.save(); ctx.globalAlpha *= 1 - f; shape(K.frame(hx + s * (0.55 + f * 0.35) * R, hy - (1.0 + f * 0.8) * R, R * (0.07 + f * 0.1)).ring(0, 0, 1, 1, 16), {fill: '#FFFFFF', width: 2 * u, stroke: K.alpha(K.PAL.line, 0.55)}); ctx.restore(); })); break;
      case 'music': [0, 1].forEach(k => { const f = ((tl * 0.5 + k / 2) % 1); ctx.save(); ctx.globalAlpha *= 1 - f; K.text(k ? '♫' : '♪', hx + (0.9 + f * 0.5) * R * dir, hy - (0.8 + f * 1.3) * R, R * 0.7, {color: K.PAL.accent, heading: false}); ctx.restore(); }); break;
      case 'cash': [0, 1, 2].forEach(k => { const f = ((tl * 0.6 + k / 3) % 1); ctx.save(); ctx.globalAlpha *= 1 - f; K.text('$', hx + (k - 1) * 0.7 * R, hy - (1.0 + f * 1.3) * R, R * 0.7, {color: C.moneyDark}); ctx.restore(); }); break;
      case 'shine': { const s = R * 0.3 * Math.max(0.1, Math.sin(tl * 4)); shape(K.frame(hx + 0.55 * R * dir, hy - 0.75 * R, s).star(0, 0, 1, 0.25, 4), {fill: '#FFFFFF', width: 1.5 * u, stroke: K.PAL.line}); break; }
      default: break;
    }
  }

  // ------------------------------------------------------------ the whole figure
  // st: {x, y (feet, px), dir, size, A (angles), expression, emote, talk, holds, tl, seed, look, engine}
  // Returns anchors: head [x, y, r], hand [x, y], box [x1, y1, x2, y2].
  // ------------------------------------------------------------ whiteboard people (0.32)
  // The hand-drawn engine draws people, not stick figures (owner review 2026-10-16): an oval head with an ear, a
  // nose, hair and the cast's face, a neck, a shirt with sleeves, trousers, shoes and hands, about six heads tall.
  // Every part is an outlined shape on the same pose skeleton, so the 40 poses, the expressions and the looks of
  // the cast all work, and a hand can draw the person line by line.
  const smooth = (pts, closed = true, steps = 5) => {
    const n = pts.length, at = k => pts[closed ? (k + n) % n : Math.max(0, Math.min(n - 1, k))], out = [];
    for (let k = 0; k < (closed ? n : n - 1); k++) {
      const a = at(k - 1), b = at(k), c = at(k + 1), d = at(k + 2);
      for (let s = 0; s < steps; s++) { const t = s / steps, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(i => 0.5 * (2 * b[i] + (-a[i] + c[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * t3))); }
    }
    out.push(closed ? out[0] : pts[n - 1]);
    return out;
  };
  // An outlined tube along a path (a sleeve, a trouser leg): its width from start to end, round ends.
  const tube = (pts, w0, w1) => {
    const n = pts.length, left = [], right = [];
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * k / Math.max(1, n - 1)) / 2;
      left.push([pts[k][0] - dy / l * w, pts[k][1] + dx / l * w]); right.push([pts[k][0] + dy / l * w, pts[k][1] - dx / l * w]);
    }
    const cap = (c, w, from) => Array.from({length: 7}, (_, s) => { const a = from - Math.PI * s / 6; return [c[0] + Math.cos(a) * w / 2, c[1] + Math.sin(a) * w / 2]; });
    const end = Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]), start = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
    return [...left, ...cap(pts[n - 1], w1, end + Math.PI / 2), ...right.reverse(), ...cap(pts[0], w0, start - Math.PI / 2), left[0]];
  };
  function drawPerson(st, progress) {
    const {u} = K, h = K.FIGURE_SIZE[st.size || 'm'] * u * 1.06, dir = st.dir, look = st.look;
    // Dry-erase boards draw caricatures: a bigger head on the same body.
    // History cartoon people (0.36, finish chron): a big round head on a short body, in costume.
    const chibi = K.FIN === 'chron';
    const J0 = skeleton(st.A, h, chibi ? 'chibi' : K.WB === 'dry-erase' ? 'caricature' : 'drawn'), lift = st.A.lift * h, J = {};
    for (const key of ['hip', 'kf', 'ff', 'kb', 'fb', 'neck', 'sh', 'head', 'ef', 'hf', 'eb', 'hb']) J[key] = [st.x + J0[key][0] * dir, st.y + J0[key][1] - lift];
    const R = J0.R, lw = Math.max(3 * u, h * 0.0105), head = K.frame(J.head[0], J.head[1], R, dir, J0.tiltRad * dir), pose = K.POSE[st.pose] || {};
    const seed = K.hashText(`${look.color}${look.hair}${look.hairColor}${look.outfit}`);
    const skin = ['#F3D3B8', '#E2B48D', '#C68E63', '#8D5A3B'][seed % 4];
    const shirt = look.color ? K.col(look.color) : ['#5B7FA6', '#C8553D', '#6A994E', '#E9C46A', '#8E7DBE'][seed % 5];
    const suit = look.outfit === 'suit', coat = look.outfit === 'lab-coat', officer = ['officer', 'uniform'].includes(look.outfit), armor = look.outfit === 'armor', robe = look.outfit === 'robe';
    const top = suit ? '#2E3440' : coat ? '#FFFFFF' : armor ? C.metal : shirt, trousers = suit ? '#2E3440' : officer ? K.mix(shirt, '#000000', 0.45) : ['#3E4A5C', '#5C4B3E', '#2F3E46'][seed % 3];
    const longSleeves = suit || coat || officer || armor || robe || look.outfit === 'hoodie' || seed % 3 === 0;
    const axis = [J.neck[0] - J.hip[0], J.neck[1] - J.hip[1]], al = Math.hypot(axis[0], axis[1]) || 1, nrm = [-axis[1] / al, axis[0] / al];
    const along = (f, w) => [J.hip[0] + axis[0] * f + nrm[0] * w, J.hip[1] + axis[1] * f + nrm[1] * w];
    const shift = (pts, w) => pts.map(p => [p[0] + nrm[0] * w, p[1] + nrm[1] * w]);
    const [armF, armB] = [shift([J.sh, J.ef, J.hf], 0.045 * h * dir), shift([J.sh, J.eb, J.hb], -0.045 * h * dir)];
    const [legF, legB] = [shift([J.hip, J.kf, J.ff], 0.04 * h * dir), shift([J.hip, J.kb, J.fb], -0.04 * h * dir)];
    const L = [], line = {px: lw};
    const arm = pts => {
      L.push({pts: tube(pts.slice(0, 2), 0.07 * h, 0.06 * h), fill: top, ...line});
      L.push({pts: tube(pts.slice(1), 0.056 * h, 0.046 * h), fill: longSleeves ? top : skin, ...line});
      const [ex, ey] = pts[1], [wx, wy] = pts[2], a = Math.atan2(wy - ey, wx - ex), c = [wx + Math.cos(a) * 0.022 * h, wy + Math.sin(a) * 0.022 * h], f = K.frame(c[0], c[1], h, 1, a);
      L.push({pts: f.ring(0, 0, 0.034, 0.027, 18), fill: skin, ...line}, {pts: f.pts([[-0.012, 0.02], [0.006, 0.036]]), px: lw * 0.8});
    };
    const leg = pts => {
      L.push({pts: tube(pts, 0.085 * h, 0.064 * h), fill: trousers, ...line});
      const [fx, fy] = pts[2], f = K.frame(fx + 0.03 * h * dir, fy + 0.006 * h, h, 1);
      L.push({pts: f.ring(0, 0, 0.058, 0.026, 18), fill: '#2B2B2B', ...line});
    };
    // Back to front: the far arm and leg, the neck, the shirt, the near leg, the head, the near arm.
    if (look.outfit === 'cape') L.push(...outfit(J, look, h, dir, 'back', st).map(item => ({...item, px: lw})));
    if (!pose.armBehind) arm(armB); else arm(armF);
    leg(legB);
    // A robe reaches the feet, so both legs go behind it.
    if (robe) leg(legF);
    if (!chibi) L.push({pts: tube([along(0.95, 0), J.head], 0.05 * h, 0.046 * h), fill: skin, ...line});
    const hem = coat ? -0.35 : robe ? -1.12 : -0.05, flare = robe ? 0.15 : 0.092;
    const body = [along(1.0, -0.035 * h), along(0.96, -0.1 * h), along(0.84, -0.11 * h), along(0.45, -0.086 * h), along(hem, -flare * h), along(hem, flare * h), along(0.45, 0.086 * h), along(0.84, 0.11 * h), along(0.96, 0.1 * h), along(1.0, 0.035 * h)];
    L.push({pts: smooth(body), fill: top, ...line});
    if (officer) {
      L.push(...[0.74, 0.54, 0.34].map(f => ({pts: K.frame(...along(f, 0), h, 1).ring(0, 0, 0.011, 0.011, 10), fill: C.gold, px: lw * 0.5})));
      if (look.outfit === 'officer') L.push(...[-1, 1].map(side => ({pts: K.frame(...along(0.96, side * 0.1 * h), h, 1).rrect(-0.035, -0.014, 0.07, 0.028, 0.014), fill: C.gold, px: lw * 0.7})), {pts: [along(0.95, -0.08 * h), along(0.95, -0.05 * h), along(0.12, 0.09 * h), along(0.2, 0.06 * h)], fill: shirt === C.red ? C.blue : C.red, px: lw * 0.6});
    }
    if (armor) L.push(...[0.66, 0.42].map(f => ({pts: [along(f, -0.09 * h), along(f + 0.03, 0), along(f, 0.09 * h)], px: lw * 0.8})));
    L.push({pts: [along(1.0, -0.035 * h), along(0.86, 0), along(1.0, 0.035 * h)], px: lw * 0.9});
    if (suit) L.push({pts: [along(0.99, -0.012 * h), along(0.99, 0.012 * h), along(0.55, 0.016 * h), along(0.5, 0), along(0.55, -0.016 * h), along(0.99, -0.012 * h)], fill: C.red, px: lw * 0.8});
    if (!coat && !robe) L.push({pts: [along(0.03, -0.09 * h), along(0.03, 0.09 * h)], px: lw * 0.9});
    if (!robe) leg(legF);
    L.push(...outfit(J, {...look, outfit: ['tie', 'bowtie', 'badge', 'scarf'].includes(look.outfit) ? look.outfit : 'none'}, h, dir, 'front', st).map(item => ({...item, px: lw * 0.7})));
    if (look.outfit === 'apron') L.push({pts: smooth([along(0.7, -0.06 * h), along(0.7, 0.06 * h), along(-0.25, 0.075 * h), along(-0.25, -0.075 * h)]), fill: '#FFFFFF', ...line});
    if (String(look.outfit).startsWith('kit:')) L.push(...outfit(J, look, h, dir, 'front', st).map(item => ({...item, px: lw})));
    L.push(...hairBack(head, look, st).map(item => ({...item, px: lw})));
    L.push({pts: chibi ? head.ring(0, 0, 1, 0.96, 44) : head.ring(0, 0, 0.84, 1.0, 40), fill: K.EXPR[st.expression]?.tint || skin, ...line});
    L.push({pts: chibi ? head.ring(-0.78, 0.1, 0.13, 0.18, 14) : head.ring(-0.6, 0.06, 0.15, 0.22, 16), fill: skin, px: lw * 0.9});
    if (!chibi) L.push({pts: head.pts([[0.66, -0.06], [0.86, 0.2], [0.64, 0.26]]), px: lw * 0.9});
    // The face a little larger than a stick figure's, so it reads on a small head (a history cartoon's big head keeps its own).
    const faceR = chibi ? R * 0.95 : R * 1.2;
    L.push({draw: () => face(K.frame(J.head[0], J.head[1] + 0.04 * R, faceR, dir, J0.tiltRad * dir), faceR, st.expression, st, 'stick')});
    L.push(...hairFront(head, look, st).map(item => ({...item, px: item.px || lw})));
    L.push(...eyewear(head, look).map(item => ({...item, px: item.px || lw})));
    if (!pose.armBehind) arm(armF); else arm(armB);
    K.render(L, progress, st.seed);
    const holds = st.holds || pose.hold;
    let hand = armF[2];
    if (holds && K.propOf(holds) && progress >= 1) {
      const at = pose.holdAt === 'chest' ? along(0.6, 0.06 * h * dir) : [armF[2][0] + 0.05 * h * dir, armF[2][1] + 0.01 * h];
      K.render(K.propOf(holds)(K.frame(at[0], at[1], (pose.holdScale || 1) * 0.26 * h, dir), {tl: st.tl, seed: st.seed}), 1, st.seed + 5);
      hand = at;
    }
    const emoteName = st.emote && st.emote !== 'none' ? st.emote : (K.EXPR[st.expression]?.emote || (['sleep'].includes(st.pose) ? 'zzz' : 'none'));
    if (progress >= 1) emote(emoteName, J.head[0], J.head[1], R, dir, st.tl);
    const xs = Object.values(J).map(p => p[0]), ys = Object.values(J).map(p => p[1]);
    return {head: [J.head[0], J.head[1], R], hand, box: [Math.min(...xs) - R, Math.min(...ys) - R, Math.max(...xs) + R, Math.max(...ys)]};
  }

  // A face drawn on anything (0.36: a country on a map that reacts): st = {tl, seed}.
  K.faceAt = (x, y, R, expression, st) => face(K.frame(x, y, R, 1, 0), R, expression, {look: {}, ...st}, 'stick');

  K.drawFigure = (st, progress = 1) => {
    // Whiteboard and motion-design people are drawn as people (0.35: flat design without outlines in the flat finish,
    // thin outlines in the infographic finish), never stick figures.
    if (['wb', 'flat', 'info', 'chron', 'paint'].includes(K.FIN) && (st.look.body || 'stick') === 'stick') return drawPerson(st, progress);
    const {u} = K, h = K.FIGURE_SIZE[st.size || 'm'] * u, dir = st.dir, look = st.look, body = look.body || 'stick', engine = st.engine;
    // Storybook people have bean bodies: a filled rounded torso under a big round head.
    const bean = K.FIN === 'story' && body === 'stick';
    // Illustrated people (the stickman engine's illustrated look): a smaller head with a skin tone, clothes on the
    // body, arms and legs as filled sleeves and trousers, hands and shoes.
    const person = K.FIN === 'ink' && body === 'stick';
    const J0 = skeleton(st.A, h, bean ? 'bean' : person ? 'person' : body), lift = st.A.lift * h;
    const J = {};
    for (const key of ['hip', 'kf', 'ff', 'kb', 'fb', 'neck', 'sh', 'head', 'ef', 'hf', 'eb', 'hb']) J[key] = [st.x + J0[key][0] * dir, st.y + J0[key][1] - lift];
    const R = J0.R, line = K.PAL.line, lw = Math.max(5 * u, h * (K.FIN === 'ink' ? 0.022 : K.FIN === 'doodle' ? 0.036 : bean ? 0.024 : 0.031)), hdir = J0.tiltRad * dir;
    const head = K.frame(J.head[0], J.head[1], R, dir, hdir);
    const pose = K.POSE[st.pose] || {};
    const L = [];
    // Ground shadow, and a chair for seated poses.
    if (!['ink', 'wb'].includes(K.FIN) && !st.A.rotate) L.push({pts: K.frame(st.x, st.y, h, 1).ring(0, 0, 0.17 * (1 - Math.min(0.5, st.A.lift * 3)), 0.025, 24), fill: K.PAL.shadow, stroke: false});
    if (pose.seat) { const s = 0.43 * h; K.render(K.PROPS.chair(K.frame(J.hip[0] - 0.03 * h * dir, J.hip[1] - 0.04 * s + 0.02 * h, s, -dir), {tl: st.tl, seed: 1}), 1, 9); }
    const limbStyle = {px: lw};
    const shirt = look.color ? K.col(look.color) : '#5B7FA6', trousers = '#3E4A5C', skin = ['#F3D3B8', '#E2B48D', '#C68E63', '#8D5A3B'][K.hashText(`${look.color}${look.hair}${look.hairColor}`) % 4];
    const limb = (pts, inner = shirt) => (K.FIN === 'ink' ? [{pts, px: lw * 3.2}, {pts, px: lw * 1.8, color: person ? inner : K.PAL.bg === '#FFFFFF' ? '#FFFFFF' : K.mix(K.PAL.bg, '#FFFFFF', 0.4)}] : [{pts, ...limbStyle}]);
    L.push(...outfit(J, look, h, dir, 'back', st));
    L.push(...hairBack(head, look, st).map(item => ({...item, width: (lw * 0.75) / K.LW()})));
    L.push(...limb([J.sh, J.eb, J.hb]), ...limb([J.hip, J.kb, J.fb], trousers));
    if (person) L.push({pts: K.frame(J.hb[0], J.hb[1], h, 1).ring(0, 0, 0.026), fill: skin, px: lw * 0.8}, {pts: K.frame(J.fb[0] + 0.02 * h * dir, J.fb[1], h, 1).ring(0, 0, 0.045, 0.022), fill: '#2E2E2E', px: lw * 0.8});
    if (body === 'robot') L.push({pts: K.frame(...J.neck, h, dir, st.A.lean * D * dir).rrect(-0.08, 0.02, 0.16, 0.26, 0.03), fill: C.metal, px: lw * 0.8});
    else if (K.FIN === 'ink') { const n = J.neck, p = J.hip, w = 0.075 * h, b = 0.03 * h; L.push({pts: [[n[0] - w, n[1]], [n[0] + w, n[1]], [p[0] + w * 0.92, p[1] + b], [p[0] - w * 0.92, p[1] + b], [n[0] - w, n[1]]], fill: shirt, px: lw}); }
    else if (bean) {
      const n = J.neck, p = J.hip, angle = Math.atan2(n[0] - p[0], p[1] - n[1]), torso = K.frame((n[0] + p[0]) / 2, (n[1] + p[1]) / 2, h, 1, angle);
      L.push({pts: torso.rrect(-0.085, -0.15, 0.17, 0.31, 0.075), fill: look.color ? K.col(look.color) : '#7D8C9A', px: lw});
    }
    else L.push({pts: [J.neck, J.hip], px: lw});
    L.push(...outfit(J, look, h, dir, 'front', st).map(item => ({...item, px: item.width ? undefined : lw * 0.7})));
    L.push(...limb([J.hip, J.kf, J.ff], trousers));
    if (person) L.push({pts: K.frame(J.ff[0] + 0.02 * h * dir, J.ff[1], h, 1).ring(0, 0, 0.045, 0.022), fill: '#2E2E2E', px: lw * 0.8});
    if (pose.armBehind) L.push(...limb([J.sh, J.ef, J.hf]));
    // The head: a big round face (creatures are a dark bristling blob, robots a box).
    const headFill = body === 'creature' ? '#1C1C1C' : body === 'robot' ? C.metal : (K.EXPR[st.expression]?.tint || (person ? skin : K.PAL.head));
    if (body === 'creature') L.push({pts: head.blob(0, 0, 1.12, 1.1, 18, 0.08), fill: headFill, px: lw});
    else if (body === 'robot') L.push({pts: head.pts([[0, -1.0], [0, -1.35]]), px: lw * 0.7}, {pts: head.ring(0, -1.4, 0.13), fill: st.tl % 1 < 0.5 ? C.red : '#7A2020', px: lw * 0.6}, {pts: head.rrect(-1.0, -0.95, 2.0, 1.85, 0.3), fill: headFill, px: lw});
    else L.push({pts: head.ring(0, 0, 1, 1, 48), fill: headFill, px: lw});
    if (body === 'stick') L.push(...hairFront(head, look, st).map(item => ({...item, px: item.px || (item.width ? item.width * lw * 0.75 : lw * 0.75)})));
    L.push({draw: () => face(head, R, st.expression, st, body)});
    if (body === 'stick') L.push(...eyewear(head, look).map(item => ({...item, px: item.px || (item.width ? item.width * lw * 0.75 : lw * 0.75)})));
    if (!pose.armBehind) L.push(...limb([J.sh, J.ef, J.hf]));
    if (person) L.push({pts: K.frame(J.hf[0], J.hf[1], h, 1).ring(0, 0, 0.026), fill: skin, px: lw * 0.8});
    if (pose.thumb) L.push({pts: [J.hf, [J.hf[0] + 0.012 * h * dir, J.hf[1] - 0.05 * h]], px: lw * 0.8});
    K.render(L, progress, st.seed);
    // The held prop sits in the hand (or on the lap, or at the chest).
    const holds = st.holds || pose.hold;
    let hand = J.hf;
    if (holds && K.propOf(holds) && progress >= 1) {
      const scale = (pose.holdScale || 1) * 0.3 * h;
      const at = st.pose === 'type' ? [J.hip[0] + 0.17 * h * dir, J.hip[1] - 0.05 * h] : pose.holdAt === 'chest' ? [(J.hf[0] + J.hb[0]) / 2 + 0.03 * h * dir, (J.hf[1] + J.hb[1]) / 2 - 0.02 * h] : [J.hf[0] + 0.05 * h * dir, J.hf[1] + 0.02 * h];
      K.render(K.propOf(holds)(K.frame(at[0], at[1], st.pose === 'type' ? 0.36 * h : scale, dir), {tl: st.tl, seed: st.seed}), 1, st.seed + 5);
      hand = at;
    }
    const emoteName = st.emote && st.emote !== 'none' ? st.emote : (K.EXPR[st.expression]?.emote || (['sleep'].includes(st.pose) ? 'zzz' : 'none'));
    if (progress >= 1) emote(emoteName, J.head[0], J.head[1], R, dir, st.tl);
    const xs = Object.values(J).map(p => p[0]), ys = Object.values(J).map(p => p[1]);
    return {head: [J.head[0], J.head[1], R], hand, box: [Math.min(...xs) - R, Math.min(...ys) - R, Math.max(...xs) + R, Math.max(...ys)]};
  };
}());
