/**
 * Saran rute lari dengan jarak mendekati target (selisih maks. 300 m) dan tetap dalam radius 25 km
 * dari titik mulai, lewat mesin rute OpenStreetMap (OSRM profil pejalan kaki). Dipakai di browser
 * (langsung ke layanan rute) dan di server (cadangan). Dua jenis rute:
 *
 * - Putar: untuk tiap arah, 21 titik di beberapa lingkaran diukur jarak jalannya dalam SATU
 *   permintaan tabel jarak; semua kombinasi dihitung di sini, beberapa yang paling pas diambil
 *   bentuknya, "taji" ke jalan buntu dibuang, lalu yang paling bulat dengan belokan paling sedikit
 *   dipilih.
 * - Lurus: lari menjauh di jalan yang selurus mungkin lalu balik lewat jalan yang sama. Satu tabel
 *   jarak dari titik mulai ke titik-titik di 16 arah (lalu 16 arah di antaranya); dipilih yang jarak
 *   jalannya hampir sama dengan garis lurusnya.
 *
 * Pencarian berjalan per putaran dengan arah-arah baru sampai terkumpul 12 rute berbeda (atau waktu
 * dan jatah permintaan habis); rute yang sudah ketemu langsung dikirim ke layar.
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
  const RAYS = 16;
  const MAX_SNAP_START = 600; // titik mulai harus dekat jalan/jalur
  // Titik yang jatuh jauh dari jalan (danau, kolong, sawah) tetap boleh, tapi dinilai lebih buruk.
  const SNAP_SOFT = 150;
  const SNAP_HARD = 800;
  const snapPenalty = (s) => Math.max(0, (s || 0) - SNAP_SOFT) * 0.8;
  const LETTERS = 'ABCDEFGHIJKL'.split('');
  const MIN_ROUTES = 3; // paling sedikit 3 rute berbeda
  const MAX_ROUTES = LETTERS.length; // sebanyak mungkin, sampai 12 rute (tiap rute satu warna)
  const MAX_ROUNDS = 8;
  const MAX_HEADINGS = 20; // arah rute putar yang dicoba per pencarian
  const MAX_REQUESTS = 40; // batas sopan untuk layanan rute gratis (rute diambil gabungan, jadi cukup)
  const MIN_ROUND = 0.2; // kebulatan minimal rute putar (lingkaran 1, persegi panjang 8:1 ≈ 0,3)
  const MAX_OVERLAP = 0.35; // bagian rute putar yang bolak-balik di jalan yang sama
  const MIN_STRAIGHT = 0.6; // kelurusan minimal rute lurus (garis lurus / jarak jalan)
  const SAME_ROUTE = 0.6; // rute dianggap sama bila 60% jalurnya berimpit
  const TYPES = ['semua', 'putar', 'lurus'];

  class RouteError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  const unavailable = () => new RouteError(502, 'Layanan rute OpenStreetMap sedang tidak bisa dihubungi. Periksa koneksi, atau tunggu sekitar 1 menit bila baru saja sering mencari, lalu coba lagi.', 'route_unavailable');
  const busyError = () => new RouteError(429, 'Layanan rute sedang membatasi permintaan karena terlalu sering mencari. Tunggu sekitar 1 menit, lalu coba lagi.', 'route_busy');
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
   * Balasan rute OSRM tanpa garis ringkas (overview=false) → per kaki rute (antar-titik):
   * {legs: {distance, duration, coords, streets, turns}[], snaps: m[]}. Garis tiap kaki disusun dari
   * geometri langkah-langkahnya, sehingga satu permintaan bisa memuat banyak rute sekaligus.
   */
  function readLegs(data) {
    if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) {
      if (data && (data.code === 'NoRoute' || data.code === 'NoSegment')) throw new RouteError(422, 'Tidak ada jalan yang bisa dilalui di sekitar titik mulai.', 'no_route');
      throw new RouteError(502, 'Layanan rute memberi jawaban yang tidak dikenali.', 'route_bad_output');
    }
    const legs = (data.routes[0].legs || []).map((leg) => {
      const coords = [];
      const streets = [];
      let turns = 0;
      for (const st of leg.steps || []) {
        const pts = (st.geometry && st.geometry.coordinates) || [];
        for (const [lng, lat] of pts) {
          const last = coords[coords.length - 1];
          if (!last || last[0] !== lat || last[1] !== lng) coords.push([lat, lng]);
        }
        const name = String(st.name || '').trim();
        if (name && !streets.includes(name)) streets.push(name);
        if (st.maneuver && !['depart', 'arrive'].includes(st.maneuver.type) && /left|right|uturn/.test(st.maneuver.modifier || '')) turns += 1;
      }
      return { distance: leg.distance, duration: leg.duration, coords, streets, turns };
    });
    return { legs, snaps: (data.waypoints || []).map((w) => (w && Number.isFinite(w.distance) ? w.distance : 0)) };
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
  function osrmClient(base, { fetchFn, headers = {}, timeoutMs = 8000, concurrency = 3, gapMs = 120, cacheSize = 200, retryMs = [1500, 3000] } = {}) {
    const url0 = String(base).replace(/\/$/, '');
    const limit = limiter(concurrency, gapMs);
    const cache = new Map(); // URL → jawaban; mencari lagi di tempat yang sama tidak perlu ke server
    const get = async (url, ms) => {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
      try {
        return await fetchFn(url, { headers, signal: ctrl ? ctrl.signal : undefined });
      } catch {
        // Tidak terhubung. Layanan yang sedang membatasi permintaan sering menjawab tanpa izin CORS,
        // sehingga di browser tampak seperti koneksi gagal: diperlakukan sama dengan "sibuk" (diulang).
        // Waktu habis (-1) tidak diulang agar pencarian tidak menggantung lama.
        return { status: ctrl && ctrl.signal.aborted ? -1 : 0, ok: false, json: async () => null };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const busy = (st) => st === 0 || st === 429 || st === 503;
    const call = async (service, points, query, ms = timeoutMs) => {
      const path = points.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
      const url = `${url0}/${service}/v1/driving/${path}?${query}`;
      if (cache.has(url)) return cache.get(url);
      const data = await limit(async () => {
        let res = await get(url, ms);
        // Layanan gratis membatasi permintaan (atau koneksi putus sebentar): tunggu lalu ulang (maks. dua kali).
        for (const wait of retryMs) {
          if (!busy(res.status)) break;
          await sleep(wait);
          res = await get(url, ms);
        }
        if (res.status <= 0) throw unavailable();
        if (busy(res.status)) throw busyError();
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
      // Banyak rute dalam satu permintaan (dirangkai lewat titik mulai), dibaca per kaki rute.
      legs: async (points) => readLegs(await call('route', points, 'overview=false&geometries=geojson&steps=true&continue_straight=false', Math.max(timeoutMs, 15000))),
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

  const RING_POINTS = SCALES.length * 3; // titik per arah di tabel jarak
  const TABLE_MAX = 100; // batas bawaan OSRM untuk jumlah titik tabel
  const BATCH_POINTS = 60; // titik per permintaan rute gabungan
  const BATCH_METERS = 60000; // panjang rute (perkiraan) per permintaan gabungan

  /**
   * Ambil banyak rute sekaligus. Setiap `group` = titik-titik satu rute (mis. [S, A, B, C, S]).
   * Rute-rute dirangkai jadi satu permintaan (S … S … S) lalu dipotong lagi per kaki rute, sehingga
   * 12 rute cukup 1 sampai 2 permintaan ke layanan rute gratis. Satu titik yang tidak terjangkau
   * membuat seluruh permintaan gagal: rangkaian dibelah dua sampai titik itu ketemu.
   * @param {number} estimate perkiraan panjang satu rute (m) untuk membatasi besar jawaban
   * @returns {Promise<(object|null)[]>} per group: {distance, duration, coords, streets, turns, snap} atau null
   */
  async function routeMany(client, groups, estimate) {
    if (!groups.length) return [];
    if (!client.legs) {
      const out = await Promise.allSettled(groups.map((g) => client.route(g)));
      if (out.every((x) => x.status === 'rejected')) throw out[0].reason;
      return out.map((x) => (x.status === 'fulfilled' ? x.value : null));
    }
    const perBatch = Math.max(1, Math.min(Math.floor(BATCH_METERS / Math.max(1000, estimate)), Math.floor(BATCH_POINTS / Math.max(...groups.map((g) => g.length)))));
    const batches = [];
    for (let i = 0; i < groups.length; i += perBatch) batches.push(groups.slice(i, i + perBatch));
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    let lastError = null;
    const run = async (batch) => {
      const points = [];
      const legOf = []; // per kaki: [indeks group, urutan kaki] atau null untuk kaki penyambung
      const snapAt = [];
      batch.forEach((g, gi) => {
        if (points.length && !same(points[points.length - 1], g[0])) {
          legOf.push(null);
          points.push(g[0]);
        } else if (!points.length) points.push(g[0]);
        snapAt[gi] = points.length - 1;
        for (let k = 1; k < g.length; k += 1) {
          legOf.push(gi);
          points.push(g[k]);
        }
      });
      try {
        const { legs, snaps } = await client.legs(points);
        if (legs.length !== legOf.length) throw new RouteError(502, 'Layanan rute memberi jawaban yang tidak dikenali.', 'route_bad_output');
        return batch.map((g, gi) => {
          const mine = legs.filter((_, k) => legOf[k] === gi);
          const coords = [];
          for (const leg of mine) for (const p of leg.coords) if (!coords.length || !same(coords[coords.length - 1], p)) coords.push(p);
          const streets = [];
          for (const leg of mine) for (const name of leg.streets) if (!streets.includes(name)) streets.push(name);
          return {
            distance: mine.reduce((a, l) => a + l.distance, 0),
            duration: mine.reduce((a, l) => a + (l.duration || 0), 0),
            coords,
            streets,
            turns: mine.reduce((a, l) => a + l.turns, 0),
            snap: snaps[snapAt[gi]] || 0,
          };
        });
      } catch (err) {
        if (err.code === 'no_route' && batch.length > 1) {
          const half = Math.ceil(batch.length / 2);
          return [...(await run(batch.slice(0, half))), ...(await run(batch.slice(half)))];
        }
        // Layanan tidak mengenali permintaan gabungan: ambil rute satu per satu.
        if (err.code === 'route_bad_output') {
          const one = await Promise.allSettled(batch.map((g) => client.route(g)));
          const rej = one.find((x) => x.status === 'rejected');
          if (rej) lastError = rej.reason;
          return one.map((x) => (x.status === 'fulfilled' ? x.value : null));
        }
        lastError = err;
        return batch.map(() => null);
      }
    };
    const out = (await Promise.all(batches.map(run))).flat();
    if (lastError && out.every((x) => !x)) throw lastError;
    return out;
  }

  /** Kombinasi rute putar untuk satu arah dari tabel jarak (indeks titik arah ini mulai di `first`). */
  function combosOf(t, points, first, start, target) {
    const { distances: d, snaps, locations } = t;
    const at = (ring, k) => first + ring * 3 + k; // indeks titik di tabel
    const loc = (i) => (locations && locations[i]) || points[i];
    const ok = (i) => (snaps[i] || 0) <= SNAP_HARD && G.distance(start, loc(i)) <= MAX_RADIUS_M;
    // Titik yang menempel ke lokasi jalan yang sama menghasilkan rute yang sama: cukup satu.
    const byKey = new Map();
    const keep = (p, legs, penalty) => {
      if (!p.every(ok) || legs.some((x) => x == null || !Number.isFinite(x))) return;
      const distance = legs.reduce((a, x) => a + x, 0);
      const locs = p.map(loc);
      const keys = locs.map(locKey);
      if (new Set(keys).size < keys.length) return;
      const pen = penalty + p.reduce((sum, i) => sum + snapPenalty(snaps[i]), 0);
      const combo = { key: keys.join('|'), keys, locs, distance, diff: distance - target, penalty: pen, rank: Math.abs(distance - target) + pen };
      const prev = byKey.get(combo.key);
      if (!prev || combo.rank < prev.rank) byKey.set(combo.key, combo);
    };
    const n = SCALES.length;
    for (let a = 0; a < n; a += 1) {
      for (let b = 0; b < n; b += 1) {
        for (let c = 0; c < n; c += 1) {
          const p = [at(a, 0), at(b, 1), at(c, 2)];
          // Bentuk yang bulat (jari-jari mirip) lebih jarang zig-zag atau bolak-balik.
          if (p.every((i) => i < d.length)) keep(p, [d[0][p[0]], d[p[0]][p[1]], d[p[1]][p[2]], d[p[2]][0]], (Math.abs(a - b) + Math.abs(b - c)) * 60);
        }
      }
    }
    // Rute segitiga (dua titik antara, sisi kiri & kanan lingkaran): lebih banyak pilihan panjang.
    for (let a = 0; a < n; a += 1) {
      for (let c = 0; c < n; c += 1) {
        const p = [at(a, 0), at(c, 2)];
        keep(p, [d[0][p[0]], d[p[0]][p[1]], d[p[1]][0]], Math.abs(a - c) * 60 + 80);
      }
    }
    return [...byKey.values()].sort((x, y) => x.rank - y.rank);
  }

  /**
   * Beberapa arah dalam SATU tabel jarak: per arah 21 titik (3 posisi × 7 jari-jari), sampai 4 arah
   * per tabel (≤ 100 titik). Bila layanan menolak tabel sebesar itu, tiap arah diukur sendiri.
   * @returns {Promise<{heading, combos}[]>} kombinasi terbaik lebih dulu
   */
  async function tableHeadings(client, start, tries, target) {
    const r0 = target / ROAD_FACTOR;
    const measure = async (list) => {
      const points = [start];
      for (const t of list) points.push(...SCALES.flatMap((s) => G.loopPoints(start, t.heading, r0 * s, 3, t.dir)));
      const t = await client.table(points);
      if ((t.startSnap || t.snaps[0] || 0) > MAX_SNAP_START) throw farStart();
      return list.map((tr, k) => ({ heading: tr.heading, combos: combosOf(t, points, 1 + k * RING_POINTS, start, target) }));
    };
    const per = Math.max(1, Math.floor((TABLE_MAX - 1) / RING_POINTS));
    const chunks = [];
    for (let i = 0; i < tries.length; i += per) chunks.push(tries.slice(i, i + per));
    return (await settle(chunks.map(async (chunk) => {
      try {
        return await measure(chunk);
      } catch (err) {
        if (err.code !== 'table_unavailable' || chunk.length === 1) throw err;
        return (await settle(chunk.map((tr) => measure([tr])))).flat();
      }
    }))).flat();
  }

  /**
   * Rute putar lewat tabel jarak: beberapa kombinasi terbaik per arah diambil bentuknya (semua arah
   * dalam satu permintaan rute gabungan). Tabel menghitung jarak termasuk masuk-keluar gang buntu,
   * padahal taji itu dibuang dari rute. Karena itu, dari rute yang sudah diambil dipelajari titik
   * mana yang ujung gang (dan panjang gangnya), lalu perkiraan jarak kombinasi lain dikoreksi untuk
   * putaran berikutnya.
   */
  async function loopsViaTable(client, start, target, tries, perHeading, deadline, rounds = 2) {
    const heads = (await tableHeadings(client, start, tries, target))
      .filter((h) => h.combos.length)
      .map((h) => ({ ...h, tried: new Set(), spur: new Map(), got: [] }));
    const fetchSome = async (picks) => {
      picks.forEach((x) => x.h.tried.add(x.c.key));
      const routes = await routeMany(client, picks.map((x) => [start, ...x.c.locs, start]), target);
      routes.forEach((route, i) => {
        if (!route) return;
        const { h, c } = picks[i];
        const cand = loopCandidate(start, route, target, h.heading);
        learnSpurs(route.coords, cand.coords, c.locs, h.spur);
        h.got.push(cand);
      });
    };
    await fetchSome(heads.flatMap((h) => {
      const near = h.combos.filter((c) => c.diff >= -TOLERANCE_M && c.diff <= TOLERANCE_M * 2);
      return (near.length ? near : h.combos).slice(0, perHeading).map((c) => ({ h, c }));
    }));
    for (let round = 0; round < rounds && Date.now() < deadline; round += 1) {
      const picks = [];
      for (const h of heads) {
        if (h.got.some((c) => off(c) <= TOLERANCE_M)) continue;
        const ranked = h.combos
          .filter((c) => !h.tried.has(c.key))
          .map((c) => {
            const known = c.keys.filter((k) => h.spur.has(k));
            const est = c.distance - 2 * known.reduce((a, k) => a + h.spur.get(k), 0);
            return { c, off: Math.abs(est - target), rank: Math.abs(est - target) + c.penalty + (c.keys.length - known.length) * 40 };
          })
          .sort((a, b) => a.rank - b.rank);
        // Arah ini tidak menjanjikan (perkiraan terbaik pun jauh dari target): hemat permintaan.
        if (!ranked.length || ranked[0].off > TOLERANCE_M * 2) continue;
        picks.push(...ranked.slice(0, 2).map((x) => ({ h, c: x.c })));
      }
      if (!picks.length) break;
      await fetchSome(picks);
    }
    return heads.flatMap((h) => h.got);
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
   * Rute lurus bolak-balik: titik di 16 arah (4 jarak per arah), satu tabel jarak dari titik mulai.
   * Per arah, titik balik yang pas diperkirakan dari jarak jalan yang teramati (interpolasi). Setiap
   * `next(n)` mengambil n arah terbaik yang belum dicoba, sejauh mungkin dari arah sebelumnya; bila
   * arahnya habis, tabel kedua mengukur 16 arah di antaranya. Jalurnya diambil dan, bila masih meleset
   * lebih dari 300 m (sering terjadi pada jarak jauh), titik baliknya digeser paling banyak dua kali.
   */
  function straightSearch(client, start, target, base) {
    const half = target / 2;
    const offsets = [0, 180 / RAYS]; // tabel kedua: arah di antara arah tabel pertama
    const cands = [];
    const chosen = [];
    let measured = 0;
    let fallback = false;

    async function measure(offset) {
      const points = [start];
      const meta = [];
      for (let i = 0; i < RAYS; i += 1) {
        const heading = (base + offset + (360 / RAYS) * i) % 360;
        for (const s of RAY_SCALES) {
          const b = (half / 1.1) * s;
          if (b <= MAX_RADIUS_M) {
            points.push(G.destination(start, heading, b));
            meta.push({ ray: i, heading, b });
          }
        }
      }
      measured += 1;
      if (points.length < 2) return;
      const t = await client.table(points, { sources: [0] });
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
    }

    const gap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    // Arah terbaik yang belum dicoba, masing-masing minimal `sep` derajat dari arah yang sudah dicoba.
    const pick = (count, sep) => {
      const out = [];
      for (const c of cands) {
        if (out.length >= count) break;
        if (c.used || chosen.concat(out).some((x) => gap(c.heading, x.heading) < sep)) continue;
        out.push(c);
      }
      return out;
    };

    async function next(count) {
      if (fallback) return [];
      if (!measured) {
        try {
          await measure(offsets[0]);
        } catch (err) {
          if (err.code !== 'table_unavailable') throw err;
          fallback = true;
          return straightsViaRoutes(client, start, target, base, count);
        }
      }
      if (pick(count, 20).length < count && measured < offsets.length) await measure(offsets[measured]).catch(() => {});
      let list = [];
      for (const sep of [40, 20, 10]) {
        list = pick(count, sep);
        if (list.length >= count) break;
      }
      for (const c of list) {
        c.used = true;
        chosen.push(c);
      }
      if (!list.length) return [];
      return refineStraights(client, start, target, list);
    }

    return {
      next,
      /** Semua arah sudah dicoba (atau cara cadangan sudah dipakai): tidak ada rute lurus baru lagi. */
      get exhausted() {
        return fallback || (measured >= offsets.length && cands.every((c) => c.used));
      },
    };
  }

  /**
   * Ambil jalur lurus ke titik-titik balik (semua dalam satu permintaan gabungan); yang masih meleset
   * lebih dari 300 m digeser titik baliknya lalu diambil lagi, paling banyak dua kali.
   * @param {{heading: number, b: number, tip?: number[]}[]} list
   */
  async function refineStraights(client, start, target, list) {
    const items = list.map((c) => ({ heading: c.heading, b: c.b, tip: c.tip || null, best: null }));
    let todo = items;
    for (let pass = 0; pass < 3 && todo.length; pass += 1) {
      const ways = await routeMany(client, todo.map((it) => [start, (!pass && it.tip) || G.destination(start, it.heading, it.b)]), target).catch(() => []);
      todo.forEach((it, i) => {
        if (!ways[i]) return;
        const cand = straightCandidate(start, ways[i], target, it.heading);
        if (!it.best || off(cand) < off(it.best)) it.best = cand;
      });
      todo = todo.filter((it) => it.best && off(it.best) > TOLERANCE_M && it.best.distance > 0);
      for (const it of todo) it.b = Math.min(it.b * (target / it.best.distance), MAX_RADIUS_M);
    }
    return items.map((it) => it.best).filter(Boolean);
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
    const ways = await routeMany(client, dirs.map((h) => [start, G.destination(start, h, b0)]), target);
    const first = dirs.map((h, i) => (ways[i] ? { h, c: straightCandidate(start, ways[i], target, h) } : null)).filter(Boolean);
    const good = first.filter((x) => x.c.distance > 0).sort((a, b) => b.c.straightness - a.c.straightness).slice(0, count);
    const fixed = await refineStraights(client, start, target, good.filter((x) => off(x.c) > TOLERANCE_M).map((x) => ({ heading: x.h, b: Math.min(b0 * (target / x.c.distance), MAX_RADIUS_M) })));
    return [...first.map((x) => x.c), ...fixed];
  }

  const DRAW_SPUR_M = 200; // taji rute gambar yang dibuang: titik yang jatuh di gang/jalan samping
  const DRAW_MAX_POINTS = 80; // titik gambar per rute (batas layanan rute)

  /**
   * Rute gambar sendiri: titik-titik ketukan/coretan di peta → rute lewat jalan sungguhan (satu
   * permintaan), lalu dirapikan: masuk-keluar pendek (≤ 200 m) ke titik yang jatuh di gang atau jalan
   * samping dibuang, dan jaraknya dihitung ulang. Bolak-balik panjang yang disengaja tetap utuh.
   * @param {number[][]} points titik gambar [lat, lng] (tanpa titik mulai)
   * @param {{loop?: boolean}} opts loop: kembali ke titik mulai
   */
  async function snapDrawing(client, start, points, { loop = true } = {}) {
    const pts = [start, ...points.slice(0, DRAW_MAX_POINTS)];
    if (loop) pts.push(start);
    if (pts.length < 2) throw new RouteError(400, 'Tambahkan minimal satu titik di peta.', 'no_points');
    const route = await client.route(pts);
    if (route.snap > MAX_SNAP_START) throw farStart();
    const coords = G.removeSpurs(route.coords, DRAW_SPUR_M);
    const cut = Math.max(0, G.lineLength(route.coords) - G.lineLength(coords));
    const fix = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
    const line = G.simplify(coords, 3).map(fix);
    const origin = line[0];
    const end = line[line.length - 1];
    const far = line.reduce((a, p) => (G.distance(origin, p) > G.distance(origin, a) ? p : a), origin);
    return {
      type: 'gambar',
      loop: Boolean(loop),
      distance: Math.round(Math.max(0, route.distance - cut)),
      trimmed: Math.round(cut),
      direction: G.compass(G.bearing(origin, far)),
      turns: G.countTurns(coords),
      overlap: Math.round(G.overlapRatio(coords) * 100) / 100,
      maxDist: Math.round(farthest(start, coords)),
      streets: route.streets.slice(0, 8),
      start: origin,
      end,
      far,
      // Google Maps: tiga titik antara di sepanjang rute agar mengikuti jalur yang sama.
      waypoints: G.pointsAlong(line, [0.25, 0.5, 0.75]).map(fix),
      coords: line,
    };
  }

  /**
   * Titik gambar yang tidak terjangkau lewat jalan dari titik mulai (mis. di seberang laut atau
   * sungai tanpa jembatan): satu tabel jarak dari titik mulai.
   * @returns {Promise<number[]>} indeks titik yang tak terjangkau
   */
  async function unreachable(client, start, points) {
    const t = await client.table([start, ...points], { sources: [0] });
    const row = t.distances[0] || [];
    return points.map((_, i) => i).filter((i) => row[i + 1] == null || !Number.isFinite(row[i + 1]));
  }

  /** Garis sederhana untuk membandingkan rute (disimpan di kandidat agar tidak dihitung ulang). */
  const simpleOf = (c) => c._simple || (c._simple = G.simplify(c.coords, 8));
  const sameRoute = (a, b) => G.overlapShare(a, b) > SAME_ROUTE || G.overlapShare(b, a) > SAME_ROUTE;

  /**
   * @param {{lat: number, lng: number, km: number, seed?: number, type?: 'semua'|'putar'|'lurus'}} q
   * @param {{table: Function, route: Function}} rawClient
   * @param {{budgetMs?: number, min?: number, max?: number, avoid?: number[][][], maxRequests?: number,
   *   onProgress?: Function, stopped?: Function}} opts
   *   avoid: rute yang sudah pernah ditampilkan (daftar koordinat), supaya "cari lagi" memberi rute baru
   *   onProgress: dipanggil dengan hasil sementara setiap kali ada rute baru (huruf rute tidak berubah)
   *   stopped: mengembalikan true bila pencarian dibatalkan (mis. titik mulai dipindah)
   * @returns {Promise<{target, tolerance, maxRadius, withinTolerance, method, type, stats, fresh, partial, routes: object[]}>}
   */
  async function suggest({ lat, lng, km, seed = 0, type = 'semua' }, rawClient, { budgetMs = 22000, min = MIN_ROUTES, max = MAX_ROUTES, avoid = [], maxRequests = MAX_REQUESTS, onProgress = null, stopped = () => false } = {}) {
    const kind = TYPES.includes(type) ? type : 'semua';
    // Hitung permintaan & yang gagal (ditampilkan kecil di aplikasi untuk memudahkan pelacakan masalah).
    const stats = { requests: 0, failed: 0, busy: 0, rounds: 0 };
    const track = (fn) => async (...args) => {
      stats.requests += 1;
      try {
        return await fn(...args);
      } catch (err) {
        // "Tidak ada jalan" (422) bukan kegagalan layanan.
        if (!err || err.status !== 422) stats.failed += 1;
        if (err && err.code === 'route_busy') stats.busy += 1;
        throw err;
      }
    };
    const client = { table: track(rawClient.table), route: track(rawClient.route), legs: rawClient.legs ? track(rawClient.legs) : null };
    const target = Math.round(km * 1000);
    const start = [lat, lng];
    const deadline = Date.now() + budgetMs;
    const n = Number(seed) || 0;
    // Setiap pencarian ("Rute lain") mulai dari arah lain; arah rute lurus bergeser di antara 16 arahnya.
    const base = (n * 68.754) % 360;
    const rayBase = (base + (n % 3) * 7.5) % 360;
    const wantLoops = kind !== 'lurus';
    // Bolak-balik lurus: ujungnya sejauh ±setengah target (dalam radius 25 km cukup sampai maraton).
    const wantStraight = kind !== 'putar' && target / 2 <= MAX_RADIUS_M * 1.15;
    if (kind === 'lurus' && !wantStraight) {
      throw new RouteError(422, `Rute lurus bolak-balik paling panjang sekitar ${Math.floor((MAX_RADIUS_M * 2.3) / 1000)} km agar tetap dalam radius ${MAX_RADIUS_M / 1000} km. Pilih jenis Putar untuk jarak ini.`, 'straight_too_long');
    }
    const avoidLines = (Array.isArray(avoid) ? avoid : []).filter((a) => Array.isArray(a) && a.length > 1);
    const fit = (c) => off(c) <= TOLERANCE_M && c.maxDist <= MAX_RADIUS_M;
    // Bentuk yang layak ditampilkan: putar cukup bulat dan jarang bolak-balik, lurus benar-benar lurus.
    const tidy = (c) => (c.type === 'lurus' ? c.straightness >= MIN_STRAIGHT : (c.roundness || 0) >= MIN_ROUND && (c.overlap || 0) <= MAX_OVERLAP);

    let method = 'table';
    const loopRound = async (tries) => {
      if (method === 'table') {
        try {
          return await loopsViaTable(client, start, target, tries, 2, deadline, kind === 'putar' ? 2 : 1);
        } catch (err) {
          if (err.code !== 'table_unavailable') throw err;
          method = 'iterate';
        }
      }
      return (await settle(tries.map((t) => iterateHeading(client, start, t.heading, t.dir, target, deadline)))).flat();
    };
    // Arah rute putar berurutan dengan sudut emas (137,5°): setiap putaran mengisi celah arah sebelumnya.
    let heads = 0;
    const nextTries = (count) => Array.from({ length: count }, () => {
      const k = heads;
      heads += 1;
      return { heading: (base + k * 137.508) % 360, dir: k % 2 ? -1 : 1 };
    });
    const straight = wantStraight ? straightSearch(client, start, target, rayBase) : null;

    // Rute yang ditampilkan, urut saat ditemukan (hurufnya tetap walau rute baru terus bertambah).
    const shown = [];
    const pool = [];
    const done = { putar: !wantLoops, lurus: !wantStraight };
    const quiet = { putar: 0, lurus: 0 }; // putaran berturut-turut tanpa rute baru
    let open = false; // setelah pencarian selesai, sisa tempat boleh diisi jenis mana saja
    const count = (t) => shown.filter((c) => c.type === t).length;
    const other = (t) => (t === 'putar' ? 'lurus' : 'putar');
    // "Semua": jatah dibagi dua; bila satu jenis sudah habis dicari, jenis lain boleh mengisi sisanya.
    const cap = (t) => (open || kind !== 'semua' ? max : done[other(t)] ? max - count(other(t)) : Math.ceil(max / 2));
    const wants = (t) => !done[t] && count(t) < cap(t) && shown.length < max;
    /** Tambahkan rute pas yang berbeda dari yang sudah ditampilkan (dan dari pencarian sebelumnya). */
    const add = () => {
      const list = pool.filter((c) => !c._dup && !shown.includes(c) && fit(c) && tidy(c));
      list.sort((a, b) => (a.type === b.type ? score(a) - score(b) : a.type === 'putar' ? -1 : 1));
      for (const c of list) {
        if (shown.length >= max) break;
        if (count(c.type) >= cap(c.type)) continue;
        const s = simpleOf(c);
        // Sekali sama dengan rute lain, selamanya sama: tidak perlu dibandingkan lagi.
        if (avoidLines.some((a) => sameRoute(s, a)) || shown.some((p) => sameRoute(s, simpleOf(p)))) c._dup = true;
        else shown.push(c);
      }
    };

    const fix = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
    const output = (c) => {
      if (c._out) return c._out;
      const coords = G.simplify(c.coords, 3).map(fix);
      const origin = coords[0];
      const far = c.type === 'lurus' ? fix(c.tip) : coords.reduce((a, p) => (G.distance(origin, p) > G.distance(origin, a) ? p : a), origin);
      c._out = {
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
      return c._out;
    };
    const result = (list, partial, withinTolerance = list.length > 0) => ({
      target,
      tolerance: TOLERANCE_M,
      maxRadius: MAX_RADIUS_M,
      withinTolerance,
      method,
      type: kind,
      stats: { ...stats },
      fresh: list.filter((c) => !c.seen).length,
      partial,
      routes: list.map((c, i) => ({ id: LETTERS[i], seen: Boolean(c.seen), ...output(c) })),
    });

    // Cari per putaran (arah baru setiap putaran) sampai jatah rute penuh, waktu habis, atau jumlah
    // permintaan ke layanan rute gratis sudah banyak. Rute yang sudah ketemu langsung dikirim ke layar.
    let lastError = null;
    let sent = 0;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (stopped()) break;
      // Layanan sibuk atau gagal berulang: berhenti (mencoba terus hanya memperpanjang pemblokiran).
      if (round && (Date.now() > deadline - budgetMs / 4 || stats.requests >= maxRequests || stats.busy || stats.failed >= 2)) break;
      const jobs = [];
      if (wants('putar')) jobs.push(['putar', loopRound(nextTries(kind === 'putar' ? 4 : 3))]);
      if (wants('lurus')) jobs.push(['lurus', straight.next(kind === 'lurus' ? 6 : 4)]);
      if (!jobs.length) break;
      stats.rounds = round + 1;
      const before = { putar: count('putar'), lurus: count('lurus') };
      const settled = await Promise.allSettled(jobs.map((j) => j[1]));
      for (const x of settled) {
        if (x.status === 'fulfilled') pool.push(...x.value.filter(Boolean));
        else {
          if (x.reason && ['far_from_road', 'straight_too_long'].includes(x.reason.code)) throw x.reason;
          lastError = x.reason;
        }
      }
      add();
      for (const [t] of jobs) {
        quiet[t] = count(t) > before[t] ? 0 : quiet[t] + 1;
        // Dua putaran berturut-turut tanpa rute baru: di sekitar sini memang tidak ada lagi.
        if (quiet[t] >= 2) done[t] = true;
      }
      if (straight && straight.exhausted) done.lurus = true;
      if (heads >= MAX_HEADINGS) done.putar = true;
      if (onProgress && shown.length > sent && !stopped()) {
        sent = shown.length;
        try {
          onProgress(result(shown, true));
        } catch {
          // Tampilan gagal diperbarui: pencarian tetap jalan.
        }
      }
    }
    if (!pool.length && stats.busy) throw busyError();
    if (!pool.length && lastError) throw lastError;
    open = true;
    add();

    const chosen = shown.slice();
    // Belum cukup: lengkapi sampai minimal 3, pertama dengan rute baru yang bentuknya kurang rapi,
    // lalu dengan rute yang pernah ditampilkan (masih pas).
    if (chosen.length < min) {
      const rest = pool.filter((c) => fit(c) && !chosen.includes(c)).sort((a, b) => score(a) - score(b));
      const differs = (c) => !chosen.some((p) => sameRoute(simpleOf(c), simpleOf(p)));
      for (const c of rest) {
        if (chosen.length >= min) break;
        if (differs(c) && !avoidLines.some((a) => sameRoute(simpleOf(c), a))) chosen.push(c);
      }
      for (const c of rest) {
        if (chosen.length >= min) break;
        if (!chosen.includes(c) && differs(c)) chosen.push({ ...c, seen: true, _out: null });
      }
    }
    if (chosen.length) return result(chosen, false);
    const closest = pool.filter((c) => c.distance > 0).sort((a, b) => score(a) - score(b)).slice(0, 1);
    if (closest.length) return result(closest, false, false);
    if (stats.busy) throw busyError();
    if (stats.failed) throw unavailable();
    throw new RouteError(422, 'Belum ketemu rute di sekitar titik ini. Geser titik mulai ke jalan yang lebih besar, ubah jaraknya, atau pilih jenis Semua.', 'no_candidates');
  }

  return { suggest, snapDrawing, unreachable, DRAW_MAX_POINTS, osrmClient, readRoute, readLegs, readTable, routeMany, limiter, score, RouteError, TOLERANCE_M, MAX_RADIUS_M, MIN_ROUTES, MAX_ROUTES, SCALES, TYPES };
});
