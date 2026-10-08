'use strict';
// P05 - FFmpeg readiness, pinned build and the deterministic proxy renderer (Documentary Montage proof).
// The renderer turns one approved visual board + approved narration + style revision into a low-resolution
// proxy MP4 with Ken Burns stills, trimmed/held clips, cuts or crossfades, real QC and a contact sheet.
// Every command, input checksum, output checksum and bounded log is kept in an immutable render manifest.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');
const VS = require('./visual-sources');
const Audio = require('./audio');

const RENDERER_VERSION = 'ffmpeg-montage/1.1.0';
const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const REQUIRED_FILTERS = ['zoompan', 'xfade', 'tpad', 'trim', 'setpts', 'scale', 'crop', 'fps', 'setsar', 'format', 'concat', 'apad', 'blackdetect', 'freezedetect', 'tile', 'settb', 'setparams', 'fade', 'ass', 'silencedetect', 'overlay', 'select', 'showinfo'];
REQUIRED_FILTERS.push(...Audio.REQUIRED_FILTERS.filter(name => !REQUIRED_FILTERS.includes(name)));
const REQUIRED_ENCODERS = ['libx264', 'aac', 'png', 'pcm_s24le'];
const PRESETS = {
  proxy: {label: 'Proxy 360p', 'long-form': {width: 640, height: 360}, shorts: {width: 360, height: 640}, crf: 26, x264: 'veryfast', audioKbps: 128, maxFps: 30},
};
const LOG_LIMIT = 4096;

