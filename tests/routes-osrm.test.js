// Klien OSRM sungguhan terhadap server OSRM tiruan lokal: format URL (lng,lat), header,
// batas permintaan bersamaan, ulang saat 429, dan pencarian rute penuh lewat HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createFakeRouter } = require('../scripts/routing-fake');

const seen = [];
let active = 0;
let maxActive = 0;
let mode = 'ok';
let mock;
let routes;
const grid = createFakeRouter();

test.before(async () => {
  mock = http.createServer(async (req, res) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    seen.push({ url: req.url, ua: req.headers['user-agent'] });
    await new Promise((r) => setTimeout(r, 30));
    const send = (status, body) => {
      active -= 1;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (mode === '429-once') {
      mode = 'ok';
      send(429, { message: 'Too Many Requests' });
      return;
    }
    if (mode === '429') {
      send(429, { message: 'Too Many Requests' });
      return;
    }
    if (mode === 'noroute') {
      send(400, { code: 'NoRoute', message: 'Impossible route between points' });
      return;
    }
    const m = /^\/routed-foot\/route\/v1\/driving\/([^?]+)\?/.exec(req.url);
    const points = m[1].split(';').map((p) => p.split(',').map(Number)).map(([lng, lat]) => [lat, lng]);
    const r = await grid(points);
    send(200, {
      code: 'Ok',
      waypoints: points.map((p, i) => ({ location: [p[1], p[0]], distance: i ? 5 : r.snap, name: '' })),
      routes: [{
        distance: r.distance,
        duration: r.duration,
        geometry: { type: 'LineString', coordinates: r.coords.map(([lat, lng]) => [lng, lat]) },
        legs: [{ steps: r.streets.map((name, i) => ({ name, maneuver: { type: i ? 'turn' : 'depart', modifier: i % 2 ? 'left' : 'right' } })) }],
      }],
    });
  });
  await new Promise((r) => mock.listen(0, r));
  process.env.ROUTING_URL = `http://127.0.0.1:${mock.address().port}/routed-foot/`;
  delete require.cache[require.resolve('../api/_lib/routes')];
  routes = require('../api/_lib/routes');
});
test.after(() => mock.close());

test('URL OSRM: urutan lng,lat, geometri geojson + langkah, User-Agent', async () => {
  const router = routes.osrmRouter();
  const r = await router([[-2.1291, 106.1135], [-2.13, 106.12], [-2.1291, 106.1135]]);
  const { url, ua } = seen[seen.length - 1];
  assert.equal(url, '/routed-foot/route/v1/driving/106.113500,-2.129100;106.120000,-2.130000;106.113500,-2.129100?overview=full&geometries=geojson&steps=true');
  assert.match(ua, /RencanaHarian/);
  assert.ok(r.distance > 0 && r.coords.length > 2 && r.streets.length > 0);
  assert.equal(Math.round(r.coords[0][0] * 1000), -2129, 'koordinat kembali ke [lat, lng]');
});

test('pencarian penuh lewat HTTP: rute 5 km dalam toleransi, maks. 2 permintaan bersamaan', async () => {
  maxActive = 0;
  const from = seen.length;
  const out = await routes.suggest({ lat: -2.1291, lng: 106.1135, km: 5, seed: 4 });
  assert.equal(out.withinTolerance, true);
  for (const r of out.routes) assert.ok(Math.abs(r.diff) <= 300);
  assert.ok(seen.length - from >= 3);
  assert.ok(maxActive <= 2, `bersamaan: ${maxActive}`);
});

test('429 diulang sekali; 429 terus → route_busy; NoRoute → 422', async () => {
  const router = routes.osrmRouter();
  mode = '429-once';
  const r = await router([[-2.1291, 106.1135], [-2.13, 106.12]]);
  assert.ok(r.distance > 0, 'berhasil setelah diulang');
  mode = '429';
  await assert.rejects(router([[-2.1291, 106.1135], [-2.13, 106.12]]), (e) => e.status === 429 && e.code === 'route_busy');
  mode = 'noroute';
  await assert.rejects(router([[-2.1291, 106.1135], [-2.13, 106.12]]), (e) => e.status === 422 && e.code === 'no_route');
  mode = 'ok';
});

test('limiter: urutan tetap, jarak antar-permintaan dijaga', async () => {
  const limit = routes.limiter(2, 50);
  const starts = [];
  const t0 = Date.now();
  const out = await Promise.all([1, 2, 3, 4].map((n) => limit(async () => {
    starts.push(Date.now() - t0);
    await new Promise((r) => setTimeout(r, 10));
    return n;
  })));
  assert.deepEqual(out, [1, 2, 3, 4]);
  for (let i = 1; i < starts.length; i += 1) assert.ok(starts[i] - starts[i - 1] >= 45, `jarak ${starts[i] - starts[i - 1]} ms`);
});
