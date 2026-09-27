const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/core/run.js');

const runs = [
  { id: 'a', date: '2026-09-01', time: '06:00', km: 5, sec: 1860, type: 'santai', feel: 4 }, // 6:12
  { id: 'b', date: '2026-09-03', time: '06:10', km: 3.2, sec: 1024, type: 'tempo', feel: 3 }, // 5:20
  { id: 'c', date: '2026-09-03', time: '17:30', km: 2, sec: 0, type: 'santai', feel: 0 }, // tanpa waktu
  { id: 'd', date: '2026-09-10', time: '05:45', km: 10.5, sec: 3990, type: 'jauh', feel: 2 }, // 6:20
  { id: 'e', date: '2026-08-31', time: '06:00', km: 21.1, sec: 7596, type: 'lomba', feel: 5 }, // 6:00
  { id: 'f', date: '2026-09-11', time: '06:00', km: 0.8, sec: 200, type: 'interval', feel: 3 }, // 4:10, < 1 km
];

test('parseKm & format', () => {
  assert.equal(R.parseKm('5,2'), 5.2);
  assert.equal(R.parseKm(' 10.25 km'), 10.25);
  assert.equal(R.parseKm('7'), 7);
  assert.equal(R.parseKm(''), null);
  assert.equal(R.parseKm('0'), null);
  assert.equal(R.parseKm('abc'), null);
  assert.equal(R.formatKm(5), '5');
  assert.equal(R.formatKm(5.25), '5,25');
  assert.equal(R.formatKm(32.4), '32,4');
  assert.equal(R.formatKm(32.46, 1), '32,5');
  assert.equal(R.formatPace(372), '6:12');
  assert.equal(R.formatPace(null), '–');
  assert.equal(R.formatClock(1930), '32:10');
  assert.equal(R.formatClock(3725), '1:02:05');
  assert.equal(R.speed(10, 3600), 10);
  assert.equal(R.pace(5, 1860), 372);
  assert.equal(R.pace(5, 0), null);
  assert.deepEqual([0, 3, 7.3, 12, 26, 140].map(R.niceMax), [5, 5, 10, 20, 50, 200]);
});

test('runMonth: harian, mingguan, total', () => {
  const m = R.runMonth(runs, '2026-09', '2026-09-12', 50);
  assert.equal(m.days.length, 30);
  const d3 = m.daily[2];
  assert.equal(d3.runs.length, 2);
  assert.deepEqual(d3.runs.map((r) => r.id), ['b', 'c']);
  assert.equal(d3.km, 5.2);
  assert.equal(d3.sec, 1024);
  assert.equal(d3.pace, 320); // hanya dari lari yang punya waktu
  assert.equal(d3.feel, 3);
  assert.equal(m.daily[12].future, true);
  assert.deepEqual(m.weeks.map((w) => [w.km, w.count]), [[10.2, 3], [11.3, 2], [0, 0], [0, 0], [0, 0]]);
  assert.equal(m.weeks[2].future, true);
  assert.deepEqual(m.total, { km: 21.5, sec: 7074, count: 5, activeDays: 4, pace: 7074 / 19.5 });
  assert.equal(m.longest.id, 'd');
  assert.equal(m.maxDay, 10.5);
});

test('runMonth: akumulasi vs target', () => {
  const m = R.runMonth(runs, '2026-09', '2026-09-12', 60);
  assert.equal(m.cumulative[0].km, 5);
  assert.equal(m.cumulative[2].km, 10.2);
  assert.equal(m.cumulative[11].km, 21.5);
  assert.equal(m.cumulative[12].km, null);
  assert.equal(m.cumulative[29].target, 60);
  assert.equal(m.cumulative[14].target, 30);
  assert.equal(m.expected, 24); // 12 dari 30 hari
  assert.equal(m.ahead, -2.5);
  assert.equal(m.pct, 36);
  const none = R.runMonth(runs, '2026-09', '2026-09-12', 0);
  assert.equal(none.pct, null);
  assert.equal(none.expected, null);
  assert.equal(none.cumulative[0].target, null);
});

test('rekor & streak', () => {
  const rec = R.records(runs);
  assert.equal(rec.count, 6);
  assert.equal(rec.km, 42.6);
  assert.equal(rec.longest.id, 'e');
  assert.equal(rec.fastest.run.id, 'b'); // 0,8 km tidak dihitung
  assert.equal(Math.round(rec.fastest.pace), 320);
  assert.equal(rec.best5k.run.id, 'e');
  assert.equal(rec.best5k.sec, 1800);
  assert.deepEqual(R.records([]), { count: 0, km: 0, longest: null, fastest: null, best5k: null });
  assert.equal(R.streak(runs, '2026-09-11'), 2);
  assert.equal(R.streak(runs, '2026-09-12'), 2); // hari ini belum lari: dihitung sampai kemarin
  assert.equal(R.streak(runs, '2026-09-14'), 0);
  assert.equal(R.streak(runs, '2026-09-01'), 2); // 31 Agu + 1 Sep
});
