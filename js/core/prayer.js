/**
 * Perhitungan waktu sholat secara offline (algoritme posisi matahari ala PrayTimes)
 * dengan kriteria Kementerian Agama RI: Subuh 20°, Isya 18°, Ashar mazhab Syafi'i,
 * ihtiyath 2 menit, Imsak 10 menit sebelum Subuh.
 * Hasilnya perkiraan; bisa selisih 1–2 menit dari jadwal resmi.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Planner = root.Planner || {}).prayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Koordinat pusat kota (derajat) dan zona waktu (WIB +7, WITA +8, WIT +9).
  const CITIES = [
    ['banda-aceh', 'Banda Aceh', 5.5483, 95.3238, 7],
    ['medan', 'Medan', 3.5952, 98.6722, 7],
    ['padang', 'Padang', -0.9471, 100.4172, 7],
    ['pekanbaru', 'Pekanbaru', 0.5071, 101.4478, 7],
    ['batam', 'Batam', 1.0456, 104.0305, 7],
    ['tanjung-pinang', 'Tanjung Pinang', 0.9188, 104.4554, 7],
    ['jambi', 'Jambi', -1.6101, 103.6131, 7],
    ['bengkulu', 'Bengkulu', -3.7928, 102.2608, 7],
    ['palembang', 'Palembang', -2.9761, 104.7754, 7],
    ['pangkal-pinang', 'Pangkal Pinang', -2.1316, 106.1169, 7],
    ['bandar-lampung', 'Bandar Lampung', -5.3971, 105.2668, 7],
    ['serang', 'Serang', -6.12, 106.1503, 7],
    ['tangerang', 'Tangerang', -6.1783, 106.6319, 7],
    ['jakarta', 'Jakarta', -6.2088, 106.8456, 7],
    ['depok', 'Depok', -6.4025, 106.7942, 7],
    ['bekasi', 'Bekasi', -6.2383, 106.9756, 7],
    ['bogor', 'Bogor', -6.595, 106.8166, 7],
    ['bandung', 'Bandung', -6.9175, 107.6191, 7],
    ['cirebon', 'Cirebon', -6.732, 108.5523, 7],
    ['semarang', 'Semarang', -6.9667, 110.4167, 7],
    ['yogyakarta', 'Yogyakarta', -7.7956, 110.3695, 7],
    ['surakarta', 'Surakarta (Solo)', -7.5755, 110.8243, 7],
    ['surabaya', 'Surabaya', -7.2575, 112.7521, 7],
    ['malang', 'Malang', -7.9666, 112.6326, 7],
    ['pontianak', 'Pontianak', -0.0263, 109.3425, 7],
    ['palangka-raya', 'Palangka Raya', -2.2161, 113.9135, 7],
    ['banjarmasin', 'Banjarmasin', -3.3186, 114.5944, 8],
    ['balikpapan', 'Balikpapan', -1.2379, 116.8529, 8],
    ['samarinda', 'Samarinda', -0.5022, 117.1536, 8],
    ['tarakan', 'Tarakan', 3.3, 117.6333, 8],
    ['denpasar', 'Denpasar', -8.6705, 115.2126, 8],
    ['mataram', 'Mataram', -8.5833, 116.1167, 8],
    ['kupang', 'Kupang', -10.1772, 123.607, 8],
    ['makassar', 'Makassar', -5.1477, 119.4327, 8],
    ['mamuju', 'Mamuju', -2.6749, 118.8886, 8],
    ['palu', 'Palu', -0.8917, 119.8707, 8],
    ['kendari', 'Kendari', -3.9985, 122.5129, 8],
    ['gorontalo', 'Gorontalo', 0.5435, 123.0568, 8],
    ['manado', 'Manado', 1.4748, 124.8421, 8],
    ['ternate', 'Ternate', 0.7893, 127.3807, 9],
    ['ambon', 'Ambon', -3.6954, 128.1814, 9],
    ['sorong', 'Sorong', -0.8762, 131.2558, 9],
    ['manokwari', 'Manokwari', -0.8615, 134.062, 9],
    ['jayapura', 'Jayapura', -2.5337, 140.7181, 9],
    ['merauke', 'Merauke', -8.4932, 140.4018, 9],
  ].map(([id, name, lat, lng, tz]) => ({ id, name, lat, lng, tz, zone: { 7: 'WIB', 8: 'WITA', 9: 'WIT' }[tz] }));

  const NAMES = [
    { id: 'imsak', label: 'Imsak' },
    { id: 'subuh', label: 'Subuh' },
    { id: 'terbit', label: 'Terbit' },
    { id: 'dzuhur', label: 'Dzuhur' },
    { id: 'ashar', label: 'Ashar' },
    { id: 'maghrib', label: 'Maghrib' },
    { id: 'isya', label: 'Isya' },
  ];

  const FAJR_ANGLE = 20;
  const ISHA_ANGLE = 18;
  const IHTIYATH = 2;

  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const sin = (d) => Math.sin(rad(d));
  const cos = (d) => Math.cos(rad(d));
  const tan = (d) => Math.tan(rad(d));
  const arcsin = (x) => deg(Math.asin(x));
  const arccos = (x) => deg(Math.acos(Math.max(-1, Math.min(1, x))));
  const arctan2 = (y, x) => deg(Math.atan2(y, x));
  const arccot = (x) => deg(Math.atan(1 / x));
  const fix = (a, b) => {
    const r = a - b * Math.floor(a / b);
    return r < 0 ? r + b : r;
  };

  function julian(y, m, d) {
    if (m <= 2) {
      y -= 1;
      m += 12;
    }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  function sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = fix(357.529 + 0.98560028 * D, 360);
    const q = fix(280.459 + 0.98564736 * D, 360);
    const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
    const e = 23.439 - 0.00000036 * D;
    const RA = fix(arctan2(cos(e) * sin(L), cos(L)) / 15, 24);
    return { declination: arcsin(sin(e) * sin(L)), equation: q / 15 - RA };
  }

  /**
   * Waktu sholat untuk tanggal "YYYY-MM-DD" di sebuah kota.
   * @returns {{id: string, label: string, minutes: number, time: string}[]}
   */
  function times(key, city) {
    const [y, m, d] = key.split('-').map(Number);
    const jDate = julian(y, m, d) - city.lng / (15 * 24);

    const midDay = (t) => fix(12 - sunPosition(jDate + t).equation, 24);
    const angleTime = (angle, t, ccw) => {
      const decl = sunPosition(jDate + t).declination;
      const noon = midDay(t);
      const h = arccos((-sin(angle) - sin(decl) * sin(city.lat)) / (cos(decl) * cos(city.lat))) / 15;
      return noon + (ccw ? -h : h);
    };
    const asr = (t) => {
      const decl = sunPosition(jDate + t).declination;
      return angleTime(-arccot(1 + tan(Math.abs(city.lat - decl))), t, false);
    };

    // Dua iterasi: tebakan awal (jam) → hitung ulang dengan posisi matahari pada jam itu.
    let t = { subuh: 5, terbit: 6, dzuhur: 12, ashar: 13, maghrib: 18, isya: 18 };
    for (let i = 0; i < 2; i += 1) {
      const p = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 24]));
      t = {
        subuh: angleTime(FAJR_ANGLE, p.subuh, true),
        terbit: angleTime(0.833, p.terbit, true),
        dzuhur: midDay(p.dzuhur),
        ashar: asr(p.ashar),
        maghrib: angleTime(0.833, p.maghrib, false),
        isya: angleTime(ISHA_ANGLE, p.isya, false),
      };
    }

    const offset = city.tz - city.lng / 15;
    const toMin = (h, extra) => Math.ceil((h + offset) * 60 + extra - 1e-6);
    const out = {
      subuh: toMin(t.subuh, IHTIYATH),
      terbit: toMin(t.terbit, -IHTIYATH),
      dzuhur: toMin(t.dzuhur, IHTIYATH),
      ashar: toMin(t.ashar, IHTIYATH),
      maghrib: toMin(t.maghrib, IHTIYATH),
      isya: toMin(t.isya, IHTIYATH),
    };
    out.imsak = out.subuh - 10;

    return NAMES.map((n) => {
      const minutes = out[n.id];
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      return { id: n.id, label: n.label, minutes, time: `${hh}:${mm}` };
    });
  }

  function findCity(id) {
    return CITIES.find((c) => c.id === id) || CITIES.find((c) => c.id === 'jakarta');
  }

  /** Waktu sholat berikutnya (tidak termasuk Imsak & Terbit) setelah `nowMin`. */
  function next(list, nowMin) {
    return list.find((p) => p.id !== 'imsak' && p.id !== 'terbit' && p.minutes > nowMin) || null;
  }

  return { CITIES, NAMES, times, findCity, next };
});
