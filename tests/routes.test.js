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
    table: async (points, { sources } = {}) => ({
      distances: (sources || points.map((_, i) => i)).map((i) => points.map((b) => leg(points[i], b))),
      snaps: points.map(() => 5),
      startSnap: 5,
      locations: points.map((p) => grid.snapPoint(p)),
    }),
    route: async (points) => {
      const r = grid.route(points);
      let distance = 0;
      for (let i = 1; i < points.length; i += 1) distance += leg(points[i - 1], points[i]);
      return { distance, duration: distance / 1.4, coords: r.coords, streets: r.streets, turns: r.turns, snap: 5 };
    },
  };
}

test('banyak & rapi: sampai 12 rute berbeda (putar + lurus), semua ±300 m dan dalam 25 km', async () => {
  for (const km of [1, 3, 5, 8, 10, 21.1]) {
    const { n, client } = counted(createFakeClient());
    const out = await L.suggest({ ...START, km, seed: 3 }, client);
    assert.equal(out.method, 'table');
    assert.equal(out.type, 'semua');
    assert.ok(out.withinTolerance, `${km} km`);
    assert.equal(out.target, Math.round(km * 1000));
    assert.equal(out.tolerance, 300);
    assert.equal(out.maxRadius, 25000);
    assert.ok(n.table + n.route <= 100, `${km} km: ${n.table} tabel, ${n.route} rute`);
    assert.ok(out.routes.length >= 8 && out.routes.length <= 12, `${km} km: ${out.routes.length} rute`);
    const types = out.routes.map((r) => r.type);
    assert.ok(types.filter((t) => t === 'putar').length >= 3 && types.filter((t) => t === 'lurus').length >= 3, `${km} km: ${types}`);
    for (let i = 0; i < out.routes.length; i += 1) {
      for (let j = i + 1; j < out.routes.length; j += 1) {
        assert.ok(G.overlapShare(out.routes[i].coords, out.routes[j].coords) <= 0.6 || G.overlapShare(out.routes[j].coords, out.routes[i].coords) <= 0.6, `${km} km: rute ${i} & ${j} berbeda`);
      }
    }
    for (const r of out.routes) {
      assert.ok(Math.abs(r.distance - km * 1000) <= 300, `${km} km → ${r.distance} m`);
      assert.equal(r.diff, r.distance - Math.round(km * 1000));
      assert.ok(r.maxDist <= 25000, `radius ${r.maxDist}`);
      assert.ok(r.coords.every((p) => G.distance(r.start, p) <= 25050), 'semua titik dalam 25 km');
      assert.equal(r.waypoints.length, r.type === 'lurus' ? 1 : 3);
      assert.deepEqual(r.coords[0], r.start);
      assert.ok(Array.isArray(r.far) && r.far.length === 2, 'titik label rute');
      assert.ok(G.distance(r.coords[0], r.coords[r.coords.length - 1]) < 1, 'kembali ke titik mulai');
      assert.ok(typeof r.direction === 'string' && r.streets.length > 0);
      assert.ok(r.shape > 0 && r.shape <= 1);
    }
    assert.deepEqual(out.routes.map((r) => r.id), 'ABCDEFGHIJKL'.split('').slice(0, out.routes.length));
  }
});

