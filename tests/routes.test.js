// Saran rute putar: pencarian jari-jari sampai jarak pas (±300 m), pembacaan balasan OSRM, dan galat.
const test = require('node:test');
const assert = require('node:assert/strict');
const routes = require('../api/_lib/routes');
const G = require('../js/core/geo.js');
const { createFakeRouter } = require('../scripts/routing-fake');

const START = { lat: -2.1291, lng: 106.1135 };

/** Jaringan jalan yang tidak rapi: jarak berubah tidak beraturan (±12%) terhadap jari-jari. */
function noisyRouter() {
  const grid = createFakeRouter({ block: 70 });
  return async (points) => {
    const r = await grid(points);
    const k = Math.round(G.distance(points[0], points[2]) / 37);
    const factor = 1 + 0.12 * Math.sin(k * 12.9898);
    return { ...r, distance: r.distance * factor };
  };
}

test('rute pas dengan target (selisih maks. 300 m) untuk jarak pendek sampai setengah maraton', async () => {
  for (const km of [1, 3, 5, 8, 10, 21.1]) {
    const out = await routes.suggest({ ...START, km, seed: 3 }, { router: createFakeRouter() });
    assert.ok(out.withinTolerance, `${km} km`);
    assert.equal(out.target, Math.round(km * 1000));
    assert.equal(out.tolerance, 300);
    assert.ok(out.routes.length >= 1 && out.routes.length <= 3);
    for (const r of out.routes) {
      assert.ok(Math.abs(r.distance - km * 1000) <= 300, `${km} km → ${r.distance} m`);
      assert.equal(r.diff, r.distance - km * 1000);
      assert.equal(r.waypoints.length, 3);
      assert.deepEqual(r.coords[0], r.start);
      assert.ok(G.distance(r.coords[0], r.coords[r.coords.length - 1]) < 1, 'kembali ke titik mulai');
      assert.ok(typeof r.direction === 'string' && r.streets.length > 0);
    }
    assert.deepEqual(out.routes.map((r) => r.id), ['A', 'B', 'C'].slice(0, out.routes.length));
  }
});

test('jalan tidak rapi: tetap menemukan rute dalam toleransi', async () => {
  let ok = 0;
  for (let seed = 0; seed < 6; seed += 1) {
    const out = await routes.suggest({ ...START, km: 5, seed }, { router: noisyRouter() });
    if (out.withinTolerance) ok += 1;
    for (const r of out.routes) if (out.withinTolerance) assert.ok(Math.abs(r.diff) <= 300);
  }
  assert.ok(ok >= 5, `${ok}/6 pencarian berhasil`);
});

test('"cari lagi" (seed lain) memberi arah rute yang berbeda', async () => {
  const a = await routes.suggest({ ...START, km: 5, seed: 1 }, { router: createFakeRouter() });
  const b = await routes.suggest({ ...START, km: 5, seed: 2 }, { router: createFakeRouter() });
  assert.notDeepEqual(a.routes.map((r) => r.waypoints), b.routes.map((r) => r.waypoints));
});

test('tidak ada rute dalam toleransi → satu rute terdekat, ditandai', async () => {
  const flat = async (points) => {
    const coords = [points[0], G.destination(points[0], 90, 50), points[0]];
    return { distance: 900, duration: 600, coords, streets: ['Jl. Buntu'], turns: 0, snap: 3 };
  };
  const out = await routes.suggest({ ...START, km: 5 }, { router: flat, budgetMs: 2000 });
  assert.equal(out.withinTolerance, false);
  assert.equal(out.routes.length, 1);
  assert.equal(out.routes[0].diff, -4100);
});

test('titik mulai jauh dari jalan → 422 far_from_road; layanan mati → galat diteruskan', async () => {
  const far = async (points) => ({ distance: 5000, duration: 1, coords: [points[0], points[0]], streets: [], turns: 0, snap: 2500 });
  await assert.rejects(routes.suggest({ ...START, km: 5 }, { router: far }), (e) => e.status === 422 && e.code === 'far_from_road');
  const down = async () => {
    throw new routes.RouteError(502, 'mati', 'route_unavailable');
  };
  await assert.rejects(routes.suggest({ ...START, km: 5 }, { router: down }), (e) => e.code === 'route_unavailable');
  // Sebagian permintaan gagal: hasil dari yang berhasil tetap dipakai.
  let n = 0;
  const grid = createFakeRouter();
  const flaky = async (p) => {
    n += 1;
    if (n % 3 === 1) throw new routes.RouteError(502, 'mati', 'route_unavailable');
    return grid(p);
  };
  const out = await routes.suggest({ ...START, km: 5 }, { router: flaky });
  assert.ok(out.routes.length >= 1);
});

test('readOsrm: format balasan OSRM (routing.openstreetmap.de) dibaca benar', () => {
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
  const r = routes.readOsrm(data);
  assert.equal(r.distance, 5043.2);
  assert.deepEqual(r.coords[1], [-2.13, 106.12], 'lat/lng dibalik dari [lng, lat]');
  assert.deepEqual(r.streets, ['Jalan Merdeka', 'Jalan Sudirman', 'Gang Mawar']);
  assert.equal(r.turns, 3);
  assert.equal(r.snap, 12.4);
  assert.throws(() => routes.readOsrm({ code: 'NoRoute', message: 'Impossible route' }), (e) => e.status === 422 && e.code === 'no_route');
  assert.throws(() => routes.readOsrm({ code: 'InvalidQuery' }), (e) => e.status === 502);
});
