'use strict';
// P08a: bounded narration finishing; P08c adds the music bed and sound effects (music.js builds the mix).
// Pure settings/filter/QC helpers; the render worker owns all I/O. No external calls, timing edits or arbitrary
// filter strings enter this contract.
const SCHEMA = 'ytprod.audio/1';
const DEFAULTS = Object.freeze({schema: SCHEMA, mode: 'normalize', targetLufs: -16, truePeakDb: -2});
const MIX_FILTERS = Object.freeze(['amix', 'adelay', 'afade', 'atrim', 'asplit', 'sidechaincompress', 'alimiter', 'volume', 'anull', 'anullsink', 'asetpts']);
const REQUIRED_FILTERS = Object.freeze(['aformat', 'loudnorm', 'silencedetect', ...MIX_FILTERS]);
const MUSIC_DEFAULTS = Object.freeze({enabled: false, levelLufs: -26, duck: 'medium', fadeSeconds: 1.5, scoreId: null});
const SFX_DEFAULTS = Object.freeze({enabled: false, density: 'accent', levelDb: -12});
const DUCKS = Object.freeze(['off', 'light', 'medium', 'strong']), DENSITIES = Object.freeze(['none', 'subtle', 'accent', 'rich']);
const fail = message => { throw Object.assign(new Error(message), {status: 400}); };

