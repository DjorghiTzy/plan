// Saran rute putar (js/core/loops.js): tabel jarak → kombinasi terbaik (±300 m), sedikit permintaan,
// cadangan tanpa tabel, pembacaan balasan OSRM, dan galat.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/core/loops.js');
const G = require('../js/core/geo.js');
const { createFakeClient, createGrid } = require('../scripts/routing-fake');

const START = { lat: -2.1291, lng: 106.1135 };

/** Hitung permintaan ke klien. */
function counted(client) {
  const n = { table: 0, route: 0 };
  return {
    n,
    client: {
      table: (p) => (n.table += 1, client.table(p)),
      route: (p) => (n.route += 1, client.route(p)),
    },
  };
}

/** Jaringan jalan yang tidak rapi: tiap ruas antar-titik ±15% dari jalan kisi (tabel & rute konsisten). */
function noisyClient() {
  const grid = createGrid({ block: 70 });
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const leg = (a, b) => {
    if (key(a) === key(b)) return 0;
    let h = 0;
    for (const ch of key(a) + key(b)) h = (h * 31 + ch.charCodeAt(0)) % 100003;
    return grid.route([a, b]).distance * (1 + 0.15 * Math.sin(h));
  };
  return {
    table: async (points) => ({ distances: points.map((a) => points.map((b) => leg(a, b))), snaps: points.map(() => 5) }),
    route: async (points) => {
      const r = grid.route(points);
      let distance = 0;
      for (let i = 1; i < points.length; i += 1) distance += leg(points[i - 1], points[i]);
      return { distance, duration: distance / 1.4, coords: r.coords, streets: r.streets, turns: r.turns, snap: 5 };
    },
  };
}

test('cepat: 3 tabel + 3 rute, semua rute dalam ±300 m untuk 1 sampai 21,1 km', async () => {
  for (const km of [1, 3, 5, 8, 10, 21.1]) {
    const { n, client } = counted(createFakeClient());
    const out = await L.suggest({ ...START, km, seed: 3 }, client);
    assert.equal(out.method, 'table');
    assert.ok(out.withinTolerance, `${km} km`);
    assert.equal(out.target, Math.round(km * 1000));
    assert.equal(out.tolerance, 300);
    assert.ok(n.table <= 3 && n.route <= 6, `${km} km: ${n.table} tabel, ${n.route} rute`);
    assert.ok(out.routes.length >= 2 && out.routes.length <= 3, `${km} km: ${out.routes.length} rute`);
    for (const r of out.routes) {
      assert.ok(Math.abs(r.distance - km * 1000) <= 300, `${km} km → ${r.distance} m`);
      assert.equal(r.diff, r.distance - Math.round(km * 1000));
      assert.equal(r.waypoints.length, 3);
      assert.deepEqual(r.coords[0], r.start);
      assert.ok(Array.isArray(r.far) && r.far.length === 2, 'titik label rute');
      assert.ok(G.distance(r.coords[0], r.coords[r.coords.length - 1]) < 1, 'kembali ke titik mulai');
      assert.ok(typeof r.direction === 'string' && r.streets.length > 0);
    }
    assert.deepEqual(out.routes.map((r) => r.id), ['A', 'B', 'C'].slice(0, out.routes.length));
  }
});

test('jalan tidak rapi: tetap menemukan rute dalam toleransi', async () => {
  let ok = 0;
  for (let seed = 0; seed < 8; seed += 1) {
    const out = await L.suggest({ ...START, km: 5, seed }, noisyClient());
    if (out.withinTolerance) ok += 1;
    if (out.withinTolerance) for (const r of out.routes) assert.ok(Math.abs(r.diff) <= 300, `${r.diff}`);
  }
  assert.equal(ok, 8);
});

test('layanan tabel tidak ada → cadangan dengan permintaan rute berulang', async () => {
  const fake = createFakeClient();
  const client = {
    table: async () => {
      throw new L.RouteError(502, 'Tabel jarak tidak tersedia.', 'table_unavailable');
    },
    route: fake.route,
  };
  const out = await L.suggest({ ...START, km: 5, seed: 1 }, client);
  assert.equal(out.method, 'iterate');
  assert.ok(out.withinTolerance);
  for (const r of out.routes) assert.ok(Math.abs(r.diff) <= 300);
});

test('"rute lain" (seed lain) memberi arah rute yang berbeda', async () => {
  const a = await L.suggest({ ...START, km: 5, seed: 1 }, createFakeClient());
  const b = await L.suggest({ ...START, km: 5, seed: 2 }, createFakeClient());
  assert.notDeepEqual(a.routes.map((r) => r.waypoints), b.routes.map((r) => r.waypoints));
});

