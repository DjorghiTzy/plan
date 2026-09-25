/** Template rutinitas yang bisa diterapkan ke tanggal mana pun. */
(function (root) {
  'use strict';
  (root.Planner = root.Planner || {}).templates = [
    {
      id: 'pagi',
      name: 'Rutinitas Pagi',
      description: 'Awali hari dengan tenang: ibadah, gerak badan, sarapan, lalu tinjau rencana.',
      tasks: [
        { title: 'Ibadah & hening sejenak', start: '04:45', end: '05:00', category: 'ibadah', priority: 'sedang' },
        { title: 'Minum segelas air putih', start: '05:00', end: '05:10', category: 'kesehatan', priority: 'rendah' },
        { title: 'Olahraga ringan / peregangan', start: '05:15', end: '05:45', category: 'kesehatan', priority: 'sedang' },
        { title: 'Mandi & bersiap', start: '05:45', end: '06:15', category: 'pribadi', priority: 'rendah' },
        { title: 'Sarapan sehat', start: '06:15', end: '06:45', category: 'kesehatan', priority: 'sedang' },
        { title: 'Tinjau rencana & tiga prioritas', start: '06:45', end: '07:00', category: 'pribadi', priority: 'tinggi', starred: true },
      ],
    },
    {
      id: 'kerja',
      name: 'Hari Kerja Fokus',
      description: 'Blok kerja dalam di pagi hari, rapat setelahnya, urusan ringan di sore hari.',
      tasks: [
        { title: 'Cek email & pesan penting', start: '08:00', end: '08:15', category: 'kerja', priority: 'sedang' },
        { title: 'Kerja fokus: tugas utama', start: '08:15', end: '10:15', category: 'kerja', priority: 'tinggi', starred: true },
        { title: 'Rehat & peregangan', start: '10:15', end: '10:30', category: 'kesehatan', priority: 'rendah' },
        { title: 'Rapat / kolaborasi tim', start: '10:30', end: '12:00', category: 'kerja', priority: 'sedang' },
        { title: 'Istirahat makan siang', start: '12:00', end: '13:00', category: 'pribadi', priority: 'rendah' },
        { title: 'Kerjakan tugas kedua', start: '13:00', end: '15:00', category: 'kerja', priority: 'sedang' },
        { title: 'Administrasi & balas pesan', start: '15:00', end: '16:30', category: 'kerja', priority: 'rendah' },
        { title: 'Tinjau hari & rencanakan besok', start: '16:30', end: '17:00', category: 'pribadi', priority: 'sedang' },
      ],
    },
    {
      id: 'belajar',
      name: 'Hari Belajar',
      description: 'Dua sesi belajar dalam, latihan soal, dan ulasan singkat di malam hari.',
      tasks: [
        { title: 'Sesi belajar 1: materi baru', start: '07:00', end: '08:30', category: 'belajar', priority: 'tinggi', starred: true },
        { title: 'Rehat singkat', start: '08:30', end: '08:45', category: 'kesehatan', priority: 'rendah' },
        { title: 'Latihan soal', start: '08:45', end: '10:15', category: 'belajar', priority: 'tinggi' },
        { title: 'Baca buku penunjang', start: '13:00', end: '14:00', category: 'belajar', priority: 'sedang' },
        { title: 'Ulas catatan hari ini', start: '19:30', end: '20:30', category: 'belajar', priority: 'sedang' },
        { title: 'Siapkan bahan untuk esok', start: '20:30', end: '21:00', category: 'belajar', priority: 'rendah' },
      ],
    },
    {
      id: 'akhir-pekan',
      name: 'Akhir Pekan Seimbang',
      description: 'Bergerak, beres-beres rumah, waktu bersama keluarga, dan persiapan minggu depan.',
      tasks: [
        { title: 'Jalan pagi / bersepeda', start: '06:30', end: '07:30', category: 'kesehatan', priority: 'sedang' },
        { title: 'Bersih-bersih rumah', start: '08:30', end: '10:00', category: 'rumah', priority: 'sedang' },
        { title: 'Belanja kebutuhan mingguan ke pasar', start: '10:00', end: '11:30', category: 'rumah', priority: 'sedang' },
        { title: 'Waktu bersama keluarga', start: '13:00', end: '15:30', category: 'pribadi', priority: 'tinggi', starred: true },
        { title: 'Hobi: berkebun / memasak', start: '16:00', end: '17:00', category: 'pribadi', priority: 'rendah' },
        { title: 'Rencanakan minggu depan', start: '20:00', end: '20:30', category: 'pribadi', priority: 'sedang' },
      ],
    },
  ];
})(typeof self !== 'undefined' ? self : this);
