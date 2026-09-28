/**
 * Layanan cuaca BMKG tiruan untuk uji & server dev lokal (WEATHER_FAKE=1): jawaban berformat
 * api.bmkg.go.id/publik/prakiraan-cuaca, 3 hari × 8 periode 3 jam mulai periode yang sedang berjalan.
 * Tidak ikut ter-deploy (scripts/ di .vercelignore).
 */
'use strict';

const PATTERN = [
  [3, 'Berawan'], [1, 'Cerah Berawan'], [61, 'Hujan Sedang'], [60, 'Hujan Ringan'],
  [3, 'Berawan'], [2, 'Cerah Berawan'], [4, 'Berawan Tebal'], [95, 'Hujan Petir'],
];

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;

/** Jawaban JSON BMKG untuk satu kode desa. */
function bmkgJson(adm4, nowMs = Date.now()) {
  const start = Math.floor(nowMs / 10800e3) * 10800e3;
  const lokasi = { adm1: adm4.slice(0, 2), adm2: adm4.slice(0, 5), adm3: adm4.slice(0, 8), adm4, provinsi: 'Kepulauan Bangka Belitung', kotkab: 'Kota Pangkal Pinang', kecamatan: 'Bukit Intan', desa: `Desa ${adm4.slice(-4)}`, lon: 106.11, lat: -2.13, timezone: 'Asia/Jakarta' };
  const days = [[], [], []];
  for (let i = 0; i < 24; i += 1) {
    const utc = new Date(start + i * 10800e3);
    const local = new Date(utc.getTime() + 7 * 3600e3);
    const [code, desc] = PATTERN[i % PATTERN.length];
    days[Math.floor(i / 8)].push({
      datetime: utc.toISOString(), t: 26 + (i % 5), tcc: code >= 60 ? 95 : 40 + (i % 3) * 10, tp: code >= 60 ? 2.4 : 0, weather: code, weather_desc: desc, weather_desc_en: desc,
      wd_deg: 120, wd: 'SE', wd_to: 'NW', ws: 6.1, hu: 78 + (i % 4) * 3, vs: 9000, vs_text: '> 8 km', time_index: `${i}-${i + 1}`,
      analysis_date: stamp(new Date(start - 6 * 3600e3)).replace(' ', 'T'), image: '', utc_datetime: stamp(utc), local_datetime: stamp(local),
    });
  }
  return { lokasi, data: [{ lokasi, cuaca: days }] };
}

/** fetch tiruan: `missing` = kode desa yang "tidak dikenal" BMKG (404), `down` = layanan mati. */
function createFakeFetch({ missing = [], down = false, calls = [] } = {}) {
  return async (url) => {
    calls.push(url);
    if (down) throw new Error('ECONNREFUSED');
    const adm4 = decodeURIComponent((/adm4=([^&]+)/.exec(url) || [])[1] || '');
    if (!adm4 || missing.includes(adm4)) return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
    return { ok: true, status: 200, json: async () => bmkgJson(adm4) };
  };
}

module.exports = { bmkgJson, createFakeFetch };
