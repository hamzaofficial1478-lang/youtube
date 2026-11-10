'use strict';
// Jobs that stopped because the internet dropped are tried again by the program itself once the connection is back
// (owner 2026-11-10: "if the program gets a network issue and the process fails, it keeps checking the network and
// retries by itself when the connection is good; do not ask me to retry every time").
//
// Only a failure whose own message says the connection was lost is retried (the program's words for it: "could not be
// reached", "connection dropped", "not connected to the internet"). The retry is always the room's own deliberate
// retry, so its limits (3 attempts, the family's budgets, a script that changed meanwhile) still hold, and it is named
// in the program's log as done by the program. At most MAX tries per job, and only for an hour after it stopped.
// Storyboards wait for the internet in their own way (scene-room `resumeWhenOnline`).
const NETWORK = /could not be reached|connection dropped|not connected to the internet/i;
// 0.100 (owner 2026-11-10: "wait for 1 hour, not 1 day"; repeated retries must not keep spending): an hour, three tries.
const MAX = 3, WINDOW_MS = 3600 * 1000;

class NetRetry {
  // online(): true when this PC can reach the AI services again (the server passes the real check; tests their own).
  // everyMs: the server's worker loop calls tick() twice a second; the check itself runs at most this often.
  constructor(store, {online = async () => true, everyMs = 30000} = {}) {
    this.everyMs = everyMs;
    this.last = 0;
    this.busy = false;
    this.store = store;
    this.db = store.db;
    this.online = online;
    this.kinds = [];
    this.db.exec('CREATE TABLE IF NOT EXISTS net_retries(kind TEXT NOT NULL, job_id TEXT NOT NULL, tries INTEGER NOT NULL, last_at TEXT NOT NULL, last_error TEXT, PRIMARY KEY(kind, job_id))');
  }
  // kind: a name; table: its jobs (status, error, updated_at); label: what the job is, in words; retry(row): the room's
  // own retry for that row; where: an extra SQL condition (for a table shared by several kinds of job).
  add(kind, {table, label, retry, statuses = ['failed', 'interrupted'], where = ''}) {
    this.kinds.push({kind, table, label, retry, statuses, where});
    return this;
  }
  // The jobs that lost their connection and will be tried again by the program (for the page's "Working now" strip).
  waiting(at = Date.now()) {
    const out = [];
    for (const item of this.kinds) {
      let rows = [];
      try { rows = this.rows(item, at); } catch { continue; }
      for (const row of rows) out.push({kind: item.kind, label: item.label, jobId: row.id, tries: this.tries(item.kind, row.id), max: MAX, error: String(row.error).slice(0, 300), contentId: row.content_id || null});
    }
    return out;
  }
  rows(item, at) {
    const since = new Date(at - WINDOW_MS).toISOString(), marks = item.statuses.map(() => '?').join(',');
    const hasContent = this.db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name=?').get(item.table, 'content_id');
    return this.db.prepare(`SELECT id, status, error, updated_at${hasContent ? ', content_id' : ''} FROM ${item.table} WHERE status IN (${marks}) AND error IS NOT NULL AND updated_at >= ?${item.where ? ` AND ${item.where}` : ''} ORDER BY updated_at`).all(...item.statuses, since)
      .filter(row => NETWORK.test(row.error) && this.tries(item.kind, row.id) < MAX);
  }
  tries(kind, id) { return this.db.prepare('SELECT tries FROM net_retries WHERE kind=? AND job_id=?').get(kind, id)?.tries || 0; }
  // One check: when the connection is back, every job that stopped for it is tried again once.
  async tick(at = Date.now()) {
    if (this.busy || at - this.last < this.everyMs) return [];
    this.last = at;
    this.busy = true;
    try { return await this.retryAll(at); } finally { this.busy = false; }
  }
  async retryAll(at) {
    const waiting = this.waiting(at);
    if (!waiting.length || await this.online() === false) return [];
    const done = [];
    for (const item of this.kinds) {
      let rows = [];
      try { rows = this.rows(item, at); } catch { continue; }
      for (const row of rows) {
        const tries = this.tries(item.kind, row.id) + 1, when = new Date(at).toISOString();
        let error = null;
        try { item.retry(row); } catch (failure) { error = String(failure?.message || failure).slice(0, 300); }
        this.db.prepare('INSERT INTO net_retries(kind,job_id,tries,last_at,last_error) VALUES(?,?,?,?,?) ON CONFLICT(kind,job_id) DO UPDATE SET tries=excluded.tries, last_at=excluded.last_at, last_error=excluded.last_error').run(item.kind, row.id, error ? MAX : tries, when, error);
        if (!error) { this.store.event(`The internet is back: ${item.label} tried again by the program itself (try ${tries} of ${MAX})`); done.push({kind: item.kind, jobId: row.id}); }
      }
    }
    return done;
  }
}

module.exports = {NetRetry, NETWORK, MAX};
