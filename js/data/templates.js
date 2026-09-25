/**
 * Saran template rutinitas. Pengguna bisa menerapkannya ke tanggal mana pun,
 * menyalinnya lalu mengubah isinya (menjadi "Template saya"), atau menyembunyikannya.
 * Setiap kegiatan: judul, jam mulai/selesai (boleh kosong), kategori, prioritas, bintang.
 */
(function (root) {
  'use strict';
  const t = (title, start, end, category, priority = 'sedang', starred = false) => ({
    title, start, end, category, priority, starred,
  });

  const SUGGESTIONS = [
    {
      id: 'pagi',
      emoji: '🌅',
      name: 'Rutinitas Pagi',
      description: 'Awali hari dengan tenang: ibadah, gerak badan, sarapan, lalu tinjau rencana.',
      tasks: [
        t('Ibadah & hening sejenak', '04:45', '05:00', 'ibadah'),
        t('Minum segelas air putih', '05:00', '05:10', 'kesehatan', 'rendah'),
        t('Olahraga ringan / peregangan', '05:15', '05:45', 'kesehatan'),
        t('Mandi & bersiap', '05:45', '06:15', 'pribadi', 'rendah'),
        t('Sarapan sehat', '06:15', '06:45', 'kesehatan'),
        t('Tinjau rencana & tiga prioritas', '06:45', '07:00', 'pribadi', 'tinggi', true),
      ],
    },
    {
      id: 'kerja',
      emoji: '💼',
      name: 'Hari Kerja Fokus',
      description: 'Blok kerja dalam di pagi hari, rapat setelahnya, urusan ringan di sore hari.',
      tasks: [
        t('Cek email & pesan penting', '08:00', '08:15', 'kerja'),
        t('Kerja fokus: tugas utama', '08:15', '10:15', 'kerja', 'tinggi', true),
        t('Rehat & peregangan', '10:15', '10:30', 'kesehatan', 'rendah'),
        t('Rapat / kolaborasi tim', '10:30', '12:00', 'kerja'),
        t('Istirahat makan siang', '12:00', '13:00', 'pribadi', 'rendah'),
        t('Kerjakan tugas kedua', '13:00', '15:00', 'kerja'),
        t('Administrasi & balas pesan', '15:00', '16:30', 'kerja', 'rendah'),
        t('Tinjau hari & rencanakan besok', '16:30', '17:00', 'pribadi'),
      ],
    },
    {
      id: 'belajar',
      emoji: '📚',
      name: 'Hari Belajar',
      description: 'Dua sesi belajar dalam, latihan soal, dan ulasan singkat di malam hari.',
      tasks: [
        t('Sesi belajar 1: materi baru', '07:00', '08:30', 'belajar', 'tinggi', true),
        t('Rehat singkat', '08:30', '08:45', 'kesehatan', 'rendah'),
        t('Latihan soal', '08:45', '10:15', 'belajar', 'tinggi'),
        t('Baca buku penunjang', '13:00', '14:00', 'belajar'),
        t('Ulas catatan hari ini', '19:30', '20:30', 'belajar'),
        t('Siapkan bahan untuk esok', '20:30', '21:00', 'belajar', 'rendah'),
      ],
    },
    {
      id: 'akhir-pekan',
      emoji: '🌿',
      name: 'Akhir Pekan Seimbang',
      description: 'Bergerak, beres-beres rumah, waktu bersama keluarga, dan persiapan minggu depan.',
      tasks: [
        t('Jalan pagi / bersepeda', '06:30', '07:30', 'kesehatan'),
        t('Bersih-bersih rumah', '08:30', '10:00', 'rumah'),
        t('Belanja kebutuhan mingguan', '10:00', '11:30', 'rumah'),
        t('Waktu bersama keluarga', '13:00', '15:30', 'pribadi', 'tinggi', true),
        t('Hobi: berkebun / memasak', '16:00', '17:00', 'pribadi', 'rendah'),
        t('Rencanakan minggu depan', '20:00', '20:30', 'pribadi'),
      ],
    },
    {
      id: 'deep-work',
      emoji: '🚀',
      name: 'Sprint Kerja Dalam',
      description: 'Tiga blok fokus 90 menit tanpa gangguan, diselingi jeda pendek. Cocok untuk kejar tenggat.',
      tasks: [
        t('Matikan notifikasi & siapkan meja', '07:45', '08:00', 'kerja', 'rendah'),
        t('Blok fokus 1', '08:00', '09:30', 'kerja', 'tinggi', true),
        t('Jeda: jalan & minum', '09:30', '09:45', 'kesehatan', 'rendah'),
        t('Blok fokus 2', '09:45', '11:15', 'kerja', 'tinggi', true),
        t('Makan siang tanpa layar', '12:00', '12:45', 'pribadi', 'rendah'),
        t('Blok fokus 3', '13:00', '14:30', 'kerja', 'tinggi', true),
        t('Balas pesan yang tertunda', '14:30', '15:00', 'kerja'),
        t('Catat kemajuan hari ini', '16:30', '16:45', 'kerja'),
      ],
    },
    {
      id: 'sehat',
      emoji: '🏃',
      name: 'Hari Sehat & Bugar',
      description: 'Olahraga, makan teratur, cukup minum, dan tidur lebih awal.',
      tasks: [
        t('Olahraga 30 menit', '05:30', '06:00', 'kesehatan', 'tinggi', true),
        t('Sarapan tinggi protein', '06:30', '07:00', 'kesehatan'),
        t('Siapkan bekal makan siang', '07:00', '07:20', 'rumah', 'rendah'),
        t('Peregangan di sela kerja', '10:30', '10:40', 'kesehatan', 'rendah'),
        t('Jalan kaki sore 20 menit', '17:00', '17:20', 'kesehatan'),
        t('Makan malam sebelum 19.00', '18:15', '18:45', 'kesehatan'),
        t('Tidur sebelum 22.00', '21:45', '22:00', 'kesehatan', 'tinggi'),
      ],
    },
    {
      id: 'beres-rumah',
      emoji: '🧹',
      name: 'Beres-beres Rumah',
      description: 'Satu pagi untuk rumah yang rapi: cucian, lantai, dapur, dan lemari.',
      tasks: [
        t('Rendam & cuci baju', '07:00', '08:00', 'rumah'),
        t('Sapu & pel seluruh ruangan', '08:00', '09:00', 'rumah', 'tinggi', true),
        t('Bersihkan kamar mandi', '09:00', '09:45', 'rumah'),
        t('Rapikan dapur & kulkas', '09:45', '10:30', 'rumah'),
        t('Rapikan lemari & sortir barang', '10:30', '11:30', 'rumah', 'rendah'),
        t('Jemur & lipat pakaian', '15:00', '16:00', 'rumah'),
        t('Buang sampah & cek stok kebutuhan', '16:00', '16:30', 'rumah', 'rendah'),
      ],
    },
    {
      id: 'kreatif',
      emoji: '🎨',
      name: 'Hari Kreatif',
      description: 'Pagi untuk berkarya, siang cari inspirasi, malam merapikan hasil.',
      tasks: [
        t('Menulis bebas 3 halaman', '06:00', '06:30', 'pribadi'),
        t('Sesi berkarya utama', '08:00', '10:30', 'pribadi', 'tinggi', true),
        t('Cari inspirasi: jalan-jalan / museum / galeri', '13:00', '15:00', 'pribadi'),
        t('Coba teknik baru selama 45 menit', '15:30', '16:15', 'belajar'),
        t('Rapikan & unggah karya', '19:30', '20:30', 'pribadi'),
      ],
    },
    {
      id: 'me-time',
      emoji: '🧘',
      name: 'Hari Santai (Me Time)',
      description: 'Isi ulang energi: tidur cukup, jauh dari layar, dan lakukan hal yang disukai.',
      tasks: [
        t('Bangun tanpa alarm, lalu peregangan', '07:30', '08:00', 'kesehatan', 'rendah'),
        t('Sarapan pelan-pelan', '08:00', '08:45', 'pribadi', 'rendah'),
        t('Puasa media sosial setengah hari', '09:00', '13:00', 'pribadi', 'tinggi', true),
        t('Baca buku yang disukai', '10:00', '11:30', 'belajar', 'rendah'),
        t('Tidur siang 30 menit', '13:30', '14:00', 'kesehatan', 'rendah'),
        t('Perawatan diri', '16:00', '17:00', 'kesehatan'),
        t('Nonton film / main musik', '19:30', '21:30', 'pribadi', 'rendah'),
      ],
    },
    {
      id: 'malam',
      emoji: '🌙',
      name: 'Rutinitas Malam',
      description: 'Tutup hari dengan rapi agar besok mulai lebih ringan dan tidur lebih nyenyak.',
      tasks: [
        t('Rapikan meja & barang untuk besok', '20:30', '20:45', 'rumah', 'rendah'),
        t('Tulis jurnal & 3 hal yang disyukuri', '20:45', '21:00', 'pribadi', 'sedang', true),
        t('Rencanakan tiga prioritas besok', '21:00', '21:15', 'pribadi', 'tinggi', true),
        t('Ibadah & doa malam', '21:15', '21:30', 'ibadah'),
        t('Layar mati, baca buku', '21:30', '22:00', 'belajar', 'rendah'),
      ],
    },
    {
      id: 'keluarga',
      emoji: '👨‍👩‍👧',
      name: 'Hari Keluarga',
      description: 'Waktu penuh untuk keluarga: masak bersama, jalan-jalan, dan ngobrol santai.',
      tasks: [
        t('Sarapan bersama', '07:00', '08:00', 'pribadi'),
        t('Jalan-jalan / piknik', '09:00', '12:00', 'pribadi', 'tinggi', true),
        t('Masak makan siang bersama', '12:00', '13:00', 'rumah'),
        t('Telepon / kunjungi orang tua', '15:00', '16:30', 'pribadi', 'tinggi', true),
        t('Main board game / nonton bareng', '19:30', '21:00', 'pribadi', 'rendah'),
      ],
    },
    {
      id: 'keuangan',
      emoji: '💰',
      name: 'Beres Keuangan Bulanan',
      description: 'Cek pengeluaran, bayar tagihan, sisihkan tabungan, dan susun anggaran bulan depan.',
      tasks: [
        t('Rekap pengeluaran bulan ini', '19:00', '19:30', 'rumah', 'tinggi', true),
        t('Bayar tagihan listrik, air, internet', '19:30', '19:45', 'rumah', 'tinggi'),
        t('Transfer tabungan & dana darurat', '19:45', '20:00', 'rumah'),
        t('Cek langganan yang tidak terpakai', '20:00', '20:15', 'rumah', 'rendah'),
        t('Susun anggaran bulan depan', '20:15', '20:45', 'rumah'),
      ],
    },
    {
      id: 'ibadah',
      emoji: '🕌',
      name: 'Hari Penuh Ibadah',
      description: 'Menjaga ibadah tepat waktu, tadarus, kajian, dan sedekah di sela kegiatan.',
      tasks: [
        t('Tahajud & doa', '03:30', '04:00', 'ibadah'),
        t('Sholat Subuh & dzikir pagi', '04:30', '05:00', 'ibadah', 'tinggi', true),
        t('Tadarus 1 juz', '05:00', '05:45', 'ibadah', 'sedang', true),
        t('Sholat Dhuha', '08:00', '08:15', 'ibadah', 'rendah'),
        t('Ikut kajian / dengarkan ceramah', '16:00', '17:00', 'ibadah'),
        t('Dzikir petang & doa malam', '21:00', '21:15', 'ibadah'),
        t('Sedekah hari ini', null, null, 'ibadah', 'rendah'),
      ],
    },
    {
      id: 'masak-mingguan',
      emoji: '🍲',
      name: 'Belanja & Masak Mingguan',
      description: 'Rencanakan menu, belanja sekali jalan, lalu siapkan bahan untuk sepekan.',
      tasks: [
        t('Susun menu 7 hari', '07:00', '07:30', 'rumah'),
        t('Tulis daftar belanja', '07:30', '07:45', 'rumah', 'rendah'),
        t('Belanja ke pasar / swalayan', '08:00', '09:30', 'rumah', 'tinggi', true),
        t('Cuci & potong sayuran', '10:00', '11:00', 'rumah'),
        t('Masak lauk untuk 3 hari', '11:00', '12:30', 'rumah', 'tinggi'),
        t('Kemas & simpan di kulkas', '12:30', '13:00', 'rumah', 'rendah'),
      ],
    },
    {
      id: 'perjalanan',
      emoji: '🧳',
      name: 'Persiapan Perjalanan',
      description: 'Satu hari sebelum berangkat: dokumen, barang bawaan, rumah, dan transportasi.',
      tasks: [
        t('Cek tiket, jadwal, & penginapan', '09:00', '09:30', 'pribadi', 'tinggi', true),
        t('Siapkan dokumen (KTP, tiket, dll.)', '09:30', '10:00', 'pribadi', 'tinggi'),
        t('Isi daya powerbank & perangkat', '10:00', '10:15', 'pribadi', 'rendah'),
        t('Kemas pakaian & perlengkapan', '19:00', '20:00', 'pribadi', 'tinggi', true),
        t('Kunci jendela, cabut kabel, matikan kompor', '20:00', '20:15', 'rumah'),
        t('Pesan transportasi ke bandara / stasiun', '20:15', '20:30', 'pribadi'),
      ],
    },
    {
      id: 'kerja-rumah',
      emoji: '🏡',
      name: 'Kerja dari Rumah',
      description: 'Pisahkan jam kerja & jam rumah: mulai tepat waktu, istirahat teratur, tutup laptop tepat waktu.',
      tasks: [
        t('Mandi & berpakaian rapi', '07:00', '07:30', 'pribadi', 'rendah'),
        t('Standup / cek rencana tim', '08:00', '08:15', 'kerja'),
        t('Kerja fokus tanpa gangguan', '08:15', '11:30', 'kerja', 'tinggi', true),
        t('Makan siang di luar meja kerja', '12:00', '13:00', 'pribadi', 'rendah'),
        t('Rapat & balas pesan', '13:00', '15:00', 'kerja'),
        t('Tugas ringan & dokumentasi', '15:00', '16:30', 'kerja', 'rendah'),
        t('Tutup laptop & jalan sore', '17:00', '17:30', 'kesehatan'),
      ],
    },
  ];

  const P = (root.Planner = root.Planner || {});
  P.templateSuggestions = SUGGESTIONS;
  P.templates = SUGGESTIONS; // nama lama, tetap tersedia
  if (typeof module === 'object' && module.exports) module.exports = SUGGESTIONS;
})(typeof self !== 'undefined' ? self : this);
