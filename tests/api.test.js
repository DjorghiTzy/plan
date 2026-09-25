// Uji API sinkronisasi lewat server dev dengan penyimpanan memori.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SYNC_STORE = 'memory';
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const { resetStore } = require('../api/_lib/store');
const { createServer } = require('../scripts/dev-server');

let server;
let base;

test.before(async () => {
  resetStore();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function api(path, { method = 'GET', body, token, ip } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}

let seq = 0;
const email = () => `uji${(seq += 1)}.${Date.now()}@contoh.id`;

test('health melaporkan penyimpanan memori', async () => {
  const r = await api('/api/health');
  assert.deepEqual(r.data, { ok: true, sync: true, storage: 'memory', private: false, auth: 'email' });
});

test('daftar, masuk, dan me', async () => {
  const e = email();
  const reg = await api('/api/register', { method: 'POST', body: { email: e, password: 'rahasia123', name: 'Dimas' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.email, e);
  assert.equal(reg.data.user.pw, undefined, 'hash kata sandi tidak boleh bocor');
  const dup = await api('/api/register', { method: 'POST', body: { email: e.toUpperCase(), password: 'rahasia123' } });
  assert.equal(dup.status, 409);
  const bad = await api('/api/login', { method: 'POST', body: { email: e, password: 'salah-sekali' } });
  assert.equal(bad.status, 401);
  const ok = await api('/api/login', { method: 'POST', body: { email: e, password: 'rahasia123' } });
  assert.equal(ok.status, 200);
  const me = await api('/api/me', { token: ok.data.token });
  assert.equal(me.data.user.name, 'Dimas');
});

test('validasi input pendaftaran', async () => {
  assert.equal((await api('/api/register', { method: 'POST', body: { email: 'bukan-email', password: 'rahasia123' } })).status, 400);
  assert.equal((await api('/api/register', { method: 'POST', body: { email: email(), password: 'pendek' } })).status, 400);
  assert.equal((await api('/api/me')).status, 401);
  assert.equal((await api('/api/me', { token: 'x'.repeat(40) })).status, 401);
  assert.equal((await api('/api/sync', { method: 'PUT' })).status, 405);
});

test('sinkron dua perangkat: kirim, tarik, dan yang terbaru menang', async () => {
  const e = email();
  const a = (await api('/api/register', { method: 'POST', body: { email: e, password: 'rahasia123' } })).data.token;
  const b = (await api('/api/login', { method: 'POST', body: { email: e, password: 'rahasia123' } })).data.token;

  const p1 = await api('/api/sync', {
    method: 'POST', token: a,
    body: { since: 0, changes: { 'task:t1': { v: { id: 't1', title: 'Rapat', subtasks: [] }, t: 1000 } } },
  });
  assert.equal(p1.status, 200);
  assert.deepEqual(p1.data.written, ['task:t1']);
  assert.deepEqual(p1.data.changes['task:t1'].v.subtasks, [], 'larik kosong tetap larik');

  const pullB = await api('/api/sync?since=0', { token: b });
  assert.equal(pullB.data.changes['task:t1'].v.title, 'Rapat');
  const revB = pullB.data.rev;

  // B mengubah (lebih baru), A mengirim versi lama → A kalah dan menerima versi B.
  await api('/api/sync', { method: 'POST', token: b, body: { since: revB, changes: { 'task:t1': { v: { id: 't1', title: 'Rapat tim' }, t: 3000 } } } });
  const stale = await api('/api/sync', { method: 'POST', token: a, body: { since: p1.data.rev, changes: { 'task:t1': { v: { id: 't1', title: 'Rapat lama' }, t: 2000 } } } });
  assert.deepEqual(stale.data.rejected, ['task:t1']);
  assert.equal(stale.data.changes['task:t1'].v.title, 'Rapat tim');

  // Tanpa perubahan baru: jawaban kosong.
  const idle = await api(`/api/sync?since=${stale.data.rev}`, { token: b });
  assert.deepEqual(idle.data.changes, {});

  // Hapus (tombstone) ikut tersebar.
  const del = await api('/api/sync', { method: 'POST', token: a, body: { since: stale.data.rev, changes: { 'task:t1': { d: true, t: 4000 } } } });
  const after = await api(`/api/sync?since=${stale.data.rev}`, { token: b });
  assert.equal(after.data.changes['task:t1'].d, true);
  assert.equal(del.status, 200);
});

test('perubahan yang tidak valid ditolak', async () => {
  const token = (await api('/api/register', { method: 'POST', body: { email: email(), password: 'rahasia123' } })).data.token;
  const bad = await api('/api/sync', { method: 'POST', token, body: { since: 0, changes: { 'bukan kunci!': { v: 1, t: 1 } } } });
  assert.equal(bad.status, 400);
  const badSince = await api('/api/sync?since=-1', { token });
  assert.equal(badSince.status, 400);
  const many = {};
  for (let i = 0; i < 501; i += 1) many[`task:t${i}`] = { v: i, t: 1 };
  assert.equal((await api('/api/sync', { method: 'POST', token, body: { since: 0, changes: many } })).status, 413);
});

test('kode pasangan: sekali pakai', async () => {
  const token = (await api('/api/register', { method: 'POST', body: { email: email(), password: 'rahasia123' } })).data.token;
  const pair = await api('/api/pair', { method: 'POST', token, body: {} });
  assert.equal(pair.status, 201);
  assert.match(pair.data.code, /^[A-Z2-9]{8}$/);
  const pretty = `${pair.data.code.slice(0, 4)}-${pair.data.code.slice(4)}`.toLowerCase();
  const claim = await api('/api/pair', { method: 'POST', body: { code: pretty } });
  assert.equal(claim.status, 200);
  assert.ok(claim.data.token);
  const again = await api('/api/pair', { method: 'POST', body: { code: pair.data.code } });
  assert.equal(again.status, 404);
});

test('keluar mematikan sesi; hapus akun menghapus data', async () => {
  const e = email();
  const token = (await api('/api/register', { method: 'POST', body: { email: e, password: 'rahasia123' } })).data.token;
  const other = (await api('/api/login', { method: 'POST', body: { email: e, password: 'rahasia123' } })).data.token;
  await api('/api/logout', { method: 'POST', token });
  assert.equal((await api('/api/me', { token })).status, 401);
  assert.equal((await api('/api/account', { method: 'DELETE', token: other, body: { password: 'salah' } })).status, 403);
  assert.equal((await api('/api/account', { method: 'DELETE', token: other, body: { password: 'rahasia123' } })).status, 200);
  assert.equal((await api('/api/me', { token: other })).status, 401);
  assert.equal((await api('/api/login', { method: 'POST', body: { email: e, password: 'rahasia123' } })).status, 401);
});

test('percobaan masuk dibatasi', async () => {
  const e = email();
  await api('/api/register', { method: 'POST', body: { email: e, password: 'rahasia123' }, ip: '10.9.9.9' });
  let last;
  for (let i = 0; i < 11; i += 1) {
    last = await api('/api/login', { method: 'POST', body: { email: e, password: 'salah-terus' }, ip: `10.0.0.${i}` });
  }
  assert.equal(last.status, 429);
});

test('server dev tidak menyajikan kode server', async () => {
  const res = await fetch(`${base}/api/_lib/auth.js`);
  assert.equal(res.status, 404);
  const src = await fetch(`${base}/scripts/dev-server.js`);
  assert.equal(src.status, 404);
});

test('penghapusan proyek hanya diterima dari klien v9+', async () => {
  const e = email();
  const token = (await api('/api/register', { method: 'POST', body: { email: e, password: 'rahasia123' } })).data.token;
  const pj = { id: 'pj-1', name: 'Aplikasi v2', area: 'kerja', status: 'aktif' };
  await api('/api/sync', { method: 'POST', token, body: { since: 0, changes: { 'project:pj-1': { v: pj, t: 1000 } } } });
  const send = (version, t) => fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Client-Version': version },
    body: JSON.stringify({ since: 0, changes: { 'project:pj-1': { d: true, t } } }),
  }).then((r) => r.json());
  const v8 = await send('8', 2000);
  assert.deepEqual(v8.rejected, ['project:pj-1'], 'tab v8 belum mengenal proyek');
  assert.equal(v8.changes['project:pj-1'].v.name, 'Aplikasi v2');
  const v9 = await send('9', 3000);
  assert.deepEqual(v9.written, ['project:pj-1']);
});

test('penghapusan checklist sholat hanya diterima dari klien v10+', async () => {
  const token = (await api('/api/register', { method: 'POST', body: { email: email(), password: 'rahasia123' } })).data.token;
  await api('/api/sync', { method: 'POST', token, body: { since: 0, changes: { 'ibadah:2026-09-25': { v: ['subuh'], t: 1000 } } } });
  const send = (version, t) => fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Client-Version': version },
    body: JSON.stringify({ since: 0, changes: { 'ibadah:2026-09-25': { d: true, t } } }),
  }).then((r) => r.json());
  assert.deepEqual((await send('9', 2000)).rejected, ['ibadah:2026-09-25']);
  assert.deepEqual((await send('10', 3000)).written, ['ibadah:2026-09-25']);
});

