// Uji MODE AKUN PEMILIK: masuk dengan nama pengguna + kata sandi dari variabel lingkungan.
// Kredensial di sini hanya untuk uji; kredensial sungguhan hanya ada di Vercel.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SYNC_STORE = 'memory';
process.env.LOGIN_USERNAME = ' Pemilik ';
process.env.LOGIN_PASSWORD = 'uji-kata-sandi-panjang';
delete process.env.LOGIN_PASSWORD_HASH;
delete process.env.ALLOWED_EMAILS;
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const { resetStore, getStore } = require('../api/_lib/store');
const auth = require('../api/_lib/auth');
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

const page = (p, cookie) => fetch(base + p, {
  redirect: 'manual',
  headers: { Accept: 'text/html', ...(cookie ? { Cookie: cookie } : {}) },
});
async function api(p, body, token, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + p, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie') };
}
const cookieOf = (setCookie) => setCookie.split(';')[0];
const login = (username, password) => api('/api/login', { username, password, device: 'Uji' });

test('health melaporkan mode nama pengguna dan pribadi', async () => {
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.auth, 'username');
  assert.equal(h.private, true);
  assert.equal((await page('/')).status, 307, 'tanpa sesi dialihkan ke halaman masuk');
});

test('pendaftaran ditutup', async () => {
  const reg = await api('/api/register', { email: 'siapa@contoh.id', password: 'rahasia123' });
  assert.equal(reg.status, 403);
  assert.equal(reg.data.code, 'registration_closed');
  assert.equal(reg.cookie, null);
});

test('nama pengguna atau kata sandi salah ditolak dengan pesan yang sama', async () => {
  const wrongPw = await login('pemilik', 'bukan-ini-sandinya');
  const wrongName = await login('orang-lain', 'uji-kata-sandi-panjang');
  const email = await api('/api/login', { email: 'pemilik@contoh.id', password: 'uji-kata-sandi-panjang' });
  for (const r of [wrongPw, wrongName, email]) {
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'Nama pengguna atau kata sandi salah.');
    assert.equal(r.cookie, null);
  }
});

