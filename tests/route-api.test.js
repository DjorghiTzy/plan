// Uji API saran rute (POST /api/coach aksi "route") lewat server dev, dengan mesin rute tiruan.
// Tanpa kunci Gemini: pencarian rute tidak bergantung pada coach AI.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SYNC_STORE = 'memory';
process.env.ROUTE_DAILY_LIMIT = '4';
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const { resetStore } = require('../api/_lib/store');
const routes = require('../api/_lib/routes');
const { createFakeClient } = require('../scripts/routing-fake');
const { createServer } = require('../scripts/dev-server');

let router = () => createFakeClient();
let server;
let base;
test.before(async () => {
  resetStore();
  routes.setRouterFactory(() => router());
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  routes.setRouterFactory(null);
  server.close();
});

let seq = 0;
async function newToken() {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.8.0.${(seq += 1)}` },
    body: JSON.stringify({ email: `rute${seq}.${Date.now()}@contoh.id`, password: 'rahasia123' }),
  });
  return (await res.json()).token;
}
const post = async (token, body) => {
  const res = await fetch(`${base}/api/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action: 'route', ...body }),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const HERE = { lat: -2.1291, lng: 106.1135 };

test('perlu masuk akun', async () => {
  const r = await post(null, { ...HERE, km: 5 });
  assert.equal(r.status, 401);
});

test('rute 5 km: selisih maks. 300 m, siap untuk Google Maps', async () => {
  const token = await newToken();
  const r = await post(token, { ...HERE, km: 5, seed: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.data.target, 5000);
  assert.equal(r.data.tolerance, 300);
  assert.equal(r.data.withinTolerance, true);
  assert.ok(r.data.routes.length >= 1);
  for (const x of r.data.routes) {
    assert.ok(Math.abs(x.distance - 5000) <= 300, `${x.distance} m`);
    assert.equal(x.waypoints.length, 3);
    assert.ok(x.coords.length >= 4);
  }
  assert.equal(r.data.remaining, 3);
});

test('masukan tidak valid & galat mesin rute', async () => {
  const token = await newToken();
  assert.equal((await post(token, { lat: 95, lng: 106, km: 5 })).data.code, 'bad_location');
  assert.equal((await post(token, { ...HERE, km: 0.2 })).data.code, 'bad_distance');
  assert.equal((await post(token, { ...HERE, km: 50 })).status, 400);
  const failing = (err) => () => ({ table: async () => { throw err; }, route: async () => { throw err; } });
  router = failing(new routes.RouteError(422, 'Titik mulai terlalu jauh dari jalan.', 'far_from_road'));
  const far = await post(token, { ...HERE, km: 5 });
  assert.equal(far.status, 422);
  assert.equal(far.data.code, 'far_from_road');
  router = failing(new Error('tak terduga'));
  const odd = await post(token, { ...HERE, km: 5 });
  assert.equal(odd.status, 502);
  assert.equal(odd.data.code, 'route_unavailable');
  router = () => createFakeClient();
});

test('batas harian pencarian per akun', async () => {
  const token = await newToken();
  for (let i = 0; i < 4; i += 1) assert.equal((await post(token, { ...HERE, km: 3 })).status, 200);
  const over = await post(token, { ...HERE, km: 3 });
  assert.equal(over.status, 429);
  assert.equal(over.data.code, 'route_quota');
});
