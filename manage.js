'use strict';
// Long lists can be cleared and exported (0.74, owner request 2026-10-31: "we cannot keep the big and old data on the
// screen"). Trending topics, Content Studio, Niche Factory and Research briefs delete the ticked rows or all of them, and
// export them as CSV, Word or PDF. Nothing waiting or running is deleted; a draft that already became a video stays; usage
// and cost records always stay, so the month's limits keep counting what was spent.
const {InputError} = require('./store');
const D = require('./documents');

const need = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const day = value => String(value || '').slice(0, 10);
const json = value => (value ? JSON.parse(value) : null);
const FORMATS = Object.freeze({csv: {type: 'text/csv; charset=utf-8', ext: 'csv'}, docx: {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx'}, pdf: {type: 'application/pdf', ext: 'pdf'}});
const YOUTUBE_NOTE = 'YouTube data about other channels: YouTube\'s terms allow keeping it for at most 30 days. Delete this file within 30 days of the scan date.';

// Each list: its table (deleted for real) or remove (Content Studio), a title per row, and its export as columns + rows
// (CSV) and blocks (Word and PDF).
const KINDS = {
  'trend-scans': {
    label: 'Trend scans', table: 'trend_scans',
    rows: db => db.prepare('SELECT * FROM trend_scans ORDER BY created_at DESC, rowid DESC').all(),
    title: row => { const scope = JSON.parse(row.scope); return `${day(row.created_at)} · ${scope.source === 'reddit' ? 'Reddit' : 'YouTube'} · ${scope.keywords.slice(0, 4).join(', ')}`; },
    export(rows) {
      const columns = ['Scan date', 'Source', 'Keywords', 'Ref', 'Title', 'Channel or subreddit', 'Link', 'Published', 'Views or votes', 'Subscribers or comments', 'Kept'];
      const lines = [], blocks = [];
      for (const row of rows) {
        const scope = JSON.parse(row.scope), result = json(row.result) || {}, reddit = scope.source === 'reddit', keywords = scope.keywords.join(', ');
        blocks.push({kind: 'heading', text: `${day(row.created_at)} · ${reddit ? 'Reddit' : 'YouTube'} · ${keywords}`}, {kind: 'small', text: [scope.niche ? `Niche: ${scope.niche.name}` : '', scope.maxSubscribers ? `channels up to ${scope.maxSubscribers} subscribers` : '', result.purged ? 'YouTube data deleted after 30 days' : '', row.error || ''].filter(Boolean).join(' · ') || row.status});
        for (const item of reddit ? result.posts || [] : result.videos || []) {
          const channel = (result.channels || {})[item.channelId] || {};
          const line = reddit
            ? [day(row.created_at), 'Reddit', keywords, item.ref, item.title, `r/${item.subreddit}`, item.url, day(item.createdAt), item.score, item.comments, 'yes']
            : [day(row.created_at), 'YouTube', keywords, item.ref, item.title, channel.title || item.channelTitle, `https://www.youtube.com/watch?v=${item.videoId}`, day(item.publishedAt), item.views, channel.subscribers ?? 'hidden', item.leftOut ? `left out (${item.leftOut})` : 'yes'];
          lines.push(line);
          blocks.push({kind: 'text', text: `${item.ref} ${item.title}\n${line[5]} · ${line[7]} · ${reddit ? `${item.score} votes · ${item.comments} comments` : `${item.views ?? '?'} views · ${line[9]} subscribers`}${item.leftOut ? ` · left out (${item.leftOut})` : ''}\n${line[6]}`});
        }
      }
      return {columns, rows: lines, blocks, note: rows.some(row => JSON.parse(row.scope).source !== 'reddit') ? YOUTUBE_NOTE : null};
    },
  },
  'trend-topics': {
    label: 'Topic ideas', table: 'trend_topics',
    rows: db => db.prepare('SELECT * FROM trend_topics ORDER BY created_at DESC, rowid DESC').all(),
    title: (row, store) => `${day(row.created_at)} · ${familyName(store, row.family_id)} · ${json(row.result)?.topics?.length || 0} ideas`,
    export(rows, store) {
      const columns = ['Date', 'Channel', 'Title', 'Hook', 'Promise', 'Why they click', 'What we add', 'Format', 'Confidence'];
      const lines = [], blocks = [];
      for (const row of rows) {
        const result = json(row.result), family = familyName(store, row.family_id);
        blocks.push({kind: 'heading', text: `${day(row.created_at)} · ${family}`}, {kind: 'small', text: result?.summary || row.error || row.status});
        for (const topic of result?.topics || []) {
          lines.push([day(row.created_at), family, topic.title, topic.hook, topic.promise, topic.whyClick, topic.angle, topic.format, topic.confidence]);
          blocks.push({kind: 'text', text: `${topic.title}\nHook: ${topic.hook}\nPromise: ${topic.promise}\nWhy they click: ${topic.whyClick}\nWhat we add: ${topic.angle}\n${topic.format} · confidence ${topic.confidence}`});
        }
      }
      return {columns, rows: lines, blocks};
    },
  },
  content: {
    label: 'Drafts', remove: true,
    rows: (db, store) => store.contents(),
    title: c => c.title,
    export(contents, store) {
      const columns = ['Title', 'Channel', 'State', 'Version', 'Kind', 'Target minutes', 'Words', 'Hook', 'Angle', 'Sources', 'Updated'];
      const words = text => (String(text || '').match(/\S+/g) || []).length, lines = [], blocks = [];
      for (const c of contents) {
        const family = familyName(store, c.familyId), kind = c.kind === 'fiction' ? 'Original fiction' : 'Factual';
        lines.push([c.title, family, c.state, c.revision, kind, c.targetMinutes ?? '', words(c.script), c.hook, c.angle, c.sources.length, day(c.updatedAt)]);
        blocks.push({kind: 'heading', text: c.title}, {kind: 'small', text: `${family} · ${c.state} · v${c.revision} · ${kind} · ${words(c.script)} words`});
        if (c.angle) blocks.push({kind: 'text', text: `Angle: ${c.angle}`});
        if (c.hook) blocks.push({kind: 'text', text: `Hook: ${c.hook}`});
        if (c.script) blocks.push({kind: 'text', text: c.script});
      }
      return {columns, rows: lines, blocks};
    },
  },
  'niche-ideas': {
    label: 'Niche ideas', table: 'niche_ideas',
    rows: db => db.prepare('SELECT * FROM niche_ideas ORDER BY created_at DESC, rowid DESC').all(),
    title: row => JSON.parse(row.payload).title,
    export(rows, store) {
      const columns = ['Niche', 'Description', 'Audience', 'Keywords', 'Status', 'Latest decision', 'Score', 'Created'];
      const lines = [], blocks = [];
      for (const row of rows) {
        const idea = JSON.parse(row.payload), evaluation = store.db.prepare("SELECT decision, score FROM niche_evaluations WHERE idea_id=? AND status='completed' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(row.id);
        lines.push([idea.title, idea.description, idea.audience, (idea.keywords || []).join(', '), row.status, evaluation?.decision || '', evaluation?.score ?? '', day(row.created_at)]);
        blocks.push({kind: 'heading', text: idea.title}, {kind: 'small', text: `${row.status}${evaluation ? ` · ${evaluation.decision} (score ${evaluation.score})` : ''} · ${day(row.created_at)}`}, {kind: 'text', text: [idea.description, idea.audience ? `Audience: ${idea.audience}` : '', idea.keywords?.length ? `Keywords: ${idea.keywords.join(', ')}` : ''].filter(Boolean).join('\n')});
      }
      return {columns, rows: lines, blocks};
    },
  },
  'niche-suggestions': {
    label: 'Niche suggestions', table: 'niche_suggestions',
    rows: db => db.prepare('SELECT * FROM niche_suggestions ORDER BY created_at DESC, rowid DESC').all(),
    title: row => `${day(row.created_at)} · ${row.mode === 'sub' ? 'sub-niches' : 'new niches'} · ${json(row.result)?.suggestions?.length || 0} suggestions`,
    export(rows) {
      const columns = ['Date', 'Niche', 'Description', 'Audience', 'Keywords', 'Why now', 'Viral chance', 'Competition', 'Our angle'];
      const lines = [], blocks = [];
      for (const row of rows) {
        const result = json(row.result);
        blocks.push({kind: 'heading', text: `${day(row.created_at)} · ${row.mode === 'sub' ? 'Sub-niches' : 'New niches'}`}, {kind: 'small', text: result?.summary || row.error || row.status});
        for (const item of result?.suggestions || []) {
          lines.push([day(row.created_at), item.title, item.description, item.audience, (item.keywords || []).join(', '), item.whyNow, item.viralChance, item.competition, item.angle]);
          blocks.push({kind: 'text', text: `${item.title}\n${item.description}\nAudience: ${item.audience}\nWhy now: ${item.whyNow}\nViral chance: ${item.viralChance} · competition: ${item.competition}\nOur angle: ${item.angle}`});
        }
      }
      return {columns, rows: lines, blocks};
    },
  },
  'research-evidence': {
    label: 'Research evidence', table: 'research_evidence',
    rows: db => db.prepare('SELECT * FROM research_evidence ORDER BY created_at DESC, rowid DESC').all(),
    title: row => JSON.parse(row.payload).title,
    export(rows, store) {
      const columns = ['Title', 'Channel', 'Publisher', 'Link', 'Published', 'Accessed', 'Expires', 'Permission', 'Notes'];
      const lines = [], blocks = [];
      for (const row of rows) {
        const item = JSON.parse(row.payload), family = familyName(store, row.family_id);
        lines.push([item.title, family, item.publisher, item.url, item.publishedAt || '', item.accessedAt, item.expiresAt, item.permission, item.notes]);
        blocks.push({kind: 'heading', text: item.title}, {kind: 'small', text: `${family} · ${item.publisher} · accessed ${item.accessedAt} · ${item.permission}`}, {kind: 'text', text: `${item.url}${item.notes ? `\n${item.notes}` : ''}`});
      }
      return {columns, rows: lines, blocks};
    },
  },
  'research-briefs': {
    label: 'Research briefs', table: 'topic_briefs',
    rows: db => db.prepare('SELECT * FROM topic_briefs ORDER BY created_at DESC, rowid DESC').all(),
    title: row => `${row.brief_date} · ${JSON.parse(row.payload).title}`,
    export(rows, store) {
      const columns = ['Date', 'Channel', 'Rank', 'Topic', 'Audience need', 'Why now', 'Angle', 'Hooks', 'Confidence'];
      const lines = [], blocks = [];
      for (const row of rows) {
        const brief = JSON.parse(row.payload), family = familyName(store, row.family_id);
        lines.push([row.brief_date, family, row.rank, brief.title, brief.audienceNeed, brief.whyNow, brief.angle, (brief.hooks || []).join(' | '), brief.confidence]);
        blocks.push({kind: 'heading', text: brief.title}, {kind: 'small', text: `${row.brief_date} · ${family} · rank ${row.rank} · confidence ${brief.confidence}`}, {kind: 'text', text: `Audience need: ${brief.audienceNeed}\nWhy now: ${brief.whyNow}\nAngle: ${brief.angle}${brief.hooks?.length ? `\nHooks: ${brief.hooks.join(' | ')}` : ''}`});
      }
      return {columns, rows: lines, blocks};
    },
  },
};
function familyName(store, id) { try { return store.family(id).name; } catch { return 'Deleted channel'; } }

class ListManager {
  // pdf(html) -> Buffer prints a page to PDF (the drawing browser); null when this PC has none.
  constructor(store, {pdf = null} = {}) { this.store = store; this.db = store.db; this.pdf = pdf; }
  kind(name) { const kind = KINDS[name]; need(kind, 'Unknown list.', 404); return kind; }
  // The rows asked for: every row, or the ticked ones (each must exist).
  pick(name, {ids, all}) {
    const kind = this.kind(name), rows = kind.rows(this.db, this.store);
    if (all === true) return rows;
    need(Array.isArray(ids) && ids.length >= 1 && ids.length <= 1000 && ids.every(id => typeof id === 'string' && id.length <= 80), 'Tick at least one row.');
    const wanted = new Set(ids), found = rows.filter(row => wanted.has(row.id));
    need(found.length === wanted.size, 'Some ticked rows no longer exist. Reload the page.', 409);
    return found;
  }
  delete(name, input) {
    need(input && typeof input === 'object' && input.confirm === true, 'Confirm the delete.');
    const kind = this.kind(name), rows = this.pick(name, input), kept = [];
    let deleted = 0;
    this.store.transaction(() => {
      if (kind.remove) {
        for (const c of rows) { const result = this.store.removeContent(c.id); if (result.kept) kept.push({id: c.id, title: c.title, reason: result.kept}); else deleted++; }
        return;
      }
      const free = [];
      for (const row of rows) {
        const busy = this.store.busyTables(this.store.rowsFrom([[kind.table, 'id', [row.id]]]));
        if (busy.length) kept.push({id: row.id, title: kind.title(row, this.store), reason: 'it is waiting or running'}); else free.push(row.id);
      }
      if (free.length) this.store.dropRows(this.store.rowsFrom([[kind.table, 'id', free]]));
      deleted = free.length;
      this.store.event(`Deleted ${deleted} of ${kind.label.toLowerCase()}${kept.length ? ` (${kept.length} kept: waiting or running)` : ''}`);
    });
    return {deleted, kept};
  }
  async export(name, {ids, all, format}) {
    need(Object.hasOwn(FORMATS, format), 'Choose PDF, Word or CSV.');
    const kind = this.kind(name), rows = this.pick(name, {ids, all});
    need(rows.length, 'There is nothing to export in this list.', 409);
    const {columns, rows: lines, blocks, note} = kind.export(rows, this.store), title = `${kind.label} · exported ${day(new Date().toISOString())}`;
    const document = [{kind: 'title', text: kind.label}, {kind: 'small', text: `Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${rows.length} item${rows.length === 1 ? '' : 's'}`}, ...(note ? [{kind: 'small', text: note}] : []), ...blocks];
    let data;
    if (format === 'csv') data = D.csvFile(columns, note ? [...lines, [], [note]] : lines);
    else if (format === 'docx') data = D.docxFile(document);
    else {
      need(this.pdf, 'PDF export needs Microsoft Edge or Google Chrome on this PC. Choose Word or CSV instead.', 503);
      data = await this.pdf(D.blocksHtml(document, title));
    }
    return {name: `${name}-${day(new Date().toISOString())}.${FORMATS[format].ext}`, type: FORMATS[format].type, data};
  }
}

module.exports = {ListManager, KINDS, FORMATS};