test('pemilik masuk → cookie membuka aplikasi; akun yang sama di setiap perangkat', async () => {
  const a = await login('Pemilik', 'uji-kata-sandi-panjang');
  assert.equal(a.status, 200);
  assert.equal(a.data.user.username, 'pemilik');
  assert.equal(a.data.user.pw, undefined);
  assert.match(a.cookie, /^rh_session=[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure/);
  assert.equal((await page('/', cookieOf(a.cookie))).status, 200);

  const b = await login('  PEMILIK ', 'uji-kata-sandi-panjang');
  assert.equal(b.status, 200);
  assert.equal(b.data.user.id, a.data.user.id, 'login kedua memakai akun data yang sama');

  // Data dari perangkat A terlihat di perangkat B.
  const put = await api('/api/sync', { since: 0, changes: { 'task:x': { t: Date.now(), v: { id: 'x', title: 'Uji' } } } }, a.data.token);
  assert.equal(put.status, 200);
  const got = await api('/api/sync?since=0', null, b.data.token, 'GET');
  assert.equal(got.status, 200);
  assert.equal(got.data.changes['task:x'].v.title, 'Uji');

  const me = await api('/api/me', null, b.data.token, 'GET');
  assert.equal(me.data.user.username, 'pemilik');
});

test('kode perangkat untuk akun pemilik memasang cookie', async () => {
  const a = await login('pemilik', 'uji-kata-sandi-panjang');
  const pair = await api('/api/pair', {}, a.data.token);
  const claim = await api('/api/pair', { code: pair.data.code });
  assert.equal(claim.status, 200);
  assert.equal(claim.data.user.username, 'pemilik');
  assert.equal((await page('/', cookieOf(claim.cookie))).status, 200);
});

test('sesi akun lain (mis. akun email lama) tidak bisa membuka aplikasi atau sinkron', async () => {
  const store = getStore();
  await store.set('u:lama', JSON.stringify({ id: 'lama', email: 'lama@contoh.id', createdAt: '' }));
  const token = 'L'.repeat(43);
  const hash = require('node:crypto').createHash('sha256').update(token).digest('hex');
  await store.set(`sess:${hash}`, JSON.stringify({ u: 'lama', at: Date.now() }), { ex: 600 });
  assert.equal((await page('/', `rh_session=${token}`)).status, 307);
  assert.equal((await api('/api/me', null, token, 'GET')).status, 401);
  assert.equal((await api('/api/sync?since=0', null, token, 'GET')).status, 401);
});

test('LOGIN_PASSWORD_HASH didahulukan daripada LOGIN_PASSWORD', async () => {
  process.env.LOGIN_PASSWORD_HASH = await auth.hashPassword('sandi-dari-hash-123');
  try {
    assert.equal((await login('pemilik', 'uji-kata-sandi-panjang')).status, 401);
    assert.equal((await login('pemilik', 'sandi-dari-hash-123')).status, 200);
  } finally {
    delete process.env.LOGIN_PASSWORD_HASH;
  }
});

test('hapus akun memakai kata sandi pemilik', async () => {
  const a = await login('pemilik', 'uji-kata-sandi-panjang');
  const bad = await api('/api/account', { password: 'salah-salah' }, a.data.token, 'DELETE');
  assert.equal(bad.status, 403);
  const ok = await api('/api/account', { password: 'uji-kata-sandi-panjang' }, a.data.token, 'DELETE');
  assert.equal(ok.status, 200);
  const again = await login('pemilik', 'uji-kata-sandi-panjang');
  assert.equal(again.status, 200);
  assert.notEqual(again.data.user.id, a.data.user.id, 'setelah dihapus, masuk lagi membuat akun kosong baru');
});

test('mengganti kata sandi mengeluarkan semua perangkat', async () => {
  const a = await login('pemilik', 'uji-kata-sandi-panjang');
  const cookie = cookieOf(a.cookie);
  assert.equal((await page('/', cookie)).status, 200);
  process.env.LOGIN_PASSWORD = 'kata-sandi-baru-456';
  try {
    assert.equal((await page('/', cookie)).status, 307, 'halaman terkunci lagi');
    assert.equal((await api('/api/me', null, a.data.token, 'GET')).status, 401);
    assert.equal((await api('/api/sync?since=0', null, a.data.token, 'GET')).status, 401);
    const b = await login('pemilik', 'kata-sandi-baru-456');
    assert.equal(b.status, 200);
    assert.equal(b.data.user.id, a.data.user.id, 'data akun tetap sama');
    assert.equal((await page('/', cookieOf(b.cookie))).status, 200);
  } finally {
    process.env.LOGIN_PASSWORD = 'uji-kata-sandi-panjang';
  }
});

test('middleware menghitung sidik kredensial yang sama dengan server', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.js'), 'utf8');
  const mw = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
  const owner = auth.ownerLogin();
  assert.equal(await mw.ownerKey(process.env), owner.key);
  const env = { LOGIN_USERNAME: ' Pemilik ', LOGIN_PASSWORD: 'uji-kata-sandi-panjang' };
  const sess = (o) => JSON.stringify({ u: 'a', ...o });
  assert.equal(await mw.sessionAllowed(sess({ n: 'pemilik', k: owner.key }), env), true);
  assert.equal(await mw.sessionAllowed(sess({ n: 'lain', k: owner.key }), env), false);
  assert.equal(await mw.sessionAllowed(sess({ n: 'pemilik', k: 'kunci-lama' }), env), false);
  assert.equal(await mw.sessionAllowed(sess({}), env), false);
  const hashed = { ...env, LOGIN_PASSWORD_HASH: 'scrypt$x' };
  assert.notEqual(await mw.ownerKey(hashed), owner.key, 'hash didahulukan');
});