function settings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Audio settings must be an object.');
  if (Object.keys(input).some(key => !Object.hasOwn(DEFAULTS, key) && !['music', 'sfx'].includes(key))) fail('Unsupported audio setting.');
  const out = {...DEFAULTS, ...input};
  const block = (value, defaults, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} settings must be an object.`);
    if (Object.keys(value).some(key => !Object.hasOwn(defaults, key))) fail(`Unsupported ${label.toLowerCase()} setting.`);
    const merged = {...defaults, ...value};
    if (typeof merged.enabled !== 'boolean') fail(`${label} must be switched on or off.`);
    return merged;
  };
  if (input.music !== undefined) {
    const m = out.music = block(input.music, MUSIC_DEFAULTS, 'Music');
    if (!Number.isFinite(m.levelLufs) || m.levelLufs < -40 || m.levelLufs > -14) fail('The music level must be -40 to -14 LUFS.');
    if (!DUCKS.includes(m.duck)) fail(`Ducking must be one of: ${DUCKS.join(', ')}.`);
    if (!Number.isFinite(m.fadeSeconds) || m.fadeSeconds < 0 || m.fadeSeconds > 5) fail('Music fades must be 0-5 seconds.');
    if (m.scoreId !== null && (typeof m.scoreId !== 'string' || !/^[0-9a-f-]{36}$/.test(m.scoreId))) fail('Choose a score for the music.');
    if (m.enabled && !m.scoreId) fail('Choose a score before switching music on.');
    m.levelLufs = Math.round(m.levelLufs * 10) / 10;
  }
  if (input.sfx !== undefined) {
    const x = out.sfx = block(input.sfx, SFX_DEFAULTS, 'Sound effects');
    if (!DENSITIES.includes(x.density)) fail(`Sound-effect density must be one of: ${DENSITIES.join(', ')}.`);
    if (!Number.isFinite(x.levelDb) || x.levelDb < -30 || x.levelDb > -3) fail('The sound-effect level must be -30 to -3 dB peak.');
    x.levelDb = Math.round(x.levelDb * 10) / 10;
  }
  if (out.schema !== SCHEMA) fail('Unsupported audio settings version.');
  if (!['source', 'normalize'].includes(out.mode)) fail('Choose original levels or normalized narration.');
  for (const [key, min, max] of [['targetLufs', -24, -14], ['truePeakDb', -6, -1]]) {
    if (!Number.isFinite(out[key]) || out[key] < min || out[key] > max) fail(`${key} must be a number from ${min} to ${max}.`);
    out[key] = Math.round(out[key] * 10) / 10;
  }
  return out;
}

function loudnorm(config, measured) {
  const s = settings(config);
  const base = `loudnorm=I=${s.targetLufs}:TP=${s.truePeakDb}:LRA=11:print_format=json`;
  if (!measured) return base;
  for (const key of ['integratedLufs', 'truePeakDb', 'rangeLu', 'thresholdLufs', 'offsetDb']) {
    if (!Number.isFinite(measured[key])) fail('Narration loudness could not be measured. Check the source audio.');
  }
  return `${base}:measured_I=${measured.integratedLufs}:measured_TP=${measured.truePeakDb}:measured_LRA=${measured.rangeLu}:measured_thresh=${measured.thresholdLufs}:offset=${measured.offsetDb}:linear=true`;
}

function measurement(stderr) {
  const block = [...String(stderr).matchAll(/\{\s*"input_i"[\s\S]*?\}/g)].at(-1)?.[0];
  if (!block) fail('FFmpeg returned no loudness measurements.');
  let value;
  try { value = JSON.parse(block); } catch { fail('FFmpeg returned invalid loudness measurements.'); }
  const number = key => typeof value[key] === 'string' && value[key].trim() !== '' && Number.isFinite(Number(value[key])) ? Number(value[key]) : null;
  return {integratedLufs: number('input_i'), truePeakDb: number('input_tp'), rangeLu: number('input_lra'), thresholdLufs: number('input_thresh'), offsetDb: number('target_offset')};
}

// Convert layout before measuring, so mono duplicated into stereo is normalized at its actual output level.
const FORMAT = 'aformat=sample_rates=48000:channel_layouts=stereo';
function analysisArgs(file, config, {source = false} = {}) {
  return ['-hide_banner', '-nostdin', '-xerror', '-err_detect', 'explode', '-i', file, '-map', '0:a:0', '-vn', '-af',
    `${source ? `${FORMAT},` : ''}silencedetect=n=-50dB:d=0.25,${loudnorm(config)}`, '-f', 'null', '-'];
}
function finishArgs(file, output, config, measured) {
  const s = settings(config);
  return ['-hide_banner', '-nostdin', '-xerror', '-err_detect', 'explode', '-i', file, '-map', '0:a:0', '-vn', '-af',
    [FORMAT, ...(s.mode === 'normalize' ? [loudnorm(s, measured)] : [])].join(','),
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', '-y', output];
}

function qc({stderr, stream, expectedSeconds, config}) {
  const s = settings(config), m = measurement(stderr);
  const duration = Number(stream?.duration), channels = Number(stream?.channels), sampleRate = Number(stream?.sample_rate);
  const starts = [...String(stderr).matchAll(/silence_start:\s*([\d.]+)/g)].map(match => Number(match[1]));
  const ends = [...String(stderr).matchAll(/silence_end:\s*([\d.]+)/g)].map(match => Number(match[1]));
  const silenceSeconds = starts.reduce((sum, start, i) => sum + Math.max(0, Math.min(ends[i] ?? duration, duration) - start), 0);
  const silenceRatio = duration > 0 ? Math.min(1, silenceSeconds / duration) : null;
  const fmt = value => Number.isFinite(value) ? value.toFixed(2) : 'unmeasured';
  const checks = [
    {name: 'audio duration', passed: Number.isFinite(duration) && Math.abs(duration - expectedSeconds) <= 0.1, detail: `${fmt(duration)} s for ${fmt(expectedSeconds)} s narration`},
    {name: 'audio layout', passed: channels === 2 && sampleRate === 48000 && stream?.codec_name === 'aac', detail: `${stream?.codec_name || 'missing'}, ${sampleRate} Hz, ${channels} channels`},
    {name: 'audio loudness', passed: m.integratedLufs !== null && (s.mode === 'normalize' ? Math.abs(m.integratedLufs - s.targetLufs) <= 1 : m.integratedLufs >= -35 && m.integratedLufs <= -5), detail: `${fmt(m.integratedLufs)} LUFS${s.mode === 'normalize' ? `; target ${s.targetLufs} (±1 LU)` : '; original levels'}`},
    {name: 'audio true peak', passed: m.truePeakDb !== null && m.truePeakDb <= (s.mode === 'normalize' ? s.truePeakDb + 0.3 : -0.1), detail: `${fmt(m.truePeakDb)} dBTP; ${s.mode === 'normalize' ? `${s.truePeakDb} ceiling (+0.3 dB codec tolerance)` : 'below clipping'}`},
    {name: 'audio silence', passed: silenceRatio !== null && Number.isFinite(silenceRatio) && silenceRatio <= 0.35, detail: `${fmt(silenceRatio === null ? null : silenceRatio * 100)}% below -50 dB`},
  ];
  return {schema: SCHEMA, settings: s, ...m, durationSeconds: Number.isFinite(duration) ? duration : null, sampleRate, channels, silenceRatio, checks, passed: checks.every(check => check.passed)};
}

const mixes = config => !!(config?.music?.enabled || (config?.sfx?.enabled && config.sfx.density !== 'none'));

module.exports = {SCHEMA, DEFAULTS, MUSIC_DEFAULTS, SFX_DEFAULTS, MIX_FILTERS, REQUIRED_FILTERS, mixes, settings, loudnorm, measurement, analysisArgs, finishArgs, qc};