test('jenis Putar saja & Lurus saja', async () => {
  const putar = await L.suggest({ ...START, km: 5, seed: 2, type: 'putar' }, createFakeClient());
  assert.ok(putar.routes.length >= 8, `${putar.routes.length} rute putar`);
  assert.ok(putar.routes.every((r) => r.type === 'putar' && Math.abs(r.diff) <= 300));
  const { n, client } = counted(createFakeClient());
  const lurus = await L.suggest({ ...START, km: 8, seed: 2, type: 'lurus' }, client);
  assert.ok(n.table <= 2, 'paling banyak dua tabel jarak dari titik mulai');
  assert.ok(lurus.routes.length >= 8, `${lurus.routes.length} rute lurus`);
  for (const r of lurus.routes) {
    assert.equal(r.type, 'lurus');
    assert.ok(Math.abs(r.diff) <= 300);
    assert.ok(r.shape >= 0.7, `kelurusan ${r.shape}`);
    // Bolak-balik: separuh kedua mengulang separuh pertama.
    assert.ok(G.overlapRatio(r.coords) > 0.9);
  }
  // Arah boleh sama (mis. dua jalan sejajar ke utara), asal jalannya berbeda.
  for (let i = 0; i < lurus.routes.length; i += 1) {
    for (let j = i + 1; j < lurus.routes.length; j += 1) {
      const [a, b] = [lurus.routes[i].coords, lurus.routes[j].coords];
      assert.ok(G.overlapShare(a, b) <= 0.6 || G.overlapShare(b, a) <= 0.6, `rute lurus ${i} & ${j} berbeda`);
    }
  }
  // Radius 25 km: rute lurus bolak-balik bisa sampai setengah maraton dan maraton.
  for (const km of [21.1, 42.2]) {
    const long = await L.suggest({ ...START, km, seed: 2, type: 'lurus' }, createFakeClient());
    assert.ok(long.withinTolerance, `${km} km lurus`);
    for (const r of long.routes) assert.ok(r.type === 'lurus' && Math.abs(r.diff) <= 300 && r.maxDist <= 25000, `${km} km: ${r.distance} m, ujung ${r.maxDist} m`);
  }
});

test('taji ke jalan buntu dibuang, jarak dihitung ulang, rute tetap pas', async () => {
  const fake = createFakeClient();
  // Setiap titik antara berada di ujung gang buntu 120 m: rute masuk lalu keluar lewat jalan yang sama.
  const spur = (p) => G.destination(p, 30, 120);
  const withSpurs = {
    table: async (points, opts) => {
      const t = await fake.table(points, opts);
      const rows = (opts && opts.sources) || points.map((_, i) => i);
      return { ...t, distances: t.distances.map((row, r) => row.map((d, c) => d + (rows[r] ? 120 : 0) + (c ? 120 : 0))) };
    },
    route: async (points) => {
      const r = await fake.route(points);
      const coords = [];
      let extra = 0;
      const mids = points.slice(1, -1).map((p) => r.coords.reduce((a, q) => (G.distance(p, q) < G.distance(p, a) ? q : a), r.coords[0]));
      for (const q of r.coords) {
        coords.push(q);
        if (mids.some((m) => m === q)) {
          coords.push(spur(q), q);
          extra += 240;
        }
      }
      return { ...r, coords, distance: r.distance + extra };
    },
  };
  const out = await L.suggest({ ...START, km: 5, seed: 1, type: 'putar' }, withSpurs);
  assert.ok(out.routes.length >= 1);
  for (const r of out.routes) {
    const key = (p) => p.join(',');
    for (let i = 2; i < r.coords.length; i += 1) assert.notEqual(key(r.coords[i]), key(r.coords[i - 2]), 'tidak ada pola A, B, A');
    assert.ok(Math.abs(r.distance - G.lineLength(r.coords)) < 60, `jarak = panjang rute bersih (${r.distance} vs ${Math.round(G.lineLength(r.coords))})`);
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
  const out = await L.suggest({ ...START, km: 5, seed: 1, type: 'putar' }, client);
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
    table: async (points) => ({ distances: points.map(() => points.map(() => 200)), snaps: points.map(() => 3), startSnap: 3, locations: points }),
    route: async (points) => ({ distance: 900, duration: 600, coords: [points[0], G.destination(points[0], 90, 50), points[0]], streets: ['Jl. Buntu'], turns: 0, snap: 3 }),
  };
  const out = await L.suggest({ ...START, km: 5, type: 'putar' }, client, { budgetMs: 2000 });
  assert.equal(out.withinTolerance, false);
  assert.equal(out.routes.length, 1);
  assert.equal(out.routes[0].diff, -4200, '900 m dikurangi taji bolak-balik 2 × 50 m');
});

