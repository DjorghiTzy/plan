// Menguji aksi store (tugas berulang, pindah, urungkan) di Node dengan localStorage tiruan.
const test = require('node:test');
const assert = require('node:assert/strict');

const memory = new Map();
globalThis.self = {
  Planner: { date: require('../js/core/date.js'), logic: require('../js/core/logic.js'), databases: require('../js/core/databases.js'), run: require('../js/core/run.js') },
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
};
require('../js/store.js');
const S = globalThis.self.Planner.store;

function fresh() {
  memory.clear();
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

test('rute tersimpan: jenis "gambar" & titik akhir rute sekali jalan dipertahankan', () => {
  fresh();
  const coords = [[-2.1, 106.1], [-2.11, 106.1], [-2.12, 106.11]];
  const one = S.saveRoute({ type: 'gambar', name: 'Gambar 2,4 km sekali jalan ke selatan', distance: 2400, coords, start: coords[0], end: coords[2], waypoints: [coords[1]] });
  assert.equal(one.type, 'gambar');
  assert.deepEqual(one.end, coords[2]);
  const loop = S.saveRoute({ type: 'putar', distance: 5000, coords, start: coords[0], waypoints: [coords[1]] });
  assert.deepEqual(loop.end, coords[0], 'tanpa titik akhir: kembali ke titik mulai');
  const odd = S.saveRoute({ type: 'aneh', distance: 1000, coords });
  assert.equal(odd.type, 'putar');
  assert.equal(S.state.savedRoutes.length, 3);
});

test('sesi coach: kartu rute di pesan coach & ringkasan pesan lama disimpan (ringkas, muat satu entri)', () => {
  fresh();
  const coords = Array.from({ length: 600 }, (_, i) => [-2.13 + i * 1e-5, 106.11 + Math.sin(i / 50) * 1e-3]);
  const route = { type: 'putar', distance: 5020, diff: 20, direction: 'timur laut', turns: 6, streets: ['Jl. A', 'Jl. B', 'Jl. C', 'Jl. D'], start: coords[0], waypoints: [coords[100], coords[300], coords[500]], coords };
  const chat = S.saveCoachChat({
    id: 'cc-rute',
    title: 'Rute',
    memory: '- Pengguna mengincar 10K.',
    compacted: 12,
    messages: [
      { role: 'user', text: 'Rute 5 km dong', t: 1 },
      { role: 'assistant', text: 'Lari 5 km.', t: 2, route: { km: 5, type: 'putar', status: 'ok', routes: [route, route, route, route], pick: 7 } },
      { role: 'assistant', text: 'Tunggu.', t: 3, route: { km: 99, type: 'putar', status: 'pending' } },
      { role: 'user', text: 'x', t: 4, route: { km: 5, type: 'putar', status: 'pending' } },
    ],
  });
  const r = chat.messages[1].route;
  assert.equal(r.status, 'ok');
  assert.equal(r.routes.length, 3, 'paling banyak 3 rute');
  assert.equal(r.pick, 2);
  assert.ok(r.routes[0].coords.length <= 120, `${r.routes[0].coords.length} titik`);
  assert.deepEqual(r.routes[0].coords[0], [-2.13, 106.11]);
  assert.equal(r.routes[0].streets.length, 3);
  assert.equal(chat.messages[2].route, undefined, 'jarak tidak masuk akal dibuang');
  assert.equal(chat.messages[3].route, undefined, 'kartu rute hanya di pesan coach');
  assert.equal(chat.memory, '- Pengguna mengincar 10K.');
  assert.equal(chat.compacted, 12);
  assert.ok(JSON.stringify(chat).length < 20000);
  // Sesi panjang: sampai 240 pesan disimpan (dulu 60).
  const long = S.saveCoachChat({ id: 'cc-long', title: 'Panjang', messages: Array.from({ length: 150 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `p${i}`, t: i + 1 })) });
  assert.equal(long.messages.length, 150);
});

test('susunan menu aplikasi: hanya daftar id yang aman, rusak → bawaan', () => {
  memory.clear();
  memory.set('rencana-harian/v1', JSON.stringify({ tasks: [], settings: { launcher: { order: ['musik', 'kerja', 5, '<b>'], dock: ['fokus', null] } } }));
  S.load();
  assert.deepEqual(S.state.settings.launcher, { order: ['musik', 'kerja'], dock: ['fokus'] });
  memory.clear();
  memory.set('rencana-harian/v1', JSON.stringify({ tasks: [], settings: { launcher: { order: ['musik'] } } }));
  S.load();
  assert.deepEqual(S.state.settings.launcher, { order: ['musik'], dock: null });
  memory.clear();
  memory.set('rencana-harian/v1', JSON.stringify({ tasks: [], settings: { launcher: 'rusak' } }));
  S.load();
  assert.equal(S.state.settings.launcher, null);
});

