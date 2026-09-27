/**
 * Mesin rute tiruan untuk uji & server dev lokal (ROUTE_FAKE=1): jalan berbentuk kisi
 * (blok 90 m) dengan nama jalan, tanpa memanggil layanan rute sungguhan.
 * - createFakeClient(): klien {route, legs, table} dengan keluaran sama seperti klien OSRM.
 * - osrmJson(url): jawaban berformat OSRM asli untuk URL /route/v1/... dan /table/v1/...
 *   (dipakai untuk mencegat permintaan browser ke routing.openstreetmap.de saat uji).
 */
'use strict';

const G = require('../js/core/geo.js');

const BLOCK_M = 90;
const M_PER_DEG_LAT = 110574;

function createGrid({ block = BLOCK_M, deadEnds = 0 } = {}) {
  let lat0 = null;
  const mPerDegLng = () => 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toGrid = (p) => [Math.round((p[1] * mPerDegLng()) / block), Math.round((p[0] * M_PER_DEG_LAT) / block)];
  const toLatLng = ([gx, gy]) => [(gy * block) / M_PER_DEG_LAT, (gx * block) / mPerDegLng()];
  const ewName = (gy) => `Jl. Melati ${((gy % 40) + 40) % 40}`;
  const nsName = (gx) => `Jl. Kenanga ${((gx % 40) + 40) % 40}`;
  const hash = ([x, y]) => {
    let h = (x * 73856093) ^ (y * 19349663);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return ((h ^ (h >>> 15)) >>> 0);
  };

  /**
   * Titik di jalan: simpul kisi, atau (bila `deadEnds` > 0) ujung gang buntu 80-250 m dari simpul,
   * seperti titik yang jatuh di gang kampung. Rute ke titik itu masuk lalu keluar lewat gang yang sama.
   */
  function place(p) {
    if (lat0 === null) lat0 = p[0];
    const node = toGrid(p);
    const h = hash(node);
    if (!deadEnds || (h % 1000) / 1000 >= deadEnds) return { node, tip: null };
    return { node, tip: G.destination(toLatLng(node), 45 + 90 * (h % 4), 80 + (h % 170)) };
  }

  /** Rute lewat titik-titik: {distance, duration, coords, streets, turns, steps, snaps}. */
  function route(points) {
    if (lat0 === null) lat0 = points[0][0];
    const spots = points.map(place);
    const nodes = spots.map((s) => s.node);
    const coords = [];
    if (spots[0].tip) coords.push(spots[0].tip);
    coords.push(toLatLng(nodes[0]));
    let cur = nodes[0];
    const streets = [];
    const steps = [];
    let turns = 0;
    let lastAxis = null;
    const step = (name, type) => {
      if (!streets.includes(name)) streets.push(name);
      steps.push({ name, maneuver: { type, modifier: type === 'depart' ? 'straight' : steps.length % 2 ? 'left' : 'right' } });
    };
    for (let i = 1; i < nodes.length; i += 1) {
      const [x0, y0] = cur;
      const [x1, y1] = nodes[i];
      // Sumbu timur-barat dulu, lalu utara-selatan (seperti berjalan mengikuti blok).
      if (x1 !== x0) {
        if (lastAxis === 'y') turns += 1;
        step(ewName(y0), lastAxis ? 'turn' : 'depart');
        lastAxis = 'x';
        for (let x = x0 + Math.sign(x1 - x0); x !== x1 + Math.sign(x1 - x0); x += Math.sign(x1 - x0)) coords.push(toLatLng([x, y0]));
      }
      if (y1 !== y0) {
        if (lastAxis === 'x') turns += 1;
        step(nsName(x1), lastAxis ? 'turn' : 'depart');
        lastAxis = 'y';
        for (let y = y0 + Math.sign(y1 - y0); y !== y1 + Math.sign(y1 - y0); y += Math.sign(y1 - y0)) coords.push(toLatLng([x1, y]));
      }
      cur = nodes[i];
      const tip = spots[i].tip;
      if (tip && i < nodes.length - 1) coords.push(tip, toLatLng(cur)); // masuk gang buntu lalu keluar
      else if (tip) coords.push(tip);
    }
    const distance = G.lineLength(coords);
    const snaps = points.map((p, i) => G.distance(p, spots[i].tip || toLatLng(nodes[i])));
    return { distance, duration: distance / 1.4, coords, streets, turns, steps, snap: snaps[0], snaps };
  }

  /** Titik jalan terdekat (simpul kisi atau ujung gang buntu). */
  function snapPoint(p) {
    const spot = place(p);
    return spot.tip || toLatLng(spot.node);
  }

  /** Tabel jarak jalan (sama persis dengan jumlah kaki rute); `sources` = indeks baris. */
  function table(points, { sources } = {}) {
    const rows = sources || points.map((_, i) => i);
    const distances = rows.map((i) => points.map((b, j) => (i === j ? 0 : route([points[i], b]).distance)));
    const locations = points.map(snapPoint);
    const snaps = points.map((p, i) => G.distance(p, locations[i]));
    return { distances, snaps, startSnap: snaps[rows[0]], locations };
  }

  return { route, table, snapPoint };
}

