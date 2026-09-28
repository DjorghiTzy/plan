const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core/coach.js');

test('profil: dibersihkan & zona detak jantung', () => {
  const p = C.cleanProfile({ age: '28', sex: 'pria', heightCm: 170, weightKg: '65,5', restingHr: 60, maxHr: '', goal: ' 10K di bawah 60 menit ', health: 'lutut kiri kadang nyeri', x: 1 });
  assert.equal(p.age, 28);
  assert.equal(p.weightKg, null, 'koma tidak dipakai di input angka');
  assert.equal(p.maxHr, null);
  assert.equal(p.goal, '10K di bawah 60 menit');
  assert.equal(p.x, undefined);
  assert.deepEqual(C.maxHrOf(p), { value: 188, method: 'perkiraan 208 − 0,7 × usia' });
  const z = C.hrZones(p);
  assert.match(z.method, /Karvonen/);
  assert.deepEqual(z.zones[1], { zone: 'Z2 aerobik ringan', from: 137, to: 150 });
  assert.equal(C.zoneOf(143, z), 'Z2 aerobik ringan');
  assert.equal(C.zoneOf(90, z), 'di bawah Z1');
  assert.equal(C.hrZones(C.cleanProfile({})), null);
  assert.equal(C.hrZones(C.cleanProfile({ maxHr: 190 })).zones[0].from, 95);
});

test('beban latihan & km mingguan', () => {
  const runs = [
    { date: '2026-09-25', km: 5 }, { date: '2026-09-21', km: 10 }, { date: '2026-09-10', km: 8 }, { date: '2026-09-01', km: 4 },
  ];
  assert.deepEqual(C.trainingLoad(runs, '2026-09-27'), { last7Km: 15, weeklyAvg28Km: 6.75, acuteChronicRatio: 2.22 });
  const w = C.weeklyKm(runs, '2026-09-27', 4);
  assert.deepEqual(w.map((x) => [x.week, x.km, x.runs]), [
    ['2026-08-31', 4, 1], ['2026-09-07', 8, 1], ['2026-09-14', 0, 0], ['2026-09-21', 15, 2],
  ]);
});

test('draf dari tangkapan layar Strava', () => {
  const x = {
    is_activity_screenshot: true, activity_type: 'Run', source_app: 'Strava', title: 'Lunch Run', date: '2026-08-29', start_time: '12:33',
    distance_km: 0.31, moving_time_sec: 250, elapsed_time_sec: null, avg_pace_sec_per_km: 806, avg_heart_rate: 143, max_heart_rate: null,
    calories: 68, elevation_gain_m: 0, avg_cadence_spm: null, location: 'Bangka-Belitung Islands', splits: [], summary: 'Ringkas.', notes: null,
  };
  const d = C.draftFromExtract(x, '2026-09-27');
  assert.deepEqual(
    { date: d.date, time: d.time, km: d.km, sec: d.sec, type: d.type, note: d.note },
    { date: '2026-08-29', time: '12:33', km: 0.31, sec: 250, type: 'santai', note: 'Lunch Run · Bangka-Belitung Islands' },
  );
  assert.deepEqual(d.extra, { hr: 143, hrMax: null, cal: 68, elev: 0, cadence: null, title: 'Lunch Run', place: 'Bangka-Belitung Islands', source: 'Strava', summary: 'Ringkas.' });
  // Tanggal masa depan → hari ini; waktu dari pace bila durasi tidak terbaca; jenis ditebak
  const y = C.draftFromExtract({ ...x, date: '2026-12-01', moving_time_sec: null, title: 'Morning Treadmill', distance_km: 5, avg_pace_sec_per_km: 360 }, '2026-09-27');
  assert.equal(y.date, '2026-09-27');
  assert.equal(y.sec, 1800);
  assert.equal(y.type, 'treadmill');
  assert.equal(C.guessType({ title: 'Jakarta Marathon' }), 'lomba');
  assert.equal(C.guessType({ title: 'Easy', distance_km: 18 }), 'jauh');
});

