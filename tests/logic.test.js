const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/core/logic.js');

test('parseQuickAdd: rentang jam, kategori, prioritas, dan besok', () => {
  const r = L.parseQuickAdd('Rapat tim 14.00-15.30 #kerja !tinggi besok');
  assert.deepEqual(r, {
    title: 'Rapat tim', start: '14:00', end: '15:30', category: 'kerja',
    priority: 'tinggi', dayOffset: 1, starred: false, repeat: null,
  });
});

test('parseQuickAdd: "jam 6" tanpa menit, durasi bawaan 60 menit', () => {
  const r = L.parseQuickAdd('Olahraga jam 6 #kesehatan');
  assert.equal(r.title, 'Olahraga');
  assert.equal(r.start, '06:00');
  assert.equal(r.end, '07:00');
  assert.equal(r.category, 'kesehatan');
});

test('parseQuickAdd: nominal rupiah tidak dianggap jam', () => {
  const r = L.parseQuickAdd('Transfer Rp10.000 ke tabungan');
  assert.equal(r.start, null);
  assert.equal(r.title, 'Transfer Rp10.000 ke tabungan');
});

test('parseQuickAdd: tanda seru tunggal dan bintang', () => {
  const r = L.parseQuickAdd('Bayar listrik ! * #rum');
  assert.equal(r.priority, 'tinggi');
  assert.equal(r.starred, true);
  assert.equal(r.category, 'rumah');
  assert.equal(r.title, 'Bayar listrik');
});

test('parseQuickAdd: tagar tak dikenal tetap di judul', () => {
  const r = L.parseQuickAdd('Nonton #film');
  assert.equal(r.category, null);
  assert.equal(r.title, 'Nonton #film');
});

test('parseQuickAdd: jam selesai sebelum jam mulai diganti +60 menit', () => {
  const r = L.parseQuickAdd('Begadang 23.30-01.00');
  assert.equal(r.start, '23:30');
  assert.equal(r.end, '23:59');
});

test('sortTasks: berjam dulu, lalu prioritas', () => {
  const tasks = [
    { id: 'a', start: null, priority: 'tinggi', createdAt: 1 },
    { id: 'b', start: '09:00', priority: 'rendah', createdAt: 2 },
    { id: 'c', start: '08:00', priority: 'rendah', createdAt: 3 },
    { id: 'd', start: null, priority: 'rendah', createdAt: 0 },
  ];
  assert.deepEqual(L.sortTasks(tasks).map((t) => t.id), ['c', 'b', 'a', 'd']);
});

test('nextTask: mendeteksi tugas yang sedang berjalan', () => {
  const tasks = [
    { id: 'a', start: '08:00', end: '09:00', done: false },
    { id: 'b', start: '10:00', end: '11:00', done: false },
  ];
  assert.deepEqual(L.nextTask(tasks, 8 * 60 + 30), { task: tasks[0], status: 'berjalan', minutes: 30 });
  assert.deepEqual(L.nextTask(tasks, 9 * 60 + 15), { task: tasks[1], status: 'berikutnya', minutes: 45 });
  assert.equal(L.nextTask(tasks, 12 * 60), null);
});

test('layoutTimeline: blok bertumpuk dibagi kolom', () => {
  const layout = L.layoutTimeline([
    { id: 'a', start: 480, end: 600 },
    { id: 'b', start: 540, end: 570 },
    { id: 'c', start: 570, end: 660 },
    { id: 'd', start: 700, end: 760 },
  ]);
  assert.deepEqual(layout.a, { col: 0, cols: 2 });
  assert.deepEqual(layout.b, { col: 1, cols: 2 });
  assert.deepEqual(layout.c, { col: 1, cols: 2 });
  assert.deepEqual(layout.d, { col: 0, cols: 1 });
});

test('currentStreak: hari ini belum dicentang tidak memutus streak', () => {
  const log = {
    '2026-09-21': ['h'], '2026-09-22': ['h'], '2026-09-23': ['h'],
  };
  assert.equal(L.currentStreak(log, 'h', '2026-09-24', '2026-09-24'), 3);
  assert.equal(L.currentStreak(log, 'h', '2026-09-25', '2026-09-24'), 0);
  log['2026-09-24'] = ['h'];
  assert.equal(L.currentStreak(log, 'h', '2026-09-24', '2026-09-24'), 4);
});

test('bestStreak mencari rangkaian terpanjang', () => {
  const log = {
    '2026-09-01': ['h'], '2026-09-02': ['h'], '2026-09-03': ['h'],
    '2026-09-05': ['h'], '2026-09-06': ['h'],
  };
  assert.equal(L.bestStreak(log, 'h'), 3);
});

test('habitRate hanya menghitung sejak kebiasaan dibuat', () => {
  const log = { '2026-09-23': ['h'], '2026-09-24': ['h'] };
  const habit = { id: 'h', createdOn: '2026-09-21' };
  assert.equal(L.habitRate(log, habit, '2026-09-24', 30), 50);
});