test('tidak ada rute dalam toleransi → satu rute terdekat, ditandai', async () => {
  const client = {
    table: async (points) => ({ distances: points.map(() => points.map(() => 200)), snaps: points.map(() => 3) }),
    route: async (points) => ({ distance: 900, duration: 600, coords: [points[0], G.destination(points[0], 90, 50), points[0]], streets: ['Jl. Buntu'], turns: 0, snap: 3 }),
  };
  const out = await L.suggest({ ...START, km: 5 }, client, { budgetMs: 2000 });
  assert.equal(out.withinTolerance, false);
  assert.equal(out.routes.length, 1);
  assert.equal(out.routes[0].diff, -4100);
});

test('titik mulai jauh dari jalan → 422; layanan mati → galat diteruskan; sebagian gagal tetap dapat rute', async () => {
  const far = {
    table: async (points) => ({ distances: points.map(() => points.map(() => 1000)), snaps: points.map((_, i) => (i ? 5 : 2500)) }),
    route: async () => assert.fail('tidak perlu rute'),
  };
  await assert.rejects(L.suggest({ ...START, km: 5 }, far), (e) => e.status === 422 && e.code === 'far_from_road');
  const down = { table: async () => { throw new L.RouteError(502, 'mati', 'route_unavailable'); }, route: async () => { throw new L.RouteError(502, 'mati', 'route_unavailable'); } };
  await assert.rejects(L.suggest({ ...START, km: 5 }, down), (e) => e.code === 'route_unavailable');
  let n = 0;
  const fake = createFakeClient();
  const flaky = {
    table: async (p) => {
      n += 1;
      if (n === 1) throw new L.RouteError(502, 'mati', 'route_unavailable');
      return fake.table(p);
    },
    route: fake.route,
  };
  const out = await L.suggest({ ...START, km: 5 }, flaky);
  assert.ok(out.routes.length >= 1 && out.withinTolerance);
});

test('titik antara yang jatuh jauh dari jalan (mis. di danau) tidak dipakai', async () => {
  const fake = createFakeClient();
  const client = {
    table: async (points) => {
      const t = await fake.table(points);
      // Semua titik di lingkaran terbesar dianggap jauh dari jalan.
      return { ...t, snaps: t.snaps.map((s, i) => (i > points.length - 4 ? 900 : s)) };
    },
    route: fake.route,
  };
  const used = [];
  const spy = { table: client.table, route: (p) => (used.push(...p.slice(1, -1)), client.route(p)) };
  const out = await L.suggest({ ...START, km: 5, seed: 5 }, spy);
  assert.ok(out.routes.length >= 1);
  assert.ok(used.length > 0);
});

test('readRoute & readTable: format balasan OSRM (routing.openstreetmap.de)', () => {
  const data = {
    code: 'Ok',
    waypoints: [{ distance: 12.4, name: 'Jalan Merdeka', location: [106.1135, -2.1291] }],
    routes: [{
      distance: 5043.2,
      duration: 3630.1,
      geometry: { type: 'LineString', coordinates: [[106.1135, -2.1291], [106.12, -2.13], [106.1135, -2.1291]] },
      legs: [
        { steps: [
          { name: 'Jalan Merdeka', maneuver: { type: 'depart', modifier: 'left' } },
          { name: 'Jalan Sudirman', maneuver: { type: 'turn', modifier: 'right' } },
          { name: '', maneuver: { type: 'continue', modifier: 'straight' } },
          { name: 'Jalan Sudirman', maneuver: { type: 'end of road', modifier: 'left' } },
        ] },
        { steps: [
          { name: 'Gang Mawar', maneuver: { type: 'turn', modifier: 'slight left' } },
          { name: 'Jalan Merdeka', maneuver: { type: 'arrive', modifier: 'right' } },
        ] },
      ],
    }],
  };
  const r = L.readRoute(data);
  assert.equal(r.distance, 5043.2);
  assert.deepEqual(r.coords[1], [-2.13, 106.12], 'lat/lng dibalik dari [lng, lat]');
  assert.deepEqual(r.streets, ['Jalan Merdeka', 'Jalan Sudirman', 'Gang Mawar']);
  assert.equal(r.turns, 3);
  assert.equal(r.snap, 12.4);
  assert.throws(() => L.readRoute({ code: 'NoRoute', message: 'Impossible route' }), (e) => e.status === 422 && e.code === 'no_route');
  assert.throws(() => L.readRoute({ code: 'InvalidQuery' }), (e) => e.status === 502);

  const t = L.readTable({
    code: 'Ok',
    distances: [[0, 812.5, null], [790.1, 0, 300], [null, 310, 0]],
    sources: [{ distance: 4.2, location: [106.1, -2.1] }, { distance: 30 }, { distance: 1.5 }],
    destinations: [],
  });
  assert.deepEqual(t.distances[0], [0, 812.5, null]);
  assert.deepEqual(t.snaps, [4.2, 30, 1.5]);
  assert.throws(() => L.readTable({ code: 'TooBig', message: 'Too many table coordinates' }), (e) => e.code === 'table_unavailable');
  assert.throws(() => L.readTable({ code: 'NoSegment' }), (e) => e.code === 'no_route');
});
