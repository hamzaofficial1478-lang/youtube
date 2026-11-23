'use strict';
// 0.111 (owner request 2026-11-18: "connect Meta Muse AI video into the program, directed by the program and its
// skills; Muse delivers the scenes, the program assembles and edits them, so fewer scenes are generated again").
// Meta has no public Muse video API (its Model API offers Muse Spark and Muse Image, not video), and the only way to
// drive the owner's muse.ai account by program is a third party that signs in with the owner's Meta password. So the
// program directs and the owner generates: every AI-video shot gets a complete direction written for a video model
// (one moment, the character from the owner's reference picture, the place, the action, the camera, the light, the
// length and shape, what to avoid), the owner pastes it into Muse with the listed reference pictures attached, and
// uploads the clip back to that shot. Pure: directions and checks only; no I/O.

const MAX_SECONDS = 10; // a Muse clip is about 10 s; a longer shot is split by the planner
const CAMERA = {
  static: 'locked-off camera, no movement', 'push-in': 'slow push in towards the subject', 'pull-out': 'slow pull back to reveal the place', 'pan-left': 'slow pan to the left', 'pan-right': 'slow pan to the right',
  'push-detail': 'slow push in on the detail that matters', 'tilt-up': 'slow tilt up', 'tilt-down': 'slow tilt down', handheld: 'subtle handheld movement, as if filmed by someone there', orbit: 'slow arc around the subject',
};
const clip = (value, max) => { const s = String(value ?? '').replace(/\s+/g, ' ').trim(); return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s; };

