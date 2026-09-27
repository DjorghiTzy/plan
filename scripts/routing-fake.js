/**
 * Mesin rute tiruan untuk uji & server dev lokal (ROUTE_FAKE=1): jalan berbentuk kisi
 * (blok 90 m) dengan nama jalan, tanpa memanggil layanan rute sungguhan.
 * Keluarannya sama dengan readOsrm(): {distance, duration, coords, streets, turns, snap}.
 */
'use strict';

const G = require('../js/core/geo.js');

const BLOCK_M = 90;
const M_PER_DEG_LAT = 110574;

function createFakeRouter({ block = BLOCK_M } = {}) {
  let lat0 = null;
  const mPerDegLng = () => 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toGrid = (p) => [Math.round((p[1] * mPerDegLng()) / block), Math.round((p[0] * M_PER_DEG_LAT) / block)];
  const toLatLng = ([gx, gy]) => [(gy * block) / M_PER_DEG_LAT, (gx * block) / mPerDegLng()];
  const ewName = (gy) => `Jl. Melati ${((gy % 40) + 40) % 40}`;
  const nsName = (gx) => `Jl. Kenanga ${((gx % 40) + 40) % 40}`;

  return async (points) => {
    if (lat0 === null) lat0 = points[0][0];
    const nodes = points.map(toGrid);
    const path = [nodes[0]];
    const streets = [];
    let turns = 0;
    let lastAxis = null;
    const addStreet = (name) => {
      if (!streets.includes(name)) streets.push(name);
    };
    for (let i = 1; i < nodes.length; i += 1) {
      const [x0, y0] = path[path.length - 1];
      const [x1, y1] = nodes[i];
      // Sumbu timur-barat dulu, lalu utara-selatan (seperti berjalan mengikuti blok).
      if (x1 !== x0) {
        if (lastAxis === 'y') turns += 1;
        lastAxis = 'x';
        addStreet(ewName(y0));
        for (let x = x0 + Math.sign(x1 - x0); x !== x1 + Math.sign(x1 - x0); x += Math.sign(x1 - x0)) path.push([x, y0]);
      }
      if (y1 !== y0) {
        if (lastAxis === 'x') turns += 1;
        lastAxis = 'y';
        addStreet(nsName(x1));
        for (let y = y0 + Math.sign(y1 - y0); y !== y1 + Math.sign(y1 - y0); y += Math.sign(y1 - y0)) path.push([x1, y]);
      }
    }
    const coords = path.map(toLatLng);
    const distance = G.lineLength(coords);
    return { distance, duration: distance / 1.4, coords, streets, turns, snap: G.distance(points[0], coords[0]) };
  };
}

module.exports = { createFakeRouter };
