'use strict';

const { route, send, readJson, query, HttpError } = require('./_lib/http');
const auth = require('./_lib/auth');
const sync = require('./_lib/sync');

function sinceOf(value) {
  const n = Number(value || 0);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'Nilai revisi tidak valid.', 'bad_since');
  return n;
}

/**
 * GET  /api/sync?since=N           → {rev, changes}
 * POST /api/sync {since, changes}   → {rev, written, changes}
 */
module.exports = route({
  GET: async (req, res) => {
    const since = sinceOf(query(req).get('since'));
    const { store, userId, rev } = await auth.authPoll(req);
    if (rev <= since) {
      send(res, 200, { rev, changes: {} });
      return;
    }
    send(res, 200, await sync.pull(store, userId, since));
  },
  POST: async (req, res) => {
    const ctx = await auth.authenticate(req);
    const body = await readJson(req);
    const since = sinceOf(body.since);
    const entries = sync.validateChanges(body.changes);
    // Aplikasi versi lama (tab yang belum dimuat ulang) belum mengenal template dan akan
    // mengira template terhapus. Penghapusan template hanya diterima dari klien v8+.
    const client = Number(req.headers['x-client-version'] || 0);
    const allowed = client >= 8 ? entries : entries.filter((e) => !(e.d && e.k.startsWith('template:')));
    const { written } = await sync.push(ctx.store, ctx.user.id, allowed);
    const done = new Set(written);
    const rejected = entries.filter((e) => !done.has(e.k)).map((e) => e.k);
    const result = await sync.pull(ctx.store, ctx.user.id, since, rejected);
    send(res, 200, { rev: result.rev, written, rejected, changes: result.changes });
  },
});