// The direction of one shot, as text for the video model and as fields for the page.
// shot: {label, prompt, motion, notes, durationSeconds}; scene: {direction, purpose}; words: what the narrator says;
// cast: the plan's cast (members with ref point at the owner's reference pictures); refs: {id: {label, description}};
// world: {era, place, rules}; grade: the video's grade name; vertical; before/after: neighbouring shots' prompts.
// sound (0.115): what is heard over the clip. narrator (default): the program's narrator, so Muse adds no speech;
// ambience: only the place's natural sound; muse: Muse speaks the shot's own words (speech: {words, voice, delivery}).
function direction({shot, scene = {}, words = '', cast = [], refs = {}, world = null, grade = null, vertical = false, before = null, after = null, craft = '', sound = 'narrator', speech = null}) {
  const seconds = Math.min(MAX_SECONDS, Math.max(2, Math.round((shot.durationSeconds || 5) * 10) / 10));
  const named = cast.filter(member => member.ref && refs[member.ref] && new RegExp(`\\b${member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(`${shot.prompt} ${shot.notes || ''}`));
  // A shot that names nobody but the story has one reference character uses that one when the prompt speaks of a person.
  const people = named.length ? named : (cast.filter(member => member.ref && refs[member.ref]).length === 1 && /\b(he|she|they|man|woman|survivor|person|figure|him|her)\b/i.test(shot.prompt) ? cast.filter(member => member.ref && refs[member.ref]) : []);
  const attach = people.map(member => ({id: member.ref, label: refs[member.ref].label, who: member.name}));
  const lines = [
    `${clip(shot.prompt || shot.query, 1500)}`,
    people.length ? `Character${people.length > 1 ? 's' : ''}: ${people.map(member => `${member.name}${member.role ? ` (${member.role})` : ''}, exactly as in the attached reference "${refs[member.ref].label}"${refs[member.ref].description ? `: ${clip(refs[member.ref].description, 500)}` : ''}`).join('; ')}. Same face, hair, build and clothes as the reference; only pose and expression change.` : null,
    world?.place || world?.era ? `World: ${[world.place, world.era ? `${world.era} era` : null].filter(Boolean).join(', ')}${world.rules?.length ? ` (${world.rules.slice(0, 4).join('; ')})` : ''}.` : null,
    `Camera: ${CAMERA[shot.motion] || 'slow, motivated movement'}; one continuous shot, no cuts.`,
    scene.direction ? `The viewer must understand: ${clip(scene.direction, 300)}` : null,
    words && !(sound === 'muse' && speech?.words) ? `This shot plays under the narration: "${clip(words, 300)}" (do not show these words).` : null,
    grade ? `Colour and light: ${grade}.` : null,
    craft ? `Craft (the channel's skills): ${clip(craft, 700)}` : null,
    before ? `Continuity: it follows a shot of ${clip(before, 200)}.` : null,
    `Length ${seconds} seconds, ${vertical ? 'vertical 9:16' : 'landscape 16:9'}, realistic motion, cinematic quality.`,
    'Avoid: any text, captions, subtitles, logos or watermarks; extra people who are not described; morphing faces or hands; a different character from the reference.',
    ...soundLines(sound, speech),
  ].filter(Boolean);
  return {seconds, aspect: vertical ? '9:16' : '16:9', text: lines.join('\n'), attach, after: after ? clip(after, 200) : null, sound: sound === 'muse' && speech?.words ? 'muse' : sound === 'ambience' ? 'ambience' : 'narrator', ...(sound === 'muse' && speech?.words ? {speech: {words: clip(speech.words, 600), seconds: Math.round(String(speech.words).split(/\s+/).filter(Boolean).length / 2.6 * 10) / 10}} : {})};
}

// What the clip sounds like (0.115). Muse makes every clip with sound and takes no voice or reference audio, so the
// voice is led in words: the exact words, the narrator's voice described, the delivery of the line.
function soundLines(sound, speech) {
  if (sound === 'muse' && speech?.words) return [
    `Spoken in this clip, word for word and nothing else: "${clip(speech.words, 600)}".`,
    `Voice: ${clip(speech.voice || 'one clear, warm narrator voice', 300)}${speech.delivery ? `; this line ${clip(speech.delivery, 200)}` : ''}. Speak clearly and finish every word inside the clip. It is an off-screen narrator, unless a character on screen is the one speaking; then their lips follow the words.`,
    ...(speech.craft ? [`Voice craft (the channel's voice skills): ${clip(speech.craft, 500)}`] : []),
    ...(speech.lessons ? [`How the niche's best narrators deliver (techniques only; never imitate their voice): ${clip(speech.lessons, 500)}`] : []),
    'No music: the program adds the music and sound effects.',
  ];
  if (sound === 'ambience') return ['Sound: only the natural sound of this place and action (wind, water, footsteps, fire, a crowd), no speech and no music; the program lays the narration and music over it.'];
  return ['No speech or music needed: the program adds the narration, music and sound effects. Nobody speaks to the camera.'];
}
// 0.116 (owner 2026-11-23: "the Muse voice is used only for the video made from Muse"): Muse speaks only in a
// video whose every shot is a Muse clip, by default; a video that mixes Muse clips with the engine keeps one narrator
// (the connected voice) and may only lay Muse's natural sound under it.
function soundOf(visuals) {
  const every = Array.isArray(visuals?.sources) && visuals.sources.length === 1 && visuals.sources[0] === 'ai-video';
  return every ? (visuals.museSound || 'muse') : visuals?.museSound === 'ambience' ? 'ambience' : 'narrator';
}
// The uploaded clip against its shot (probe: visual-sources probeMedia): a video, sharp enough, long enough, the right
// shape (another shape is cropped to fill the frame).
function checkClip(probe, {seconds, vertical = false}) {
  const problems = [], notes = [];
  if (!probe || probe.kind !== 'video') return {ok: false, problems: ['The file is not a video clip.'], notes};
  const duration = Number(probe.durationSeconds || 0), width = Number(probe.width), height = Number(probe.height);
  if (!(duration > 0)) problems.push('The clip has no length.');
  else if (duration + 0.05 < seconds) notes.push(`The clip is ${duration.toFixed(1)} s and its shot is ${seconds.toFixed(1)} s: the edit slows or holds it; a clip of ${Math.ceil(seconds)} s or more fits best.`);
  if (!(width > 0 && height > 0)) problems.push('The clip has no picture size.');
  else {
    if (Math.min(width, height) < 480) problems.push(`The clip is only ${width}x${height}; generate it at 720p or more.`);
    const want = vertical ? 9 / 16 : 16 / 9;
    if (Math.abs(width / height - want) / want > 0.06) notes.push(`The clip is ${width}x${height}, not ${vertical ? '9:16' : '16:9'}: it is cropped to fill the frame.`);
  }
  return {ok: !problems.length, problems, notes, duration, width, height};
}

const PLANNER_LINE = `AI VIDEO (source "ai-video"): each such shot is generated by the owner's video model (Meta Muse) from your "prompt", one clip per shot of at most ${MAX_SECONDS} s, so keep ai-video shots ${MAX_SECONDS} s or shorter (give a long moment several shots). Write the prompt as a film director's shot description of ONE continuous moment (60-1,500 characters): who is in it (name a reference character by the cast name you gave it, and give it "ref"), what they do from the first frame to the last, the place and its details, the time of day and weather, the light and colour, the mood, the lens (wide, medium, close-up, extreme close-up) and the camera move; real physical detail a camera would see (water level, breath in the cold, torn fabric, the weight of a satchel). Show what the words mean; never put text, captions or logos in it. Each shot continues the one before (same clothes, same injuries, same light unless time passes). Plan the coverage like a film: establish the place, then medium and close shots of the character, inserts of the objects that matter, reaction shots on the turns.`;

// 0.116 (owner 2026-11-23: "an option in each engine to use Muse; the program sees where to add a Muse clip and where
// to proceed with the engine"): when Muse joins an engine, the planner chooses per shot.
const MIX_LINE = 'WHERE MUSE, WHERE THE ENGINE: this video mixes AI video clips (source "ai-video") with its engine. Choose per shot what serves the moment best. A Muse clip where live action tells it better than the engine can: people acting in real places, physical action, nature, weather, crowds, spectacle, a close-up of an emotion the viewer must feel is real, a reveal. Keep the engine for what it does better: explanations, numbers, charts, maps, timelines, diagrams, lists, words on screen, comparisons, humour, abstract ideas, and the look that makes the channel recognisable. Keep a Muse moment whole (a run of shots or a scene), never one stray clip between drawings unless it is a deliberate reveal; keep the same characters, clothes and places as the engine shows them (the cast and the world); every ai-video shot says in its notes why live action serves it there.';

module.exports = {MAX_SECONDS, CAMERA, direction, checkClip, soundOf, PLANNER_LINE, MIX_LINE};
