// Klien OSRM (js/core/loops.js) terhadap server OSRM tiruan lokal: format URL tabel & rute (lng,lat),
// batas permintaan bersamaan, ulang saat 429, tabel ditolak → cadangan, dan pencarian penuh lewat HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const L = require('../js/core/loops.js');
const { osrmJson, createGrid } = require('../scripts/routing-fake');

const seen = [];
let active = 0;
let maxActive = 0;
let mode = 'ok';
let mock;
let base;
const grid = createGrid();

test.before(async () => {
  mock = http.createServer(async (req, res) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    seen.push({ url: req.url, ua: req.headers['user-agent'] });
    await new Promise((r) => setTimeout(r, 20));
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
    if (mode === '429') return send(429, { message: 'Too Many Requests' });
    if (mode === 'noroute') return send(400, { code: 'NoRoute', message: 'Impossible route between points' });
    if (mode === 'notable' && req.url.includes('/table/')) return send(400, { code: 'TooBig', message: 'Too many table coordinates' });
    if (mode === 'notable-404' && req.url.includes('/table/')) return send(404, { message: 'Not Found' });
    return send(200, osrmJson(req.url, grid));
  });
  await new Promise((r) => mock.listen(0, r));
  base = `http://127.0.0.1:${mock.address().port}/routed-foot/`;
});
test.after(() => mock.close());

const client = (opts = {}) => L.osrmClient(base, { fetchFn: fetch, headers: { 'User-Agent': 'RencanaHarian/uji' }, ...opts });

test('URL OSRM: rute & tabel memakai urutan lng,lat dan parameter yang benar', async () => {
  const c = client();
  const r = await c.route([[-2.1291, 106.1135], [-2.13, 106.12], [-2.1291, 106.1135]]);
  assert.equal(seen[seen.length - 1].url, '/routed-foot/route/v1/driving/106.113500,-2.129100;106.120000,-2.130000;106.113500,-2.129100?overview=full&geometries=geojson&steps=true');
  assert.match(seen[seen.length - 1].ua, /RencanaHarian/);
  assert.ok(r.distance > 0 && r.coords.length > 2 && r.streets.length > 0);
  const t = await c.table([[-2.1291, 106.1135], [-2.13, 106.12]]);
  assert.equal(seen[seen.length - 1].url, '/routed-foot/table/v1/driving/106.113500,-2.129100;106.120000,-2.130000?annotations=distance');
  assert.equal(t.distances.length, 2);
  assert.equal(Math.round(t.distances[0][1]), Math.round(grid.route([[-2.1291, 106.1135], [-2.13, 106.12]]).distance));
});

test('pencarian penuh lewat HTTP: banyak rute dalam toleransi, tabel ≤ 100 titik, maks. 3 bersamaan', async () => {
  maxActive = 0;
  const from = seen.length;
  const out = await L.suggest({ lat: -2.1291, lng: 106.1135, km: 5, seed: 4 }, client({ concurrency: 3 }));
  assert.equal(out.method, 'table');
  assert.equal(out.withinTolerance, true);
  assert.ok(out.routes.length >= 8, `${out.routes.length} rute`);
  for (const r of out.routes) assert.ok(Math.abs(r.diff) <= 300);
  const urls = seen.slice(from).map((s) => s.url);
  const tables = urls.filter((u) => u.includes('/table/'));
  assert.ok(tables.length >= 2 && tables.length <= 30, `${tables.length} tabel`);
  const lurus = tables.filter((u) => /[?&]sources=0(&|$)/.test(u)).length;
  assert.ok(lurus >= 1 && lurus <= 2, 'tabel rute lurus hanya dari titik mulai (paling banyak dua)');
  // Batas bawaan OSRM: tabel paling banyak 100 titik.
  for (const u of tables) assert.ok(u.split('?')[0].split(';').length <= 100, 'tabel ≤ 100 titik');
  assert.ok(urls.length <= 100, `${urls.length} permintaan`);
  assert.ok(out.routes.some((r) => r.type === 'lurus') && out.routes.some((r) => r.type === 'putar'));
  assert.ok(maxActive <= 3, `bersamaan: ${maxActive}`);
});

test('layanan tabel ditolak (TooBig/404) → cadangan rute berulang tetap berhasil', async () => {
  for (const m of ['notable', 'notable-404']) {
    mode = m;
    const out = await L.suggest({ lat: -2.1291, lng: 106.1135, km: 3, seed: 2, type: 'putar' }, client());
    assert.equal(out.method, 'iterate', m);
    assert.ok(out.withinTolerance, m);
  }
  mode = 'ok';
});

test('429 diulang (dengan jeda); 429 terus → route_busy; NoRoute → 422; server mati → route_unavailable', async () => {
  const pts = [[-2.1291, 106.1135], [-2.13, 106.12]];
  mode = '429-once';
  const r = await client().route(pts);
  assert.ok(r.distance > 0, 'berhasil setelah diulang');
  mode = '429';
  const t0 = Date.now();
  await assert.rejects(client().route(pts), (e) => e.status === 429 && e.code === 'route_busy' && /1 menit/.test(e.message));
  assert.ok(Date.now() - t0 >= 4000, 'menunggu 1,5 + 3 detik sebelum menyerah');
  mode = 'noroute';
  await assert.rejects(client().route(pts), (e) => e.status === 422 && e.code === 'no_route');
  mode = 'ok';
  const dead = L.osrmClient('http://127.0.0.1:1/routed-foot', { fetchFn: fetch, timeoutMs: 500 });
  await assert.rejects(dead.table([[-2.1, 106.1], [-2.2, 106.2]]), (e) => e.code === 'route_unavailable');
});

test('tembolok: permintaan yang sama tidak dikirim ulang; jawaban gagal tidak disimpan', async () => {
  const c = client();
  const pts = [[-2.1291, 106.1135], [-2.14, 106.12]];
  const from = seen.length;
  await c.route(pts);
  await c.route(pts);
  await c.table(pts);
  await c.table(pts);
  assert.equal(seen.length - from, 2, 'satu rute + satu tabel');
  mode = 'noroute';
  const other = [[-2.1291, 106.1135], [-2.15, 106.13]];
  await assert.rejects(c.route(other));
  mode = 'ok';
  const again = await c.route(other);
  assert.ok(again.distance > 0, 'jawaban gagal tidak ikut disimpan');
});

test('batas waktu per permintaan → route_unavailable', async () => {
  const slow = http.createServer(() => { /* tidak pernah menjawab */ });
  await new Promise((r) => slow.listen(0, r));
  const c = L.osrmClient(`http://127.0.0.1:${slow.address().port}`, { fetchFn: fetch, timeoutMs: 150 });
  const t0 = Date.now();
  await assert.rejects(c.route([[-2.1, 106.1], [-2.2, 106.2]]), (e) => e.code === 'route_unavailable');
  assert.ok(Date.now() - t0 < 2000);
  slow.closeAllConnections();
  slow.close();
});

test('limiter: urutan tetap, jarak antar-permintaan dijaga', async () => {
  const limit = L.limiter(2, 50);
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
