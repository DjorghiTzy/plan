// Rencana Kerja & Pribadi: ruang tugas, jam kerja, proyek, laporan kerja, sinkron proyek.
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
require('../js/data/sample.js');
require('../js/data/templates.js');
require('../js/store.js');
const S = globalThis.self.Planner.store;
const L = require('../js/core/logic.js');
const D = require('../js/core/date.js');
const M = require('../js/core/syncmap.js');

const KEY = 'rencana-harian/v1';
function fresh(data = { tasks: [] }) {
  memory.set(KEY, JSON.stringify(data));
  return S.load();
}

// 2026-09-25 = Jumat, 2026-09-26 = Sabtu, 2026-09-28 = Senin
const FRI = '2026-09-25';
const SAT = '2026-09-26';
const MON = '2026-09-28';

test('ruang tugas: eksplisit, atau mengikuti kategori untuk tugas lama', () => {
  assert.equal(L.areaOf({ category: 'kerja' }), 'kerja');
  assert.equal(L.areaOf({ category: 'belajar' }), 'pribadi');
  assert.equal(L.areaOf({ category: 'belajar', area: 'kerja' }), 'kerja', 'pelatihan kantor tetap di Kerja');
  assert.equal(L.areaOf({ category: 'kerja', area: 'pribadi' }), 'pribadi');
  assert.equal(L.areaOf({ category: 'kerja', area: 'aneh' }), 'kerja');
});

test('jam kerja: hari kerja, istirahat, dan hari kerja berikutnya', () => {
  const s = { workStart: '08:30', workEnd: '17:00', breakStart: '12:00', breakEnd: '13:00', workDays: [1, 2, 3, 4, 5] };
  const w = L.workWindow(s, FRI);
  assert.deepEqual([w.isWorkday, w.start, w.end, w.rest, w.minutes], [true, 510, 1020, [720, 780], 450]);
  assert.equal(L.workWindow(s, SAT).isWorkday, false);
  assert.equal(L.workWindow({ ...s, breakStart: '07:00', breakEnd: '08:00' }, FRI).rest, null, 'istirahat di luar jam kerja diabaikan');
  assert.equal(L.workWindow({ workStart: '17:00', workEnd: '08:00' }, FRI).start, 480, 'jam terbalik → bawaan');
  assert.equal(L.nextWorkday(FRI, [1, 2, 3, 4, 5]), MON);
  assert.equal(L.nextWorkday(FRI, [1, 2, 3, 4, 5, 6]), SAT);
  assert.equal(L.nextWorkday(FRI, []), MON, 'tanpa hari kerja → Sen–Jum');
});

test('beban jam kerja tidak menghitung istirahat', () => {
  const tasks = [
    { start: '08:00', end: '10:00' },
    { start: '11:30', end: '13:30' }, // 30 menit di dalam istirahat 12–13 tidak dihitung dua kali
    { start: null, done: false },
  ];
  const c = L.capacityIn(tasks, 480, 1020, [[720, 780]]);
  assert.equal(c.window, 480);
  assert.equal(c.scheduled, 120 + 60);
  assert.equal(c.free, 300);
  assert.equal(c.untimed, 1);
  assert.deepEqual(L.capacity(tasks, 5, 23), L.capacityIn(tasks, 300, 1380), 'kapasitas harian tetap sama');
});

test('atur otomatis di jam kerja melewati istirahat', () => {
  const tasks = [
    { id: 'a', start: '08:00', end: '11:50' },
    { id: 'b', start: null, priority: 'tinggi' },
    { id: 'c', start: null, priority: 'sedang' },
  ];
  const plan = L.autoSchedule(tasks, { startMin: 480, endMin: 1020, blocked: [[720, 780]] });
  assert.deepEqual(plan.map((p) => [p.id, p.start, p.end]), [['b', '13:05', '14:05'], ['c', '14:10', '14:40']]);
});

test('kemajuan & tenggat proyek', () => {
  const pj = { id: 'p1', deadline: '2026-09-28' };
  const tasks = [
    { id: '1', projectId: 'p1', date: '2026-09-23', done: false, title: 'Terlewat' },
    { id: '2', projectId: 'p1', date: '2026-09-26', done: false, title: 'Berikutnya' },
    { id: '3', projectId: 'p1', date: '2026-09-24', done: true, title: 'Beres' },
    { id: '4', projectId: 'p2', date: '2026-09-24', done: false, title: 'Lain' },
  ];
  const s = L.projectStats(pj, tasks, FRI);
  assert.deepEqual([s.total, s.done, s.pct, s.overdue, s.daysLeft], [3, 1, 33, 1, 3]);
  assert.equal(s.next.title, 'Berikutnya');
  assert.equal(L.deadlineLabel(-2), 'Terlambat 2 hari');
  assert.equal(L.deadlineLabel(0), 'Tenggat hari ini');
  assert.equal(L.deadlineLabel(1), 'Tenggat besok');
  assert.equal(L.deadlineLabel(5), '5 hari lagi');
  assert.equal(L.deadlineLabel(null), '');
});