test('titik mulai jauh dari jalan → 422; layanan mati → galat diteruskan; sebagian gagal tetap dapat rute', async () => {
  const far = {
    table: async (points) => ({ distances: points.map(() => points.map(() => 1000)), snaps: points.map((_, i) => (i ? 5 : 2500)), startSnap: 2500, locations: points }),
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
  const out = await L.suggest({ ...START, km: 5, seed: 5, type: 'putar' }, spy);
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

// ----- Jaringan jalan tak beraturan (lebih mirip kota & pinggiran sungguhan) -----
const { createNetworkClient } = require('../scripts/routing-fake');

async function successRate(opts, type, { noTable = false } = {}) {
  let ok = 0;
  let total = 0;
  for (let loc = 0; loc < 6; loc += 1) {
    for (const km of [3, 5, 10]) {
      const net = createNetworkClient({ ...opts, seed: loc + 1 });
      const client = noTable
        ? { table: async () => { throw new L.RouteError(502, 'x', 'table_unavailable'); }, route: net.route }
        : net;
      total += 1;
      const out = await L.suggest({ lat: -2.13 + loc * 0.013, lng: 106.11 + loc * 0.009, km, seed: loc, type }, client).catch(() => null);
      if (out && out.withinTolerance) {
        ok += 1;
        for (const r of out.routes) assert.ok(Math.abs(r.diff) <= 300 && r.maxDist <= 25000);
      }
    }
  }
  return { ok, total };
}

test('kota padat & pinggiran jarang (banyak jalan buntu): jenis Semua selalu menemukan rute ±300 m', async () => {
  for (const opts of [{ block: 110, drop: 0.3 }, { block: 400, drop: 0.4 }]) {
    const r = await successRate(opts, 'semua');
    assert.equal(r.ok, r.total, `blok ${opts.block} m: ${r.ok}/${r.total}`);
  }
  const putar = await successRate({ block: 110, drop: 0.3 }, 'putar');
  assert.equal(putar.ok, putar.total, `putar di kota padat: ${putar.ok}/${putar.total}`);
});

test('tanpa layanan tabel (cara cadangan) tetap menemukan rute di kota padat & sedang', async () => {
  const dense = await successRate({ block: 110, drop: 0.3 }, 'semua', { noTable: true });
  assert.equal(dense.ok, dense.total, `padat: ${dense.ok}/${dense.total}`);
  const mid = await successRate({ block: 220, drop: 0.35 }, 'semua', { noTable: true });
  assert.ok(mid.ok >= mid.total - 2, `sedang: ${mid.ok}/${mid.total}`);
});

test('statistik permintaan, tidak ada kandidat → galat jelas, dibatasi layanan → pesan tunggu', async () => {
  const out = await L.suggest({ ...START, km: 5, seed: 1 }, createFakeClient());
  assert.ok(out.stats.requests >= 4 && out.stats.failed === 0);
  const nothing = {
    table: async (points, { sources } = {}) => ({ distances: (sources || points).map(() => points.map(() => null)), snaps: points.map(() => 5), startSnap: 5, locations: points }),
    route: async () => { throw new L.RouteError(422, 'x', 'no_route'); },
  };
  await assert.rejects(L.suggest({ ...START, km: 5 }, nothing), (e) => e.code === 'no_candidates' && /Geser titik mulai/.test(e.message));
  const busy = {
    table: async (points, { sources } = {}) => ({ distances: (sources || points).map(() => points.map(() => 1500)), snaps: points.map(() => 5), startSnap: 5, locations: points.map((p, i) => [p[0] + i * 1e-4, p[1]]) }),
    route: async () => { throw new L.RouteError(429, 'sibuk', 'route_busy'); },
  };
  await assert.rejects(L.suggest({ ...START, km: 5 }, busy), (e) => e.code === 'route_busy' && /1 menit/.test(e.message));
});

test('cari lagi di tempat yang sama: rute baru, bukan yang itu-itu saja', async () => {
  const net = createNetworkClient({ block: 110, drop: 0.3, seed: 3 });
  const q = { lat: -2.12, lng: 106.12, km: 5, type: 'semua' };
  const first = await L.suggest({ ...q, seed: 1 }, net);
  assert.ok(first.routes.length >= 3);
  const shown = first.routes.map((r) => r.coords);
  const second = await L.suggest({ ...q, seed: 2 }, net, { avoid: shown });
  assert.ok(second.routes.length >= 3, `${second.routes.length} rute`);
  const fresh = second.routes.filter((r) => !r.seen);
  assert.ok(fresh.length >= 2, `${fresh.length} rute baru`);
  for (const r of fresh) {
    for (const old of shown) assert.ok(G.overlapShare(r.coords, old) <= 0.6 || G.overlapShare(old, r.coords) <= 0.6, 'rute baru tidak sama dengan yang lama');
  }
  // Rute lama hanya dipakai untuk melengkapi sampai 3 dan ditandai "pernah muncul".
  for (const r of second.routes.filter((x) => x.seen)) assert.ok(shown.some((old) => G.overlapShare(r.coords, old) > 0.6 || G.overlapShare(old, r.coords) > 0.6));
});

test('rute tampil bertahap: hasil sementara bertambah, huruf rute tidak berubah', async () => {
  const net = createNetworkClient({ block: 110, drop: 0.3, seed: 2 });
  const steps = [];
  const out = await L.suggest({ lat: -2.12, lng: 106.12, km: 5, seed: 4 }, net, { onProgress: (res) => steps.push(res) });
  assert.ok(steps.length >= 2, `${steps.length} kali tampil`);
  assert.ok(steps.every((s) => s.partial === true && s.withinTolerance) && out.partial === false);
  const sig = (r) => `${r.id}|${r.type}|${r.distance}|${r.coords.length}`;
  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(steps[i].routes.length > steps[i - 1].routes.length, 'setiap kali ada rute baru');
    assert.deepEqual(steps[i].routes.slice(0, steps[i - 1].routes.length).map(sig), steps[i - 1].routes.map(sig));
  }
  const last = steps[steps.length - 1].routes;
  assert.deepEqual(out.routes.slice(0, last.length).map(sig), last.map(sig), 'hasil akhir memuat rute yang sudah tampil');
  // Dibatalkan (mis. titik mulai dipindah): berhenti setelah putaran pertama.
  let calls = 0;
  const stopped = await L.suggest({ lat: -2.12, lng: 106.12, km: 5, seed: 5 }, net, { stopped: () => (calls += 1) > 1 });
  assert.equal(stopped.stats.rounds, 1);
});

test('rute gabungan: banyak rute dalam satu permintaan, titik tak terjangkau hanya menggagalkan rutenya', async () => {
  const S = [START.lat, START.lng];
  const fake = createFakeClient();
  const calls = [];
  const bad = G.destination(S, 45, 900);
  const client = {
    ...fake,
    legs: async (points) => {
      calls.push(points.length);
      if (points.some((p) => G.distance(p, bad) < 1)) throw new L.RouteError(422, 'x', 'no_route');
      return fake.legs(points);
    },
  };
  const loops = [0, 90, 180, 270].map((h) => [S, ...G.loopPoints(S, h, 400, 3, 1), S]);
  const out = await L.routeMany(client, loops, 3000);
  assert.equal(calls.length, 1, 'empat rute putar: satu permintaan');
  assert.equal(calls[0], 4 * 4 + 1, 'dirangkai lewat titik mulai (S A B C S A B C S …)');
  for (let i = 0; i < loops.length; i += 1) {
    const single = await fake.route(loops[i]);
    assert.ok(Math.abs(out[i].distance - single.distance) < 1, `rute ${i}: jarak sama dengan permintaan terpisah`);
    assert.deepEqual(out[i].coords[0], single.coords[0]);
    assert.deepEqual(out[i].coords[out[i].coords.length - 1], single.coords[single.coords.length - 1]);
  }
  // Rute lurus [S, ujung]: dirangkai dengan kaki penyambung, tetap terbaca per rute.
  const tips = [0, 120, 240].map((h) => [S, G.destination(S, h, 1500)]);
  const way = await L.routeMany(client, tips, 3000);
  for (let i = 0; i < tips.length; i += 1) assert.ok(Math.abs(way[i].distance - (await fake.route(tips[i])).distance) < 1);
  // Satu titik tak terjangkau: rangkaian dibelah, rute lain tetap didapat.
  calls.length = 0;
  const mixed = await L.routeMany(client, [...loops.slice(0, 3), [S, bad, S]], 3000);
  assert.deepEqual(mixed.map(Boolean), [true, true, true, false]);
  assert.equal(calls.length, 5, "1 gagal → 2 bagian → bagian yang gagal dibelah lagi");
  // Layanan menolak permintaan gabungan (mis. parameter tidak dikenal): rute diambil satu per satu.
  const picky = { ...fake, legs: async () => { throw new L.RouteError(502, 'x', 'route_bad_output'); } };
  const each = await L.routeMany(picky, loops, 3000);
  assert.ok(each.every(Boolean) && Math.abs(each[0].distance - out[0].distance) < 1);
  // Klien tanpa `legs`: satu permintaan per rute.
  const plain = await L.routeMany({ route: fake.route, table: fake.table }, loops, 3000);
  assert.ok(plain.every(Boolean));
  // Rute panjang: dibagi beberapa permintaan agar jawabannya tidak terlalu besar.
  calls.length = 0;
  await L.routeMany(client, loops, 21100);
  assert.ok(calls.length >= 2, `21 km: ${calls.length} permintaan`);
});

test('gambar rute sendiri: lewat jalan, taji dibuang, jarak dihitung; bolak-balik & sekali jalan', async () => {
  const S = [START.lat, START.lng];
  const client = createFakeClient({ deadEnds: 0.3 });
  const pts = [G.destination(S, 0, 800), G.destination(S, 90, 900), G.destination(S, 150, 700)];
  const r = await L.snapDrawing(client, S, pts);
  assert.equal(r.type, 'gambar');
  assert.equal(r.loop, true);
  assert.ok(r.trimmed > 0, 'titik di gang buntu: masuk-keluar dibuang');
  assert.ok(Math.abs(r.distance - G.lineLength(r.coords)) < 30, `jarak = panjang garis (${r.distance} vs ${Math.round(G.lineLength(r.coords))})`);
  assert.ok(G.distance(r.coords[0], r.coords[r.coords.length - 1]) < 1, 'kembali ke titik mulai');
  assert.deepEqual(r.end, r.start);
  assert.equal(r.waypoints.length, 3);
  assert.ok(r.streets.length > 0 && typeof r.direction === 'string' && r.maxDist > 0);
  // Lari ke satu titik lalu pulang lewat jalan yang sama: tidak dianggap taji.
  const one = G.destination(S, 0, 1500);
  const back = await L.snapDrawing(createFakeClient(), S, [one]);
  const oneWay = await L.snapDrawing(createFakeClient(), S, [one], { loop: false });
  assert.ok(Math.abs(back.distance - 2 * oneWay.distance) < 2, `${back.distance} ≈ 2 × ${oneWay.distance}`);
  assert.equal(back.trimmed, 0);
  assert.equal(oneWay.loop, false);
  assert.ok(G.distance(oneWay.end, oneWay.start) > 1000, 'sekali jalan selesai di titik lain');
  // Galat: tanpa titik, titik mulai jauh dari jalan.
  await assert.rejects(L.snapDrawing(createFakeClient(), S, [], { loop: false }), (e) => e.code === 'no_points');
  const offRoad = { route: async (p) => ({ ...(await createFakeClient().route(p)), snap: 2000 }) };
  await assert.rejects(L.snapDrawing(offRoad, S, pts), (e) => e.code === 'far_from_road');
  // Paling banyak 80 titik per rute.
  let n = 0;
  const count = { route: async (p) => ((n = p.length), createFakeClient().route(p)) };
  await L.snapDrawing(count, S, Array.from({ length: 120 }, (_, i) => G.destination(S, i * 3, 300)));
  assert.equal(n, L.DRAW_MAX_POINTS + 2);
});

test('titik gambar yang tak terjangkau lewat jalan dikenali lewat satu tabel jarak', async () => {
  const S = [START.lat, START.lng];
  const fake = createFakeClient();
  const island = G.destination(S, 0, 3000);
  let tables = 0;
  const client = {
    ...fake,
    table: async (points, opts) => {
      tables += 1;
      const t = await fake.table(points, opts);
      return { ...t, distances: t.distances.map((row) => row.map((d, i) => (G.distance(points[i], island) < 1 ? null : d))) };
    },
  };
  const pts = [G.destination(S, 90, 500), island, G.destination(S, 180, 500)];
  assert.deepEqual(await L.unreachable(client, S, pts), [1]);
  assert.equal(tables, 1);
  assert.deepEqual(await L.unreachable(client, S, [pts[0], pts[2]]), []);
});
