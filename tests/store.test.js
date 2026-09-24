// Menguji aksi store (tugas berulang, pindah, urungkan) di Node dengan localStorage tiruan.
const test = require('node:test');
const assert = require('node:assert/strict');

const memory = new Map();
globalThis.self = {
  Planner: { date: require('../js/core/date.js'), logic: require('../js/core/logic.js') },
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
  },
};
require('../js/store.js');
const S = globalThis.self.Planner.store;

function fresh() {
  memory.set('rencana-harian/v1', JSON.stringify({ tasks: [] }));
  S.load();
}
const onDate = (date, title) => S.state.tasks.filter((t) => t.date === date && t.title === title);
const base = { title: 'Jalan pagi', date: '2026-09-21', start: '06:00', end: '06:30', category: 'kesehatan', priority: 'sedang' };

test('seri harian dibuat & dimunculkan per tanggal tanpa duplikat', () => {
  fresh();
  S.saveTask(null, base, { rule: 'harian' });
  S.materialize(['2026-09-21', '2026-09-22', '2026-09-22', '2026-09-20']);
  assert.equal(onDate('2026-09-21', 'Jalan pagi').length, 1);
  assert.equal(onDate('2026-09-22', 'Jalan pagi').length, 1);
  assert.equal(onDate('2026-09-20', 'Jalan pagi').length, 0);
});

test('hapus satu kejadian tidak dibuat ulang; urungkan mengembalikan', () => {
  fresh();
  S.saveTask(null, base, { rule: 'harian' });
  S.materialize(['2026-09-22']);
  const removed = S.deleteTask(onDate('2026-09-22', 'Jalan pagi')[0].id);
  S.materialize(['2026-09-22']);
  assert.equal(onDate('2026-09-22', 'Jalan pagi').length, 0);
  S.restoreTask(removed);
  S.materialize(['2026-09-22']);
  assert.equal(onDate('2026-09-22', 'Jalan pagi').length, 1);
});

test('pindah kejadian lalu urungkan tidak menghilangkan jadwal hari tujuan', () => {
  fresh();
  S.saveTask(null, base, { rule: 'harian' });
  S.materialize(['2026-09-21', '2026-09-22']);
  const first = onDate('2026-09-21', 'Jalan pagi')[0];
  S.moveTasks([first.id], '2026-09-22');
  S.materialize(['2026-09-21', '2026-09-22']);
  assert.equal(onDate('2026-09-21', 'Jalan pagi').length, 0, 'asal tidak dibuat ulang');
  assert.equal(onDate('2026-09-22', 'Jalan pagi').length, 2, 'tujuan: hasil pindahan + jadwalnya sendiri');
  S.moveTasks([first.id], '2026-09-21');
  S.materialize(['2026-09-21', '2026-09-22']);
  assert.equal(onDate('2026-09-21', 'Jalan pagi').length, 1);
  assert.equal(onDate('2026-09-22', 'Jalan pagi').length, 1);
});

test('ubah seri memperbarui kejadian mendatang yang belum selesai saja', () => {
  fresh();
  S.saveTask(null, base, { rule: 'harian' });
  S.materialize(['2026-09-22', '2026-09-23', '2026-09-24']);
  S.toggleTask(onDate('2026-09-24', 'Jalan pagi')[0].id);
  const t22 = onDate('2026-09-22', 'Jalan pagi')[0];
  S.saveTask(t22, { ...base, date: '2026-09-22', title: 'Jalan pagi 3 km', start: '05:30', end: '06:15' }, { rule: 'harian' });
  assert.equal(S.state.tasks.find((t) => t.date === '2026-09-21').title, 'Jalan pagi', 'masa lalu tetap');
  assert.equal(S.state.tasks.find((t) => t.date === '2026-09-23').start, '05:30', 'berikutnya ikut berubah');
  assert.equal(S.state.tasks.find((t) => t.date === '2026-09-24').title, 'Jalan pagi', 'yang sudah selesai tidak diubah');
});

test('ganti aturan ke hari kerja membuang kejadian akhir pekan mendatang', () => {
  fresh();
  S.saveTask(null, base, { rule: 'harian' });
  S.materialize(['2026-09-25', '2026-09-26', '2026-09-27']); // Jum, Sab, Min
  const t21 = S.state.tasks.find((t) => t.date === '2026-09-21');
  S.saveTask(t21, { ...base }, { rule: 'kerja' });
  assert.equal(S.state.tasks.filter((t) => t.date === '2026-09-26' || t.date === '2026-09-27').length, 0);
  assert.equal(S.state.tasks.filter((t) => t.date === '2026-09-25').length, 1);
});

test('hentikan seri: kejadian ini & berikutnya dihapus, riwayat tetap', () => {
  fresh();
  S.saveTask(null, base, { rule: 'harian' });
  S.materialize(['2026-09-22', '2026-09-23']);
  S.toggleTask(S.state.tasks.find((t) => t.date === '2026-09-21').id);
  const removed = S.stopSeries(S.state.tasks.find((t) => t.date === '2026-09-22').id);
  assert.equal(removed, 2);
  S.materialize(['2026-09-24']);
  assert.deepEqual(S.state.tasks.map((t) => t.date), ['2026-09-21']);
});

test('mingguan tanpa hari ditolak', () => {
  fresh();
  assert.throws(() => S.saveTask(null, base, { rule: 'mingguan', days: [] }), /minimal satu hari/);
});

test('mengubah tugas biasa menjadi berulang', () => {
  fresh();
  const t = S.addTask({ ...base, date: '2026-09-24' });
  S.saveTask(t, { ...base, date: '2026-09-24' }, { rule: 'mingguan', days: [4] });
  S.materialize(['2026-10-01', '2026-10-02']);
  assert.equal(onDate('2026-10-01', 'Jalan pagi').length, 1);
  assert.equal(onDate('2026-10-02', 'Jalan pagi').length, 0);
  assert.equal(onDate('2026-09-24', 'Jalan pagi').length, 1);
});

test('impor data lama tanpa seri tetap berjalan', () => {
  const next = S.normalize({ tasks: [{ title: 'Lama', date: '2026-01-01' }] });
  assert.deepEqual(next.series, []);
  assert.equal(next.tasks[0].priority, 'sedang');
});
