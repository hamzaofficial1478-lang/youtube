'use strict';
// L01 language editions (Room 06): after the primary video's final master is approved, each of the family's other
// languages gets an edition: the narration script, every word on screen and the package, adapted by Claude on the
// owner's click (inside a token reservation) or written by the owner. Revisions are immutable per language; an
// approval is named and goes stale when the primary video's words change. Items whose source did not change keep their
// approved wording. Nothing is narrated, rendered or published here (L02/L03).
const {randomUUID, createHash} = require('node:crypto');
const L = require('./localize');
const R = require('./render');
const {splitSentences} = require('./scene-room');
const {AiError, jsonText} = require('./ai');
const {InputError} = require('./store');
const {messageTokenUpperBound} = require('./writer');
const {connectorReference, connectorCurrent} = require('./intel-sources');
const {requireValue, now, object, person, text} = R;

const PART_SENTENCES = 150, MAX_ANSWER = 16000;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
// The answer room one packet needs: about 2 characters a token for adapted text and JSON, plus a margin.
const answerTokens = messages => Math.min(MAX_ANSWER, Math.ceil(Buffer.byteLength(messages[1].content, 'utf8') / 2) + 2000);

// Sentences numbered like the scene plan (the whole script at once), each with the paragraph it sits in.
function sentencesOf(script, locale) {
  const paragraphs = String(script).split(/\n\s*\n/).map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let p = 0, at = 0;
  return splitSentences(script, locale).map(item => {
    const head = item.text.slice(0, 24);
    let index = paragraphs[p]?.indexOf(head, at) ?? -1;
    while (index < 0 && p < paragraphs.length - 1) { p++; at = 0; index = paragraphs[p].indexOf(head); }
    at = Math.max(at, index + 1);
    return {n: item.n, paragraph: p, text: item.text};
  });
}