test('laporan kerja harian & mingguan', () => {
  const projects = [{ id: 'p1', name: 'Aplikasi v2', emoji: '🚀', deadline: '2026-09-30', status: 'aktif' }];
  const tasks = [
    { id: 'a', date: FRI, title: 'Rapat tim', start: '09:00', end: '10:00', done: true, category: 'kerja', subtasks: [] },
    { id: 'b', date: FRI, title: 'Desain halaman', projectId: 'p1', done: true, category: 'kerja', subtasks: [] },
    { id: 'c', date: FRI, title: 'Uji coba', projectId: 'p1', done: false, category: 'kerja', subtasks: [{ done: true }, { done: false }] },
  ];
  const next = [{ id: 'd', date: MON, title: 'Presentasi klien', start: '10:00', end: '11:00', done: false, category: 'kerja', subtasks: [] }];
  const text = L.workReport({
    date: FRI, name: 'Dimas', tasks, next, nextDate: MON, projects, blockers: 'Menunggu data', notes: '',
  });
  assert.match(text, /^\*Laporan Kerja Harian\*\nDimas · Jumat, 25 September 2026/);
  assert.match(text, /\*✅ Selesai \(2\)\*\n1\. Rapat tim \(09:00–10:00\)\n2\. Desain halaman · _Aplikasi v2_/);
  assert.match(text, /\*⏳ Belum selesai \(1\)\*\n1\. Uji coba \(1\/2 subtugas\) · _Aplikasi v2_/);
  assert.match(text, /\*📅 Rencana Senin, 28 Sep \(1\)\*\n1\. Presentasi klien \(10:00–11:00\)/);
  assert.match(text, /\*⚠️ Kendala\*\nMenunggu data/);
  assert.doesNotMatch(text, /Catatan/);
  assert.match(text, /_Progres: 2 dari 3 tugas selesai \(67%\)_$/);

  const week = L.workReportWeek({ keys: D.weekKeys(FRI), tasks: [...tasks, ...next], projects, today: FRI });
  assert.match(week, /^\*Laporan Kerja Mingguan\*\n21–27 September 2026/);
  assert.match(week, /_Jumat, 25 Sep_\n1\. Rapat tim/);
  assert.match(week, /• 🚀 Aplikasi v2: 1\/2 tugas \(50%\) · tenggat 30 Sep/);
  assert.doesNotMatch(week, /Presentasi klien/, 'tugas pekan depan tidak masuk');
});

test('keseimbangan kerja vs pribadi', () => {
  const b = L.areaBalance([
    { date: FRI, category: 'kerja', start: '08:00', end: '12:00', done: true },
    { date: FRI, category: 'kesehatan', start: '06:00', end: '07:00', done: false },
    { date: FRI, category: 'belajar', area: 'kerja', done: false },
    { date: SAT, category: 'kerja', start: '08:00', end: '09:00' },
  ], [FRI]);
  assert.deepEqual(b.kerja, { total: 2, done: 1, minutes: 240 });
  assert.deepEqual(b.pribadi, { total: 1, done: 0, minutes: 60 });
});

