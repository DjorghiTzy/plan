/**
 * Saran rute lari putar (mulai & selesai di titik yang sama) dengan jarak mendekati target.
 * Jalan dihitung mesin rute OpenStreetMap (OSRM profil pejalan kaki, gratis tanpa kunci):
 * titik-titik di sebuah lingkaran dirutekan lewat jalan sungguhan, lalu jari-jarinya
 * disesuaikan berulang kali sampai selisih jaraknya paling banyak 300 m.
 */
'use strict';

const G = require('../../js/core/geo.js');

const BASE = (process.env.ROUTING_URL || 'https://routing.openstreetmap.de/routed-foot').replace(/\/$/, '');
const TOLERANCE_M = 300;
const MAX_ITER = 6;
const BUDGET_MS = 25000; // di bawah batas waktu fungsi
const REQUEST_MS = 9000;
const MAX_SNAP_M = 600; // titik mulai harus dekat jalan/jalur
// Jarak jalan ≈ 7 × jari-jari: keliling persegi di dalam lingkaran (5,66 r) × faktor liku jalan ±1,25.
const ROAD_FACTOR = 7.07;
const LETTERS = ['A', 'B', 'C', 'D'];

class RouteError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let factory = null;

/** Hanya untuk uji & server dev lokal: ganti mesin rute dengan tiruan. */
function setRouterFactory(fn) {
  factory = fn;
}

/** Ubah balasan OSRM menjadi {distance, duration, coords, streets, turns, snap}. */
function readOsrm(data) {
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

function osrmRouter() {
  const limit = limiter(2, 200);
  const get = async (url) => {
    try {
      return await fetch(url, {
        headers: { 'User-Agent': 'RencanaHarian/1.0 (saran rute lari, aplikasi pribadi)' },
        signal: globalThis.AbortSignal.timeout(REQUEST_MS),
      });
    } catch {
      throw new RouteError(502, 'Layanan rute sedang tidak bisa dihubungi. Coba lagi sebentar lagi.', 'route_unavailable');
    }
  };
  return (points) => limit(async () => {
    const path = points.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
    const url = `${BASE}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true`;
    let res = await get(url);
    if (res.status === 429) {
      await sleep(1500);
      res = await get(url);
    }
    if (res.status === 429) throw new RouteError(429, 'Layanan rute sedang sibuk. Coba lagi sebentar lagi.', 'route_busy');
    const data = await res.json().catch(() => null);
    if (!res.ok && !(data && data.code)) throw new RouteError(502, 'Layanan rute sedang gangguan. Coba lagi sebentar lagi.', 'route_unavailable');
    return readOsrm(data);
  });
}

function getRouter() {
  return factory ? factory() : osrmRouter();
}

/** Nilai kandidat (lebih kecil lebih baik): dalam toleransi, sedikit bolak-balik, dekat target. */
function score(c) {
  const off = Math.abs(c.diff);
  return (off <= TOLERANCE_M ? 0 : 100000 + off) + c.overlap * 1500 + off * 0.5;
}

/** Cari satu rute putar ke satu arah, sesuaikan jari-jari sampai jaraknya pas. */
async function searchLoop(router, start, heading, dir, target, deadline) {
  let r = target / ROAD_FACTOR;
  let prev = null;
  let best = null;
  for (let i = 0; i < MAX_ITER && Date.now() < deadline; i += 1) {
    const route = await router([start, ...G.loopPoints(start, heading, r, 3, dir), start]);
    if (route.snap > MAX_SNAP_M) throw new RouteError(422, 'Titik mulai terlalu jauh dari jalan. Pindahkan titik mulai ke dekat jalan.', 'far_from_road');
    const cand = { ...route, heading, diff: route.distance - target, overlap: G.overlapRatio(route.coords) };
    if (!best || score(cand) < score(best)) best = cand;
    if (Math.abs(cand.diff) <= TOLERANCE_M * 0.6 && cand.overlap < 0.25) break;
    // Jari-jari berikutnya: garis potong (secant) bila ada dua titik, selain itu sebanding target/jarak.
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

/**
 * @param {{lat: number, lng: number, km: number, seed?: number, count?: number}} q
 * @returns {Promise<{target: number, tolerance: number, withinTolerance: boolean, routes: object[]}>}
 */
async function suggest({ lat, lng, km, seed = 0, count = 3 }, { router = getRouter(), budgetMs = BUDGET_MS } = {}) {
  const target = Math.round(km * 1000);
  const start = [lat, lng];
  const deadline = Date.now() + budgetMs;
  const base = (Number(seed) * 137.508) % 360; // sudut emas: setiap "cari lagi" memberi arah baru
  const round = async (offset) => {
    const tries = [0, 120, 240].map((a, i) => ({ heading: (base + offset + a) % 360, dir: i % 2 ? -1 : 1 }));
    const settled = await Promise.allSettled(tries.map((t) => searchLoop(router, start, t.heading, t.dir, target, deadline)));
    const ok = settled.filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value);
    if (!ok.length) throw settled[0].reason || new RouteError(502, 'Rute tidak ditemukan.', 'route_unavailable');
    return ok;
  };
  const results = await round(0);
  // Jalan sungguhan tidak serapi lingkaran: bila rute yang pas masih kurang, coba arah lain.
  const fits = () => results.filter((c) => Math.abs(c.diff) <= TOLERANCE_M).length;
  if (fits() < 2 && deadline - Date.now() > budgetMs / 3) results.push(...(await round(60).catch(() => [])));

  // Urutkan dari yang terbaik, buang rute yang hampir sama dengan rute lain.
  const picked = [];
  for (const c of results.filter(Boolean).sort((a, b) => score(a) - score(b))) {
    if (picked.some((p) => G.similarity(c.coords, p.coords) > 0.6)) continue;
    picked.push(c);
  }
  const within = picked.filter((c) => Math.abs(c.diff) <= TOLERANCE_M);
  const list = (within.length ? within : picked.slice(0, 1)).slice(0, count);

  const routes = list.map((c, i) => {
    const coords = G.simplify(c.coords, 3).map((p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]);
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
      waypoints: G.pointsAlong(coords, [0.25, 0.5, 0.75]).map((p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]),
      coords,
    };
  });
  return { target, tolerance: TOLERANCE_M, withinTolerance: within.length > 0, routes };
}

module.exports = { suggest, readOsrm, osrmRouter, limiter, setRouterFactory, RouteError, TOLERANCE_M, BASE };
