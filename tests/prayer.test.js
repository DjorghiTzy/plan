const test = require('node:test');
const assert = require('node:assert/strict');
const PR = require('../js/core/prayer.js');

const byId = (list) => Object.fromEntries(list.map((p) => [p.id, p.minutes]));
const hm = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

test('urutan waktu sholat selalu naik', () => {
  for (const city of PR.CITIES) {
    for (const key of ['2026-01-15', '2026-06-21', '2026-09-24', '2026-12-21']) {
      const m = PR.times(key, city).map((p) => p.minutes);
      for (let i = 1; i < m.length; i += 1) assert.ok(m[i] > m[i - 1], `${city.id} ${key}`);
    }
  }
});

test('Jakarta: Dzuhur mengikuti persamaan waktu', () => {
  const jkt = PR.findCity('jakarta');
  // Akhir Juni Dzuhur sekitar 11:56–11:57, awal November sekitar 11:37–11:38 WIB.
  const june = byId(PR.times('2026-06-21', jkt)).dzuhur;
  const nov = byId(PR.times('2026-11-03', jkt)).dzuhur;
  assert.ok(Math.abs(june - hm('11:57')) <= 2, `Juni ${june}`);
  assert.ok(Math.abs(nov - hm('11:38')) <= 2, `November ${nov}`);
});

test('Jakarta 24 September 2026 dalam rentang wajar', () => {
  const t = byId(PR.times('2026-09-24', PR.findCity('jakarta')));
  assert.ok(Math.abs(t.subuh - hm('04:24')) <= 4);
  assert.ok(Math.abs(t.maghrib - hm('17:51')) <= 3);
  assert.ok(Math.abs(t.isya - hm('19:00')) <= 4);
  assert.equal(t.subuh - t.imsak, 10);
});

test('zona waktu: Jayapura (WIT) lebih pagi dari Jakarta dalam jam lokal', () => {
  const jkt = byId(PR.times('2026-09-24', PR.findCity('jakarta')));
  const jpr = byId(PR.times('2026-09-24', PR.findCity('jayapura')));
  assert.equal(PR.findCity('jayapura').zone, 'WIT');
  assert.ok(jpr.dzuhur < jkt.dzuhur);
});

test('next melewati Imsak dan Terbit', () => {
  const list = PR.times('2026-09-24', PR.findCity('jakarta'));
  assert.equal(PR.next(list, 0).id, 'subuh');
  assert.equal(PR.next(list, hm('05:00')).id, 'dzuhur');
  assert.equal(PR.next(list, hm('23:00')), null);
});

test('kota tak dikenal jatuh ke Jakarta', () => {
  assert.equal(PR.findCity('atlantis').id, 'jakarta');
});
