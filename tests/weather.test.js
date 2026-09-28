// Cuaca BMKG untuk coach: desa terdekat dari koordinat, ringkasan prakiraan per 3 jam, tembolok,
// cadangan bila kode desa tidak dikenal BMKG, dan galat (luar Indonesia, BMKG mati, kuota).
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../api/_lib/weather');
const { bmkgJson, createFakeFetch } = require('../scripts/weather-fake');

const HOME = { lat: -2.1291, lng: 106.1135 }; // Pangkal Pinang

function fakeCtx() {
  const mem = new Map();
  const hits = new Map();
  return {
    user: { id: 'u1' },
    store: {
      get: async (k) => mem.get(k) || null,
      set: async (k, v) => mem.set(k, v),
      hit: async (k) => {
        hits.set(k, (hits.get(k) || 0) + 1);
        return hits.get(k);
      },
    },
    mem,
  };
}

test('desa terdekat dari koordinat: kode wilayah tingkat IV (format BMKG)', () => {
  const near = W.nearestVillages(HOME.lat, HOME.lng, 3);
  assert.equal(near.length, 3);
  for (const v of near) {
    assert.match(v.adm4, /^19\.71\.\d{2}\.\d{4}$/, 'Kota Pangkal Pinang = 19.71');
    assert.ok(v.km < 2, `${v.adm4} ${v.km} km`);
  }
  assert.ok(near[0].km <= near[1].km && near[1].km <= near[2].km);
  assert.match(W.nearestVillages(-6.1754, 106.8272, 1)[0].adm4, /^31\.71\./, 'Monas: Jakarta Pusat');
});

test('ringkasan: sekarang, 8 periode ke depan, peluang hujan = bagian periode hujan, per hari', () => {
  const now = Date.parse('2026-09-28T01:30:00Z'); // 08:30 WIB
  const raw = {
    lokasi: { desa: 'Semabung Lama', kecamatan: 'Bukit Intan', kota: 'Kota Pangkal Pinang', provinsi: 'Kepulauan Bangka Belitung', timezone: 'Asia/Jakarta' },
    analysis: '2026-09-27T12:00',
    slots: [],
  };
  const json = bmkgJson('19.71.01.1004', Date.parse('2026-09-27T21:00:00Z'));
  for (const s of json.data[0].cuaca.flat()) raw.slots.push({ utc: s.utc_datetime.slice(0, 16), local: s.local_datetime.slice(0, 16), desc: s.weather_desc, code: s.weather, t: s.t, hu: s.hu, tcc: s.tcc, tp: s.tp, ws: s.ws, wd: s.wd });
  const w = W.summarize(raw, { adm4: '19.71.01.1004', km: 0.4 }, now);
  assert.equal(w.place.desa, 'Semabung Lama');
  assert.equal(w.place.adm4, '19.71.01.1004');
  assert.equal(w.next.length, 8);
  assert.equal(w.now.time, '07:00', 'periode 07:00-10:00 WIB sedang berjalan');
  const rain = w.next.filter((s) => s.rain).length;
  assert.equal(w.rainChance24h, Math.round((100 * rain) / 8));
  assert.ok(w.rainChance24h > 0 && w.rainChance24h < 100);
  assert.equal(w.rainyNext24h.length, rain);
  assert.ok(w.days.length >= 2 && w.days.every((d) => d.tMin <= d.tMax && d.rainChance >= 0 && d.rainChance <= 100));
  assert.ok(W.rainy({ code: 95, desc: 'Hujan Petir' }) && W.rainy({ code: null, desc: 'Hujan Ringan' }) && !W.rainy({ code: 3, desc: 'Berawan' }));
});

test('ambil cuaca: kode desa tak dikenal → desa berikutnya; disimpan 30 menit', async () => {
  const calls = [];
  const first = W.nearestVillages(HOME.lat, HOME.lng, 1)[0].adm4;
  W.setWeatherFetch(createFakeFetch({ missing: [first], calls }));
  const ctx = fakeCtx();
  const w = await W.getWeather(ctx, HOME);
  assert.notEqual(w.place.adm4, first);
  assert.equal(calls.length, 2, 'desa pertama 404, desa kedua berhasil');
  assert.match(calls[0], /api\.bmkg\.go\.id\/publik\/prakiraan-cuaca\?adm4=19\.71\./);
  await W.getWeather(ctx, HOME);
  assert.equal(calls.length, 3, 'desa pertama dicoba lagi (tidak disimpan), desa kedua dari tembolok');
  assert.ok([...ctx.mem.keys()].some((k) => k === `bmkg:${w.place.adm4}`));
  W.setWeatherFetch(null);
});

test('galat: luar Indonesia, BMKG mati, kuota harian', async () => {
  const ctx = fakeCtx();
  await assert.rejects(W.getWeather(ctx, { lat: 51.5, lng: -0.12 }), (e) => e.status === 400 && e.code === 'outside_indonesia');
  W.setWeatherFetch(createFakeFetch({ down: true }));
  await assert.rejects(W.getWeather(ctx, HOME), (e) => e.status === 502 && e.code === 'weather_unavailable');
  W.setWeatherFetch(createFakeFetch());
  const busy = fakeCtx();
  busy.store.hit = async () => W.DAILY_LIMIT + 1;
  await assert.rejects(W.getWeather(busy, HOME), (e) => e.status === 429 && e.code === 'weather_quota');
  W.setWeatherFetch(null);
});
