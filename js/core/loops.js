/**
 * Saran rute lari putar (mulai & selesai di titik yang sama) dengan jarak mendekati target,
 * lewat mesin rute OpenStreetMap (OSRM profil pejalan kaki). Dipakai di browser (langsung ke
 * layanan rute) dan di server (cadangan).
 *
 * Cara cepatnya: untuk tiap arah, 15 titik di beberapa lingkaran diukur jarak jalannya satu sama
 * lain dalam SATU permintaan tabel jarak. Semua kombinasi rute putar dihitung di sini, yang
 * selisihnya paling kecil (maks. 300 m) dipilih, lalu hanya rute terpilih yang diminta
 * geometrinya. Bila layanan tabel tidak tersedia, jatuh ke cara lama: jari-jari disesuaikan
 * berulang lewat permintaan rute.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'));
  else (root.Planner = root.Planner || {}).loops = factory(root.Planner.geo);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  const TOLERANCE_M = 300;
  // Jarak jalan ≈ 7 × jari-jari: keliling persegi di dalam lingkaran (5,66 r) × faktor liku jalan ±1,25.
  const ROAD_FACTOR = 7.07;
  const SCALES = [0.7, 0.85, 1, 1.15, 1.3];
  const MAX_SNAP_START = 600; // titik mulai harus dekat jalan/jalur
  const MAX_SNAP_POINT = 250; // titik antara yang jatuh jauh dari jalan (danau, sawah) dilewati
  const MAX_ITER = 5;
  const LETTERS = ['A', 'B', 'C', 'D'];

  class RouteError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  const unavailable = () => new RouteError(502, 'Layanan rute OpenStreetMap sedang tidak bisa dihubungi. Coba lagi sebentar lagi.', 'route_unavailable');

  /** Balasan rute OSRM → {distance, duration, coords, streets, turns, snap}. */
  function readRoute(data) {
    if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) {
      if (data && (data.code === 'NoRoute' || data.code === 'NoSegment')) throw new RouteError(422, 'Tidak ada jalan yang bisa dilalui di sekitar titik mulai.', 'no_route');
      throw new RouteError(502, 'Layanan rute memberi jawaban yang tidak dikenali.', 'route_bad_output');
    }
    const r = data.routes[0];
    const steps = (r.legs || []).flatMap((l) => l.steps || []);
    const streets = [];
    for (const s of steps) {
      const name = String(s.name || '').trim();
      if (name && !streets.includes(name)) streets.push(name);
    }
    const turns = steps.filter((s) => s.maneuver && !['depart', 'arrive'].includes(s.maneuver.type) && /left|right|uturn/.test(s.maneuver.modifier || '')).length;
    return {
      distance: r.distance,
      duration: r.duration,
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      streets,
      turns,
      snap: data.waypoints && data.waypoints[0] ? data.waypoints[0].distance : 0,
    };
  }

  /** Balasan tabel jarak OSRM → {distances: m[][] (null = tak terjangkau), snaps: m[]}. */
  function readTable(data) {
    if (!data || data.code !== 'Ok' || !Array.isArray(data.distances)) {
      if (data && data.code === 'NoSegment') throw new RouteError(422, 'Tidak ada jalan yang bisa dilalui di sekitar titik mulai.', 'no_route');
      throw new RouteError(502, 'Tabel jarak tidak tersedia.', 'table_unavailable');
    }
    return { distances: data.distances, snaps: (data.sources || []).map((s) => (s && Number.isFinite(s.distance) ? s.distance : 0)) };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Batasi permintaan ke layanan rute gratis: paling banyak `max` bersamaan, berjarak minimal `gapMs`. */
  function limiter(max, gapMs) {
    let active = 0;
    let last = 0;
    const queue = [];
    const next = () => {
      if (active >= max || !queue.length) return;
      const wait = last + gapMs - Date.now();
      if (wait > 0) {
        setTimeout(next, wait);
        return;
      }
      active += 1;
      last = Date.now();
      const job = queue.shift();
      job.fn().then(job.resolve, job.reject).finally(() => {
        active -= 1;
        next();
      });
      next();
    };
    return (fn) => new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  }

  /**
   * Klien OSRM: {table(points), route(points)}. `fetchFn` = fetch browser atau Node.
   * @param {string} base mis. https://routing.openstreetmap.de/routed-foot
   */
  function osrmClient(base, { fetchFn, headers = {}, timeoutMs = 8000, concurrency = 3, gapMs = 80 } = {}) {
    const url0 = String(base).replace(/\/$/, '');
    const limit = limiter(concurrency, gapMs);
    const get = async (url) => {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        return await fetchFn(url, { headers, signal: ctrl ? ctrl.signal : undefined });
      } catch {
        throw unavailable();
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const call = (service, points, query) => limit(async () => {
      const path = points.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
      const url = `${url0}/${service}/v1/driving/${path}?${query}`;
      let res = await get(url);
      if (res.status === 429) {
        await sleep(1200);
        res = await get(url);
      }
      if (res.status === 429) throw new RouteError(429, 'Layanan rute sedang sibuk. Coba lagi sebentar lagi.', 'route_busy');
      const data = await res.json().catch(() => null);
      if (!res.ok && !(data && data.code)) {
        if (service === 'table') throw new RouteError(502, 'Tabel jarak tidak tersedia.', 'table_unavailable');
        throw unavailable();
      }
      return data;
    });
    return {
      table: async (points) => readTable(await call('table', points, 'annotations=distance')),
      route: async (points) => readRoute(await call('route', points, 'overview=full&geometries=geojson&steps=true')),
    };
  }

  /** Nilai kandidat (lebih kecil lebih baik): dalam toleransi, sedikit bolak-balik, dekat target. */
  function score(c) {
    const off = Math.abs(c.diff);
    return (off <= TOLERANCE_M ? 0 : 100000 + off) + (c.overlap || 0) * 1500 + off * 0.5;
  }

  const farStart = () => new RouteError(422, 'Titik mulai terlalu jauh dari jalan. Pindahkan titik mulai ke dekat jalan.', 'far_from_road');

  /**
   * Satu arah dengan tabel jarak: 15 titik (3 posisi × 5 jari-jari), 125 kombinasi rute putar.
   * @returns {Promise<{heading, combos: {points, distance, diff}[]}>} kombinasi terbaik lebih dulu
   */
  async function tableHeading(client, start, heading, dir, target) {
    const r0 = target / ROAD_FACTOR;
    const rings = SCALES.map((s) => G.loopPoints(start, heading, r0 * s, 3, dir));
    const points = [start, ...rings.flat()];
    const { distances: d, snaps } = await client.table(points);
    if ((snaps[0] || 0) > MAX_SNAP_START) throw farStart();
    const at = (ring, k) => 1 + ring * 3 + k; // indeks titik di tabel
    const ok = (i) => (snaps[i] || 0) <= MAX_SNAP_POINT;
    const combos = [];
    const n = SCALES.length;
    for (let a = 0; a < n; a += 1) {
      for (let b = 0; b < n; b += 1) {
        for (let c = 0; c < n; c += 1) {
          const p = [at(a, 0), at(b, 1), at(c, 2)];
          if (!p.every(ok)) continue;
          const legs = [d[0][p[0]], d[p[0]][p[1]], d[p[1]][p[2]], d[p[2]][0]];
          if (legs.some((x) => x == null || !Number.isFinite(x))) continue;
          const distance = legs[0] + legs[1] + legs[2] + legs[3];
          // Bentuk yang bulat (jari-jari mirip) lebih jarang bolak-balik.
          const uneven = Math.abs(a - b) + Math.abs(b - c);
          combos.push({ points: p.map((i) => points[i]), distance, diff: distance - target, rank: Math.abs(distance - target) + uneven * 40 });
        }
      }
    }
    combos.sort((x, y) => x.rank - y.rank);
    return { heading, combos };
  }

  /** Cadangan tanpa tabel: sesuaikan jari-jari berulang lewat permintaan rute. */
  async function iterateHeading(client, start, heading, dir, target, deadline) {
    let r = target / ROAD_FACTOR;
    let prev = null;
    let best = null;
    for (let i = 0; i < MAX_ITER && Date.now() < deadline; i += 1) {
      const route = await client.route([start, ...G.loopPoints(start, heading, r, 3, dir), start]);
      if (route.snap > MAX_SNAP_START) throw farStart();
      const cand = { ...route, heading, diff: route.distance - target, overlap: G.overlapRatio(route.coords) };
      if (!best || score(cand) < score(best)) best = cand;
      if (Math.abs(cand.diff) <= TOLERANCE_M * 0.6 && cand.overlap < 0.25) break;
      let next = route.distance > 0 ? r * (target / route.distance) : r * 1.5;
      if (prev && prev.distance !== route.distance) {
        const s = r + ((target - route.distance) * (r - prev.r)) / (route.distance - prev.distance);
        if (Number.isFinite(s) && s > 0) next = s;
      }
      prev = { r, distance: route.distance };
      r = Math.min(r * 2, Math.max(r * 0.5, next));
    }
    return best;
  }

  async function settle(promises) {
    const out = await Promise.allSettled(promises);
    const ok = out.filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value);
    if (!ok.length) throw out.length && out[0].reason ? out[0].reason : unavailable();
    return ok;
  }

  /** Cara cepat: tabel jarak per arah, lalu geometri hanya untuk kombinasi terpilih. */
  async function viaTable(client, start, target, tries, deadline) {
    const headings = await settle(tries.map((t) => tableHeading(client, start, t.heading, t.dir, target)));
    const fetchRoute = async (combo, heading) => {
      const route = await client.route([start, ...combo.points, start]);
      return { ...route, heading, diff: route.distance - target, overlap: G.overlapRatio(route.coords) };
    };
    // Kombinasi terbaik per arah; bila hasilnya banyak bolak-balik, coba kombinasi berikutnya.
    return settle(headings.filter((h) => h.combos.length).map(async (h) => {
      let best = await fetchRoute(h.combos[0], h.heading);
      for (let i = 1; i < 3 && i < h.combos.length && (best.overlap > 0.3 || Math.abs(best.diff) > TOLERANCE_M) && Date.now() < deadline; i += 1) {
        if (Math.abs(h.combos[i].diff) > TOLERANCE_M) break;
        const alt = await fetchRoute(h.combos[i], h.heading);
        if (score(alt) < score(best)) best = alt;
      }
      return best;
    }));
  }

  /**
   * @param {{lat: number, lng: number, km: number, seed?: number, count?: number}} q
   * @param {{table: Function, route: Function}} client
   * @returns {Promise<{target, tolerance, withinTolerance, method, routes: object[]}>}
   */
  async function suggest({ lat, lng, km, seed = 0, count = 3 }, client, { budgetMs = 20000 } = {}) {
    const target = Math.round(km * 1000);
    const start = [lat, lng];
    const deadline = Date.now() + budgetMs;
    const base = (Number(seed) * 137.508) % 360; // sudut emas: setiap "rute lain" memberi arah baru
    const tries = [0, 120, 240].map((a, i) => ({ heading: (base + a) % 360, dir: i % 2 ? -1 : 1 }));

    let results;
    let method = 'table';
    try {
      results = await viaTable(client, start, target, tries, deadline);
    } catch (err) {
      if (err.code !== 'table_unavailable') throw err;
      method = 'iterate';
      results = await settle(tries.map((t) => iterateHeading(client, start, t.heading, t.dir, target, deadline)));
    }
    // Jalan sungguhan tidak serapi lingkaran: bila rute yang pas masih kurang, coba arah lain.
    const fits = () => results.filter((c) => Math.abs(c.diff) <= TOLERANCE_M).length;
    if (fits() < 2 && deadline - Date.now() > budgetMs / 3) {
      const more = tries.map((t) => ({ heading: (t.heading + 60) % 360, dir: -t.dir }));
      const extra = method === 'table'
        ? await viaTable(client, start, target, more, deadline).catch(() => [])
        : await settle(more.map((t) => iterateHeading(client, start, t.heading, t.dir, target, deadline))).catch(() => []);
      results.push(...extra);
    }

    // Urutkan dari yang terbaik, buang rute yang hampir sama dengan rute lain.
    const picked = [];
    for (const c of results.filter(Boolean).sort((a, b) => score(a) - score(b))) {
      if (picked.some((p) => G.similarity(c.coords, p.coords) > 0.6)) continue;
      picked.push(c);
    }
    const within = picked.filter((c) => Math.abs(c.diff) <= TOLERANCE_M);
    const list = (within.length ? within : picked.slice(0, 1)).slice(0, count);
    const fix = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
    const routes = list.map((c, i) => {
      const coords = G.simplify(c.coords, 3).map(fix);
      const origin = coords[0];
      const far = coords.reduce((a, p) => (G.distance(origin, p) > G.distance(origin, a) ? p : a), origin);
      return {
        id: LETTERS[i],
        distance: Math.round(c.distance),
        diff: Math.round(c.diff),
        direction: G.compass(G.bearing(origin, far)),
        turns: c.turns,
        overlap: Math.round(c.overlap * 100) / 100,
        streets: c.streets.slice(0, 8),
        start: origin,
        far: fix(far),
        waypoints: G.pointsAlong(coords, [0.25, 0.5, 0.75]).map(fix),
        coords,
      };
    });
    return { target, tolerance: TOLERANCE_M, withinTolerance: within.length > 0, method, routes };
  }

  return { suggest, osrmClient, readRoute, readTable, limiter, RouteError, TOLERANCE_M, SCALES };
});
