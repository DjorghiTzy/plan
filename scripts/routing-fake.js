/**
 * Mesin rute tiruan untuk uji & server dev lokal (ROUTE_FAKE=1): jalan berbentuk kisi
 * (blok 90 m) dengan nama jalan, tanpa memanggil layanan rute sungguhan.
 * - createFakeClient(): klien {route, table} dengan keluaran sama seperti klien OSRM.
 * - osrmJson(url): jawaban berformat OSRM asli untuk URL /route/v1/... dan /table/v1/...
 *   (dipakai untuk mencegat permintaan browser ke routing.openstreetmap.de saat uji).
 */
'use strict';

const G = require('../js/core/geo.js');

const BLOCK_M = 90;
const M_PER_DEG_LAT = 110574;

function createGrid({ block = BLOCK_M } = {}) {
  let lat0 = null;
  const mPerDegLng = () => 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toGrid = (p) => [Math.round((p[1] * mPerDegLng()) / block), Math.round((p[0] * M_PER_DEG_LAT) / block)];
  const toLatLng = ([gx, gy]) => [(gy * block) / M_PER_DEG_LAT, (gx * block) / mPerDegLng()];
  const ewName = (gy) => `Jl. Melati ${((gy % 40) + 40) % 40}`;
  const nsName = (gx) => `Jl. Kenanga ${((gx % 40) + 40) % 40}`;

  /** Rute lewat titik-titik: {distance, duration, coords, streets, turns, steps, snaps}. */
  function route(points) {
    if (lat0 === null) lat0 = points[0][0];
    const nodes = points.map(toGrid);
    const path = [nodes[0]];
    const streets = [];
    const steps = [];
    let turns = 0;
    let lastAxis = null;
    const step = (name, type) => {
      if (!streets.includes(name)) streets.push(name);
      steps.push({ name, maneuver: { type, modifier: type === 'depart' ? 'straight' : steps.length % 2 ? 'left' : 'right' } });
    };
    for (let i = 1; i < nodes.length; i += 1) {
      const [x0, y0] = path[path.length - 1];
      const [x1, y1] = nodes[i];
      // Sumbu timur-barat dulu, lalu utara-selatan (seperti berjalan mengikuti blok).
      if (x1 !== x0) {
        if (lastAxis === 'y') turns += 1;
        step(ewName(y0), lastAxis ? 'turn' : 'depart');
        lastAxis = 'x';
        for (let x = x0 + Math.sign(x1 - x0); x !== x1 + Math.sign(x1 - x0); x += Math.sign(x1 - x0)) path.push([x, y0]);
      }
      if (y1 !== y0) {
        if (lastAxis === 'x') turns += 1;
        step(nsName(x1), lastAxis ? 'turn' : 'depart');
        lastAxis = 'y';
        for (let y = y0 + Math.sign(y1 - y0); y !== y1 + Math.sign(y1 - y0); y += Math.sign(y1 - y0)) path.push([x1, y]);
      }
    }
    const coords = path.map(toLatLng);
    const distance = G.lineLength(coords);
    const snaps = points.map((p, i) => G.distance(p, toLatLng(nodes[i])));
    return { distance, duration: distance / 1.4, coords, streets, turns, steps, snap: snaps[0], snaps };
  }

  /** Tabel jarak jalan antar semua titik (sama persis dengan jumlah kaki rute). */
  function table(points) {
    const distances = points.map((a) => points.map((b) => route([a, b]).distance));
    return { distances, snaps: points.map((p) => route([p, p]).snaps[0]) };
  }

  return { route, table };
}

function createFakeClient(opts) {
  const grid = createGrid(opts);
  return {
    route: async (points) => {
      const r = grid.route(points);
      return { distance: r.distance, duration: r.duration, coords: r.coords, streets: r.streets, turns: r.turns, snap: r.snap };
    },
    table: async (points) => grid.table(points),
  };
}

/** Jawaban JSON berformat OSRM untuk URL layanan rute/tabel (null bila URL tidak dikenali). */
function osrmJson(url, grid = createGrid()) {
  const m = /\/(route|table)\/v1\/[a-z]+\/([^?]+)/.exec(url);
  if (!m) return null;
  const points = decodeURIComponent(m[2]).split(';').map((p) => p.split(',').map(Number)).map(([lng, lat]) => [lat, lng]);
  if (m[1] === 'table') {
    const t = grid.table(points);
    const wp = points.map((p, i) => ({ location: [p[1], p[0]], distance: t.snaps[i], name: '' }));
    return { code: 'Ok', distances: t.distances, sources: wp, destinations: wp };
  }
  const r = grid.route(points);
  return {
    code: 'Ok',
    waypoints: points.map((p, i) => ({ location: [p[1], p[0]], distance: r.snaps[i], name: '' })),
    routes: [{
      distance: r.distance,
      duration: r.duration,
      geometry: { type: 'LineString', coordinates: r.coords.map(([lat, lng]) => [lng, lat]) },
      legs: [{ steps: r.steps }],
    }],
  };
}

module.exports = { createFakeClient, createGrid, osrmJson };