test('penyimpanan per database: data lama dipindah, hanya database yang berubah ditulis ulang', () => {
  const DB = globalThis.self.Planner.databases;
  memory.clear();
  memory.set('rencana-harian/v1', JSON.stringify({
    settings: { name: 'Sari' },
    tasks: [{ id: 'a', date: '2026-09-30', title: 'Rapat', category: 'kerja', priority: 'sedang' }, { id: 'b', date: '2026-09-30', title: 'Belanja', category: 'rumah', priority: 'sedang' }],
    runs: [{ id: 'r', date: '2026-09-30', km: 5, sec: 1800 }],
    water: { '2026-09-30': 3 },
  }));
  S.load();
  S.flush();
  assert.ok(!memory.has('rencana-harian/v1'), 'dokumen lama dihapus setelah semua database tertulis');
  assert.ok(memory.has('rencana-harian/db'), 'penanda database lengkap');
  const part = (id) => JSON.parse(memory.get(`rencana-harian/db/${id}`));
  assert.deepEqual(part('kerja').tasks.map((t) => t.id), ['a']);
  assert.deepEqual(part('pribadi').tasks.map((t) => t.id), ['b']);
  assert.equal(part('olahraga').runs.length, 1);
  assert.deepEqual(part('kebiasaan').water, { '2026-09-30': 3 });
  assert.equal(part('umum').settings.name, 'Sari');
  // Muat ulang dari database terpisah: isi sama.
  S.load();
  assert.deepEqual(S.state.tasks.map((t) => t.id).sort(), ['a', 'b']);
  assert.equal(S.state.runs[0].km, 5);
  // Ubah air minum: hanya Database Kebiasaan yang ditulis ulang.
  const before = Object.fromEntries(DB.IDS.map((id) => [id, memory.get(`rencana-harian/db/${id}`)]));
  const writes = [];
  const orig = globalThis.self.localStorage.setItem;
  globalThis.self.localStorage.setItem = (k, v) => { writes.push(k); orig(k, v); };
  S.setWater('2026-09-30', 5);
  S.flush();
  globalThis.self.localStorage.setItem = orig;
  assert.deepEqual(writes, ['rencana-harian/db/kebiasaan']);
  assert.equal(memory.get('rencana-harian/db/kerja'), before.kerja);
  assert.ok(S.isDataKey('rencana-harian/db/olahraga') && S.isDataKey('rencana-harian/v1') && !S.isDataKey('rencana-harian/sync'));
  const sizes = S.dbSizes();
  assert.ok(sizes.kebiasaan > 0 && sizes.olahraga > 0);
});

test('penyimpanan per database: tugas yang pindah ke Pribadi tidak tertinggal di Kerja', () => {
  memory.clear();
  memory.set('rencana-harian/v1', JSON.stringify({ tasks: [{ id: 'a', date: '2026-09-30', title: 'Rapat', category: 'kerja', priority: 'sedang' }] }));
  S.load();
  S.flush();
  S.updateTask('a', { category: 'rumah' });
  S.flush();
  assert.deepEqual(JSON.parse(memory.get('rencana-harian/db/kerja')).tasks, []);
  assert.deepEqual(JSON.parse(memory.get('rencana-harian/db/pribadi')).tasks.map((t) => t.id), ['a']);
});

test('penyimpanan per database: penyimpanan penuh saat pindah → tetap dokumen lama, tidak terbelah', () => {
  memory.clear();
  memory.set('rencana-harian/v1', JSON.stringify({ tasks: [{ id: 'a', date: '2026-09-30', title: 'Rapat', category: 'kerja', priority: 'sedang' }] }));
  const ls = globalThis.self.localStorage;
  const orig = ls.setItem;
  // Kuota habis setelah dua database tertulis.
  let n = 0;
  ls.setItem = (k, v) => {
    if (k.startsWith('rencana-harian/db/') && (n += 1) > 2) throw new Error('QuotaExceededError');
    orig(k, v);
  };
  S.load();
  ls.setItem = orig;
  assert.ok(!memory.has('rencana-harian/db'), 'belum ditandai pindah');
  assert.ok(![...memory.keys()].some((k) => k.startsWith('rencana-harian/db/')), 'database setengah jadi dibuang');
  assert.equal(JSON.parse(memory.get('rencana-harian/v1')).tasks[0].id, 'a', 'data tetap utuh di dokumen lama');
  assert.equal(S.storageOk, true);
  // Kuota kembali normal: penyimpanan berikutnya memindah.
  S.setWater('2026-09-30', 2);
  S.flush();
  assert.ok(memory.has('rencana-harian/db') && !memory.has('rencana-harian/v1'));
});