test('penghapusan template dari aplikasi versi lama ditolak, dari v8 diterima', async () => {
  const e = email();
  const token = (await api('/api/register', { method: 'POST', body: { email: e, password: 'rahasia123' } })).data.token;
  const tpl = { id: 'tp-1', name: 'Pagi', tasks: [{ title: 'A' }] };
  const put = await api('/api/sync', { method: 'POST', token, body: { since: 0, changes: { 'template:tp-1': { v: tpl, t: 1000 } } } });
  assert.deepEqual(put.data.written, ['template:tp-1']);

  // Tab lama (tanpa header versi) mengira template terhapus.
  const old = await api('/api/sync', { method: 'POST', token, body: { since: 0, changes: { 'template:tp-1': { d: true, t: 2000 }, 'task:x': { v: { id: 'x', title: 'T' }, t: 2000 } } } });
  assert.deepEqual(old.data.written, ['task:x']);
  assert.deepEqual(old.data.rejected, ['template:tp-1']);
  assert.equal(old.data.changes['template:tp-1'].v.name, 'Pagi', 'versi server dikembalikan ke klien lama');

  const res = await fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Client-Version': '8' },
    body: JSON.stringify({ since: 0, changes: { 'template:tp-1': { d: true, t: 3000 } } }),
  });
  const now = await res.json();
  assert.deepEqual(now.written, ['template:tp-1'], 'klien v8 boleh menghapus');
  const pulled = await api('/api/sync?since=0', { token });
  assert.equal(pulled.data.changes['template:tp-1'].d, true);
});