test('rolloverCandidates mengambil tugas lama yang belum selesai', () => {
  const tasks = [
    { id: 'a', date: '2026-09-23', done: false },
    { id: 'b', date: '2026-09-23', done: true },
    { id: 'c', date: '2026-09-10', done: false },
    { id: 'd', date: '2026-09-24', done: false },
  ];
  assert.deepEqual(L.rolloverCandidates(tasks, '2026-09-24').map((t) => t.id), ['a']);
});

test('pickForDate stabil untuk tanggal yang sama', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(L.pickForDate('2026-09-24', list), L.pickForDate('2026-09-24', list));
  assert.notEqual(L.pickForDate('2026-09-24', list), L.pickForDate('2026-09-25', list));
});

test('parseQuickAdd: kata pengulangan', () => {
  assert.deepEqual(L.parseQuickAdd('Olahraga tiap hari jam 6').repeat, { rule: 'harian', days: [] });
  assert.deepEqual(L.parseQuickAdd('Cek email setiap hari kerja 08.00').repeat, { rule: 'kerja', days: [] });
  assert.deepEqual(L.parseQuickAdd('Beres rumah tiap akhir pekan').repeat, { rule: 'akhir-pekan', days: [] });
  const r = L.parseQuickAdd("Futsal setiap jum'at & selasa 19.00-21.00");
  assert.deepEqual(r.repeat, { rule: 'mingguan', days: [2, 5] });
  assert.equal(r.title, 'Futsal');
  assert.equal(L.parseQuickAdd('Belajar hari ini').repeat, null);
});

test('occursOn mengikuti aturan, batas, dan tanggal yang dilewati', () => {
  const base = { from: '2026-09-21', until: null, skips: [] };
  assert.equal(L.occursOn({ ...base, rule: 'harian' }, '2026-09-20'), false);
  assert.equal(L.occursOn({ ...base, rule: 'harian' }, '2026-09-21'), true);
  assert.equal(L.occursOn({ ...base, rule: 'kerja' }, '2026-09-26'), false); // Sabtu
  assert.equal(L.occursOn({ ...base, rule: 'kerja' }, '2026-09-25'), true); // Jumat
  assert.equal(L.occursOn({ ...base, rule: 'akhir-pekan' }, '2026-09-27'), true); // Minggu
  assert.equal(L.occursOn({ ...base, rule: 'mingguan', days: [4] }, '2026-09-24'), true); // Kamis
  assert.equal(L.occursOn({ ...base, rule: 'mingguan', days: [4] }, '2026-09-23'), false);
  assert.equal(L.occursOn({ ...base, rule: 'harian', until: '2026-09-22' }, '2026-09-23'), false);
  assert.equal(L.occursOn({ ...base, rule: 'harian', skips: ['2026-09-23'] }, '2026-09-23'), false);
});

test('describeRule', () => {
  assert.equal(L.describeRule({ rule: 'harian' }), 'Setiap hari');
  assert.equal(L.describeRule({ rule: 'mingguan', days: [5, 2] }), 'Setiap Selasa & Jumat');
  assert.equal(L.describeRule({ rule: 'mingguan', days: [0, 1, 3] }), 'Setiap Senin, Rabu & Minggu');
});

test('rolloverCandidates mengabaikan tugas berulang', () => {
  const tasks = [{ id: 'a', date: '2026-09-23', done: false, seriesId: 'r1' }];
  assert.equal(L.rolloverCandidates(tasks, '2026-09-24').length, 0);
});

test('searchTasks: semua kata harus cocok, tanpa peduli huruf besar', () => {
  const tasks = [
    { id: 'a', date: '2026-09-20', title: 'Rapat tim pemasaran', notes: '', subtasks: [] },
    { id: 'b', date: '2026-09-24', title: 'Rapat klien', notes: 'bahas TIM desain', subtasks: [] },
    { id: 'c', date: '2026-09-24', title: 'Belanja', notes: '', subtasks: [{ title: 'Beli sayur' }] },
  ];
  assert.deepEqual(L.searchTasks(tasks, 'rapat tim', '2026-09-24').map((t) => t.id), ['b', 'a']);
  assert.deepEqual(L.searchTasks(tasks, 'SAYUR', '2026-09-24').map((t) => t.id), ['c']);
  assert.deepEqual(L.searchTasks(tasks, '   ', '2026-09-24'), []);
});

test('shareText memakai format WhatsApp', () => {
  const text = L.shareText([
    { id: 'a', title: 'Rapat', start: '10:00', end: '11:00', done: true, starred: true, priority: 'tinggi' },
    { id: 'b', title: 'Belanja', start: null, done: false, priority: 'sedang' },
  ], '2026-09-24');
  assert.equal(text, '*Rencana Kamis, 24 September 2026*\n\n✅ 10:00–11:00 Rapat ⭐\n⬜ Belanja\n\n_1 dari 2 selesai_');
});

