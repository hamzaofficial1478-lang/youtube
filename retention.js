'use strict';
// S03 - retention check for scripts (owner request 2026-10-21: hooks and scripts that make viewers stay).
// Restates the structure from the owner's screenshots (skills/retention-craft.json): no intro in the first
// 15 seconds, a promise in the first minute, specifics, sections that pull forward, a re-hook before the
// middle, an ending that answers the hook, one call to action at the end. Pure and deterministic. Advice
// only: it never blocks a script. Reads English only, like craft.js.
const WORDS_PER_MINUTE = 150;
const HOOK_WORDS = Math.round(WORDS_PER_MINUTE / 4); // 15 seconds
const INTRO = /\b(welcome (?:back )?to|hey (?:guys|everyone|there|friends)|hi (?:guys|everyone|friends)|what'?s up|my name is|in (?:this|today'?s) video|today (?:we|i)(?:'ll| will| are going to| am going to)|before we (?:start|begin|get started|dive in)|don'?t forget to (?:like|subscribe)|smash (?:that|the) like)\b/i;
const PROMISE = /\b(by the end|you(?:'ll| will) (?:learn|know|see|discover|understand|find out|be able)|i(?:'ll| will) show you|here'?s (?:how|why|what)|this is (?:how|why|what)|we(?:'ll| will) (?:see|find out|uncover|look at)|the answer (?:is|comes))\b/i;
const PULL = /(?:\?|\b(?:but|until|except|so why|here'?s (?:the|where|what|why)|that'?s (?:when|where)|what happened next|the (?:real|strange|surprising|worst|hardest|best) part|the catch|turns out|wait|and then|which is why|it gets (?:worse|stranger|better))\b[^.!?]*[.!?…]?["'”’)]*)\s*$/i;
const CTA = /\b(subscribe|hit the bell|like (?:this|the) video|leave a (?:comment|like)|comment below|follow (?:me|us|for more)|link (?:is )?in (?:the )?description|join (?:the|my|our) (?:newsletter|community|membership))\b/gi;
const STOP = new Set('about after again also because been before being between both could does doing down during each even every from have having here into just like made make many more most much must never only other over same should some such than that their them then there these they this those through very what when where which while will with would your youre'.split(' '));
const isEnglish = locale => !locale || /^en(?:-|$)/i.test(String(locale));
const words = value => String(value || '').match(/[\p{L}\p{N}'’]+/gu) || [];
const sentences = value => String(value || '').split(/(?<=[.!?…])["'”’)]*\s+/).map(item => item.trim()).filter(Boolean);
const content = value => new Set(words(value).map(word => word.toLowerCase().replace(/['’]s$/, '')).filter(word => word.length >= 4 && !STOP.has(word)));

// Numbers, amounts and names (capitalised words that do not start a sentence).
function concreteCount(script) {
  let count = (String(script).match(/\$?\d[\d,.]*%?/g) || []).length;
  for (const sentence of sentences(script)) count += words(sentence).slice(1).filter(word => /^\p{Lu}\p{Ll}{2,}/u.test(word)).length;
  return count;
}

function check({script = '', hook = '', locale = 'en'} = {}) {
  if (!isEnglish(locale)) return {applicable: false, checks: [], note: 'The retention check reads English only.'};
  const text = [hook, script].filter(Boolean).join(' ').trim(), all = words(text);
  if (all.length < 60) return {applicable: false, checks: [], note: 'Write at least 60 words to check the structure.'};
  const checks = [], add = (key, label, passed, detail) => checks.push({key, label, passed, detail});
  const opening = all.slice(0, HOOK_WORDS).join(' '), intro = opening.match(INTRO);
  add('noIntro', 'No intro in the first 15 seconds', !intro, intro ? `The opening says "${intro[0]}". Start inside the story or the problem; greet later or never.` : 'The opening goes straight into the story.');
  const minute = all.slice(0, WORDS_PER_MINUTE).join(' '), promise = minute.match(PROMISE);
  add('promise', 'A promise in the first minute', !!promise, promise ? `The first minute promises the viewer something ("${promise[0]}").` : 'Say in the first minute what the viewer will know or be able to do by the end.');
  const concrete = concreteCount(text), perHundred = concrete / all.length * 100;
  add('specific', 'Specific numbers and names', perHundred >= 1, `${concrete} concrete detail${concrete === 1 ? '' : 's'} (numbers, names) in ${all.length} words${perHundred < 1 ? ': replace vague words with the year, the amount, the person or what was at stake' : ''}.`);
  const parts = String(script).split(/\n\s*\n/).map(item => item.trim()).filter(Boolean), beats = parts.slice(0, -1);
  if (beats.length >= 2) {
    const pulling = beats.filter(part => PULL.test(sentences(part).at(-1) || '')).length;
    add('beats', 'Sections end by pulling forward', pulling / beats.length >= 0.4, `${pulling} of ${beats.length} sections end on a question, a turn or a hint of what comes next${pulling / beats.length < 0.4 ? '; end more of them on a small cliffhanger' : ''}.`);
  }
  const list = sentences(script), from = Math.floor(list.length * 0.25), to = Math.max(from + 1, Math.ceil(list.length * 0.55));
  const rehook = list.slice(from, to).find(sentence => PULL.test(sentence));
  add('rehook', 'A re-hook before the middle', !!rehook, rehook ? `Re-hook: "${rehook.slice(0, 120)}"` : 'Between a quarter and a half of the script, add a sentence that reopens curiosity about what is still coming.');
  const hookWords = content(hook || list[0] || ''), ending = content(parts.at(-1) || list.slice(-3).join(' ')), shared = [...hookWords].filter(word => ending.has(word));
  if (hookWords.size >= 2) add('payoff', 'The ending answers the hook', shared.length >= 1, shared.length ? `The ending returns to ${shared.slice(0, 4).map(word => `"${word}"`).join(', ')} from the hook.` : `The ending never returns to the hook (${[...hookWords].slice(0, 4).join(', ')}).`);
  const calls = [...String(script).matchAll(CTA)], early = calls.filter(match => match.index < String(script).length * 0.6);
  add('oneCta', 'One call to action, at the end', calls.length === 1 && !early.length, !calls.length ? 'No call to action: end with one next step (usually the next video).' : calls.length > 1 ? `${calls.length} calls to action (${calls.slice(0, 3).map(match => `"${match[0]}"`).join(', ')}); keep one.` : early.length ? `The call to action ("${early[0][0]}") comes before the payoff; move it to the end.` : `One call to action at the end ("${calls[0][0]}").`);
  return {applicable: true, passed: checks.filter(item => item.passed).length, total: checks.length, checks};
}

module.exports = {check, concreteCount, HOOK_WORDS, WORDS_PER_MINUTE};
