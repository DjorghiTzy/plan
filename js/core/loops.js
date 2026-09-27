/**
 * Saran rute lari dengan jarak mendekati target (selisih maks. 300 m) dan tetap dalam radius 25 km
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
  const MAX_RADIUS_M = 25000; // rute tidak menjauh lebih dari 25 km (garis lurus) dari titik mulai
  // Jarak jalan ≈ 7 × jari-jari: keliling persegi di dalam lingkaran (5,66 r) × faktor liku jalan ±1,25.
  const ROAD_FACTOR = 7.07;
  const SCALES = [0.55, 0.7, 0.85, 1, 1.15, 1.3, 1.5];
  const RAY_SCALES = [0.8, 0.9, 1, 1.1];
  const RAYS = 12;
  const MAX_SNAP_START = 600; // titik mulai harus dekat jalan/jalur
  // Titik yang jatuh jauh dari jalan (danau, kolong, sawah) tetap boleh, tapi dinilai lebih buruk.
  const SNAP_SOFT = 150;
  const SNAP_HARD = 800;
  const snapPenalty = (s) => Math.max(0, (s || 0) - SNAP_SOFT) * 0.8;
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
  function osrmClient(base, { fetchFn, headers = {}, timeoutMs = 8000, concurrency = 3, gapMs = 120, cacheSize = 200 } = {}) {
    const url0 = String(base).replace(/\/$/, '');
    const limit = limiter(concurrency, gapMs);
    const cache = new Map(); // URL → jawaban; mencari lagi di tempat yang sama tidak perlu ke server
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
    const call = async (service, points, query) => {
      const path = points.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
      const url = `${url0}/${service}/v1/driving/${path}?${query}`;
      if (cache.has(url)) return cache.get(url);
      const data = await limit(async () => {
        let res = await get(url);
        // Layanan gratis membatasi permintaan: tunggu sebentar lalu ulang (paling banyak dua kali).
        for (const wait of [1500, 3000]) {
          if (res.status !== 429) break;
          await sleep(wait);
          res = await get(url);
        }
        if (res.status === 429) throw new RouteError(429, 'Layanan rute sedang membatasi permintaan karena terlalu sering mencari. Tunggu sekitar 1 menit, lalu coba lagi.', 'route_busy');
        const json = await res.json().catch(() => null);
        if (!res.ok && !(json && json.code)) {
          if (service === 'table') throw new RouteError(502, 'Tabel jarak tidak tersedia.', 'table_unavailable');
          throw unavailable();
        }
        return json;
      });
      if (data && data.code === 'Ok') {
        if (cache.size >= cacheSize) cache.delete(cache.keys().next().value);
        cache.set(url, data);
      }
      return data;
    };
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

  const locKey = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const key6 = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

  /**
   * Pelajari titik mana yang berada di ujung jalan buntu (dan sepanjang apa gangnya) dari satu rute:
   * titik yang hilang saat taji dibuang adalah ujung gang; panjangnya diukur mundur sampai jalan utama.
   */
  function learnSpurs(raw, clean, waypoints, spur) {
    const kept = new Set(clean.map(key6));
    for (const w of waypoints) {
      let idx = -1;
      let best = Infinity;
      for (let i = 0; i < raw.length; i += 1) {
        const dd = G.distance(raw[i], w);
        if (dd < best) {
          best = dd;
          idx = i;
        }
      }
      if (idx < 0 || best > 40) continue;
      if (kept.has(key6(raw[idx]))) {
        spur.set(locKey(w), 0);
        continue;
      }
      let j = idx;
      while (j > 0 && !kept.has(key6(raw[j]))) j -= 1;
      spur.set(locKey(w), G.lineLength(raw.slice(j, idx + 1)));
    }
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
    const { distances: d, snaps, startSnap, locations } = await client.table(points);
    if ((startSnap || snaps[0] || 0) > MAX_SNAP_START) throw farStart();
    const at = (ring, k) => 1 + ring * 3 + k; // indeks titik di tabel
    const loc = (i) => (locations && locations[i]) || points[i];
    const ok = (i) => (snaps[i] || 0) <= SNAP_HARD && G.distance(start, loc(i)) <= MAX_RADIUS_M;
    // Titik yang menempel ke lokasi jalan yang sama menghasilkan rute yang sama: cukup satu.
    const byKey = new Map();
    const n = SCALES.length;
    for (let a = 0; a < n; a += 1) {
      for (let b = 0; b < n; b += 1) {
        for (let c = 0; c < n; c += 1) {
          const p = [at(a, 0), at(b, 1), at(c, 2)];
          if (!p.every(ok)) continue;
          const legs = [d[0][p[0]], d[p[0]][p[1]], d[p[1]][p[2]], d[p[2]][0]];
          if (legs.some((x) => x == null || !Number.isFinite(x))) continue;
          const distance = legs[0] + legs[1] + legs[2] + legs[3];
          const locs = p.map(loc);
          const keys = locs.map(locKey);
          if (new Set(keys).size < 3) continue;
          // Bentuk yang bulat (jari-jari mirip) lebih jarang zig-zag atau bolak-balik.
          const uneven = Math.abs(a - b) + Math.abs(b - c);
          const penalty = uneven * 60 + p.reduce((sum, i) => sum + snapPenalty(snaps[i]), 0);
          const combo = { key: keys.join('|'), keys, locs, distance, diff: distance - target, penalty, rank: Math.abs(distance - target) + penalty };
          const prev = byKey.get(combo.key);
          if (!prev || combo.rank < prev.rank) byKey.set(combo.key, combo);
        }
      }
    }
    // Rute segitiga (dua titik antara, sisi kiri & kanan lingkaran): lebih banyak pilihan panjang.
    for (let a = 0; a < n; a += 1) {
      for (let c = 0; c < n; c += 1) {
        const p = [at(a, 0), at(c, 2)];
        if (!p.every(ok)) continue;
        const legs = [d[0][p[0]], d[p[0]][p[1]], d[p[1]][0]];
        if (legs.some((x) => x == null || !Number.isFinite(x))) continue;
        const distance = legs[0] + legs[1] + legs[2];
        const locs = p.map(loc);
        const keys = locs.map(locKey);
        if (keys[0] === keys[1]) continue;
        const penalty = Math.abs(a - c) * 60 + 80 + p.reduce((sum, i) => sum + snapPenalty(snaps[i]), 0);
        const combo = { key: keys.join('|'), keys, locs, distance, diff: distance - target, penalty, rank: Math.abs(distance - target) + penalty };
        const prev = byKey.get(combo.key);
        if (!prev || combo.rank < prev.rank) byKey.set(combo.key, combo);
      }
    }
    const combos = [...byKey.values()].sort((x, y) => x.rank - y.rank);
    return { heading, combos };
  }

  /**
   * Rute putar lewat tabel jarak: beberapa kombinasi terbaik per arah diambil bentuknya. Tabel
   * menghitung jarak termasuk masuk-keluar gang buntu, padahal taji itu dibuang dari rute. Karena
   * itu, dari rute yang sudah diambil dipelajari titik mana yang ujung gang (dan panjang gangnya),
   * lalu perkiraan jarak kombinasi lain dikoreksi untuk putaran berikutnya.
   */
  async function loopsViaTable(client, start, target, tries, perHeading, deadline, rounds = 2) {
    const headings = await settle(tries.map((t) => tableHeading(client, start, t.heading, t.dir, target)));
    const results = await Promise.all(headings.filter((h) => h.combos.length).map(async (h) => {
      const tried = new Set();
      const spur = new Map();
      const got = [];
      const fetchSome = async (list) => {
        list.forEach((c) => tried.add(c.key));
        const out = await Promise.allSettled(list.map(async (combo) => {
          const route = await client.route([start, ...combo.locs, start]);
          const cand = loopCandidate(start, route, target, h.heading);
          learnSpurs(route.coords, cand.coords, combo.locs, spur);
          return cand;
        }));
        got.push(...out.filter((x) => x.status === 'fulfilled').map((x) => x.value));
      };
      const near = h.combos.filter((c) => c.diff >= -TOLERANCE_M && c.diff <= TOLERANCE_M * 2);
      await fetchSome((near.length ? near : h.combos).slice(0, perHeading));
      for (let round = 0; round < rounds && !got.some((c) => off(c) <= TOLERANCE_M) && Date.now() < deadline; round += 1) {
        const ranked = h.combos
          .filter((c) => !tried.has(c.key))
          .map((c) => {
            const known = c.keys.filter((k) => spur.has(k));
            const est = c.distance - 2 * known.reduce((a, k) => a + spur.get(k), 0);
            return { c, off: Math.abs(est - target), rank: Math.abs(est - target) + c.penalty + (c.keys.length - known.length) * 40 };
          })
          .sort((a, b) => a.rank - b.rank);
        // Arah ini tidak menjanjikan (perkiraan terbaik pun jauh dari target): hemat permintaan.
        if (!ranked.length || ranked[0].off > TOLERANCE_M * 2) break;
        await fetchSome(ranked.slice(0, 2).map((x) => x.c));
      }
      return got;
    }));
    return results.flat();
  }

  /**
   * Cadangan tanpa tabel: dua jari-jari sekaligus, lalu perkirakan jari-jari yang pas dari garis
   * jarak(jari-jari) yang teramati (jarak sudah tanpa taji), paling banyak tiga kali.
   * @returns {Promise<object[]>} semua kandidat yang didapat
   */
  async function iterateHeading(client, start, heading, dir, target, deadline) {
    const r0 = target / ROAD_FACTOR;
    const cands = [];
    const tried = [];
    const tryR = async (r) => {
      const rr = Math.min(Math.max(r, r0 * 0.35), MAX_RADIUS_M / 2);
      if (tried.some((x) => Math.abs(x - rr) / rr < 0.03)) return;
      tried.push(rr);
      const route = await client.route([start, ...G.loopPoints(start, heading, rr, 3, dir), start]);
      if (route.snap > MAX_SNAP_START) throw farStart();
      cands.push({ ...loopCandidate(start, route, target, heading), r: rr });
    };
    const first = await Promise.allSettled([0.8, 1.2].map((s) => tryR(r0 * s)));
    const far = first.find((x) => x.status === 'rejected' && x.reason && x.reason.code === 'far_from_road');
    if (far) throw far.reason;
    for (let i = 0; i < 3 && !cands.some((c) => off(c) <= TOLERANCE_M) && Date.now() < deadline; i += 1) {
      const pts = cands.filter((c) => c.distance > 0);
      if (!pts.length) break;
      let r = pts[0].r * (target / pts[0].distance);
      if (pts.length >= 2) {
        const mx = pts.reduce((a, c) => a + c.r, 0) / pts.length;
        const my = pts.reduce((a, c) => a + c.distance, 0) / pts.length;
        const sxy = pts.reduce((a, c) => a + (c.r - mx) * (c.distance - my), 0);
        const sxx = pts.reduce((a, c) => a + (c.r - mx) ** 2, 0);
        const m = sxx ? sxy / sxx : 0;
        if (m > 0) r = mx + (target - my) / m;
      }
      await tryR(r).catch(() => {});
    }
    return cands;
  }

  /**
   * Rute lurus bolak-balik: titik di 12 arah (4 jarak per arah), satu tabel jarak dari titik mulai.
   * Per arah, titik balik yang pas diperkirakan dari jarak jalan yang teramati (interpolasi), lalu
   * dipilih arah yang paling lurus. Jalurnya diambil dan, bila masih meleset lebih dari 300 m
   * (sering terjadi pada jarak jauh), titik baliknya digeser paling banyak dua kali.
   */
  async function straights(client, start, target, base, count) {
    const half = target / 2;
    const points = [start];
    const meta = [];
    for (let i = 0; i < RAYS; i += 1) {
      const heading = (base + (360 / RAYS) * i) % 360;
      for (const s of RAY_SCALES) {
        const b = (half / 1.1) * s;
        if (b <= MAX_RADIUS_M) {
          points.push(G.destination(start, heading, b));
          meta.push({ ray: i, heading, b });
        }
      }
    }
    if (points.length < 2) return [];
    let t;
    try {
      t = await client.table(points, { sources: [0] });
    } catch (err) {
      if (err.code !== 'table_unavailable') throw err;
      return straightsViaRoutes(client, start, target, base, count);
    }
    if ((t.startSnap || 0) > MAX_SNAP_START) throw farStart();
    const rays = new Map();
    meta.forEach((m, k) => {
      const i = k + 1;
      const d = t.distances[0][i];
      if (d == null || !Number.isFinite(d) || d <= 0 || (t.snaps[i] || 0) > SNAP_HARD) return;
      const tip = t.locations[i] || points[i];
      const beeline = G.distance(start, tip);
      if (beeline > MAX_RADIUS_M) return;
      if (!rays.has(m.ray)) rays.set(m.ray, []);
      rays.get(m.ray).push({ ...m, d, tip, beeline, straightness: Math.min(1, beeline / d), snap: t.snaps[i] || 0 });
    });
    const cands = [];
    for (const samples of rays.values()) {
      samples.sort((a, b) => a.b - b.b);
      const straightness = samples.reduce((a, x) => a + x.straightness, 0) / samples.length;
      const exact = samples.find((x) => Math.abs(2 * x.d - target) <= TOLERANCE_M);
      let b;
      let tip = null;
      if (exact) {
        b = exact.b;
        tip = exact.tip;
      } else {
        // Garis antara dua sampel yang mengapit setengah target; kalau tidak ada, perbesar/perkecil sebanding.
        const lo = [...samples].reverse().find((x) => x.d <= half);
        const hi = samples.find((x) => x.d >= half);
        if (lo && hi && hi.d > lo.d) b = lo.b + ((half - lo.d) * (hi.b - lo.b)) / (hi.d - lo.d);
        else {
          const near = samples.reduce((a, x) => (Math.abs(x.d - half) < Math.abs(a.d - half) ? x : a), samples[0]);
          b = near.b * (half / near.d);
        }
      }
      if (b > MAX_RADIUS_M) continue;
      const penalty = samples.reduce((a, x) => a + snapPenalty(x.snap), 0) / samples.length;
      cands.push({ heading: samples[0].heading, b, tip, straightness, rank: (1 - straightness) * 2500 + penalty + (exact ? 0 : 60) });
    }
    cands.sort((a, b) => a.rank - b.rank);
    // Arah yang berbeda-beda (selisih minimal 40°).
    const chosen = [];
    for (const c of cands) {
      if (chosen.length >= count) break;
      if (chosen.some((x) => Math.abs(((c.heading - x.heading + 540) % 360) - 180) < 40)) continue;
      chosen.push(c);
    }
    return settle(chosen.map((c) => refineStraight(client, start, target, c.heading, c.b, c.tip))).catch(() => []);
  }

  /** Ambil jalur lurus ke titik balik; geser titik balik (maks. 2×) sampai selisihnya ≤ 300 m. */
  async function refineStraight(client, start, target, heading, b0, tip0 = null) {
    let b = b0;
    let best = straightCandidate(start, await client.route([start, tip0 || G.destination(start, heading, b)]), target, heading);
    for (let i = 0; i < 2 && off(best) > TOLERANCE_M && best.distance > 0; i += 1) {
      b = Math.min(b * (target / best.distance), MAX_RADIUS_M);
      const next = straightCandidate(start, await client.route([start, G.destination(start, heading, b)]), target, heading);
      if (off(next) < off(best)) best = next;
    }
    return best;
  }

  /** Satu rute lurus bolak-balik dari satu jalur S → ujung. */
  function straightCandidate(start, way, target, heading) {
    const tip = way.coords[way.coords.length - 1];
    const distance = 2 * way.distance;
    return {
      type: 'lurus',
      heading,
      coords: [...way.coords, ...way.coords.slice(0, -1).reverse()],
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
  }

  /** Cadangan rute lurus tanpa tabel: 6 arah, lalu koreksi titik balik untuk arah yang paling lurus. */
  async function straightsViaRoutes(client, start, target, base, count) {
    const half = target / 2;
    const dirs = [0, 1, 2, 3, 4, 5].map((i) => (base + i * 60) % 360);
    const b0 = Math.min(half / 1.15, MAX_RADIUS_M);
    const first = (await Promise.allSettled(dirs.map(async (h) => ({ h, c: straightCandidate(start, await client.route([start, G.destination(start, h, b0)]), target, h) }))))
      .filter((x) => x.status === 'fulfilled')
      .map((x) => x.value);
    const good = first.filter((x) => x.c.distance > 0).sort((a, b) => b.c.straightness - a.c.straightness).slice(0, count);
    const fixed = await Promise.allSettled(good.filter((x) => off(x.c) > TOLERANCE_M).map((x) => refineStraight(client, start, target, x.h, Math.min(b0 * (target / x.c.distance), MAX_RADIUS_M))));
    return [...first.map((x) => x.c), ...fixed.filter((x) => x.status === 'fulfilled').map((x) => x.value)];
  }

  /**
   * @param {{lat: number, lng: number, km: number, seed?: number, type?: 'semua'|'putar'|'lurus', count?: number}} q
   * @param {{table: Function, route: Function}} client
   * @returns {Promise<{target, tolerance, maxRadius, withinTolerance, method, type, routes: object[]}>}
   */
  async function suggest({ lat, lng, km, seed = 0, type = 'semua', count = 3 }, rawClient, { budgetMs = 15000 } = {}) {
    const kind = TYPES.includes(type) ? type : 'semua';
    // Hitung permintaan & yang gagal (ditampilkan kecil di aplikasi untuk memudahkan pelacakan masalah).
    const stats = { requests: 0, failed: 0, busy: 0 };
    const track = (fn) => async (...args) => {
      stats.requests += 1;
      try {
        return await fn(...args);
      } catch (err) {
        stats.failed += 1;
        if (err && err.code === 'route_busy') stats.busy += 1;
        throw err;
      }
    };
    const client = { table: track(rawClient.table), route: track(rawClient.route) };
    const target = Math.round(km * 1000);
    const start = [lat, lng];
    const deadline = Date.now() + budgetMs;
    const base = (Number(seed) * 137.508) % 360; // sudut emas: setiap "rute lain" memberi arah baru
    const tries = [0, 120, 240].map((a, i) => ({ heading: (base + a) % 360, dir: i % 2 ? -1 : 1 }));
    const wantLoops = kind !== 'lurus';
    // Bolak-balik lurus: ujungnya sejauh ±setengah target (dalam radius 25 km cukup sampai maraton).
    const wantStraight = kind !== 'putar' && target / 2 <= MAX_RADIUS_M * 1.15;
    if (kind === 'lurus' && !wantStraight) {
      throw new RouteError(422, `Rute lurus bolak-balik paling panjang sekitar ${Math.floor((MAX_RADIUS_M * 2.3) / 1000)} km agar tetap dalam radius ${MAX_RADIUS_M / 1000} km. Pilih jenis Putar untuk jarak ini.`, 'straight_too_long');
    }

    let method = 'table';
    const loopJob = async () => {
      if (!wantLoops) return [];
      try {
        // "Semua" selalu punya rute lurus sebagai pilihan, jadi pencarian putar cukup satu putaran koreksi.
        const onlyLoops = kind === 'putar';
        const list = await loopsViaTable(client, start, target, tries, 2, deadline, onlyLoops ? 2 : 1);
        const fits = list.filter((c) => off(c) <= TOLERANCE_M).length;
        if (fits < 1 && deadline - Date.now() > budgetMs / 3) {
          const more = tries.map((t) => ({ heading: (t.heading + 60) % 360, dir: -t.dir }));
          list.push(...(await loopsViaTable(client, start, target, more, 2, deadline, onlyLoops ? 2 : 1).catch(() => [])));
        }
        return list;
      } catch (err) {
        if (err.code !== 'table_unavailable') throw err;
        method = 'iterate';
        const list = (await settle(tries.map((t) => iterateHeading(client, start, t.heading, t.dir, target, deadline)))).flat();
        if (!list.some((c) => off(c) <= TOLERANCE_M) && deadline - Date.now() > budgetMs / 3) {
          const more = tries.map((t) => ({ heading: (t.heading + 60) % 360, dir: -t.dir }));
          list.push(...(await settle(more.map((t) => iterateHeading(client, start, t.heading, t.dir, target, deadline))).catch(() => [])).flat());
        }
        return list;
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
    if (!chosen.length) chosen = pickBest([...loops, ...lines].filter((c) => c.distance > 0), 1);
    if (!chosen.length) {
      if (stats.busy) throw new RouteError(429, 'Layanan rute sedang membatasi permintaan karena terlalu sering mencari. Tunggu sekitar 1 menit, lalu coba lagi.', 'route_busy');
      if (stats.failed) throw unavailable();
      throw new RouteError(422, 'Belum ketemu rute di sekitar titik ini. Geser titik mulai ke jalan yang lebih besar, ubah jaraknya, atau pilih jenis Semua.', 'no_candidates');
    }

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
    return { target, tolerance: TOLERANCE_M, maxRadius: MAX_RADIUS_M, withinTolerance, method, type: kind, stats, routes };
  }

  return { suggest, osrmClient, readRoute, readTable, limiter, score, RouteError, TOLERANCE_M, MAX_RADIUS_M, SCALES, TYPES };
});