test('proyek: buat, ubah ruang, selesai, hapus lalu urungkan', () => {
  fresh({
    tasks: [
      { id: 't1', date: FRI, title: 'A', category: 'kerja' },
      { id: 't2', date: FRI, title: 'B', category: 'kerja' },
    ],
  });
  assert.throws(() => S.saveProject({ name: '  ' }), /nama proyek/i);
  assert.throws(() => S.saveProject({ name: 'X', deadline: 'besok' }), /tenggat/i);
  const pj = S.saveProject({ name: ' Aplikasi v2 ', emoji: '🚀', area: 'kerja', deadline: '2026-09-30' });
  assert.equal(pj.name, 'Aplikasi v2');
  assert.equal(pj.status, 'aktif');
  S.updateTask('t1', { projectId: pj.id });
  S.updateTask('t2', { projectId: pj.id });

  // Pindah ke Pribadi: tugasnya ikut pindah ruang.
  S.saveProject({ id: pj.id, name: 'Aplikasi v2', area: 'pribadi', deadline: null });
  assert.deepEqual(S.state.tasks.map((t) => L.areaOf(t)), ['pribadi', 'pribadi']);
  assert.equal(S.findProject(pj.id).deadline, null);
  assert.equal(S.findProject(pj.id).createdAt, pj.createdAt);

  S.setProjectStatus(pj.id, 'selesai');
  assert.equal(S.findProject(pj.id).status, 'selesai');
  assert.ok(S.findProject(pj.id).doneAt);

  const removed = S.deleteProject(pj.id);
  assert.equal(S.state.projects.length, 0);
  assert.deepEqual(S.state.tasks.map((t) => t.projectId), [null, null], 'tugas tetap ada, lepas dari proyek');
  S.restoreProject(removed);
  assert.equal(S.state.projects.length, 1);
  assert.deepEqual(S.state.tasks.map((t) => t.projectId), [pj.id, pj.id]);
});

test('tugas baru, berulang, dan template membawa ruang & proyek', () => {
  fresh();
  const pj = S.saveProject({ name: 'Laporan Q3', area: 'kerja' });
  const t = S.addTask({ date: FRI, title: 'Kumpulkan data', category: 'belajar', area: 'kerja', projectId: pj.id });
  assert.equal(L.areaOf(t), 'kerja');
  assert.equal(t.projectId, pj.id);
  const plain = S.addTask({ date: FRI, title: 'Tanpa ruang' });
  assert.equal('area' in plain, false, 'tidak menambah field bila tidak dipilih');

  S.saveTask(null, { date: MON, title: 'Standup', category: 'kerja', area: 'kerja', projectId: pj.id, start: '09:00', end: '09:15', subtasks: [] }, { rule: 'kerja' });
  S.materialize(['2026-09-29']);
  const next = S.state.tasks.find((x) => x.date === '2026-09-29' && x.title === 'Standup');
  assert.equal(next.area, 'kerja');
  assert.equal(next.projectId, pj.id);

  const tpl = S.templateFromDate(FRI, 'kerja');
  assert.deepEqual(tpl.tasks.map((x) => [x.title, x.area]), [['Kumpulkan data', 'kerja']]);
  const ids = S.applyTemplate(tpl, SAT);
  assert.equal(S.findTask(ids[0]).area, 'kerja');
});

test('pengaturan jam kerja yang rusak dikembalikan ke bawaan', () => {
  const s = S.normalize({ settings: { workStart: '25:00', workEnd: '17:00', breakStart: '13:00', breakEnd: '12:00', workDays: [1, 9, 'x', 3, 3] } });
  assert.equal(s.settings.workStart, '08:00');
  assert.equal(s.settings.workEnd, '17:00');
  assert.equal(s.settings.breakStart, '', 'istirahat terbalik dikosongkan');
  assert.deepEqual(s.settings.workDays, [1, 3]);
  const ok = S.normalize({});
  assert.deepEqual([ok.settings.workStart, ok.settings.breakStart, ok.settings.workDays], ['08:00', '12:00', [1, 2, 3, 4, 5]]);
  const pj = S.normalize({ projects: [{ name: 'A', area: 'x', status: 'y', deadline: 'z' }, { name: '' }, null] }).projects;
  assert.equal(pj.length, 1);
  assert.deepEqual([pj[0].area, pj[0].status, pj[0].deadline], ['kerja', 'aktif', null]);
});

test('proyek ikut sinkron sebagai entri terpisah', () => {
  fresh();
  const pj = S.saveProject({ name: 'Sinkron', area: 'kerja' });
  const flat = M.flatten(S.state);
  assert.ok(flat[`project:${pj.id}`]);
  assert.equal(flat['settings:workStart'], '08:00');
  const other = S.normalize({});
  M.applyEntry(other, `project:${pj.id}`, { v: pj, t: 5 });
  assert.equal(other.projects.length, 1);
  M.applyEntry(other, `project:${pj.id}`, { d: true, t: 6 });
  assert.equal(other.projects.length, 0);
});

test('kosongkan semua rencana menghapus proyek tapi menyimpan jam kerja', () => {
  fresh();
  S.saveProject({ name: 'Hilang', area: 'kerja' });
  S.setSettings({ workStart: '09:00' });
  S.clearAll();
  assert.equal(S.state.projects.length, 0);
  assert.equal(S.state.settings.workStart, '09:00');
});
