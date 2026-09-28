'use strict';

const { route, send, readJson, query, HttpError } = require('./_lib/http');
const auth = require('./_lib/auth');
const sync = require('./_lib/sync');
const music = require('./_lib/music');

// Daftar yang ditambahkan belakangan → versi klien pertama yang mengenalnya.
const NEWER_LISTS = [['template:', 8], ['project:', 9], ['ibadah:', 10], ['case:', 11], ['workNote:', 11], ['run:', 12], ['runx:', 13], ['coach:', 13], ['coachbin:', 14], ['savedroute:', 15]];

function sinceOf(value) {
  const n = Number(value || 0);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'Nilai revisi tidak valid.', 'bad_since');
  return n;
}

/**
 * Pustaka musik akun (lagu yang diimpor, disimpan di database server):
 * GET  /api/sync?music=list                → {tracks, used, limit}
 * GET  /api/sync?music=chunk&id=…&i=N      → potongan audio (biner)
 * POST /api/sync?music=1 {action: begin|chunk|finish|delete, …}
 */
async function musicGet(req, res, q) {
  const ctx = await auth.authenticate(req);
  if (q.get('music') === 'chunk') {
    const bytes = await music.getChunk(ctx, q.get('id'), q.get('i'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(bytes);
    return;
  }
  send(res, 200, await music.list(ctx));
}

async function musicPost(req, res) {
  const ctx = await auth.authenticate(req);
  const body = await readJson(req, { maxBytes: 1024 * 1024 });
  const fn = { begin: music.begin, chunk: music.putChunk, finish: music.finish, delete: music.remove }[body.action];
  if (!fn) throw new HttpError(400, 'Aksi musik tidak dikenal.', 'bad_action');
  send(res, 200, await fn(ctx, body));
}

/**
 * GET  /api/sync?since=N           → {rev, changes}
 * POST /api/sync {since, changes}   → {rev, written, changes}
 */
module.exports = route({
  GET: async (req, res) => {
    const q = query(req);
    if (q.has('music')) {
      await musicGet(req, res, q);
      return;
    }
    const since = sinceOf(q.get('since'));
    const { store, userId, rev } = await auth.authPoll(req);
    if (rev <= since) {
      send(res, 200, { rev, changes: {} });
      return;
    }
    send(res, 200, await sync.pull(store, userId, since));
  },
  POST: async (req, res) => {
    if (query(req).has('music')) {
      await musicPost(req, res);
      return;
    }
    const ctx = await auth.authenticate(req);
    const body = await readJson(req);
    const since = sinceOf(body.since);
    const entries = sync.validateChanges(body.changes);
    // Aplikasi versi lama (tab yang belum dimuat ulang) belum mengenal daftar yang lebih baru
    // dan akan mengira isinya terhapus. Penghapusannya hanya diterima dari klien yang mengenalnya.
    const client = Number(req.headers['x-client-version'] || 0);
    const allowed = entries.filter((e) => !(e.d && NEWER_LISTS.some(([prefix, since]) => client < since && e.k.startsWith(prefix))));
    const { written } = await sync.push(ctx.store, ctx.user.id, allowed);
    const done = new Set(written);
    const rejected = entries.filter((e) => !done.has(e.k)).map((e) => e.k);
    const result = await sync.pull(ctx.store, ctx.user.id, since, rejected);
    send(res, 200, { rev: result.rev, written, rejected, changes: result.changes });
  },
});