test('konteks coach berisi data kesehatan yang relevan', () => {
  const state = {
    settings: {
      runGoal: 60, waterGoal: 8, sholatChecklist: true, workStart: '08:00', workEnd: '17:00', breakStart: '12:00', breakEnd: '13:00', workDays: [1, 2, 3, 4, 5],
      coachProfile: { age: 30, restingHr: 58, goal: 'Half marathon Desember' },
    },
    runs: [
      { id: 'r1', date: '2026-09-26', time: '05:40', km: 6, sec: 2160, type: 'santai', feel: 4, note: '' },
      { id: 'r2', date: '2026-09-24', time: '17:10', km: 4, sec: 1500, type: 'tempo', feel: 2, note: 'panas' },
      { id: 'future', date: '2026-09-30', time: '', km: 9, sec: 0, type: 'santai', feel: 0, note: '' },
    ],
    runExtras: { r1: { hr: 142, cal: 380, elev: 12, title: 'Morning Run' } },
    habits: [{ id: 'h1', name: 'Tidur sebelum 22.00', color: 'kesehatan', createdOn: '2026-09-01' }],
    habitLog: { '2026-09-26': ['h1'], '2026-09-25': ['h1'] },
    water: { '2026-09-27': 5, '2026-09-26': 8 },
    journal: { '2026-09-26': { mood: 4 }, '2026-09-25': { mood: 2 } },
    ibadah: { '2026-09-27': ['subuh', 'dzuhur'] },
    tasks: [
      { id: 't1', date: '2026-09-28', title: 'Rapat tim', start: '09:00', end: '10:00', category: 'kerja', done: false },
      { id: 't2', date: '2026-09-27', title: 'Belanja', start: null, end: null, category: 'rumah', done: true },
    ],
  };
  const c = C.buildContext(state, { today: '2026-09-27', prayers: { today: [{ id: 'subuh', time: '04:32' }] } });
  assert.equal(c.today.day, 'Minggu');
  assert.equal(c.profile.max_hr_used.value, 187);
  assert.equal(c.profile.hr_zones.zones.length, 5);
  assert.equal(c.running.recent_runs.length, 2, 'lari masa depan tidak ikut');
  assert.deepEqual(
    { d: c.running.recent_runs[0].date, hr: c.running.recent_runs[0].avg_hr, z: c.running.recent_runs[0].avg_hr_zone, pace: c.running.recent_runs[0].pace_per_km, cal: c.running.recent_runs[0].calories },
    { d: '2026-09-26', hr: 142, z: 'Z2 aerobik ringan', pace: '6:00', cal: 380 },
  );
  assert.equal(c.running.recent_runs[1].feel, 'Berat');
  assert.equal(c.running.this_month.km, 10);
  assert.equal(c.running.days_since_last_run, 1);
  assert.equal(c.running.load.last7Km, 10);
  assert.equal(c.habits_this_month[0].name, 'Tidur sebelum 22.00');
  assert.equal(c.habits_this_month[0].current_streak, 2);
  assert.equal(c.water_glasses_last_7_days.days[6].glasses, 5);
  assert.equal(c.mood_last_14_days.average, 3);
  assert.equal(c.sholat_last_7_days[6].done, 2);
  assert.equal(c.schedule.today.work.workday, false, 'Minggu libur');
  assert.deepEqual(c.schedule.tomorrow.work, { workday: true, start: '08:00', end: '17:00', rest: '12:00-13:00' });
  assert.equal(c.schedule.tomorrow.tasks[0].title, 'Rapat tim');
  assert.equal(c.prayer_times.today[0].time, '04:32');
  assert.ok(JSON.stringify(c).length < 60000, 'konteks muat di batas server');
});

test('judul sesi chat', () => {
  assert.equal(C.chatTitle('  Kapan   sebaiknya aku lari besok? '), 'Kapan sebaiknya aku lari besok?');
  assert.equal(C.chatTitle('x'.repeat(60)).length, 48);
  assert.equal(C.chatTitle(''), 'Sesi coach');
});

test('tidyText: jawaban AI tanpa tanda pisah panjang', () => {
  const t = C.tidyText;
  assert.equal(t('Lari 3 – 3,5 km, HR 137–150 bpm, pukul 05:30 — 06:15.'), 'Lari 3-3,5 km, HR 137-150 bpm, pukul 05:30-06:15.');
  assert.equal(t('Lari santai — jangan terlalu cepat.'), 'Lari santai, jangan terlalu cepat.');
  assert.equal(t('- **Jarak** — 3 km'), '- **Jarak**: 3 km');
  assert.equal(t('Senin–Jumat dan Z1–Z2'), 'Senin-Jumat dan Z1-Z2');
  assert.equal(t('— butir satu\n  – butir dua'), '- butir satu\n  - butir dua');
  assert.equal(t('| Lusa | Istirahat | – |'), '| Lusa | Istirahat | - |');
  assert.equal(t('Catatan —\nlanjut'), 'Catatan\nlanjut');
  assert.equal(t('bagus — .'), 'bagus.');
  assert.equal(t('Tanpa tanda pisah - biasa.'), 'Tanpa tanda pisah - biasa.');
  assert.equal(t(null), '');
  assert.ok(!/[—–]/.test(C.draftFromExtract({ distance_km: 5, summary: 'Pace 6:00 — HR 140–150.' }, '2026-09-27').extra.summary));
});

test('trashDaysLeft: sesi di Sampah terhapus permanen setelah 30 hari', () => {
  const day = 86400000;
  const del = Date.UTC(2026, 8, 1);
  assert.equal(C.TRASH_DAYS, 30);
  assert.equal(C.trashDaysLeft(del, del), 30);
  assert.equal(C.trashDaysLeft(del, del + 1), 30);
  assert.equal(C.trashDaysLeft(del, del + 29 * day + 1), 1);
  assert.equal(C.trashDaysLeft(del, del + 30 * day), 0);
  assert.equal(C.trashDaysLeft(del, del + 45 * day), 0);
});

test('baris saran rute dari coach: dibaca lalu dibuang dari teks', () => {
  const C = require('../js/core/coach.js');
  assert.deepEqual(C.routeTag('Lari santai 5 km besok.\n\n[[RUTE 5 km putar]]'), { km: 5, type: 'putar' });
  assert.deepEqual(C.routeTag('[[ rute 6,5 km LURUS ]]'), { km: 6.5, type: 'lurus' });
  assert.deepEqual(C.routeTag('[[RUTE 3 km]]'), { km: 3, type: 'semua' });
  assert.equal(C.routeTag('[[RUTE 90 km putar]]'), null, 'jarak tidak masuk akal');
  assert.equal(C.routeTag('Lari 5 km saja.'), null);
  assert.equal(C.stripRouteTag('Lari santai 5 km.\n\n[[RUTE 5 km putar]]\n'), 'Lari santai 5 km.');
  assert.equal(C.stripRouteTag('A [[RUTE 5 km]] B [[RUTE 3 km lurus]]'), 'A  B');
});
