// Uji MODE PRIBADI: middleware gerbang + pembatasan email, lewat server dev.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SYNC_STORE = 'memory';
process.env.ALLOWED_EMAILS = 'Pemilik@Contoh.id, kedua@contoh.id';
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

const page = (p, cookie) => fetch(base + p, {
  redirect: 'manual',
  headers: { Accept: 'text/html,application/xhtml+xml', ...(cookie ? { Cookie: cookie } : {}) },
});
async function api(p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + p, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie') };
}
const cookieOf = (setCookie) => setCookie.split(';')[0];

test('tanpa sesi: halaman dialihkan ke halaman masuk, berkas lain ditolak', async () => {
  const home = await page('/');
  assert.equal(home.status, 307);
  assert.equal(home.headers.get('location'), '/masuk.html');
  assert.equal((await page('/index.html')).status, 307);
  const js = await fetch(`${base}/js/store.js`, { redirect: 'manual' });
  assert.equal(js.status, 401);
  for (const p of ['/masuk.html', '/js/gate.js', '/css/styles.css', '/icons/icon.svg', '/robots.txt']) {
    assert.equal((await page(p)).status, 200, p);
  }
});

test('health melaporkan mode pribadi', async () => {
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.private, true);
});

test('orang lain tidak bisa mendaftar atau masuk', async () => {
  const reg = await api('/api/register', { email: 'orang.lain@contoh.id', password: 'rahasia123' });
  assert.equal(reg.status, 403);
  assert.equal(reg.cookie, null);
  const login = await api('/api/login', { email: 'orang.lain@contoh.id', password: 'rahasia123' });
  assert.equal(login.status, 401);
});

test('pemilik mendaftar → cookie HttpOnly membuka aplikasi; keluar menutupnya lagi', async () => {
  const reg = await api('/api/register', { email: 'pemilik@contoh.id', password: 'rahasia123' });
  assert.equal(reg.status, 201);
  assert.match(reg.cookie, /^rh_session=[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
  const cookie = cookieOf(reg.cookie);
  const home = await page('/', cookie);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<title>Rencana Harian<\/title>/);
  assert.equal((await fetch(`${base}/js/store.js`, { headers: { Cookie: cookie } })).status, 200);

  const out = await api('/api/logout', {}, reg.data.token);
  assert.match(out.cookie, /Max-Age=0/);
  assert.equal((await page('/', cookie)).status, 307, 'cookie lama tidak berlaku setelah keluar');
});

test('kode perangkat untuk pemilik juga memasang cookie', async () => {
  const login = await api('/api/login', { email: 'PEMILIK@contoh.id', password: 'rahasia123' });
  assert.equal(login.status, 200);
  const pair = await api('/api/pair', {}, login.data.token);
  const claim = await api('/api/pair', { code: pair.data.code });
  assert.equal(claim.status, 200);
  assert.equal((await page('/', cookieOf(claim.cookie))).status, 200);
});

test('cookie palsu ditolak', async () => {
  assert.equal((await page('/', 'rh_session=' + 'a'.repeat(43))).status, 307);
  assert.equal((await page('/', 'rh_session=<script>')).status, 307);
});

test('fungsi pembantu middleware', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.js'), 'utf8');
  const mw = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
  assert.equal(mw.readCookie('a=1; rh_session=abc; b=2', 'rh_session'), 'abc');
  assert.equal(mw.readCookie('', 'rh_session'), null);
  assert.equal(mw.isPublic('/api/sync'), true);
  assert.equal(mw.isPublic('/masuk.html'), true);
  assert.equal(mw.isPublic('/js/app.js'), false);
  assert.equal(mw.isPrivate({ ALLOWED_EMAILS: ' ' }), false);
  assert.equal(mw.isPrivate({ ALLOWED_EMAILS: 'a@b.id' }), true);
  assert.equal(mw.isPrivate({ LOGIN_USERNAME: 'pemilik' }), true);
  assert.equal(await mw.fetchSession('x'.repeat(40), {}), null, 'tanpa Redis: gagal tertutup');
  assert.equal(await mw.sessionAllowed(null, {}), false);
  assert.equal(await mw.sessionAllowed('bukan json', {}), false);
  assert.equal(await mw.sessionAllowed('{"at":1}', {}), false, 'tanpa id pengguna');
  assert.equal(await mw.sessionAllowed('{"u":"abc"}', {}), true);
  assert.deepEqual(mw.config, { matcher: ['/((?!api/).*)'] });
});
