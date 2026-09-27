const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/core/geo.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≈ ${b} (±${tol})`);

test('distance & destination: satu derajat lintang ±111 km, tujuan kembali ke jarak & arah semula', () => {
  near(G.distance([0, 0], [1, 0]), 111195, 50, '1° lintang');
  const start = [-2.13, 106.11];
  for (const b of [0, 45, 133, 270]) {
    const p = G.destination(start, b, 1500);
    near(G.distance(start, p), 1500, 0.5, `jarak arah ${b}`);
    near(G.bearing(start, p), b, 0.5, `arah ${b}`);
  }
  assert.equal(G.compass(0), 'utara');
  assert.equal(G.compass(50), 'timur laut');
  assert.equal(G.compass(181), 'selatan');
  assert.equal(G.compass(350), 'utara');
});

test('loopPoints: titik di lingkaran yang melewati titik mulai, urutan searah/berlawanan jarum jam', () => {
  const start = [-6.2, 106.8];
  const r = 800;
  const center = G.destination(start, 90, r);
  const cw = G.loopPoints(start, 90, r, 3, 1);
  assert.equal(cw.length, 3);
  for (const p of cw) near(G.distance(center, p), r, 0.5, 'di lingkaran');
  near(G.distance(start, cw[1]), 2 * r, 1, 'titik tengah berseberangan dengan titik mulai');
  const ccw = G.loopPoints(start, 90, r, 3, -1);
  near(G.distance(cw[0], ccw[2]), 0, 0.5, 'arah sebaliknya');
  assert.ok(G.bearing(start, cw[0]) > 0 && G.bearing(start, cw[0]) < 90, 'searah jarum jam: ke timur laut dulu bila pusat di timur');
});

test('pointsAlong, lineLength, overlapRatio, similarity', () => {
  const a = [0, 0];
  const b = G.destination(a, 90, 1000);
  const c = G.destination(b, 0, 1000);
  const line = [a, b, c];
  near(G.lineLength(line), 2000, 1);
  const [q, h] = G.pointsAlong(line, [0.25, 0.5]);
  near(G.distance(a, q), 500, 1, 'seperempat');
  near(G.distance(h, b), 0, 1, 'setengah = sudut');
  const loop = [a, b, c, G.destination(a, 0, 1000), a];
  assert.equal(G.overlapRatio(loop), 0);
  assert.equal(G.overlapRatio([a, b, c, b, a]), 1, 'bolak-balik penuh');
  near(G.overlapRatio([a, b, c, b]), 2 / 3, 0.01, 'sebagian bolak-balik');
  assert.equal(G.similarity(loop, loop), 1);
  near(G.similarity([a, b, c], [a, b]), 0.5, 0.01);
});

test('simplify membuang titik segaris, menjaga sudut', () => {
  const a = [0, 0];
  const pts = [a];
  for (let i = 1; i <= 10; i += 1) pts.push(G.destination(a, 90, i * 100));
  const corner = pts[pts.length - 1];
  for (let i = 1; i <= 5; i += 1) pts.push(G.destination(corner, 0, i * 100));
  const s = G.simplify(pts, 3);
  assert.equal(s.length, 3);
  assert.deepEqual(s[1], corner);
});

test('googleMapsUrl: rute jalan kaki putar dengan maks. 3 titik antara', () => {
  const url = G.googleMapsUrl([-2.1, 106.1], [[-2.11, 106.1], [-2.11, 106.11], [-2.1, 106.11], [1, 1]]);
  assert.equal(url, 'https://www.google.com/maps/dir/?api=1&origin=-2.100000,106.100000&destination=-2.100000,106.100000&waypoints=-2.110000,106.100000%7C-2.110000,106.110000%7C-2.100000,106.110000&travelmode=walking');
});

test('gpx: berkas GPX sah dengan nama di-escape', () => {
  const x = G.gpx('Rute A <5 km> & "pagi"', [[-2.1, 106.1], [-2.11, 106.1]]);
  assert.match(x, /^<\?xml version="1.0"/);
  assert.match(x, /<name>Rute A &lt;5 km&gt; &amp; &quot;pagi&quot;<\/name>/);
  assert.equal((x.match(/<trkpt /g) || []).length, 2);
  assert.match(x, /<trkpt lat="-2.100000" lon="106.100000">/);
});