test('toICS menghasilkan VEVENT berjam dan seharian', () => {
  const ics = L.toICS([
    { id: 'a', date: '2026-09-24', title: 'Rapat; penting, ya', start: '09:00', end: '10:30', category: 'kerja', notes: 'baris 1\nbaris 2' },
    { id: 'b', date: '2026-09-24', title: 'Belanja', start: null, category: 'rumah' },
  ], new Date('2026-09-24T01:02:03Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20260924T090000\r\nDTEND:20260924T103000'));
  assert.ok(ics.includes('SUMMARY:Rapat\\; penting\\, ya'));
  assert.ok(ics.includes('DESCRIPTION:baris 1\\nbaris 2'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260924\r\nDTEND;VALUE=DATE:20260925'));
  assert.ok(ics.includes('DTSTAMP:20260924T010203Z'));
  assert.ok(ics.split('\r\n').every((line) => line.length <= 75));
});

test('aggregateWeeks mengelompokkan per pekan Senin–Minggu', () => {
  const days = ['2026-09-20', '2026-09-21', '2026-09-22'].map((key, i) => ({ key, total: 2, done: i, focus: 25, water: 4, mood: i ? 4 : null, habitsDone: 1 }));
  const w = L.aggregateWeeks(days);
  assert.equal(w.length, 2);
  assert.equal(w[0].key, '2026-09-14');
  assert.deepEqual([w[1].total, w[1].done, w[1].focus, w[1].mood], [4, 3, 50, 4]);
});

test('hourHistogram & weekdayRates', () => {
  const at = (h) => new Date(2026, 8, 24, h, 10).getTime();
  const tasks = [
    { date: '2026-09-24', done: true, doneAt: at(9) },
    { date: '2026-09-24', done: true, doneAt: at(9) },
    { date: '2026-09-22', done: false },
    { date: '2026-09-01', done: true, doneAt: at(9) },
  ];
  const keys = ['2026-09-22', '2026-09-23', '2026-09-24'];
  assert.equal(L.hourHistogram(tasks, keys)[9], 2);
  const rates = L.weekdayRates(tasks, keys);
  assert.equal(rates[0].day, 1);
  assert.deepEqual(rates.find((r) => r.day === 4), { day: 4, total: 2, done: 2, pct: 100 });
  assert.deepEqual(rates.find((r) => r.day === 2), { day: 2, total: 1, done: 0, pct: 0 });
});

test('heatmap: kolom pekan, tingkat, dan tanggal mendatang', () => {
  const tasks = [
    ...Array.from({ length: 5 }, () => ({ date: '2026-09-24', done: true })),
    { date: '2026-09-23', done: true },
  ];
  const cols = L.heatmap(tasks, '2026-09-24', 3, '2026-09-24');
  assert.equal(cols.length, 3);
  assert.equal(cols[2].week, '2026-09-21');
  const thu = cols[2].cells[3];
  assert.deepEqual([thu.key, thu.done, thu.level, thu.future], ['2026-09-24', 5, 3, false]);
  assert.equal(cols[2].cells[2].level, 1);
  assert.equal(cols[2].cells[4].future, true);
  assert.deepEqual([0, 1, 3, 5, 9].map(L.activityLevel), [0, 1, 2, 3, 4]);
});

test('delta dibanding periode sebelumnya', () => {
  assert.equal(L.delta(12, 10), 20);
  assert.equal(L.delta(5, 10), -50);
  assert.equal(L.delta(3, 0), null);
  assert.equal(L.delta(0, 0), 0);
});

test('capacity menghitung menit terjadwal tanpa tumpang tindih', () => {
  const tasks = [
    { start: '08:00', end: '10:00' },
    { start: '09:00', end: '11:00' },
    { start: '04:00', end: '06:00' },
    { start: null, done: false },
  ];
  const c = L.capacity(tasks, 5, 23);
  assert.equal(c.scheduled, 180 + 60);
  assert.equal(c.window, 18 * 60);
  assert.equal(c.untimed, 1);
});

test('autoSchedule mengisi celah, melewati yang sibuk, dan mengutamakan bintang', () => {
  const tasks = [
    { id: 'rapat', start: '09:00', end: '10:00' },
    { id: 'a', start: null, priority: 'rendah', createdAt: 1 },
    { id: 'b', start: null, priority: 'tinggi', createdAt: 2 },
    { id: 'c', start: null, priority: 'sedang', starred: true, createdAt: 3 },
    { id: 'x', start: null, done: true },
  ];
  const plan = L.autoSchedule(tasks, { dayStart: 8, dayEnd: 23, fromMin: 8 * 60 + 2, blocked: [[12 * 60, 12 * 60 + 10]] });
  assert.deepEqual(plan.map((p) => p.id), ['c', 'b', 'a']);
  assert.deepEqual(plan[0], { id: 'c', start: '08:05', end: '08:35' });
  // 'b' butuh 60 menit: 08:40–09:40 bentrok rapat → setelah 10:05
  assert.deepEqual(plan[1], { id: 'b', start: '10:05', end: '11:05' });
  assert.deepEqual(plan[2], { id: 'a', start: '11:10', end: '11:40' });
});

test('autoSchedule berhenti bila hari sudah penuh', () => {
  const plan = L.autoSchedule([{ id: 'a', start: null }], { dayStart: 5, dayEnd: 23, fromMin: 22 * 60 + 50 });
  assert.deepEqual(plan, []);
});
