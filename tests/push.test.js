// Pengingat per jam lewat Web Push: kunci VAPID, JWT, jam aktif, pengiriman sekali per jam, API.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.SYNC_STORE = 'memory';
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.LOGIN_USERNAME;
delete process.env.ALLOWED_EMAILS;
delete process.env.CRON_SECRET;
delete process.env.REMINDER_SECRET;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

const push = require('../api/_lib/push');
const { memory, resetStore } = require('../api/_lib/store');
const { createServer } = require('../scripts/dev-server');

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';
const sub = (endpoint = FCM) => ({ endpoint, keys: { p256dh: 'BPx', auth: 'xyz' } });
// 2026-09-25 03:00 UTC = 10:00 WIB
const T10 = Date.UTC(2026, 8, 25, 3, 0, 20);
const HOUR = 3600 * 1000;

function publicKeyObject(b64) {
  const raw = Buffer.from(b64, 'base64url');
  return crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
}

function verifyJwt(jwt, pub) {
  const [h, p, s] = jwt.split('.');
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKeyObject(pub), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return { ok, header: JSON.parse(Buffer.from(h, 'base64url')), payload: JSON.parse(Buffer.from(p, 'base64url')) };
}

function fakeFetch(status = 201) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { status };
  };
  fn.calls = calls;
  return fn;
}

test('kunci VAPID & JWT ES256 yang bisa diverifikasi', async () => {
  const keys = push.generateVapidKeys();
  assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);
  assert.equal(Buffer.from(keys.privateKey, 'base64url').length, 32);
  const jwt = push.vapidJwt('https://fcm.googleapis.com', keys, 'mailto:uji@contoh.id', T10);
  const { ok, header, payload } = verifyJwt(jwt, keys.publicKey);
  assert.equal(ok, true);
  assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
  assert.equal(payload.aud, 'https://fcm.googleapis.com');
  assert.equal(payload.sub, 'mailto:uji@contoh.id');
  assert.equal(payload.exp, Math.floor(T10 / 1000) + 12 * 3600);

  const store = memory();
  const a = await push.vapidKeys(store);
  const b = await push.vapidKeys(store);
  assert.deepEqual(a, b, 'kunci dibuat sekali lalu dipakai ulang');
});

test('jam lokal & rentang jam aktif', () => {
  assert.deepEqual(push.localSlot('Asia/Jakarta', T10), { hour: 10, slot: '2026-09-25T10' });
  assert.equal(push.localSlot('Asia/Jayapura', T10).hour, 12);
  assert.equal(push.localSlot('Zona/Ngawur', T10).hour, 10, 'zona tidak valid → WIB');
  assert.equal(push.inWindow(7, 7, 21), true);
  assert.equal(push.inWindow(21, 7, 21), true);
  assert.equal(push.inWindow(22, 7, 21), false);
  assert.equal(push.inWindow(6, 7, 21), false);
  assert.equal(push.inWindow(23, 20, 2), true, 'melewati tengah malam');
  assert.equal(push.inWindow(1, 20, 2), true);
  assert.equal(push.inWindow(12, 20, 2), false);
});

test('hanya layanan push resmi yang diterima', () => {
  assert.throws(() => push.cleanSubscription({ endpoint: 'http://fcm.googleapis.com/x' }), /tidak dikenali/);
  assert.throws(() => push.cleanSubscription({ endpoint: 'https://contoh.id/x' }), /tidak dikenali/);
  assert.throws(() => push.cleanSubscription({ endpoint: 'https://fcm.googleapis.com.jahat.id/x' }), /tidak dikenali/);
  assert.throws(() => push.cleanSubscription({}), /tidak valid/);
  for (const ok of [FCM, 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/abc', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
    assert.equal(push.cleanSubscription({ endpoint: ok }).endpoint, ok);
  }
});

test('satu pengingat per jam di jam aktif; di luar jam aktif dilewati', async () => {
  const store = memory();
  await push.saveSubscription(store, 'u1', { subscription: sub(), from: 7, to: 21, tz: 'Asia/Jakarta' });
  const f = fakeFetch(201);

  let r = await push.tick(store, { now: T10, fetchImpl: f });
  assert.deepEqual([r.sent, r.skipped], [1, 0]);
  const { init, url } = f.calls[0];
  assert.equal(url, FCM);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.TTL, '1800');
  assert.equal(init.headers.Topic, 'pengingat-jam');
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(init.headers.Authorization);
  assert.ok(m, 'header Authorization VAPID');
  const v = verifyJwt(m[1], m[2]);
  assert.equal(v.ok, true);
  assert.equal(v.payload.aud, 'https://fcm.googleapis.com');

  r = await push.tick(store, { now: T10 + 20 * 60 * 1000, fetchImpl: f });
  assert.deepEqual([r.sent, r.skipped], [0, 1], 'jam yang sama tidak dikirim dua kali');
  r = await push.tick(store, { now: T10 + HOUR, fetchImpl: f });
  assert.equal(r.sent, 1, 'jam berikutnya dikirim lagi');
  r = await push.tick(store, { now: T10 + 13 * HOUR, fetchImpl: f }); // 23.00 WIB
  assert.deepEqual([r.sent, r.skipped], [0, 1]);
  assert.equal(await push.lastTick(store), T10 + 13 * HOUR);

  r = await push.tick(store, { now: T10 + 13 * HOUR, userId: 'u1', force: true, fetchImpl: f });
  assert.equal(r.sent, 1, 'tes mengabaikan jam aktif');
});