/**
 * Jaringan jalan tak beraturan yang lebih mirip kota sungguhan: simpul kisi digeser acak, sebagian
 * ruas hilang (muncul jalan buntu & jalan memutar), ada jalan diagonal. Rute = jalur terpendek
 * (Dijkstra) antar-titik; titik ditempelkan ke simpul terdekat yang punya jalan.
 */
function createNetwork({ block = 150, jitter = 0.3, drop = 0.3, diagonal = 0.12, seed = 1 } = {}) {
  let lat0 = null;
  let lng0 = null;
  const mLng = () => 111320 * Math.cos((lat0 * Math.PI) / 180);
  const rnd = (i, j, salt) => {
    let h = (i * 374761393 + j * 668265263 + salt * 2147483647 + seed * 1013904223) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const xy = (i, j) => [(i + (rnd(i, j, 1) - 0.5) * 2 * jitter) * block, (j + (rnd(i, j, 2) - 0.5) * 2 * jitter) * block];
  const toLatLng = ([x, y]) => [lat0 + y / M_PER_DEG_LAT, lng0 + x / mLng()];
  const toXY = (p) => [(p[1] - lng0) * mLng(), (p[0] - lat0) * M_PER_DEG_LAT];
  const hasH = (i, j) => rnd(i, j, 3) >= drop; // (i,j)–(i+1,j)
  const hasV = (i, j) => rnd(i, j, 4) >= drop; // (i,j)–(i,j+1)
  const hasD = (i, j) => rnd(i, j, 5) < diagonal; // (i,j)–(i+1,j+1)
  const neighbors = (i, j) => {
    const out = [];
    if (hasH(i, j)) out.push([i + 1, j, `Jl. Melati ${((j % 40) + 40) % 40}`]);
    if (hasH(i - 1, j)) out.push([i - 1, j, `Jl. Melati ${((j % 40) + 40) % 40}`]);
    if (hasV(i, j)) out.push([i, j + 1, `Jl. Kenanga ${((i % 40) + 40) % 40}`]);
    if (hasV(i, j - 1)) out.push([i, j - 1, `Jl. Kenanga ${((i % 40) + 40) % 40}`]);
    if (hasD(i, j)) out.push([i + 1, j + 1, 'Jl. Serong']);
    if (hasD(i - 1, j - 1)) out.push([i - 1, j - 1, 'Jl. Serong']);
    return out;
  };
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const init = (p) => {
    if (lat0 === null) {
      lat0 = p[0];
      lng0 = p[1];
    }
  };

  function snapNode(p) {
    init(p);
    const [x, y] = toXY(p);
    const ci = Math.round(x / block);
    const cj = Math.round(y / block);
    let best = null;
    for (let i = ci - 2; i <= ci + 2; i += 1) {
      for (let j = cj - 2; j <= cj + 2; j += 1) {
        if (!neighbors(i, j).length) continue;
        const d = len([x, y], xy(i, j));
        if (!best || d < best.d) best = { i, j, d };
      }
    }
    return best;
  }

  /** Dijkstra dari satu simpul ke banyak simpul (dibatasi kotak di sekitar semua titik). */
  function shortest(from, targets, box) {
    const key = (i, j) => `${i},${j}`;
    const dist = new Map([[key(from.i, from.j), 0]]);
    const prev = new Map();
    const heap = [[0, from.i, from.j]];
    const want = new Set(targets.map((t) => key(t.i, t.j)));
    let left = want.size;
    const push = (e) => {
      heap.push(e);
      let k = heap.length - 1;
      while (k > 0) {
        const up = (k - 1) >> 1;
        if (heap[up][0] <= heap[k][0]) break;
        [heap[up], heap[k]] = [heap[k], heap[up]];
        k = up;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const done = new Set();
    while (heap.length && left > 0) {
      const [d, i, j] = pop();
      const k = key(i, j);
      if (done.has(k)) continue;
      done.add(k);
      if (want.has(k)) left -= 1;
      for (const [ni, nj, name] of neighbors(i, j)) {
        if (ni < box[0] || ni > box[1] || nj < box[2] || nj > box[3]) continue;
        const nd = d + len(xy(i, j), xy(ni, nj));
        const nk = key(ni, nj);
        if (!dist.has(nk) || nd < dist.get(nk)) {
          dist.set(nk, nd);
          prev.set(nk, [i, j, name]);
          push([nd, ni, nj]);
        }
      }
    }
    return { dist: (t) => (dist.has(key(t.i, t.j)) ? dist.get(key(t.i, t.j)) : null), path: (t) => {
      const out = [];
      let k = key(t.i, t.j);
      if (!dist.has(k)) return null;
      let cur = [t.i, t.j];
      while (k !== key(from.i, from.j)) {
        const [pi, pj, name] = prev.get(k);
        out.push({ node: cur, name });
        cur = [pi, pj];
        k = key(pi, pj);
      }
      out.push({ node: [from.i, from.j], name: null });
      return out.reverse();
    } };
  }

  const boxOf = (nodes) => {
    const is = nodes.map((n) => n.i);
    const js = nodes.map((n) => n.j);
    return [Math.min(...is) - 8, Math.max(...is) + 8, Math.min(...js) - 8, Math.max(...js) + 8];
  };

  function route(points) {
    const nodes = points.map(snapNode);
    const box = boxOf(nodes);
    const coords = [];
    const streets = [];
    for (let k = 1; k < nodes.length; k += 1) {
      const leg = shortest(nodes[k - 1], [nodes[k]], box).path(nodes[k]);
      if (!leg) return { distance: Infinity, coords: [], streets, turns: 0, snap: nodes[0].d, snaps: nodes.map((n) => n.d), steps: [] };
      for (let m = coords.length ? 1 : 0; m < leg.length; m += 1) {
        coords.push(toLatLng(xy(leg[m].node[0], leg[m].node[1])));
        if (leg[m].name && !streets.includes(leg[m].name)) streets.push(leg[m].name);
      }
    }
    if (!coords.length) coords.push(toLatLng(xy(nodes[0].i, nodes[0].j)));
    const distance = G.lineLength(coords);
    const steps = streets.map((name, i) => ({ name, maneuver: { type: i ? 'turn' : 'depart', modifier: i % 2 ? 'left' : 'right' } }));
    return { distance, duration: distance / 1.4, coords, streets, turns: Math.max(0, streets.length - 1), steps, snap: nodes[0].d, snaps: nodes.map((n) => n.d) };
  }

  function table(points, { sources } = {}) {
    const nodes = points.map(snapNode);
    const box = boxOf(nodes);
    const rows = sources || points.map((_, i) => i);
    const distances = rows.map((r) => {
      const sp = shortest(nodes[r], nodes, box);
      return nodes.map((n, c) => (c === r ? 0 : sp.dist(n)));
    });
    const locations = nodes.map((n) => toLatLng(xy(n.i, n.j)));
    const snaps = nodes.map((n) => n.d);
    return { distances, snaps, startSnap: snaps[rows[0]], locations };
  }

  return { route, table, snapPoint: (p) => { const n = snapNode(p); return toLatLng(xy(n.i, n.j)); } };
}

const noRoute = () => new (require('../js/core/loops.js').RouteError)(422, 'Tidak ada jalan.', 'no_route');

/**
 * Kaki-kaki rute (satu per pasangan titik berurutan), seperti klien OSRM `legs`: satu permintaan
 * untuk banyak rute yang dirangkai. Satu kaki tanpa jalan → seluruh permintaan gagal (NoRoute).
 */
function legsOf(route, points) {
  const legs = [];
  const snaps = [];
  for (let i = 1; i < points.length; i += 1) {
    const r = route([points[i - 1], points[i]]);
    if (!Number.isFinite(r.distance)) throw noRoute();
    legs.push({ distance: r.distance, duration: r.duration, coords: r.coords, streets: r.streets, turns: r.turns });
    if (i === 1) snaps.push(r.snaps[0]);
    snaps.push(r.snaps[1]);
  }
  return { legs, snaps };
}

function createNetworkClient(opts = {}) {
  const net = createNetwork(opts);
  const client = {
    route: async (points) => {
      const r = net.route(points);
      if (!Number.isFinite(r.distance)) throw noRoute();
      return { distance: r.distance, duration: r.duration, coords: r.coords, streets: r.streets, turns: r.turns, snap: r.snap };
    },
    table: async (points, o) => net.table(points, o),
  };
  if (opts.legs !== false) client.legs = async (points) => legsOf(net.route, points);
  return client;
}

function createFakeClient(opts = {}) {
  const grid = createGrid(opts);
  const client = {
    route: async (points) => {
      const r = grid.route(points);
      return { distance: r.distance, duration: r.duration, coords: r.coords, streets: r.streets, turns: r.turns, snap: r.snap };
    },
    table: async (points, o) => grid.table(points, o),
  };
  if (opts.legs !== false) client.legs = async (points) => legsOf(grid.route, points);
  return client;
}

/** Jawaban JSON berformat OSRM untuk URL layanan rute/tabel (null bila URL tidak dikenali). */
function osrmJson(url, grid = createGrid()) {
  const m = /\/(route|table)\/v1\/[a-z]+\/([^?]+)(?:\?(.*))?/.exec(url);
  if (!m) return null;
  const points = decodeURIComponent(m[2]).split(';').map((p) => p.split(',').map(Number)).map(([lng, lat]) => [lat, lng]);
  if (m[1] === 'table') {
    const src = /(?:^|&)sources=([\d;]+)/.exec(m[3] || '');
    const sources = src ? src[1].split(';').map(Number) : null;
    const t = grid.table(points, { sources });
    const wp = points.map((p, i) => ({ location: [t.locations[i][1], t.locations[i][0]], distance: t.snaps[i], name: '' }));
    return { code: 'Ok', distances: t.distances, sources: (sources || points.map((_, i) => i)).map((i) => wp[i]), destinations: wp };
  }
  const r = grid.route(points);
  const ll = ([lat, lng]) => [lng, lat];
  // Per kaki: langkah pertama membawa seluruh garis kaki, langkah berikutnya hanya belokan & nama jalan.
  const legs = [];
  for (let i = 1; i < points.length; i += 1) {
    const leg = grid.route([points[i - 1], points[i]]);
    const end = ll(leg.coords[leg.coords.length - 1]);
    const steps = [{ name: leg.streets[0] || '', maneuver: { type: 'depart', modifier: 'straight' }, geometry: { type: 'LineString', coordinates: leg.coords.map(ll) } }];
    leg.streets.slice(1).forEach((name, k) => steps.push({ name, maneuver: { type: 'turn', modifier: k % 2 ? 'left' : 'right' }, geometry: { type: 'LineString', coordinates: [end, end] } }));
    steps.push({ name: '', maneuver: { type: 'arrive' }, geometry: { type: 'LineString', coordinates: [end, end] } });
    legs.push({ distance: leg.distance, duration: leg.duration, steps });
  }
  return {
    code: 'Ok',
    waypoints: points.map((p, i) => ({ location: [p[1], p[0]], distance: r.snaps[i], name: '' })),
    routes: [{
      distance: r.distance,
      duration: r.duration,
      geometry: { type: 'LineString', coordinates: r.coords.map(ll) },
      legs,
    }],
  };
}

module.exports = { createFakeClient, createGrid, createNetwork, createNetworkClient, osrmJson };
