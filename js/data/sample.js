/**
 * Contoh data untuk kunjungan pertama, disusun relatif terhadap tanggal hari ini
 * supaya grafik, streak, dan kalender langsung terlihat hidup.
 * Pengguna bisa menghapusnya dari banner atau menu Pengaturan.
 */
(function (root) {
  'use strict';
  const P = (root.Planner = root.Planner || {});

  // PRNG kecil yang deterministik supaya contoh data sama setiap dimuat ulang di hari yang sama.
  function seeded(seedText) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i += 1) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function next() {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const POOL = [
    { title: 'Balas email klien', start: '08:00', end: '08:30', category: 'kerja', priority: 'sedang' },
    { title: 'Kerja fokus: rancangan proposal', start: '09:00', end: '11:00', category: 'kerja', priority: 'tinggi' },
    { title: 'Rapat mingguan tim', start: '13:00', end: '14:00', category: 'kerja', priority: 'sedang' },
    { title: 'Jogging 3 km', start: '05:30', end: '06:00', category: 'kesehatan', priority: 'sedang' },
    { title: 'Belanja sayur di pasar', start: '06:30', end: '07:15', category: 'rumah', priority: 'rendah' },
    { title: 'Cuci & setrika baju', start: '16:00', end: '17:00', category: 'rumah', priority: 'rendah' },
    { title: 'Masak makan malam', start: '17:30', end: '18:30', category: 'rumah', priority: 'sedang' },
    { title: 'Ibadah & kajian', start: '18:30', end: '19:15', category: 'ibadah', priority: 'sedang' },
    { title: 'Video call dengan sahabat', start: '20:00', end: '20:30', category: 'pribadi', priority: 'rendah' },
    { title: 'Baca buku 20 halaman', start: '21:00', end: '21:30', category: 'belajar', priority: 'rendah' },
  ];

  const NOTES = [
    'Pekerjaan berjalan lancar, walau rapat sedikit molor.',
    'Hari yang padat. Besok coba mulai kerja fokus lebih pagi.',
    'Senang bisa olahraga pagi lagi setelah beberapa hari absen.',
    'Terlalu banyak buka media sosial di siang hari. Perlu dikurangi.',
    'Ngobrol lama dengan keluarga, rasanya hangat.',
    'Target baca tercapai. Bukunya makin seru.',
  ];

  const GRATITUDE = [
    'Cuaca cerah untuk jalan pagi',
    'Diskusi tim berjalan lancar',
    'Makan siang enak bersama rekan kerja',
    'Sempat telepon orang tua',
    'Tidur cukup semalam',
    'Pekerjaan selesai sebelum magrib',
    'Dapat ilmu baru dari kursus daring',
  ];

  function build(today, nowMin) {
    const D = P.date;
    const rnd = seeded(`contoh:${today}`);
    let counter = 0;
    const id = (prefix) => `${prefix}-contoh-${(counter += 1)}`;
    const createdAt = Date.now() - 86400000 * 14;

    const task = (date, t, extra = {}) => ({
      id: id('t'),
      date,
      title: t.title,
      notes: t.notes || '',
      category: t.category,
      priority: t.priority,
      start: t.start || null,
      end: t.end || null,
      starred: Boolean(t.starred),
      done: false,
      doneAt: null,
      subtasks: [],
      pomodoros: 0,
      createdAt: createdAt + (counter += 1),
      ...extra,
    });

    const tasks = [];
    const focusSessions = [];

    // Hari ini
    const todayPlan = [
      { title: 'Olahraga pagi: jogging 20 menit', start: '05:30', end: '06:00', category: 'kesehatan', priority: 'sedang' },
      { title: 'Tinjau rencana & tiga prioritas', start: '07:30', end: '07:45', category: 'pribadi', priority: 'rendah' },
      {
        title: 'Selesaikan laporan bulanan', start: '09:00', end: '11:00', category: 'kerja', priority: 'tinggi', starred: true,
        notes: 'Pakai data penjualan Agustus dan September. Kirim versi PDF.',
      },
      { title: 'Rapat singkat tim', start: '11:00', end: '11:30', category: 'kerja', priority: 'sedang' },
      { title: 'Makan siang & istirahat', start: '12:00', end: '13:00', category: 'pribadi', priority: 'rendah' },
      { title: 'Belajar TypeScript: modul generics', start: '14:00', end: '15:30', category: 'belajar', priority: 'tinggi', starred: true },
      { title: 'Bayar tagihan listrik & internet', start: '16:00', end: '16:30', category: 'rumah', priority: 'sedang', starred: true },
      { title: 'Telepon orang tua', start: '19:00', end: '19:30', category: 'pribadi', priority: 'sedang' },
      { title: 'Baca buku 20 halaman', start: '20:30', end: '21:00', category: 'belajar', priority: 'rendah' },
      { title: 'Beli galon air minum', category: 'rumah', priority: 'rendah' },
    ];
    for (const t of todayPlan) {
      const endMin = t.end ? D.parseTime(t.end) : null;
      const done = endMin != null && endMin <= nowMin;
      tasks.push(task(today, t, { done, doneAt: done ? Date.now() : null }));
    }
    const report = tasks.find((t) => t.title === 'Selesaikan laporan bulanan');
    const reportSubs = ['Kumpulkan data penjualan', 'Buat grafik ringkasan', 'Kirim ke atasan'];
    report.subtasks = reportSubs.map((title, i) => ({
      id: id('s'),
      title,
      done: report.done || (i === 0 && nowMin >= 9 * 60 + 30),
    }));
    const reportPomodoros = Math.max(0, Math.min(4, Math.floor((nowMin - 9 * 60) / 30)));
    report.pomodoros = reportPomodoros;
    for (let i = 0; i < reportPomodoros; i += 1) {
      focusSessions.push({ id: id('f'), date: today, taskId: report.id, minutes: 25, endedAt: Date.now() });
    }

    // Enam hari ke belakang
    for (let back = 1; back <= 6; back += 1) {
      const date = D.addDays(today, -back);
      const picks = POOL.filter(() => rnd() < 0.6);
      for (const t of picks) {
        const forcedOpen = back === 1 && (t.title === 'Baca buku 20 halaman' || t.title === 'Cuci & setrika baju');
        const done = forcedOpen ? false : rnd() < 0.82;
        tasks.push(task(date, t, { done, doneAt: done ? Date.now() - back * 86400000 : null }));
      }
      if (back === 1) {
        for (const title of ['Baca buku 20 halaman', 'Cuci & setrika baju']) {
          if (!picks.some((p) => p.title === title)) {
            tasks.push(task(date, POOL.find((p) => p.title === title)));
          }
        }
      }
      const sessions = 2 + Math.floor(rnd() * 5);
      for (let i = 0; i < sessions; i += 1) {
        focusSessions.push({ id: id('f'), date, taskId: null, minutes: 25, endedAt: Date.now() - back * 86400000 });
      }
    }

    // Beberapa rencana ke depan
    tasks.push(task(D.addDays(today, 1), {
      title: 'Presentasi proyek ke klien', start: '10:00', end: '11:00', category: 'kerja', priority: 'tinggi', starred: true,
    }));
    tasks.push(task(D.addDays(today, 1), {
      title: 'Servis motor di bengkel', start: '15:00', end: '16:00', category: 'rumah', priority: 'sedang',
    }));
    tasks.push(task(D.addDays(today, 3), {
      title: 'Arisan keluarga', start: '16:00', end: '18:00', category: 'pribadi', priority: 'sedang',
    }));

    // Kebiasaan
    const createdOn = D.addDays(today, -30);
    const habits = [
      { name: 'Bangun sebelum 05.00', color: 'ibadah', chance: 0.88 },
      { name: 'Olahraga 20 menit', color: 'kesehatan', chance: 0.72 },
      { name: 'Baca 10 halaman', color: 'belajar', chance: 0.8 },
      { name: 'Menabung Rp10.000', color: 'rumah', chance: 0.9 },
      { name: 'Tidur sebelum 22.00', color: 'kerja', chance: 0.55 },
    ].map((h) => ({ id: id('h'), name: h.name, color: h.color, createdOn, archived: false, chance: h.chance }));

    const habitLog = {};
    for (let back = 30; back >= 1; back -= 1) {
      const date = D.addDays(today, -back);
      const done = habits.filter((h) => rnd() < h.chance).map((h) => h.id);
      if (done.length) habitLog[date] = done;
    }
    habitLog[today] = habits.slice(0, nowMin >= 6 * 60 ? 2 : 1).map((h) => h.id);
    habits.forEach((h) => delete h.chance);

    // Air minum, suasana hati, jurnal
    const water = {};
    const journal = {};
    for (let back = 13; back >= 1; back -= 1) {
      const date = D.addDays(today, -back);
      water[date] = 5 + Math.floor(rnd() * 4);
      const moodRoll = rnd();
      journal[date] = {
        mood: moodRoll < 0.1 ? 2 : moodRoll < 0.35 ? 3 : moodRoll < 0.8 ? 4 : 5,
        gratitude: [GRATITUDE[Math.floor(rnd() * GRATITUDE.length)], '', ''],
        notes: back <= 6 ? NOTES[back - 1] : '',
        better: '',
      };
    }
    water[today] = Math.max(1, Math.min(8, Math.floor((nowMin - 5 * 60) / 110)));
    journal[today] = {
      mood: 4,
      gratitude: ['Cuaca cerah untuk jogging pagi', '', ''],
      notes: '',
      better: '',
    };

    return { tasks, habits, habitLog, water, journal, focusSessions };
  }

  P.sample = { build };
})(typeof self !== 'undefined' ? self : this);
