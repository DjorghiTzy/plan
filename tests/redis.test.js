// Uji adapter Upstash terhadap redis-server sungguhan lewat tiruan REST API Upstash.
// Dilewati otomatis bila redis-server tidak terpasang.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const hasRedis = spawnSync('redis-server', ['--version']).status === 0;
const opts = { skip: hasRedis ? false : 'redis-server tidak tersedia' };

/** Klien RESP minimal. */
function respClient(port) {
  const sock = net.connect(port, '127.0.0.1');
  let buf = Buffer.alloc(0);
  const waiting = [];

  function parse(i) {
    if (i >= buf.length) return null;
    const type = String.fromCharCode(buf[i]);
    const end = buf.indexOf('\r\n', i);
    if (end < 0) return null;
    const line = buf.toString('utf8', i + 1, end);
    if (type === '+') return { value: line, next: end + 2 };
    if (type === '-') return { value: { error: line }, next: end + 2 };
    if (type === ':') return { value: Number(line), next: end + 2 };
    if (type === '$') {
      const len = Number(line);
      if (len < 0) return { value: null, next: end + 2 };
      if (buf.length < end + 2 + len + 2) return null;
      return { value: buf.toString('utf8', end + 2, end + 2 + len), next: end + 2 + len + 2 };
    }
    if (type === '*') {
      const n = Number(line);
      if (n < 0) return { value: null, next: end + 2 };
      const arr = [];
      let at = end + 2;
      for (let k = 0; k < n; k += 1) {
        const item = parse(at);
        if (!item) return null;
        arr.push(item.value);
        at = item.next;
      }
      return { value: arr, next: at };
    }
    throw new Error(`RESP tidak dikenal: ${type}`);
  }

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const r = parse(0);
      if (!r) break;
      buf = buf.subarray(r.next);
      waiting.shift()(r.value);
    }
  });

  return {
    send(args) {
      const parts = [`*${args.length}\r\n`];
      for (const a of args) {
        const s = String(a);
        parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`);
      }
      sock.write(parts.join(''));
      return new Promise((resolve) => waiting.push(resolve));
    },
    close: () => sock.destroy(),
  };
}

/** Tiruan REST Upstash: POST / (satu perintah) dan POST /pipeline. */
function upstashShim(client, token) {
  const wrap = (v) => (v && typeof v === 'object' && !Array.isArray(v) && v.error ? { error: v.error } : { result: v });
  return http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || 'null');
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    if (req.url === '/pipeline') {
      const out = [];
      for (const cmd of body) out.push(wrap(await client.send(cmd)));
      res.end(JSON.stringify(out));
      return;
    }
    const r = wrap(await client.send(body));
    if (r.error) res.statusCode = 400;
    res.end(JSON.stringify(r));
  });
}

let redis;
let client;
let shim;
let url;

test.before(async () => {
  if (!hasRedis) return;
  const port = 20000 + Math.floor(Math.random() * 20000);
  redis = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    await new Promise((r) => setTimeout(r, 100));
    const probe = spawnSync('redis-cli', ['-p', String(port), 'ping']);
    if (String(probe.stdout).trim() === 'PONG') break;
  }
  client = respClient(port);
  shim = upstashShim(client, 'rahasia');
  await new Promise((r) => shim.listen(0, r));
  url = `http://127.0.0.1:${shim.address().port}`;
});

test.after(() => {
  if (!hasRedis) return;
  client.close();
  shim.close();
  redis.kill();
});

test('adapter Upstash: perintah dasar', opts, async () => {
  const { upstash } = require('../api/_lib/store');
  const s = upstash(`${url}/`, 'rahasia');
  assert.equal(await s.set('a', '1', { nx: true }), true);
  assert.equal(await s.set('a', '2', { nx: true }), false);
  assert.equal(await s.get('a'), '1');
  assert.equal(await s.getdel('a'), '1');
  assert.equal(await s.get('a'), null);
  assert.equal(await s.hit('rl', 60), 1);
  assert.equal(await s.hit('rl', 60), 2);
  await s.sadd('set', 'x');
  assert.deepEqual(await s.smembers('set'), ['x']);
  await s.srem('set', 'x');
  assert.deepEqual(await s.smembers('set'), []);
  assert.equal(await s.rev('tidak-ada'), 0);
});

test('adapter Upstash: merge Lua atomik dengan yang terbaru menang', opts, async () => {
  const { upstash } = require('../api/_lib/store');
  const s = upstash(url, 'rahasia');
  const keys = { doc: 'd:u1', ts: 'dt:u1', rev: 'dr:u1' };
  const now = Date.now();
  const r1 = await s.merge(keys, [
    { k: 'task:a', t: now, d: false, payload: JSON.stringify({ title: 'A', subtasks: [], tags: {} }) },
    { k: 'water:2026-09-24', t: now, d: false, payload: '5' },
  ]);
  assert.equal(r1.rev, 1);
  assert.deepEqual(r1.written.sort(), ['task:a', 'water:2026-09-24']);
  const r2 = await s.merge(keys, [
    { k: 'task:a', t: now - 5, d: false, payload: JSON.stringify({ title: 'lama' }) },
    { k: 'task:b', t: now, d: true, payload: 'null' },
  ]);
  assert.deepEqual(r2.written, ['task:b']);
  const doc = await s.hgetall(keys.doc);
  const a = JSON.parse(doc['task:a']);
  assert.deepEqual(a.v, { title: 'A', subtasks: [], tags: {} }, 'nilai utuh, larik kosong tetap larik');
  assert.equal(a.t, now, 'stempel waktu 13 digit tidak berubah jadi notasi ilmiah');
  assert.equal(a.r, 1);
  assert.equal(JSON.parse(doc['task:b']).d, true);
  assert.equal(await s.rev(keys.rev), 2);
});

test('adapter Upstash: poll sesi + revisi dalam satu perintah', opts, async () => {
  const { upstash } = require('../api/_lib/store');
  const s = upstash(url, 'rahasia');
  await s.set('sess:abc', JSON.stringify({ u: 'u1', at: 1 }));
  assert.deepEqual(await s.poll('sess:abc'), { userId: 'u1', rev: 2, username: null, key: null });
  await s.set('sess:pemilik', JSON.stringify({ u: 'u1', n: 'pemilik', k: 'ab12', at: 1 }));
  assert.deepEqual(await s.poll('sess:pemilik'), { userId: 'u1', rev: 2, username: 'pemilik', key: 'ab12' });
  await s.set('sess:tanpa-nama', JSON.stringify({ u: 'u1', k: 'ab12', at: 1 }));
  assert.deepEqual(await s.poll('sess:tanpa-nama'), { userId: 'u1', rev: 2, username: null, key: 'ab12' });
  assert.deepEqual(await s.poll('sess:tidak-ada'), { userId: null, rev: 0, username: null, key: null });
});

test('API penuh di atas Redis', opts, async () => {
  process.env.KV_REST_API_URL = url;
  process.env.KV_REST_API_TOKEN = 'rahasia';
  const store = require('../api/_lib/store');
  store.resetStore();
  const { createServer } = require('../scripts/dev-server');
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  try {
    assert.equal((await call('/api/health')).data.storage, 'redis');
    const reg = await call('/api/register', { method: 'POST', body: { email: 'redis@contoh.id', password: 'rahasia123' } });
    assert.equal(reg.status, 201);
    const token = reg.data.token;
    const push = await call('/api/sync', { method: 'POST', token, body: { since: 0, changes: { 'settings:name': { v: 'Sari', t: Date.now() } } } });
    assert.deepEqual(push.data.written, ['settings:name']);
    const login = await call('/api/login', { method: 'POST', body: { email: 'redis@contoh.id', password: 'rahasia123' } });
    const pulled = await call('/api/sync?since=0', { token: login.data.token });
    assert.equal(pulled.data.changes['settings:name'].v, 'Sari');
    const pair = await call('/api/pair', { method: 'POST', token, body: {} });
    const claim = await call('/api/pair', { method: 'POST', body: { code: pair.data.code } });
    assert.equal(claim.status, 200);
    assert.equal((await call('/api/account', { method: 'DELETE', token, body: { password: 'rahasia123' } })).status, 200);
    assert.equal((await call('/api/me', { token: claim.data.token })).status, 401);
  } finally {
    server.close();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    store.resetStore();
  }
});

test('akun pemilik di atas Redis: gerbang middleware membaca sesi lewat REST Upstash', opts, async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.js'), 'utf8');
  const mw = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
  const env = { KV_REST_API_URL: url, KV_REST_API_TOKEN: 'rahasia', LOGIN_USERNAME: 'pemilik', LOGIN_PASSWORD: 'sandi-uji-redis' };
  Object.assign(process.env, env);
  const store = require('../api/_lib/store');
  store.resetStore();
  const auth = require('../api/_lib/auth');
  try {
    const req = { headers: { 'x-forwarded-for': '10.0.0.9' }, socket: {} };
    const { token } = await auth.login({ username: 'Pemilik', password: 'sandi-uji-redis' }, req);
    const raw = await mw.fetchSession(token, env);
    assert.equal(JSON.parse(raw).n, 'pemilik');
    assert.equal(await mw.sessionAllowed(raw, env), true);
    assert.equal(await mw.sessionAllowed(raw, { ...env, LOGIN_PASSWORD: 'sandi-lain-123' }), false);
    assert.equal(await mw.fetchSession('t'.repeat(43), env), null);
    assert.equal(await mw.fetchSession(token, { ...env, KV_REST_API_TOKEN: 'salah' }), null, 'token REST salah: gagal tertutup');
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    store.resetStore();
  }
});

test('pengingat per jam di atas Redis: sekali per jam per perangkat', opts, async () => {
  const { upstash } = require('../api/_lib/store');
  const push = require('../api/_lib/push');
  const s = upstash(url, 'rahasia');
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    return { status: 201 };
  };
  const endpoint = 'https://fcm.googleapis.com/fcm/send/redis-uji';
  await push.saveSubscription(s, 'u-redis', { subscription: { endpoint, keys: {} }, from: 0, to: 23, tz: 'Asia/Jakarta' });
  const now = Date.UTC(2026, 8, 25, 3, 0, 0);
  const [a, b] = await Promise.all([push.tick(s, { now, fetchImpl }), push.tick(s, { now, fetchImpl })]);
  assert.equal(a.sent + b.sent, 1, 'dua pemanggilan bersamaan tetap satu notifikasi');
  assert.equal(calls.length, 1);
  const keys = await push.vapidKeys(s);
  assert.deepEqual(await push.vapidKeys(s), keys);
  await push.removeUser(s, 'u-redis');
  assert.deepEqual(await s.smembers(push.KEYS.all), []);
});
