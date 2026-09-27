const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/core/logic.js');

const habits = [
  { id: 'a', name: 'Jamaah Subuh', createdOn: '2026-08-01' },
  { id: 'b', name: 'Baca 1 bab buku', createdOn: '2026-09-10' },
  { id: 'c', name: 'Diarsipkan', archived: true },
  { id: 'd', name: 'Belum dibuat', createdOn: '2026-10-02' },
];
const log = {
  '2026-09-01': ['a'],
  '2026-09-02': ['a'],
  '2026-09-03': ['a'],
  '2026-09-05': ['b'], // sebelum dibuat tapi dicentang: tetap dihitung
  '2026-09-10': ['a', 'b'],
  '2026-09-11': ['b'],
  '2026-09-12': ['a', 'b'],
  '2026-09-30': ['a'], // masa depan: tidak dihitung
};

test('habitMonth: hari, minggu 1–7 dst, dan kebiasaan yang ikut', () => {
  const m = L.habitMonth(log, habits, '2026-09', '2026-09-12');
  assert.equal(m.days.length, 30);
  assert.equal(m.days[0], '2026-09-01');
  assert.deepEqual(m.rows.map((r) => r.habit.id), ['a', 'b']);
  assert.deepEqual(m.weeks.map((w) => [w.from.slice(8), w.to.slice(8), w.size]), [
    ['01', '07', 7], ['08', '14', 7], ['15', '21', 7], ['22', '28', 7], ['29', '30', 2],
  ]);
  assert.equal(L.habitMonth({}, habits, '2026-02', '2026-09-12').days.length, 28);
});

test('habitMonth: target & selesai per kebiasaan', () => {
  const m = L.habitMonth(log, habits, '2026-09', '2026-09-12');
  const [a, b] = m.rows;
  assert.deepEqual([a.target, a.done, a.pct, a.bestRun], [12, 5, 42, 3]);
  // b: 10, 11, 12 + tanggal 5 (dicentang sebelum dibuat) = 4 hari dihitung, semua selesai
  assert.deepEqual([b.target, b.done, b.pct], [4, 4, 100]);
  assert.equal(b.cells[3].before, true);
  assert.equal(b.cells[4].counted, true);
  assert.equal(a.cells[29].future, true);
  assert.equal(a.cells[29].counted, false);
});

test('habitMonth: persentase harian, mingguan, total, hari sempurna, peringkat', () => {
  const m = L.habitMonth(log, habits, '2026-09', '2026-09-12');
  assert.deepEqual(m.daily.slice(0, 5).map((d) => d.pct), [100, 100, 100, 0, 50]);
  assert.deepEqual(m.daily[9], { key: '2026-09-10', done: 2, total: 2, pct: 100 });
  assert.equal(m.daily[12].pct, null); // besok
  assert.deepEqual([m.weeks[0].done, m.weeks[0].total], [4, 8]);
  assert.deepEqual(m.total, { done: 9, target: 16, pct: 56 });
  assert.equal(m.perfect, 5); // 1, 2, 3, 10, 12
  assert.deepEqual(m.top.map((r) => r.habit.id), ['b', 'a']);
  assert.deepEqual([m.streak.habit.id, m.streak.days], ['a', 3]);
});

test('habitMonth: bulan depan kosong, tanpa kebiasaan aman', () => {
  const next = L.habitMonth(log, habits, '2026-10', '2026-09-12');
  assert.equal(next.total.pct, null);
  assert.ok(next.daily.every((d) => d.pct === null));
  assert.deepEqual(next.rows.map((r) => r.habit.id), ['a', 'b', 'd']);
  const none = L.habitMonth({}, [], '2026-09', '2026-09-12');
  assert.deepEqual([none.rows.length, none.total.pct, none.perfect, none.top.length], [0, null, 0, 0]);
});