test('langganan kedaluwarsa (410) dihapus; pindah akun memindah kepemilikan', async () => {
  const store = memory();
  await push.saveSubscription(store, 'u1', { subscription: sub(), from: 0, to: 23 });
  await push.saveSubscription(store, 'u2', { subscription: sub(), from: 0, to: 23 });
  assert.deepEqual(await store.smembers(push.KEYS.user('u1')), []);
  assert.equal((await store.smembers(push.KEYS.user('u2'))).length, 1);
  const r = await push.tick(store, { now: T10, fetchImpl: fakeFetch(410) });
  assert.equal(r.removed, 1);
  assert.deepEqual(await store.smembers(push.KEYS.all), []);
  assert.deepEqual(await store.smembers(push.KEYS.user('u2')), []);
});

test('API: langganan, tes, penjadwal, berhenti berlangganan', async () => {
  resetStore();
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  const pushed = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://fcm.googleapis.com/')) {
      pushed.push(url);
      return new Response(null, { status: 201 });
    }
    return realFetch(url, init);
  };
  const api = async (p, { method = 'GET', body, token, headers = {} } = {}) => {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await realFetch(base + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    const info = await api('/api/push');
    assert.equal(info.data.available, true);
    assert.equal(Buffer.from(info.data.publicKey, 'base64url').length, 65);
    assert.equal(info.data.lastTick, null);

    assert.equal((await api('/api/push', { method: 'POST', body: { subscription: sub() } })).status, 401);
    const reg = await api('/api/register', { method: 'POST', body: { email: 'push@contoh.id', password: 'rahasia123' } });
    const token = reg.data.token;

    const bad = await api('/api/push', { method: 'POST', token, body: { subscription: sub('https://contoh.id/x') } });
    assert.equal(bad.status, 400);
    const ok = await api('/api/push', { method: 'POST', token, body: { subscription: sub(), from: 0, to: 23, tz: 'Asia/Jakarta' } });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.data.from, ok.data.to, ok.data.tz], [0, 23, 'Asia/Jakarta']);
    assert.equal((await api('/api/push', { token })).data.devices, 1);

    const t = await api('/api/push', { method: 'POST', token, body: { test: true } });
    assert.equal(t.data.sent, 1);
    assert.equal(pushed.length, 1);

    const tick = await api('/api/remind');
    assert.equal(tick.status, 200);
    assert.equal(tick.data.sent, 1);
    const again = await api('/api/remind', { method: 'POST' });
    assert.equal(again.data.skipped, 'baru saja dijalankan', 'panggilan beruntun hanya dijalankan sekali');
    assert.ok((await api('/api/push')).data.lastTick > 0);

    process.env.CRON_SECRET = 'rahasia-cron';
    assert.equal((await api('/api/remind')).status, 401);
    assert.equal((await api('/api/remind?key=salah')).status, 401);
    assert.equal((await api('/api/remind', { headers: { Authorization: 'Bearer rahasia-cron' } })).status, 200);
    assert.equal((await api('/api/remind?key=rahasia-cron')).status, 200);
    delete process.env.CRON_SECRET;

    const del = await api('/api/push', { method: 'DELETE', token, body: { endpoint: FCM } });
    assert.equal(del.data.removed, true);
    assert.equal((await api('/api/push', { token })).data.devices, 0);

    // Hapus akun ikut menghapus langganan.
    await api('/api/push', { method: 'POST', token, body: { subscription: sub() } });
    assert.equal((await api('/api/account', { method: 'DELETE', token, body: { password: 'rahasia123' } })).status, 200);
    const { getStore } = require('../api/_lib/store');
    assert.deepEqual(await getStore().smembers(push.KEYS.all), []);
  } finally {
    globalThis.fetch = realFetch;
    server.close();
  }
});