function object(value, label = 'Request') { requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object.`); return value; }
function text(value, label, min, max) {
  requireValue(typeof value === 'string', `${label} must be text.`);
  const result = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').trim();
  requireValue(result.length >= min && result.length <= max, `${label} must contain ${min}-${max} characters.`);
  return result;
}
const person = (value, label = 'Your name') => text(value, label, 2, 80);

// ---------------------------------------------------------------- executables
// Resolves "ffmpeg" through PATH (PATHEXT on Windows) without a shell, so the exact binary can be hashed and pinned.
function resolveExecutable(command) {
  if (!command) return null;
  if (path.isAbsolute(command)) return fs.existsSync(command) ? command : null;
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean) : [''];
  for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const extension of ['', ...extensions]) {
      const candidate = path.join(dir, command + extension);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* keep looking */ }
    }
  }
  return null;
}
function fileSha256(file) {
  const hash = createHash('sha256'), handle = fs.openSync(file, 'r'), buffer = Buffer.alloc(1024 * 1024);
  try { for (;;) { const read = fs.readSync(handle, buffer, 0, buffer.length, null); if (!read) break; hash.update(buffer.subarray(0, read)); } } finally { fs.closeSync(handle); }
  return hash.digest('hex');
}
const tail = (value, limit = LOG_LIMIT) => { const textValue = String(value || ''); return textValue.length > limit ? `…${textValue.slice(-limit)}` : textValue; };

// Runs one tool with a timeout and an abort hook; stdout/stderr are bounded.
function run(command, args, {timeout = 120000, onSpawn = () => {}, cwd} = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(command, args, {cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}); } catch { reject(new InputError(`${path.basename(command)} could not be started.`, 503)); return; }
    let stdout = '', stderr = '', killedFor = null;
    const cap = (current, chunk) => { const next = current + chunk; return next.length > 262144 ? next.slice(-262144) : next; };
    child.stdout.on('data', chunk => { stdout = cap(stdout, chunk.toString()); });
    child.stderr.on('data', chunk => { stderr = cap(stderr, chunk.toString()); });
    const timer = setTimeout(() => { killedFor = 'timeout'; child.kill('SIGKILL'); }, timeout);
    onSpawn({kill: reason => { killedFor = reason || 'cancelled'; child.kill('SIGKILL'); }});
    child.on('error', error => { clearTimeout(timer); reject(new InputError(error.code === 'ENOENT' ? `${path.basename(command)} is not installed or not on PATH.` : `${path.basename(command)} failed to start.`, 503)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (killedFor === 'cancelled') return reject(Object.assign(new InputError('The render was cancelled.', 409), {cancelled: true, stderr}));
      if (killedFor === 'timeout') return reject(Object.assign(new InputError(`${path.basename(command)} took too long and was stopped.`, 504), {stderr}));
      if (code !== 0) return reject(Object.assign(new InputError(`${path.basename(command)} exited with code ${code}.`, 502), {stderr}));
      resolve({stdout, stderr});
    });
  });
}

// ---------------------------------------------------------------- readiness
async function inspectFFmpeg({ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', workDir}) {
  const issues = [], report = {checkedAt: now(), rendererVersion: RENDERER_VERSION};
  const resolved = {ffmpeg: resolveExecutable(ffmpeg), ffprobe: resolveExecutable(ffprobe)};
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const command = tool === 'ffmpeg' ? ffmpeg : ffprobe;
    if (!resolved[tool]) { issues.push(`${tool} was not found (${command}). Install a reviewed build and restart the program.`); report[tool] = {command, path: null}; continue; }
    try {
      const {stdout} = await run(resolved[tool], ['-hide_banner', '-version'], {timeout: 20000});
      const first = stdout.split(/\r?\n/)[0] || '';
      report[tool] = {command, path: resolved[tool], version: (first.match(/version\s+(\S+)/) || [])[1] || 'unknown', banner: first.slice(0, 200), configuration: ((stdout.match(/configuration:\s*(.*)/) || [])[1] || '').slice(0, 2000), sha256: fileSha256(resolved[tool]), sizeBytes: fs.statSync(resolved[tool]).size};
    } catch (error) {
      issues.push(`${tool} could not report its version: ${error.message}`);
      report[tool] = {command, path: resolved[tool]};
    }
  }
  report.filters = {};
  report.encoders = {};
  if (report.ffmpeg?.version) {
    try {
      const {stdout} = await run(resolved.ffmpeg, ['-hide_banner', '-filters'], {timeout: 20000});
      const names = new Set(stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/)[1]).filter(Boolean));
      for (const name of REQUIRED_FILTERS) report.filters[name] = names.has(name);
    } catch { issues.push('ffmpeg could not list its filters.'); }
    try {
      const {stdout} = await run(resolved.ffmpeg, ['-hide_banner', '-encoders'], {timeout: 20000});
      const names = new Set(stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/)[1]).filter(Boolean));
      for (const name of REQUIRED_ENCODERS) report.encoders[name] = names.has(name);
    } catch { issues.push('ffmpeg could not list its encoders.'); }
    const missing = [...REQUIRED_FILTERS.filter(name => report.filters[name] === false), ...REQUIRED_ENCODERS.filter(name => report.encoders[name] === false)];
    if (missing.length) issues.push(`This FFmpeg build lacks: ${missing.join(', ')}. Use a full build (for example the Gyan.dev "full" build on Windows).`);
    // Deterministic fixture: the same tiny render twice must give byte-identical files.
    if (!missing.length) {
      fs.mkdirSync(workDir, {recursive: true});
      const hashes = [];
      try {
        for (const name of ['a', 'b']) {
          const out = path.join(workDir, `fixture-${name}.mp4`);
          await run(resolved.ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2',
            '-vf', "zoompan=z='1+0.1*on/59':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=320x180:fps=30,format=yuv420p", ...encodeVideo(PRESETS.proxy, 30), '-c:a', 'aac', '-b:a', '96k', '-flags:a', '+bitexact', '-shortest', '-y', out], {timeout: 60000});
          hashes.push(fileSha256(out));
        }
        report.determinism = {passed: hashes[0] === hashes[1], hashes};
        if (!report.determinism.passed) issues.push('Two identical fixture renders produced different files; this build is not deterministic.');
      } catch (error) {
        report.determinism = {passed: false, error: error.message};
        issues.push(`The fixture render failed: ${error.message}`);
      } finally {
        fs.rmSync(workDir, {recursive: true, force: true});
      }
    }
  }
  report.issues = issues;
  report.passed = !issues.length;
  return report;
}

// ---------------------------------------------------------------- proxy plan
function encodeVideo(preset, fps) {
  return ['-c:v', 'libx264', '-preset', preset.x264, '-crf', String(preset.crf), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-g', String(fps * 2), '-r', String(fps), '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1', '-video_track_timescale', String(fps * 1000)];
}
// Camera moves the FFmpeg montage adapter can draw; amplitude follows the style's motion intensity.
function zoompanFor(move, index, frames, intensity) {
  const amp = round(0.04 + 0.16 * Math.max(0, Math.min(100, intensity)) / 100, 4), last = Math.max(1, frames - 1);
  const centre = {x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)"};
  if (move === 'static') return {z: '1', ...centre, kind: 'static'};
  if (move === 'zoom') return {z: `1+${amp}*on/${last}`, ...centre, kind: 'zoom-in'};
  if (move === 'pan') return index % 2 ? {z: String(1 + amp), x: `(iw-iw/zoom)*(1-on/${last})`, y: centre.y, kind: 'pan-left'} : {z: String(1 + amp), x: `(iw-iw/zoom)*on/${last}`, y: centre.y, kind: 'pan-right'};
  const cycle = ['zoom-in', 'zoom-out', 'pan-right', 'pan-left'][index % 4];
  if (cycle === 'zoom-in') return {z: `1+${amp}*on/${last}`, ...centre, kind: cycle};
  if (cycle === 'zoom-out') return {z: `${1 + amp}-${amp}*on/${last}`, ...centre, kind: cycle};
  if (cycle === 'pan-right') return {z: String(1 + amp), x: `(iw-iw/zoom)*on/${last}`, y: centre.y, kind: cycle};
  return {z: String(1 + amp), x: `(iw-iw/zoom)*(1-on/${last})`, y: centre.y, kind: cycle};
}
// Builds every command for one proxy. Shot boundaries are snapped to frames so the picture never drifts from the narration.
function planProxy({shots, narration, spec, format, preset = PRESETS.proxy, workDir, outFile}) {
  const size = preset[format] || preset['long-form'], fps = Math.min(spec.canvas.frameRate, preset.maxFps);
  const transition = spec.transitions.default;
  const fade = transition === 'crossfade' ? 'fade' : transition === 'dip-to-black' ? 'fadeblack' : null;
  const totalFrames = Math.round(narration.durationSeconds * fps);
  let boundaries = shots.map(shot => Math.round(shot.startSeconds * fps));
  boundaries.push(totalFrames);
  boundaries[0] = 0;
  const frames = shots.map((shot, index) => boundaries[index + 1] - boundaries[index]);
  requireValue(frames.every(count => count >= 1), 'A shot is shorter than one frame at this frame rate.', 409);
  const shortest = Math.min(...frames);
  const transitionFrames = fade ? Math.max(0, Math.min(Math.round(spec.transitions.maxDurationMs / 1000 * fps), Math.floor(shortest / 3))) : 0;
  const segments = shots.map((shot, index) => {
    const extra = transitionFrames && index < shots.length - 1 ? transitionFrames : 0, count = frames[index] + extra;
    const file = path.join(workDir, `seg-${String(index + 1).padStart(4, '0')}.mp4`);
    let args, motion;
    if (shot.mediaType === 'image') {
      motion = zoompanFor(shot.motion, index, count, spec.motion.intensity);
      const big = `${size.width * 2}:${size.height * 2}`;
      args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', shot.file, '-vf', `scale=${big}:force_original_aspect_ratio=increase:out_range=tv:out_color_matrix=bt709,crop=${big},zoompan=z='${motion.z}':x='${motion.x}':y='${motion.y}':d=${count}:s=${size.width}x${size.height}:fps=${fps},setsar=1,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709,format=yuv420p`, '-frames:v', String(count), ...encodeVideo(preset, fps), '-an', '-y', file];
    } else {
      motion = {kind: 'clip'};
      const hold = Math.max(0, count / fps - (shot.clipSeconds || 0)) + 1;
      args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', shot.file, '-vf', `fps=${fps},scale=${size.width}:${size.height}:force_original_aspect_ratio=increase:out_range=tv:out_color_matrix=bt709,crop=${size.width}:${size.height},setsar=1,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709,tpad=stop_mode=clone:stop_duration=${round(hold, 3)},trim=end_frame=${count},setpts=PTS-STARTPTS,format=yuv420p`, '-frames:v', String(count), ...encodeVideo(preset, fps), '-an', '-y', file];
    }
    return {index, shotId: shot.shotId, label: shot.label, assetId: shot.assetId, mediaType: shot.mediaType, startFrame: boundaries[index], frames: frames[index], extraFrames: extra, motion: motion.kind, file, args};
  });
  const audio = ['-c:a', 'aac', '-b:a', `${preset.audioKbps}k`, '-ar', '48000', '-af', 'apad', '-shortest', '-flags:a', '+bitexact', '-movflags', '+faststart'];
  let final;
  const listFile = path.join(workDir, 'segments.txt');
  if (!transitionFrames || segments.length === 1) {
    final = {mode: 'concat', listFile, list: segments.map(item => `file '${path.basename(item.file)}'`).join('\n') + '\n',
      args: ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', narration.file, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', ...audio, '-fflags', '+bitexact', '-map_metadata', '-1', '-y', outFile]};
  } else {
    const td = round(transitionFrames / fps, 6), parts = [];
    let label = '0:v';
    for (let k = 1; k < segments.length; k++) {
      const next = k === segments.length - 1 ? 'vout' : `v${k}`;
      parts.push(`[${label}][${k}:v]xfade=transition=${fade}:duration=${td}:offset=${round(segments[k].startFrame / fps, 6)}[${next}]`);
      label = next;
    }
    final = {mode: 'xfade', transition: fade, transitionSeconds: td,
      args: ['-hide_banner', '-nostdin', '-loglevel', 'error', ...segments.flatMap(item => ['-i', item.file]), '-i', narration.file, '-filter_complex', parts.join(';'), '-map', '[vout]', '-map', `${segments.length}:a:0`, ...encodeVideo(preset, fps), ...audio, '-y', outFile]};
  }
  return {preset: {name: 'proxy', label: preset.label, width: size.width, height: size.height, fps, crf: preset.crf, x264: preset.x264}, transition: {style: transition, applied: fade || 'cut', frames: transitionFrames}, totalFrames, segments, final};
}

// ---------------------------------------------------------------- edit render (P06)
// Eased camera moves for the Editing Room: smoothstep progress, so a move starts and lands gently.
function easedZoompan(move, frames) {
  const last = Math.max(1, frames - 1), amount = move?.amount || 0;
  const eased = `((on/${last})*(on/${last})*(3-2*(on/${last})))`;
  const centre = {x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)'};
  switch (move?.kind) {
    case 'push-in': return {z: `1+${amount}*${eased}`, ...centre};
    case 'pull-out': return {z: `${round(1 + amount, 4)}-${amount}*${eased}`, ...centre};
    case 'pan-right': return {z: String(round(1 + amount, 4)), x: `(iw-iw/zoom)*${eased}`, y: centre.y};
    case 'pan-left': return {z: String(round(1 + amount, 4)), x: `(iw-iw/zoom)*(1-${eased})`, y: centre.y};
    case 'push-detail': return {z: `1+${amount}*${eased}`, x: centre.x, y: '(ih-ih/zoom)*0.38'};
    default: return {z: '1', ...centre};
  }
}
// Plans an edit render: one segment per clip, lossless joins for runs of hard cuts, xfade for the few
// structural transitions, then the graphics layer (ASS through libass) and the fade-out ending.
// Every boundary is snapped from the edit's frame grid to the preset's, so picture and narration stay locked.
function planTimeline({timeline, files, narration, format, preset = PRESETS.proxy, workDir, outFile, graphics = null, overlays = []}) {
  const size = preset[format] || preset['long-form'], fps = Math.min(timeline.fps, preset.maxFps);
  const scale = frame => Math.round(frame * fps / timeline.fps);
  const totalFrames = scale(timeline.totalFrames);
  const clips = timeline.clips;
  const starts = clips.map(clip => scale(clip.start));
  starts.push(totalFrames);
  const frames = clips.map((clip, index) => starts[index + 1] - starts[index]);
  requireValue(frames.every(count => count >= 1), 'A clip is shorter than one frame at this frame rate.', 409);
  const joins = timeline.joins.map((join, index) => {
    if (join.type === 'cut') return {type: 'cut', frames: 0};
    const most = Math.floor(Math.min(frames[index], frames[index + 1]) / 2);
    const count = Math.max(2, Math.min(scale(join.frames), most));
    return most >= 2 ? {type: join.type, frames: count} : {type: 'cut', frames: 0};
  });
  const segments = clips.map((clip, index) => {
    const extra = index < clips.length - 1 ? joins[index].frames : 0, count = frames[index] + extra;
    const file = path.join(workDir, `seg-${String(index + 1).padStart(4, '0')}.mp4`), source = files[clip.id];
    requireValue(source, `${clip.label}: no approved file for this clip.`, 409);
    let args, motion;
    if (clip.mediaType === 'image') {
      const zp = easedZoompan(clip.move, count);
      motion = clip.move?.kind || 'static';
      const big = `${size.width * 2}:${size.height * 2}`;
      args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', source, '-vf', `scale=${big}:force_original_aspect_ratio=increase:out_range=tv:out_color_matrix=bt709,crop=${big},zoompan=z='${zp.z}':x='${zp.x}':y='${zp.y}':d=${count}:s=${size.width}x${size.height}:fps=${fps},setsar=1,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709,format=yuv420p`, '-frames:v', String(count), ...encodeVideo(preset, fps), '-an', '-y', file];
    } else {
      motion = clip.speed < 1 ? `clip at ${Math.round(clip.speed * 100)}%` : 'clip';
      const available = Math.max(0, ((clip.clipSeconds || count / fps) - (clip.inSeconds || 0)) / (clip.speed || 1));
      const hold = Math.max(0, count / fps - available) + 1;
      args = ['-hide_banner', '-nostdin', '-loglevel', 'error', ...(clip.inSeconds ? ['-ss', String(clip.inSeconds)] : []), '-i', source, '-vf', `setpts=(PTS-STARTPTS)/${clip.speed || 1},fps=${fps},scale=${size.width}:${size.height}:force_original_aspect_ratio=increase:out_range=tv:out_color_matrix=bt709,crop=${size.width}:${size.height},setsar=1,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709,tpad=stop_mode=clone:stop_duration=${round(hold, 3)},trim=end_frame=${count},setpts=PTS-STARTPTS,format=yuv420p`, '-frames:v', String(count), ...encodeVideo(preset, fps), '-an', '-y', file];
    }
    return {index, clipId: clip.id, shotId: clip.shotId, label: clip.label, assetId: clip.assetId, mediaType: clip.mediaType, startFrame: starts[index], frames: frames[index], extraFrames: extra, motion, file, args};
  });
  // Runs of hard cuts become chunks joined losslessly with the concat demuxer.
  const chunks = [];
  segments.forEach((segment, index) => {
    if (!index || joins[index - 1].type !== 'cut') chunks.push({members: [], join: index ? joins[index - 1] : null});
    chunks[chunks.length - 1].members.push(segment);
  });
  chunks.forEach((chunk, index) => {
    chunk.file = `chunk-${String(index + 1).padStart(3, '0')}.mp4`;
    chunk.frames = chunk.members.reduce((sum, item) => sum + item.frames + item.extraFrames, 0);
    chunk.listFile = path.join(workDir, `chunk-${String(index + 1).padStart(3, '0')}.txt`);
    chunk.list = chunk.members.map(item => `file '${path.basename(item.file)}'`).join('\n') + '\n';
    chunk.args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.basename(chunk.listFile), '-c', 'copy', '-fflags', '+bitexact', '-map_metadata', '-1', '-y', chunk.file];
  });
  const parts = chunks.map((chunk, index) => `[${index}:v]settb=AVTB,setpts=PTS-STARTPTS[c${index}]`);
  let label = 'c0', length = chunks[0].frames;
  for (let k = 1; k < chunks.length; k++) {
    const join = chunks[k].join, fade = join.type === 'dip-to-black' ? 'fadeblack' : 'fade';
    parts.push(`[${label}][c${k}]xfade=transition=${fade}:duration=${round(join.frames / fps, 6)}:offset=${round((length - join.frames) / fps, 6)}[x${k}]`);
    length += chunks[k].frames - join.frames;
    label = `x${k}`;
  }
  // Canvas graphics (rendered by motion.js to RGBA clips) are laid over the picture at their start time.
  overlays.forEach((overlay, k) => {
    const input = chunks.length + 1 + k, start = round(scale(overlay.start) / fps, 6), end = round((scale(overlay.start) + overlay.frames) / fps, 6);
    parts.push(`[${input}:v]setpts=PTS-STARTPTS+${start}/TB,format=rgba[g${k}]`);
    parts.push(`[${label}][g${k}]overlay=x=0:y=0:eof_action=pass:enable='between(t,${start},${end})'[o${k}]`);
    label = `o${k}`;
  });
  const fadeFrames = Math.min(scale(timeline.ending?.fadeOutFrames || 0), Math.floor(frames[frames.length - 1] / 2));
  const tailFilters = [...(graphics ? ['ass=graphics.ass'] : []), ...(fadeFrames ? [`fade=t=out:st=${round((totalFrames - fadeFrames) / fps, 6)}:d=${round(fadeFrames / fps, 6)}`] : []), 'format=yuv420p'];
  parts.push(`[${label}]${tailFilters.join(',')}[vout]`);
  const audio = ['-c:a', 'aac', '-b:a', `${preset.audioKbps}k`, '-ar', '48000', '-af', 'apad', '-shortest', '-flags:a', '+bitexact', '-movflags', '+faststart'];
  const final = {mode: 'edit', graphics: !!graphics, args: ['-hide_banner', '-nostdin', '-loglevel', 'error', ...chunks.flatMap(chunk => ['-i', chunk.file]), '-i', narration.file, ...overlays.flatMap(overlay => ['-i', overlay.file]), '-filter_complex', parts.join(';'), '-map', '[vout]', '-map', `${chunks.length}:a:0`, ...encodeVideo(preset, fps), ...audio, '-y', outFile]};
  return {preset: {name: 'proxy', label: preset.label, width: size.width, height: size.height, fps, crf: preset.crf, x264: preset.x264}, transition: {applied: [...new Set(joins.map(join => join.type))].join(', '), soft: joins.filter(join => join.type !== 'cut').length, frames: joins.reduce((sum, join) => sum + join.frames, 0)}, totalFrames, segments, chunks, final, fadeFrames, overlays: overlays.length};
}

// Parses blackdetect/freezedetect output into spans.
function detections(stderr) {
  const black = [...stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)].map(match => ({start: Number(match[1]), end: Number(match[2]), duration: Number(match[3])}));
  const starts = [...stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map(match => Number(match[1]));
  const durations = [...stderr.matchAll(/freeze_duration:\s*([\d.]+)/g)].map(match => Number(match[1]));
  const frozen = starts.map((start, index) => ({start, duration: durations[index] ?? null, end: durations[index] !== undefined ? start + durations[index] : null}));
  return {black, frozen};
}

// Hard cuts inside a video: frames whose FFmpeg scene score passes the threshold, with their times
// (the scene detection of bradautomates/claude-video, used here to find stock clips that hide their own cuts
// and to check a render for cuts the edit did not plan). 0.3 keeps fast camera moves from counting as cuts.
const SCENE_CUT_THRESHOLD = 0.3;
const sceneCutTimes = stderr => [...String(stderr).matchAll(/pts_time:\s*(-?[\d.]+)/g)].map(match => round(Number(match[1]), 3)).filter(value => Number.isFinite(value) && value > 0);
async function sceneCuts(ffmpeg, file, {threshold = SCENE_CUT_THRESHOLD, timeout = 180000} = {}) {
  const out = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], {timeout});
  return sceneCutTimes(out.stderr);
}

// ---------------------------------------------------------------- review checks (P09)
// The whole file must decode without one error line: a damaged frame or a truncated tail fails here even when
// ffprobe can still read the header.
const decodeArgs = file => ['-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-map', '0', '-f', 'null', '-'];
function decodeCheck({stderr = '', failed = false}) {
  const lines = String(stderr).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const passed = !failed && !lines.length;
  return {name: 'full decode', passed, detail: passed ? 'every video frame and audio packet decoded without an error' : `${failed ? 'FFmpeg stopped decoding' : `${lines.length} decode error${lines.length === 1 ? '' : 's'}`}${lines.length ? `: ${lines.slice(0, 2).join(' | ').slice(0, 300)}` : ''}`};
}
// Audio and picture must start together and end together (within one frame); an offset or a length
// difference moves every caption and cut away from the voice.
function avAlignment(streams, fps) {
  const video = streams.find(stream => stream.codec_type === 'video'), audio = streams.find(stream => stream.codec_type === 'audio');
  if (!video || !audio) return {name: 'audio/video alignment', passed: false, detail: `no ${video ? 'audio' : 'video'} stream`};
  const number = value => (value === undefined || value === null || value === 'N/A' || !Number.isFinite(Number(value)) ? null : Number(value));
  const offset = (number(audio.start_time) ?? 0) - (number(video.start_time) ?? 0);
  const drift = number(audio.duration) !== null && number(video.duration) !== null ? number(audio.duration) - number(video.duration) : null;
  const frame = 1 / fps, ms = value => `${value >= 0 ? '+' : '−'}${Math.round(Math.abs(value) * 1000)} ms`;
  return {name: 'audio/video alignment', passed: Math.abs(offset) <= frame && drift !== null && Math.abs(drift) <= frame + 0.05,
    detail: drift === null ? 'stream lengths could not be measured' : `audio starts ${ms(offset)} and ends ${ms(drift)} against the picture (limit ${Math.round(frame * 1000)} ms)`};
}
// Contact-sheet tile geometry from the sheet's real size (padding 4, margin 4), so a page can label each tile.
function sheetGeometry({width, height}, cols, rows) {
  return {cols, rows, width, height, tileWidth: (width - 8 - (cols - 1) * 4) / cols, tileHeight: (height - 8 - (rows - 1) * 4) / rows};
}

module.exports = {RENDERER_VERSION, PRESETS, REQUIRED_FILTERS, REQUIRED_ENCODERS, SCENE_CUT_THRESHOLD, resolveExecutable, fileSha256, run, inspectFFmpeg, planProxy, planTimeline, easedZoompan, zoompanFor, encodeVideo, detections, sceneCutTimes, sceneCuts, decodeArgs, decodeCheck, avAlignment, sheetGeometry, tail, object, text, person, requireValue, now, round};
