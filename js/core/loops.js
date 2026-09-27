/**
 * Saran rute lari dengan jarak mendekati target (selisih maks. 300 m) dan tetap dalam radius 7 km
 * dari titik mulai, lewat mesin rute OpenStreetMap (OSRM profil pejalan kaki). Dipakai di browser
 * (langsung ke layanan rute) dan di server (cadangan). Dua jenis rute:
 *
 * - Putar: untuk tiap arah, 15 titik di beberapa lingkaran diukur jarak jalannya dalam SATU
 *   permintaan tabel jarak; semua kombinasi dihitung di sini, beberapa yang paling pas diambil
 *   bentuknya, "taji" ke jalan buntu dibuang, lalu yang paling bulat dengan belokan paling sedikit
 *   dipilih.
 * - Lurus: lari menjauh di jalan yang selurus mungkin lalu balik lewat jalan yang sama. Satu tabel
 *   jarak dari titik mulai ke titik-titik di 12 arah; dipilih yang jarak jalannya hampir sama dengan
 *   garis lurusnya.
 *
 * Bila layanan tabel tidak tersedia, rute putar dicari dengan cara lama (jari-jari disesuaikan
 * berulang lewat permintaan rute).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'));
  else (root.Planner = root.Planner || {}).loops = factory(root.Planner.geo);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  const TOLERANCE_M = 300;
  const MAX_RADIUS_M = 7000; // rute tidak menjauh lebih dari 7 km (garis lurus) dari titik mulai
  // Jarak jalan ≈ 7 × jari-jari: keliling persegi di dalam lingkaran (5,66 r) × faktor liku jalan ±1,25.
  const ROAD_FACTOR = 7.07;
  const SCALES = [0.7, 0.85, 1, 1.15, 1.3];
  const RAY_SCALES = [0.8, 0.9, 1, 1.1];
  const RAYS = 12;
  const MAX_SNAP_START = 600; // titik mulai harus dekat jalan/jalur
  const MAX_SNAP_POINT = 150; // titik antara yang jatuh jauh dari jalan (danau, sawah, gang buntu) dilewati
  const MAX_ITER = 5;
  const LETTERS = ['A', 'B', 'C', 'D'];
  const TYPES = ['semua', 'putar', 'lurus'];

  class RouteError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  const unavailable = () => new RouteError(502, 'Layanan rute OpenStreetMap sedang tidak bisa dihubungi. Coba lagi sebentar lagi.', 'route_unavailable');
  const farStart = () => new RouteError(422, 'Titik mulai terlalu jauh dari jalan. Pindahkan titik mulai ke dekat jalan.', 'far_from_road');

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

  /**
   * Balasan tabel jarak OSRM → {distances: m[][] (null = tak terjangkau), snaps: m[], locations: [lat,lng][]}.
   * `snaps` & `locations` per kolom (tujuan); sama dengan baris bila tabel penuh.
   */
  function readTable(data) {
    if (!data || data.code !== 'Ok' || !Array.isArray(data.distances)) {
      if (data && data.code === 'NoSegment') throw new RouteError(422, 'Tidak ada jalan yang bisa dilalui di sekitar titik mulai.', 'no_route');
      throw new RouteError(502, 'Tabel jarak tidak tersedia.', 'table_unavailable');
    }
    const wps = data.destinations && data.destinations.length ? data.destinations : data.sources || [];
    const src = data.sources || [];
    return {
      distances: data.distances,
      snaps: wps.map((s) => (s && Number.isFinite(s.distance) ? s.distance : 0)),
      startSnap: src[0] && Number.isFinite(src[0].distance) ? src[0].distance : 0,
      locations: wps.map((s) => (s && Array.isArray(s.location) ? [s.location[1], s.location[0]] : null)),
    };
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
   * Klien OSRM: {table(points, {sources}), route(points)}. `fetchFn` = fetch browser atau Node.
   * @param {string} base mis. https://routing.openstreetmap.de/routed-foot
   */
  function osrmClient(base, { fetchFn, headers = {}, timeoutMs = 8000, concurrency = 4, gapMs = 60 } = {}) {
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
      table: async (points, { sources } = {}) => readTable(await call('table', points, `annotations=distance${sources ? `&sources=${sources.join(';')}` : ''}`)),
      route: async (points) => readRoute(await call('route', points, 'overview=full&geometries=geojson&steps=true')),
    };
  }

  async function settle(promises) {
    const out = await Promise.allSettled(promises);
    const ok = out.filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value);
    if (!ok.length) throw out.length && out[0].reason ? out[0].reason : unavailable();
    return ok;
  }

  const off = (c) => Math.abs(c.diff);
  const perKm = (c) => c.turns / Math.max(0.5, c.distance / 1000);

  /** Nilai kandidat (lebih kecil lebih baik): dalam toleransi dulu, lalu bentuk yang rapi. */
  function score(c) {
    let s = off(c) <= TOLERANCE_M ? 0 : 100000 + off(c);
    if (c.maxDist > MAX_RADIUS_M) s += 50000;
    s += off(c) * 0.3 + perKm(c) * 150;
    if (c.type === 'lurus') s += (1 - c.straightness) * 2500;
    else s += (c.overlap || 0) * 1500 + (1 - (c.roundness || 0)) * 700;
    return s;
  }

  const farthest = (start, coords) => coords.reduce((m, p) => Math.max(m, G.distance(start, p)), 0);

  /** Rute putar dari satu jawaban rute: buang taji, hitung ulang jarak & bentuk. */
  function loopCandidate(start, route, target, heading) {
    const coords = G.removeSpurs(route.coords);
    const cut = G.lineLength(route.coords) - G.lineLength(coords);
    const distance = route.distance - cut;
    return {
      type: 'putar',
      heading,
      coords,
      distance,
      diff: distance - target,
      streets: route.streets,
      turns: G.countTurns(coords),
      overlap: G.overlapRatio(coords),
      roundness: G.roundness(coords),
      maxDist: farthest(start, coords),
      snap: route.snap,
    };
  }

  /**
   * Satu arah dengan tabel jarak: 15 titik (3 posisi × 5 jari-jari), 125 kombinasi rute putar.
   * @returns {Promise<{heading, combos: {points, distance, diff}[]}>} kombinasi terbaik lebih dulu
   */
  async function tableHeading(client, start, heading, dir, target) {
    const r0 = target / ROAD_FACTOR;
    const rings = SCALES.map((s) => G.loopPoints(start, heading, r0 * s, 3, dir));
    const points = [start, ...rings.flat()];
    const { distances: d, snaps, startSnap } = await client.table(points);
    if ((startSnap || snaps[0] || 0) > MAX_SNAP_START) throw farStart();
    const at = (ring, k) => 1 + ring * 3 + k; // indeks titik di tabel
    const ok = (i) => (snaps[i] || 0) <= MAX_SNAP_POINT && G.distance(start, points[i]) <= MAX_RADIUS_M;
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
          // Bentuk yang bulat (jari-jari mirip) lebih jarang zig-zag atau bolak-balik.
          const uneven = Math.abs(a - b) + Math.abs(b - c);
          combos.push({ points: p.map((i) => points[i]), distance, diff: distance - target, rank: Math.abs(distance - target) + uneven * 60 });
        }
      }
    }
    combos.sort((x, y) => x.rank - y.rank);
    return { heading, combos };
  }

  /** Rute putar lewat tabel jarak: beberapa kombinasi terbaik per arah diambil bentuknya. */
  async function loopsViaTable(client, start, target, tries, perHeading) {
    const headings = await settle(tries.map((t) => tableHeading(client, start, t.heading, t.dir, target)));
    const jobs = [];
    for (const h of headings) {
      if (!h.combos.length) continue;
      // Kombinasi di sekitar target (taji bisa memendekkan rute, jadi sedikit lebih panjang pun boleh).
      const near = h.combos.filter((c) => c.diff >= -TOLERANCE_M && c.diff <= TOLERANCE_M * 2);
      const pick = (near.length ? near : h.combos).slice(0, perHeading);
      for (const combo of pick) {
        jobs.push(client.route([start, ...combo.points, start]).then((route) => loopCandidate(start, route, target, h.heading)));
      }
    }
    return jobs.length ? settle(jobs) : [];
  }

  /** Cadangan tanpa tabel: sesuaikan jari-jari berulang lewat permintaan rute. */
  async function iterateHeading(client, start, heading, dir, target, deadline) {
    let r = target / ROAD_FACTOR;
    let prev = null;
    let best = null;
    for (let i = 0; i < MAX_ITER && Date.now() < deadline; i += 1) {
      r = Math.min(r, MAX_RADIUS_M / 2);
      const route = await client.route([start, ...G.loopPoints(start, heading, r, 3, dir), start]);
      if (route.snap > MAX_SNAP_START) throw farStart();
      const cand = loopCandidate(start, route, target, heading);
      if (!best || score(cand) < score(best)) best = cand;
      if (off(cand) <= TOLERANCE_M * 0.6 && cand.overlap < 0.25) break;
      let next = cand.distance > 0 ? r * (target / cand.distance) : r * 1.5;
      if (prev && prev.distance !== cand.distance) {
        const s = r + ((target - cand.distance) * (r - prev.r)) / (cand.distance - prev.distance);
        if (Number.isFinite(s) && s > 0) next = s;
      }
      prev = { r, distance: cand.distance };
      r = Math.min(r * 2, Math.max(r * 0.5, next));
    }
    return best;
  }

  /**
   * Rute lurus bolak-balik: titik di 12 arah, satu tabel jarak dari titik mulai, pilih yang jarak
   * jalannya ≈ setengah target dan hampir segaris lurus, lalu ambil jalurnya.
   */
  async function straights(client, start, target, base, count) {
    const half = target / 2;
    const points = [start];
    for (let i = 0; i < RAYS; i += 1) {
      const heading = (base + (360 / RAYS) * i) % 360;
      for (const s of RAY_SCALES) {
        const b = (half / 1.1) * s;
        if (b <= MAX_RADIUS_M) points.push(G.destination(start, heading, b));
      }
    }
    if (points.length < 2) return [];
    const t = await client.table(points, { sources: [0] });
    if ((t.startSnap || 0) > MAX_SNAP_START) throw farStart();
    const cands = [];
    for (let i = 1; i < points.length; i += 1) {
      const d = t.distances[0][i];
      if (d == null || !Number.isFinite(d) || d <= 0 || (t.snaps[i] || 0) > MAX_SNAP_POINT) continue;
      const tip = t.locations[i] || points[i];
      const beeline = G.distance(start, tip);
      if (beeline > MAX_RADIUS_M) continue;
      const diff = 2 * d - target;
      cands.push({ tip, heading: G.bearing(start, tip), diff, straightness: Math.min(1, beeline / d), rank: Math.abs(diff) * 0.5 + (1 - Math.min(1, beeline / d)) * 2500 + (Math.abs(diff) > TOLERANCE_M ? 100000 : 0) });
    }
    cands.sort((a, b) => a.rank - b.rank);
    // Arah yang berbeda-beda (selisih minimal 40°).
    const chosen = [];
    for (const c of cands) {
      if (chosen.length >= count) break;
      if (chosen.some((x) => Math.abs(((c.heading - x.heading + 540) % 360) - 180) < 40)) continue;
      chosen.push(c);
    }
    return settle(chosen.map(async (c) => {
      const way = await client.route([start, c.tip]);
      const coords = [...way.coords, ...way.coords.slice(0, -1).reverse()];
      const distance = 2 * way.distance;
      const tip = way.coords[way.coords.length - 1];
      return {
        type: 'lurus',
        heading: c.heading,
        coords,
        tip,
        distance,
        diff: distance - target,
        streets: way.streets,
        turns: G.countTurns(way.coords),
        overlap: 0,
        straightness: Math.min(1, G.distance(way.coords[0], tip) / Math.max(1, way.distance)),
        maxDist: farthest(start, way.coords),
        snap: way.snap,
      };
    })).catch(() => []);
  }

  /**
   * @param {{lat: number, lng: number, km: number, seed?: number, type?: 'semua'|'putar'|'lurus', count?: number}} q
   * @param {{table: Function, route: Function}} client
   * @returns {Promise<{target, tolerance, maxRadius, withinTolerance, method, type, routes: object[]}>}
   */
  async function suggest({ lat, lng, km, seed = 0, type = 'semua', count = 3 }, client, { budgetMs = 15000 } = {}) {
    const kind = TYPES.includes(type) ? type : 'semua';
    const target = Math.round(km * 1000);
    const start = [lat, lng];
    const deadline = Date.now() + budgetMs;
    const base = (Number(seed) * 137.508) % 360; // sudut emas: setiap "rute lain" memberi arah baru
    const tries = [0, 120, 240].map((a, i) => ({ heading: (base + a) % 360, dir: i % 2 ? -1 : 1 }));
    const wantLoops = kind !== 'lurus';
    // Bolak-balik lurus: ujungnya sejauh ±setengah target, jadi paling panjang ±16 km dalam radius 7 km.
    const wantStraight = kind !== 'putar' && target / 2 <= MAX_RADIUS_M * 1.15;
    if (kind === 'lurus' && !wantStraight) {
      throw new RouteError(422, `Rute lurus bolak-balik paling panjang sekitar ${Math.floor((MAX_RADIUS_M * 2.3) / 1000)} km agar tetap dalam radius ${MAX_RADIUS_M / 1000} km. Pilih jenis Putar untuk jarak ini.`, 'straight_too_long');
    }

    let method = 'table';
    const loopJob = async () => {
      if (!wantLoops) return [];
      try {
        const list = await loopsViaTable(client, start, target, tries, kind === 'putar' ? 3 : 2);
        const fits = list.filter((c) => off(c) <= TOLERANCE_M).length;
        if (fits < (kind === 'putar' ? 2 : 1) && deadline - Date.now() > budgetMs / 3) {
          const more = tries.map((t) => ({ heading: (t.heading + 60) % 360, dir: -t.dir }));
          list.push(...(await loopsViaTable(client, start, target, more, 2).catch(() => [])));
        }
        return list;
      } catch (err) {
        if (err.code !== 'table_unavailable') throw err;
        method = 'iterate';
        return settle(tries.map((t) => iterateHeading(client, start, t.heading, t.dir, target, deadline)));
      }
    };
    const straightJob = async () => (wantStraight ? straights(client, start, target, base, kind === 'lurus' ? 4 : 2).catch((err) => {
      if (err.code === 'far_from_road') throw err;
      return [];
    }) : []);
    const [loops, lines] = await Promise.all([loopJob(), straightJob()]);

    // Terbaik per jenis, buang rute yang hampir sama dengan rute lain.
    const pickBest = (list, n) => {
      const out = [];
      for (const c of list.filter(Boolean).sort((a, b) => score(a) - score(b))) {
        if (out.length >= n) break;
        if (out.some((p) => G.similarity(c.coords, p.coords) > 0.6)) continue;
        out.push(c);
      }
      return out;
    };
    const fit = (c) => off(c) <= TOLERANCE_M && c.maxDist <= MAX_RADIUS_M;
    let chosen;
    if (kind === 'putar') chosen = pickBest(loops.filter(fit), count);
    else if (kind === 'lurus') chosen = pickBest(lines.filter(fit), count);
    else {
      const l = pickBest(loops.filter(fit), count);
      const s = pickBest(lines.filter(fit), 1);
      chosen = s.length ? [...l.slice(0, count - 1), ...s] : l;
    }
    const withinTolerance = chosen.length > 0;
    if (!chosen.length) chosen = pickBest([...loops, ...lines], 1);

    const fix = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
    const routes = chosen.map((c, i) => {
      const coords = G.simplify(c.coords, 3).map(fix);
      const origin = coords[0];
      const far = c.type === 'lurus' ? fix(c.tip) : coords.reduce((a, p) => (G.distance(origin, p) > G.distance(origin, a) ? p : a), origin);
      return {
        id: LETTERS[i],
        type: c.type,
        distance: Math.round(c.distance),
        diff: Math.round(c.diff),
        direction: G.compass(G.bearing(origin, far)),
        turns: c.turns,
        overlap: Math.round((c.overlap || 0) * 100) / 100,
        shape: Math.round((c.type === 'lurus' ? c.straightness : c.roundness) * 100) / 100,
        maxDist: Math.round(c.maxDist),
        streets: c.streets.slice(0, 8),
        start: origin,
        far,
        // Titik antara untuk Google Maps: lurus cukup ujungnya, putar tiga titik di sepanjang rute.
        waypoints: c.type === 'lurus' ? [far] : G.pointsAlong(coords, [0.25, 0.5, 0.75]).map(fix),
        coords,
      };
    });
    return { target, tolerance: TOLERANCE_M, maxRadius: MAX_RADIUS_M, withinTolerance, method, type: kind, routes };
  }

  return { suggest, osrmClient, readRoute, readTable, limiter, score, RouteError, TOLERANCE_M, MAX_RADIUS_M, SCALES, TYPES };
});