class LocalizationRoom {
  constructor(store, renders, packaging, connectors, ai) {
    Object.assign(this, {store, db: store.db, renders, packaging, connectors, ai, busy: false});
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edition_revisions(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), locale TEXT NOT NULL, revision INTEGER NOT NULL, content_revision INTEGER NOT NULL, master_id TEXT NOT NULL, source TEXT NOT NULL, source_hash TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, checks TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(content_id, locale, revision));
      CREATE TRIGGER IF NOT EXISTS edition_revisions_immutable BEFORE UPDATE ON edition_revisions BEGIN SELECT RAISE(ABORT, 'Edition revisions are immutable.'); END;
      CREATE TABLE IF NOT EXISTS edition_approvals(id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES edition_revisions(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, source_hash TEXT NOT NULL, master_id TEXT NOT NULL, approved_by TEXT NOT NULL, notes TEXT NOT NULL, confirmations TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS edition_approvals_immutable BEFORE UPDATE ON edition_approvals BEGIN SELECT RAISE(ABORT, 'Edition approvals are immutable.'); END;
      CREATE TABLE IF NOT EXISTS edition_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, status TEXT NOT NULL, scope TEXT NOT NULL, parts TEXT NOT NULL DEFAULT '{}', revision_id TEXT, error TEXT, attempts INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    for (const row of this.db.prepare("SELECT id FROM edition_jobs WHERE status='running'").all()) {
      this.db.prepare("UPDATE edition_jobs SET status='interrupted', error='The program stopped while Claude was adapting. Finished parts are kept; token use of the open part is unknown. Retry deliberately.', updated_at=? WHERE id=?").run(now(), row.id);
      this.db.prepare("UPDATE intelligence_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(now(), row.id);
    }
  }

  // ------------------------------------------------------------ inputs
  // The newest final master the owner approved that is still current (localization starts only from a locked master).
  approvedMaster(contentId) {
    for (const row of this.db.prepare("SELECT * FROM render_jobs WHERE content_id=? AND preset='master' AND status='completed' ORDER BY created_at DESC, rowid DESC").all(contentId))
      if (this.renders.masterApproval(row)?.current) return row;
    return null;
  }
  inputs(contentId) {
    const content = this.store.content(contentId), family = this.store.family(content.familyId), blockers = [], targets = family.locales.slice(1);
    if (!targets.length) blockers.push('This family has one language. Add languages to the family (Studio) to make editions.');
    if (content.state !== 'approved') blockers.push('Approve the script first.');
    const master = content.state === 'approved' ? this.approvedMaster(contentId) : null;
    if (!master && content.state === 'approved') blockers.push('Approve the final master in Room 10 first: editions are adapted from the locked primary video.');
    let src = null;
    if (master) {
      const edit = JSON.parse(master.scope).edit, pkgRow = this.packaging.latestRow(contentId);
      const visible = L.visibleTexts({drawings: edit?.drawings || {}, graphics: edit?.timeline?.graphics || [], clips: edit?.timeline?.clips || []});
      src = L.source({sentences: sentencesOf(content.script, family.primaryLocale), visible, pkg: pkgRow ? JSON.parse(pkgRow.payload) : null});
    }
    return {content, family, targets, master, source: src, sourceHash: src ? hash(src) : null, blockers, ready: !blockers.length};
  }
  locale(inputs, value) {
    const locale = text(value, 'Language', 2, 20);
    requireValue(inputs.targets.includes(locale), `${locale} is not one of this family's other languages (${inputs.targets.join(', ') || 'none'}).`, 400);
    return locale;
  }

  // ------------------------------------------------------------ revisions
  latestRow(contentId, locale) { return this.db.prepare('SELECT * FROM edition_revisions WHERE content_id=? AND locale=? ORDER BY revision DESC LIMIT 1').get(contentId, locale) || null; }
  revisionRow(id) { const row = this.db.prepare('SELECT * FROM edition_revisions WHERE id=?').get(id); requireValue(row, 'Edition revision not found.', 404); return row; }
  insertRevision({inputs, locale, payload, actor, note, createdBy, expectedRevision = null}) {
    return this.store.transaction(() => {
      const latest = this.latestRow(inputs.content.id, locale), content = this.store.content(inputs.content.id);
      requireValue(content.revision === inputs.content.revision, 'The script changed while the edition was being prepared. Reload and try again.', 409);
      if (expectedRevision !== null) requireValue((latest?.revision || 0) === expectedRevision, `This edition changed (now r${latest?.revision || 0}). Reload before saving.`, 409);
      const checks = L.check(payload, inputs.source, {locale, sourceLocale: inputs.family.primaryLocale}), id = randomUUID(), revision = (latest?.revision || 0) + 1;
      this.db.prepare('INSERT INTO edition_revisions(id,family_id,content_id,locale,revision,content_revision,master_id,source,source_hash,actor,payload,payload_hash,checks,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, inputs.family.id, content.id, locale, revision, content.revision, inputs.master.id, JSON.stringify(inputs.source), inputs.sourceHash, actor, JSON.stringify(payload), hash(payload), JSON.stringify(checks), note, createdBy, now());
      this.store.event(`${L.language(locale)} edition r${revision} for "${content.title}" (${actor === 'claude' ? 'Claude adaptation' : `edited by ${createdBy}`})`);
      return this.publicRevision(this.revisionRow(id));
    });
  }
  // The owner's own wording: checked strictly (no unknown items, every limit), saved as the next revision.
  save(contentId, input) {
    object(input);
    const by = person(input.createdBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const locale = this.locale(inputs, input.locale);
    requireValue(Number.isSafeInteger(input.expectedRevision), 'Reload the edition before saving.', 409);
    let payload;
    try { payload = L.normalise(object(input.edition, 'Edition'), inputs.source); } catch (error) { throw new InputError(error.message, 400); }
    const latest = this.latestRow(contentId, locale);
    requireValue(!latest || hash(payload) !== latest.payload_hash || latest.source_hash !== inputs.sourceHash, 'Nothing changed.', 400);
    return this.insertRevision({inputs, locale, payload, actor: 'owner', note: text(input.note || 'Owner edit', 'Note', 1, 300), createdBy: by, expectedRevision: input.expectedRevision});
  }

  // ------------------------------------------------------------ Claude adaptations
  // One packet per part of the script (visible words and the package travel with the first). When the primary video
  // changed since the newest revision, unchanged items keep their wording and only the changes are asked.
  packets(inputs, locale) {
    const latest = this.latestRow(inputs.content.id, locale);
    const keep = latest && latest.source_hash !== inputs.sourceHash ? L.carry(JSON.parse(latest.payload), JSON.parse(latest.source), inputs.source) : {sentences: [], visible: [], given: []};
    const asked = inputs.source.sentences.filter(item => !keep.sentences.includes(item.n)), skills = this.store.skillRuntime?.brief('localization.check', inputs.family.id)?.prompt || null;
    const parts = [];
    for (let k = 0; k === 0 || k < asked.length; k += PART_SENTENCES) {
      const chunk = new Set(asked.slice(k, k + PART_SENTENCES).map(item => item.n)), first = k === 0;
      const source = {sentences: inputs.source.sentences.filter(item => chunk.has(item.n)), visible: first ? inputs.source.visible : [], package: first ? inputs.source.package : null};
      parts.push(L.messages({locale, sourceLocale: inputs.family.primaryLocale, family: inputs.family, title: inputs.content.title, source, keep: {visible: keep.visible}, given: first ? keep.given.slice(0, 200) : [], skills}));
    }
    return {parts, keep};
  }
  queueDraft(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const locale = this.locale(inputs, input.locale), connector = connectorReference(this.connectors, input.connector, 'ai', 'Claude', true);
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM edition_jobs WHERE content_id=? AND locale=? AND status IN ('queued','running')").get(contentId, locale), `Claude is already adapting the ${L.language(locale)} edition.`, 409);
      const {parts, keep} = this.packets(inputs, locale), tokenLimit = parts.reduce((sum, messages) => sum + messageTokenUpperBound(messages) + answerTokens(messages), 0);
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO edition_jobs(id,family_id,content_id,locale,status,scope,attempts,created_by,created_at,updated_at) VALUES(?,?,?,?,'queued',?,0,?,?,?)")
        .run(id, inputs.family.id, contentId, locale, JSON.stringify({contentRevision: inputs.content.revision, sourceHash: inputs.sourceHash, connector, parts, keep, tokenLimit}), by, at, at);
      const brief = this.store.skillRuntime?.brief('localization.check', inputs.family.id);
      if (brief) this.store.skillRuntime.recordUsage({jobId: id, familyId: inputs.family.id, room: 'localization', taskKey: 'localization.check', brief});
      this.store.event(`Queued Claude's ${L.language(locale)} adaptation of "${inputs.content.title}"${keep.sentences.length ? ` (${keep.sentences.length} unchanged sentences kept)` : ''}`);
      return this.publicJob(this.jobRow(id));
    });
  }
  jobRow(id) { const row = this.db.prepare('SELECT * FROM edition_jobs WHERE id=?').get(id); requireValue(row, 'Edition job not found.', 404); return row; }
  publicJob(row) { const usage = this.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(row.id), scope = JSON.parse(row.scope); return {id: row.id, contentId: row.content_id, locale: row.locale, status: row.status, error: row.error, attempts: row.attempts, revisionId: row.revision_id, parts: scope.parts.length, partsDone: Object.keys(JSON.parse(row.parts)).length, createdBy: row.created_by, createdAt: row.created_at, usage: usage ? {status: usage.status, total: usage.total_tokens, reserved: usage.reserved_tokens} : null}; }
  retryDraft(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.jobRow(id);
      requireValue(['failed', 'interrupted', 'quality_failed', 'blocked_budget'].includes(row.status), `A ${row.status} adaptation cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This adaptation already used 3 attempts. Ask for a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and Claude may have used tokens. Confirm the deliberate retry.', 409);
      if (this.db.prepare('SELECT 1 FROM intelligence_usage WHERE job_id=?').get(id)) this.db.prepare('UPDATE intelligence_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${row.attempts}`, id);
      this.db.prepare("UPDATE edition_jobs SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicJob(this.jobRow(id));
    });
  }
  claim() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM edition_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), family = this.store.family(row.family_id), at = now(), done = JSON.parse(row.parts);
      const stop = (status, error) => { this.db.prepare('UPDATE edition_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      const inputs = (() => { try { return this.inputs(row.content_id); } catch { return null; } })();
      if (!inputs?.ready || inputs.content.revision !== scope.contentRevision || inputs.sourceHash !== scope.sourceHash) return stop('stale', 'The primary video changed before Claude started. Nothing was sent.');
      if (!connectorCurrent(this.connectors, scope.connector, 'ai')) return stop('stale', 'The Claude connection changed or is not tested. Nothing was sent.');
      // Only the parts still to answer are reserved (finished parts are kept and never paid twice).
      const reserve = scope.parts.reduce((sum, messages, k) => sum + (done[k] ? 0 : messageTokenUpperBound(messages) + answerTokens(messages)), 0), summary = this.store.usageSummary(family.id);
      if (summary.settledTokens + summary.reservedTokens + reserve > family.tokenBudget.monthlyLimit) return stop('blocked_budget', 'The family monthly token limit cannot reserve this adaptation. Raise it or wait for next month.');
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'localization',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), reserve, at, at);
      this.db.prepare("UPDATE edition_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, scope, done};
    });
  }
  async processNext() {
    if (this.busy) return null;
    const job = this.claim();
    if (!job) return null;
    this.busy = true;
    let started = false;
    const used = {prompt: 0, completion: 0, total: 0, known: true}, warnings = [];
    const add = usage => { if (!Number.isSafeInteger(usage?.totalTokens)) { used.known = false; return; } used.prompt += usage.promptTokens || 0; used.completion += usage.completionTokens || 0; used.total += usage.totalTokens; };
    const settle = at => this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(used.known ? 'settled' : 'unknown', used.prompt, used.completion, used.total, at, job.id);
    let answered = 0;
    try {
      for (const [k, messages] of job.scope.parts.entries()) {
        if (job.done[k]) continue;
        started = false;
        const reply = await this.ai.complete({connectorId: job.scope.connector.id, task: 'localization', messages, maxTokens: answerTokens(messages), onStart: () => { started = true; }});
        add(reply.usage); answered++;
        let answer;
        try { answer = JSON.parse(jsonText(reply.content)); } catch (error) { throw Object.assign(new AiError(`Claude's adaptation (part ${k + 1}) was not JSON: ${error.message}`), {quality: true}); }
        job.done[k] = answer;
        this.db.prepare('UPDATE edition_jobs SET parts=?, updated_at=? WHERE id=?').run(JSON.stringify(job.done), now(), job.id);
      }
      const inputs = this.inputs(job.content_id);
      if (!inputs.ready || inputs.content.revision !== job.scope.contentRevision || inputs.sourceHash !== job.scope.sourceHash) throw Object.assign(new AiError('The primary video changed while Claude was adapting. The edition was not saved.'), {quality: true, stale: true});
      const answers = job.scope.parts.map((_, k) => job.done[k]), given = job.scope.keep.given;
      const raw = {sentences: [...given.filter(item => item.n), ...answers.flatMap(answer => Array.isArray(answer?.sentences) ? answer.sentences : [])],
        visible: [...given.filter(item => item.id), ...(Array.isArray(answers[0]?.visible) ? answers[0].visible : [])], package: answers[0]?.package, notes: answers.map(answer => answer?.notes).filter(Boolean).join(' ')};
      let payload;
      try { payload = L.normalise(raw, inputs.source, {lenient: true, warn: message => warnings.push(message)}); } catch (error) { throw Object.assign(new AiError(`Claude's adaptation was not usable: ${error.message}`), {quality: true}); }
      if (warnings.length) payload.notes = `${payload.notes} [Repaired: ${warnings.slice(0, 5).join(' ')}]`.trim().slice(0, 400);
      const revision = this.insertRevision({inputs, locale: job.locale, payload, actor: 'claude', note: `Claude adaptation${given.length ? ` (${given.length} unchanged items kept)` : ''}`, createdBy: job.created_by});
      this.store.transaction(() => { const at = now(); settle(at); this.db.prepare("UPDATE edition_jobs SET status='completed', revision_id=?, updated_at=? WHERE id=?").run(revision.id, at, job.id); });
      this.store.skillRuntime?.settleUsage(job.id, revision.checks.passed ? 'completed' : 'completed-with-findings');
      return revision;
    } catch (error) {
      this.store.transaction(() => {
        const at = now(), message = error instanceof AiError || error instanceof InputError ? error.message : 'The adaptation failed.';
        if (error.quality) { settle(at); this.db.prepare('UPDATE edition_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(error.stale ? 'stale' : 'quality_failed', message, at, job.id); return; }
        this.db.prepare('UPDATE edition_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(started || answered ? 'interrupted' : 'failed', message, at, job.id);
        if (answered || started) { used.known = used.known && !started; settle(at); }
        else this.db.prepare("UPDATE intelligence_usage SET status='released', reserved_tokens=0, updated_at=? WHERE job_id=?").run(at, job.id);
      });
      return null;
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------ approval
  approve(revisionId, input) {
    object(input);
    const by = person(input.approvedBy, 'Your name');
    return this.store.transaction(() => {
      const row = this.revisionRow(revisionId), latest = this.latestRow(row.content_id, row.locale), inputs = this.inputs(row.content_id), checks = JSON.parse(row.checks);
      requireValue(latest.id === row.id, `A newer ${L.language(row.locale)} revision exists (r${latest.revision}). Approve that one.`, 409);
      requireValue(inputs.ready, inputs.blockers[0], 409);
      requireValue(row.source_hash === inputs.sourceHash, 'The primary video\'s words changed after this edition. Adapt it again (unchanged items are kept).', 409);
      requireValue(checks.passed, `Fix the critical edition checks first: ${checks.issues.find(item => item.severity === 'critical')?.message}`, 409);
      const c = object(input.confirmations, 'Confirmations');
      for (const [key, message] of [['meaningReviewed', 'Confirm that a speaker of this language read the whole narration and it says what the primary video says.'], ['factsChecked', 'Confirm that names, numbers, dates and units are right for this market.'], ['visibleChecked', 'Confirm that every on-screen word reads naturally and fits.'], ['packageHonest', 'Confirm that the title and thumbnail words promise only what the video shows.']]) requireValue(c[key] === true, message);
      const id = randomUUID();
      this.db.prepare('INSERT INTO edition_approvals(id,revision_id,content_id,locale,source_hash,master_id,approved_by,notes,confirmations,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, row.id, row.content_id, row.locale, row.source_hash, inputs.master.id, by, text(input.notes || '', 'Notes', 0, 2000), JSON.stringify({meaningReviewed: true, factsChecked: true, visibleChecked: true, packageHonest: true}), now());
      this.store.event(`${L.language(row.locale)} edition r${row.revision} of "${inputs.content.title}" approved by ${by}`);
      return this.publicRevision(row);
    });
  }
  // An approval holds while it is the newest revision for its language, the primary video's words are unchanged and a
  // master is still approved.
  approvalFor(row, inputs = null) {
    const approval = this.db.prepare('SELECT * FROM edition_approvals WHERE revision_id=? ORDER BY created_at DESC LIMIT 1').get(row.id);
    if (!approval) return null;
    const current = inputs || (() => { try { return this.inputs(row.content_id); } catch { return null; } })(), latest = this.latestRow(row.content_id, row.locale);
    const reason = latest.id !== row.id ? 'A newer revision was saved.' : !current?.ready ? (current?.blockers[0] || 'The primary video is no longer approved.') : current.sourceHash !== approval.source_hash ? 'The primary video\'s words changed.' : null;
    return {id: approval.id, approvedBy: approval.approved_by, notes: approval.notes, at: approval.created_at, current: !reason, staleReason: reason};
  }
  // The edition approval that stands now for one language (L02 narrates it).
  currentApproval(contentId, locale) {
    const latest = this.latestRow(contentId, locale), approval = latest ? this.approvalFor(latest) : null;
    return approval?.current ? {id: approval.id, revisionId: latest.id, revision: latest.revision, approvedBy: approval.approvedBy, at: approval.at} : null;
  }
  // The edition's narration script and package text, for L02 and for the owner to copy.
  exportText(revisionId) {
    const row = this.revisionRow(revisionId), payload = JSON.parse(row.payload), src = JSON.parse(row.source), content = this.store.content(row.content_id);
    return {filename: `${content.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'edition'}-${row.locale}-r${row.revision}.txt`,
      text: [`LANGUAGE\n${L.language(row.locale)} (${row.locale})`, `NARRATION\n${L.script(payload, src)}`, ...(payload.package ? [`TITLE\n${payload.package.title}`, `DESCRIPTION\n${payload.package.description}`, `TAGS\n${payload.package.tags.join(', ')}`, ...(payload.package.thumbnail ? [`THUMBNAIL WORDS\n${payload.package.thumbnail.text}`] : [])] : []),
        ...(payload.visible.length ? [`ON-SCREEN WORDS\n${payload.visible.map(item => `${src.visible.find(entry => entry.id === item.id)?.source} -> ${item.text}`).join('\n')}`] : [])].join('\n\n') + '\n'};
  }
  publicRevision(row, inputs = null) {
    return {id: row.id, contentId: row.content_id, locale: row.locale, language: L.language(row.locale), revision: row.revision, contentRevision: row.content_revision, masterId: row.master_id, actor: row.actor, note: row.note, createdBy: row.created_by, createdAt: row.created_at,
      payload: JSON.parse(row.payload), source: JSON.parse(row.source), checks: JSON.parse(row.checks), approval: this.approvalFor(row, inputs)};
  }
  state() {
    const families = new Map(this.store.families().map(family => [family.id, family]));
    const contents = this.store.contents().filter(content => (families.get(content.familyId)?.locales.length || 0) > 1 && (content.state === 'approved' || this.db.prepare('SELECT 1 FROM edition_revisions WHERE content_id=? LIMIT 1').get(content.id)));
    return {
      busy: !!this.db.prepare("SELECT 1 FROM edition_jobs WHERE status IN ('queued','running') LIMIT 1").get(),
      contents: contents.map(content => {
        const inputs = (() => { try { return this.inputs(content.id); } catch (error) { return {ready: false, blockers: [error.message], targets: [], source: null}; } })();
        return {contentId: content.id, familyId: content.familyId, title: content.title, ready: inputs.ready, blockers: inputs.blockers, masterId: inputs.master?.id || null, primaryLocale: families.get(content.familyId).primaryLocale,
          source: inputs.source ? {sentences: inputs.source.sentences.length, visible: inputs.source.visible.length, designed: inputs.source.designed.length, package: !!inputs.source.package, full: inputs.source} : null,
          editions: (inputs.targets || families.get(content.familyId).locales.slice(1)).map(locale => {
            const latest = this.latestRow(content.id, locale);
            return {locale, language: L.language(locale), latest: latest ? this.publicRevision(latest, inputs.ready ? inputs : null) : null, sourceChanged: !!(latest && inputs.sourceHash && latest.source_hash !== inputs.sourceHash),
              history: this.db.prepare('SELECT id, revision, actor, note, created_by, created_at FROM edition_revisions WHERE content_id=? AND locale=? ORDER BY revision DESC LIMIT 10').all(content.id, locale).map(item => ({id: item.id, revision: item.revision, actor: item.actor, note: item.note, createdBy: item.created_by, createdAt: item.created_at})),
              jobs: this.db.prepare('SELECT * FROM edition_jobs WHERE content_id=? AND locale=? ORDER BY created_at DESC, rowid DESC LIMIT 3').all(content.id, locale).map(row => this.publicJob(row))};
          })};
      }),
    };
  }
}

module.exports = {LocalizationRoom, sentencesOf};
