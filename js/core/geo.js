/**
 * Geometri untuk saran rute lari: jarak di permukaan bumi, titik-titik rute putar,
 * pemeriksaan jalan yang dilewati dua kali, tautan Google Maps, dan berkas GPX.
 * Titik ditulis [lat, lng] dalam derajat.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Planner = root.Planner || {}).geo = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const R = 6371008.8; // jari-jari rata-rata bumi (m)
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  /** Jarak dua titik (m), rumus haversine. */
  function distance(a, b) {
    const dLat = rad(b[0] - a[0]);
    const dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Titik tujuan dari `p` sejauh `meters` ke arah `bearing` (derajat dari utara, searah jarum jam). */
  function destination(p, bearing, meters) {
    const d = meters / R;
    const b = rad(bearing);
    const lat1 = rad(p[0]);
    const lng1 = rad(p[1]);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return [deg(lat2), ((deg(lng2) + 540) % 360) - 180];
  }

  /** Arah dari `a` ke `b` (derajat 0-360). */
  function bearing(a, b) {
    const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
    const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }

  const COMPASS = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
  const compass = (b) => COMPASS[Math.round((((b % 360) + 360) % 360) / 45) % 8];

  function lineLength(coords) {
    let sum = 0;
    for (let i = 1; i < coords.length; i += 1) sum += distance(coords[i - 1], coords[i]);
    return sum;
  }

  /**
   * Titik-titik rute putar: lingkaran berjari-jari `radius` yang melewati `start`,
   * pusatnya ke arah `heading`. Menghasilkan `n` titik antara (tanpa titik mulai),
   * berurutan searah (`dir` = 1) atau berlawanan (`dir` = -1) jarum jam.
   */
  function loopPoints(start, heading, radius, n = 3, dir = 1) {
    const center = destination(start, heading, radius);
    const back = (heading + 180) % 360; // arah dari pusat ke titik mulai
    const out = [];
    for (let k = 1; k <= n; k += 1) out.push(destination(center, back + dir * (360 / (n + 1)) * k, radius));
    return out;
  }

  /** Titik pada garis di posisi pecahan panjangnya (0..1). */
  function pointsAlong(coords, fractions) {
    const total = lineLength(coords);
    const out = [];
    for (const f of fractions) {
      const want = total * f;
      let acc = 0;
      let hit = coords[coords.length - 1];
      for (let i = 1; i < coords.length; i += 1) {
        const seg = distance(coords[i - 1], coords[i]);
        if (acc + seg >= want) {
          const t = seg ? (want - acc) / seg : 0;
          hit = [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t];
          break;
        }
        acc += seg;
      }
      out.push(hit);
    }
    return out;
  }

  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const segKey = (a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };

  /** Kunci ruas jalan (tanpa arah) beserta panjangnya. */
  function segments(coords) {
    const map = new Map();
    for (let i = 1; i < coords.length; i += 1) {
      const k = segKey(coords[i - 1], coords[i]);
      const e = map.get(k);
      if (e) e.count += 1;
      else map.set(k, { count: 1, len: distance(coords[i - 1], coords[i]) });
    }
    return map;
  }

  /** Bagian rute (0..1) yang melewati ruas jalan yang sama lebih dari sekali (bolak-balik). */
  function overlapRatio(coords) {
    const total = lineLength(coords);
    if (!total) return 0;
    let twice = 0;
    for (const e of segments(coords).values()) if (e.count > 1) twice += e.len * e.count;
    return Math.min(1, twice / total);
  }

  /** Kemiripan dua rute (0..1): bagian panjang rute `a` yang juga dilewati `b`. */
  function similarity(a, b) {
    const sa = segments(a);
    const sb = segments(b);
    let shared = 0;
    let total = 0;
    for (const [k, e] of sa) {
      total += e.len;
      if (sb.has(k)) shared += e.len;
    }
    return total ? shared / total : 0;
  }

  const key6 = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

  /**
   * Buang "taji": masuk ke jalan buntu lalu kembali lewat jalan yang sama (A, B, A → A).
   * Pola bolak-balik yang bersebelahan dihapus berulang, jadi taji sepanjang apa pun hilang.
   * Jalan masuk-keluar di titik mulai (tidak bersebelahan) tetap ada.
   */
  function removeSpurs(coords) {
    const out = [];
    for (const p of coords) {
      const k = key6(p);
      if (out.length && key6(out[out.length - 1]) === k) continue;
      if (out.length >= 2 && key6(out[out.length - 2]) === k) {
        out.pop();
        continue;
      }
      out.push(p);
    }
    return out;
  }

  /** Jumlah belokan nyata (arah berubah lebih dari 50°), setelah garis disederhanakan. */
  function countTurns(coords, minAngle = 50) {
    const pts = simplify(coords, 8);
    let n = 0;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const a = bearing(pts[i - 1], pts[i]);
      const b = bearing(pts[i], pts[i + 1]);
      const d = Math.abs(((b - a + 540) % 360) - 180);
      if (d > minAngle && d < 170) n += 1;
    }
    return n;
  }

  /** Kebulatan rute putar (0..1): 4πA/P². Lingkaran = 1, persegi ≈ 0,79, rute zig-zag kecil. */
  function roundness(coords) {
    if (coords.length < 4) return 0;
    const lat0 = rad(coords[0][0]);
    const xy = coords.map((p) => [rad(p[1]) * Math.cos(lat0) * R, rad(p[0]) * R]);
    let area = 0;
    for (let i = 0; i < xy.length; i += 1) {
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[(i + 1) % xy.length];
      area += x1 * y2 - x2 * y1;
    }
    const per = lineLength(coords);
    return per ? Math.min(1, (4 * Math.PI * Math.abs(area / 2)) / (per * per)) : 0;
  }

  /** Sederhanakan garis (Douglas-Peucker) dengan toleransi `tol` meter. */
  function simplify(coords, tol = 4) {
    if (coords.length < 3) return coords.slice();
    const lat0 = rad(coords[0][0]);
    const xy = coords.map((p) => [rad(p[1]) * Math.cos(lat0) * R, rad(p[0]) * R]);
    const keep = new Uint8Array(coords.length);
    keep[0] = 1;
    keep[coords.length - 1] = 1;
    const stack = [[0, coords.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const [ax, ay] = xy[s];
      const [bx, by] = xy[e];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let far = -1;
      let max = tol;
      for (let i = s + 1; i < e; i += 1) {
        const [px, py] = xy[i];
        let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d > max) {
          max = d;
          far = i;
        }
      }
      if (far > 0) {
        keep[far] = 1;
        stack.push([s, far], [far, e]);
      }
    }
    return coords.filter((_, i) => keep[i]);
  }

  const fmt = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

  /**
   * Tautan petunjuk arah jalan kaki di Google Maps: mulai dan selesai di titik yang sama,
   * lewat titik-titik antara (maks. 3 agar tetap berfungsi di HP).
   */
  function googleMapsUrl(start, waypoints) {
    const params = [
      'api=1',
      `origin=${fmt(start)}`,
      `destination=${fmt(start)}`,
      `waypoints=${waypoints.slice(0, 3).map(fmt).join('%7C')}`,
      'travelmode=walking',
    ];
    return `https://www.google.com/maps/dir/?${params.join('&')}`;
  }

  const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

  /** Berkas GPX (rute) untuk diimpor ke Strava, Garmin, dll. */
  function gpx(name, coords) {
    const pts = coords.map((p) => `      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"></trkpt>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Rencana Harian" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(name)}</name></metadata>
  <trk>
    <name>${xml(name)}</name>
    <type>running</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
  }

  return { distance, destination, bearing, compass, lineLength, loopPoints, pointsAlong, overlapRatio, similarity, simplify, removeSpurs, countTurns, roundness, googleMapsUrl, gpx };
});
