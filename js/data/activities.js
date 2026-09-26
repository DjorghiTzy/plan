/**
 * Kamus jenis kegiatan untuk pengenalan cerdas & rekomendasi waktu.
 * Setiap jenis: kategori aplikasi, kelompok yang ditampilkan (mis. "Olahraga"),
 * durasi wajar (menit), kata kunci (termasuk ejaan tak baku/salah ketik yang umum),
 * dan jendela waktu yang cocok.
 *
 * Jendela waktu: "HH:MM-HH:MM", boleh diikuti " we" (akhir pekan saja), " wd" (hari kerja saja),
 * atau " d5" (hari tertentu: 0=Minggu … 6=Sabtu). Jangkar sholat: "@maghrib+10".
 * Khusus: "work" (jam kerja), "work-start", "work-end", "rest" (istirahat kerja).
 * anytime: boleh disarankan di tengah jam kerja (sholat, minum obat, makan siang).
 */
(function (root) {
  'use strict';

  const k = (id, label, emoji, category, group, minutes, words, windows = [], extra = {}) => ({
    id, label, emoji, category, group, minutes, words, windows, ...extra,
  });

  const KINDS = [
    // ----- Ibadah -----
    k('jumat', 'Sholat Jumat', '🕌', 'ibadah', 'Ibadah', 60,
      ['jumatan', 'sholat jumat', 'shalat jumat', 'solat jumat', 'salat jumat', 'jumat an'], ['11:40-12:40 d5'], { anytime: true }),
    k('sholat', 'Sholat', '🕌', 'ibadah', 'Ibadah', 15,
      ['sholat', 'shalat', 'solat', 'salat', 'sholad', 'solad', 'shollat', 'sembahyang', 'berjamaah', 'jamaah', 'sujud', 'rawatib', 'tarawih', 'taraweh', 'witir', 'istikharah', 'qobliyah', 'badiyah', 'sunnah'],
      [], { prayer: true, generic: true, anytime: true }),
    k('tahajud', 'Tahajud', '🌙', 'ibadah', 'Ibadah', 30,
      ['tahajud', 'tahajjud', 'tahajut', 'qiyamul lail', 'qiyamullail', 'qiyam', 'sepertiga malam'], ['03:00-04:15']),
    k('dhuha', 'Dhuha', '☀️', 'ibadah', 'Ibadah', 15, ['dhuha', 'duha', 'doha'], ['07:00-11:00'], { anytime: true }),
    k('ngaji', 'Mengaji', '📖', 'ibadah', 'Ibadah', 30,
      ['ngaji', 'mengaji', 'ngaji quran', 'tilawah', 'tadarus', 'tadarrus', 'quran', 'alquran', 'al quran', 'qur an', 'murojaah', 'murajaah', 'hafalan', 'tahsin', 'iqro', 'iqra', 'baca quran', 'one day one juz', 'odoj'],
      ['@subuh+15', '@maghrib+15', '20:00-21:30']),
    k('kajian', 'Kajian', '🕌', 'ibadah', 'Ibadah', 90,
      ['kajian', 'pengajian', 'ceramah', 'taklim', 'majelis', 'majlis', 'liqo', 'liqa', 'halaqah', 'halaqoh', 'tausiyah', 'tabligh', 'khutbah'],
      ['@maghrib+20', '19:30-21:30', '08:00-11:00 we']),
    k('dzikir', 'Dzikir & doa', '📿', 'ibadah', 'Ibadah', 15,
      ['dzikir', 'zikir', 'dikir', 'wirid', 'doa', 'berdoa', 'almatsurat', 'al matsurat', 'matsurat', 'sholawat', 'shalawat', 'selawat', 'istighfar'],
      ['@subuh+10', '@maghrib+10']),
    k('sahur', 'Sahur', '🍚', 'ibadah', 'Ibadah', 30, ['sahur', 'saur'], ['03:15-04:15']),
    k('bukapuasa', 'Buka puasa', '🌅', 'ibadah', 'Ibadah', 30, ['buka puasa', 'bukber', 'buka bersama', 'iftar', 'ifthar', 'takjil'], ['@maghrib+0']),
    k('puasa', 'Puasa', '🌙', 'ibadah', 'Ibadah', 0, ['puasa', 'shaum', 'saum', 'puasa senin kamis', 'ayyamul bidh', 'puasa sunnah', 'puasa daud']),
    k('sedekah', 'Sedekah', '🤲', 'ibadah', 'Ibadah', 0, ['sedekah', 'sodaqoh', 'shodaqoh', 'sedekah subuh', 'infaq', 'infak', 'zakat', 'wakaf', 'donasi', 'fidyah']),
    k('gereja', 'Ibadah gereja', '⛪', 'ibadah', 'Ibadah', 120,
      ['gereja', 'misa', 'kebaktian', 'ibadah minggu', 'sekolah minggu', 'persekutuan', 'saat teduh', 'renungan', 'pendalaman alkitab'], ['07:00-11:00 d0', '17:00-19:00 d0']),
    k('sembahyang', 'Sembahyang', '🙏', 'ibadah', 'Ibadah', 30, ['pura', 'vihara', 'klenteng', 'puja', 'meditasi pagi'], ['05:30-07:00', '18:00-19:30']),
    k('ibadah', 'Ibadah', '🤲', 'ibadah', 'Ibadah', 30, ['ibadah', 'umroh', 'umrah', 'haji', 'itikaf', 'i tikaf', 'ziarah', 'manasik'], ['@maghrib+15'], { generic: true }),

    // ----- Olahraga -----
    k('padel', 'Padel', '🎾', 'kesehatan', 'Olahraga', 90, ['padel', 'paddle', 'padle', 'padel tenis'], ['16:00-22:00', '06:00-10:00 we']),
    k('tenis', 'Tenis', '🎾', 'kesehatan', 'Olahraga', 90, ['tenis', 'tennis', 'tenis lapangan', 'tenis meja', 'pingpong', 'ping pong', 'pickleball'], ['16:00-21:00', '06:00-09:00 we']),
    k('badminton', 'Badminton', '🏸', 'kesehatan', 'Olahraga', 120, ['badminton', 'bulutangkis', 'bulu tangkis', 'bultang', 'batminton', 'badmin'], ['19:00-22:00', '07:00-10:00 we']),
    k('futsal', 'Futsal / sepak bola', '⚽', 'kesehatan', 'Olahraga', 120, ['futsal', 'sepakbola', 'sepak bola', 'main bola', 'soccer', 'mini soccer', 'minisoccer', 'football'], ['19:00-22:00', '15:30-17:30 we']),
    k('basket', 'Basket / voli', '🏀', 'kesehatan', 'Olahraga', 90, ['basket', 'basketball', 'voli', 'voly', 'volley', 'bola voli', 'volleyball'], ['16:00-18:00', '19:00-21:00']),
    k('lari', 'Lari', '🏃', 'kesehatan', 'Olahraga', 45, ['lari', 'lari pagi', 'lari sore', 'berlari', 'jogging', 'joging', 'jogingg', 'running', 'run', 'marathon', 'maraton', 'half marathon', 'fun run', 'trail run'], ['05:30-07:00', '16:30-18:00']),
    k('renang', 'Renang', '🏊', 'kesehatan', 'Olahraga', 60, ['renang', 'berenang', 'swimming', 'swim'], ['06:00-08:00', '15:00-17:30']),
    k('gym', 'Gym / fitness', '🏋️', 'kesehatan', 'Olahraga', 75, ['gym', 'ngegym', 'nge gym', 'fitness', 'fitnes', 'angkat beban', 'weightlifting', 'crossfit', 'push up', 'pushup', 'sit up', 'plank', 'workout', 'hiit', 'calisthenics'], ['05:30-07:30', '17:30-20:30']),
    k('yoga', 'Yoga / peregangan', '🧘', 'kesehatan', 'Olahraga', 45, ['yoga', 'pilates', 'stretching', 'peregangan', 'meditasi', 'mindfulness', 'tai chi', 'taichi'], ['05:30-07:00', '20:00-21:30']),
    k('sepeda', 'Bersepeda', '🚴', 'kesehatan', 'Olahraga', 90, ['sepeda', 'bersepeda', 'gowes', 'goes', 'cycling', 'bike', 'sepedaan', 'road bike', 'mtb'], ['05:30-08:00', '16:00-18:00']),
    k('jalankaki', 'Jalan kaki', '🚶', 'kesehatan', 'Olahraga', 30, ['jalan kaki', 'jalan pagi', 'jalan sore', 'jalan santai', 'walking', 'jalan sehat', '10000 langkah', '10rb langkah'], ['05:30-07:00', '16:30-18:00']),
    k('senam', 'Senam', '💃', 'kesehatan', 'Olahraga', 60, ['senam', 'zumba', 'aerobik', 'aerobic', 'poco poco', 'senam pagi'], ['06:00-08:00 we', '16:30-18:00']),
    k('hiking', 'Hiking', '⛰️', 'kesehatan', 'Olahraga', 240, ['hiking', 'mendaki', 'naik gunung', 'trekking', 'tracking', 'trail'], ['05:00-09:00 we']),
    k('beladiri', 'Bela diri', '🥋', 'kesehatan', 'Olahraga', 90, ['silat', 'pencak silat', 'karate', 'taekwondo', 'judo', 'boxing', 'tinju', 'muay thai', 'muaythai', 'mma', 'kickboxing', 'wushu', 'aikido'], ['16:00-18:00', '19:00-21:00']),
    k('olahraga', 'Olahraga', '💪', 'kesehatan', 'Olahraga', 60, ['olahraga', 'olah raga', 'olga', 'latihan fisik', 'exercise', 'sport', 'kardio', 'cardio', 'latihan'], ['05:30-07:30', '16:00-18:00'], { generic: true }),

    // ----- Kesehatan -----
    k('dokter', 'Periksa kesehatan', '🩺', 'kesehatan', 'Kesehatan', 60, ['dokter', 'dokter gigi', 'dentist', 'check up', 'checkup', 'medical check up', 'mcu', 'kontrol', 'klinik', 'rumah sakit', 'puskesmas', 'periksa', 'terapi', 'fisioterapi', 'vaksin', 'imunisasi', 'cek darah', 'lab', 'konsultasi dokter', 'psikolog', 'bidan', 'posyandu'], ['09:00-11:30', '16:00-19:00']),
    k('obat', 'Minum obat / vitamin', '💊', 'kesehatan', 'Kesehatan', 5, ['obat', 'minum obat', 'vitamin', 'suplemen', 'minum vitamin', 'antibiotik'], ['07:00-07:30', '19:00-19:30'], { anytime: true }),
    k('tidursiang', 'Tidur siang', '😴', 'kesehatan', 'Kesehatan', 30, ['tidur siang', 'power nap', 'nap', 'qailulah', 'qoilulah'], ['12:30-14:30']),
    k('tidur', 'Tidur', '🛌', 'kesehatan', 'Kesehatan', 30, ['tidur', 'bobo', 'istirahat malam', 'rebahan', 'siap tidur', 'sleep'], ['21:30-23:00']),

    // ----- Kerja -----
    k('rapat', 'Rapat', '👥', 'kerja', 'Kerja', 60, ['rapat', 'meeting', 'meet', 'zoom', 'gmeet', 'google meet', 'teams', 'standup', 'stand up', 'daily standup', 'daily scrum', 'scrum', 'sync', 'briefing', 'koordinasi', 'presentasi', 'pitching', 'pitch', 'demo', 'one on one', 'townhall', 'town hall', 'retro', 'retrospektif', 'sprint planning', 'weekly', 'rakor', 'rapim', 'diskusi tim'], ['work']),
    k('email', 'Email & pesan', '📧', 'kerja', 'Kerja', 30, ['email', 'e mail', 'surel', 'inbox', 'balas email', 'cek email', 'balas pesan', 'slack', 'chat kantor'], ['work-start', 'work-end']),
    k('laporan', 'Laporan & dokumen', '📝', 'kerja', 'Kerja', 90, ['laporan', 'report', 'reporting', 'rekap', 'rekapan', 'proposal', 'dokumen', 'notulen', 'notulensi', 'memo', 'slide', 'ppt', 'deck', 'spreadsheet', 'excel', 'analisa', 'analisis', 'riset', 'research', 'draft', 'kajian teknis', 'rab', 'anggaran', 'budget'], ['work']),
    k('coding', 'Coding', '💻', 'kerja', 'Kerja', 120, ['coding', 'ngoding', 'koding', 'deploy', 'debug', 'debugging', 'bug', 'bugfix', 'fix bug', 'code review', 'review code', 'pull request', 'merge', 'testing', 'qa', 'develop', 'development', 'programming', 'release', 'refactor', 'frontend', 'backend', 'api', 'uji coba', 'fitur', 'aplikasi', 'website', 'server'], ['work']),
    k('klien', 'Klien & penjualan', '🤝', 'kerja', 'Kerja', 60, ['klien', 'client', 'customer', 'nasabah', 'kunjungan', 'visit', 'sales', 'prospek', 'follow up', 'followup', 'fu', 'negosiasi', 'nego', 'deal', 'tender', 'vendor', 'supplier', 'canvassing', 'kanvas'], ['work']),
    k('interview', 'Wawancara', '🎙️', 'kerja', 'Kerja', 60, ['interview', 'wawancara', 'rekrutmen', 'recruitment', 'hiring', 'psikotes', 'user interview'], ['work']),
    k('admin', 'Administrasi', '🗂️', 'kerja', 'Kerja', 30, ['admin', 'administrasi', 'invoice', 'faktur', 'reimburse', 'reimbursement', 'klaim', 'approval', 'approve', 'tanda tangan', 'ttd', 'arsip', 'input data', 'entri data', 'absen', 'absensi', 'timesheet', 'spj'], ['work-end']),
    k('kerja', 'Pekerjaan', '💼', 'kerja', 'Kerja', 60, ['kerja', 'kerjaan', 'pekerjaan', 'ngantor', 'kantor', 'wfh', 'wfo', 'lembur', 'shift', 'piket', 'tugas kantor', 'deadline', 'target', 'kpi', 'apel pagi', 'project', 'proyek', 'task', 'jobdesk', 'kerja fokus', 'deep work'], ['work'], { generic: true }),

    // ----- Belajar -----
    k('bahasa', 'Belajar bahasa', '🗣️', 'belajar', 'Belajar', 30, ['bahasa inggris', 'english', 'duolingo', 'bahasa arab', 'bahasa jepang', 'bahasa mandarin', 'bahasa korea', 'toefl', 'ielts', 'toeic', 'vocabulary', 'grammar', 'speaking'], ['20:00-21:30', '06:00-07:00']),
    k('baca', 'Membaca', '📖', 'belajar', 'Belajar', 30, ['baca', 'baca buku', 'membaca', 'reading', 'buku', 'artikel', 'jurnal ilmiah', 'paper'], ['20:30-22:00', '05:30-06:30']),
    k('belajar', 'Belajar', '📚', 'belajar', 'Belajar', 90, ['belajar', 'study', 'studi', 'kuliah', 'kelas', 'les', 'kursus', 'course', 'bimbel', 'webinar', 'seminar', 'workshop', 'pelatihan', 'training', 'sertifikasi', 'bootcamp', 'ujian', 'uts', 'uas', 'quiz', 'kuis', 'ulangan', 'tugas kuliah', 'tugas sekolah', 'skripsi', 'tesis', 'thesis', 'disertasi', 'makalah', 'praktikum', 'review materi', 'latihan soal', 'tryout', 'try out', 'utbk', 'snbt', 'cpns', 'sekolah'], ['19:30-21:30', '08:00-11:00 we'], { generic: true }),

    // ----- Rumah -----
    k('bersih', 'Bersih-bersih', '🧹', 'rumah', 'Rumah', 60, ['bersih bersih', 'beres beres', 'beberes', 'beres rumah', 'bersihin rumah', 'bersihkan rumah', 'nyapu', 'menyapu', 'ngepel', 'mengepel', 'cuci piring', 'rapikan kamar', 'rapihin kamar', 'buang sampah', 'sampah', 'bersihin kamar mandi', 'kuras', 'lap kaca'], ['08:00-11:00 we', '17:00-19:00']),
    k('cucibaju', 'Cuci & setrika', '🧺', 'rumah', 'Rumah', 60, ['cuci baju', 'nyuci', 'mencuci', 'nyuci baju', 'laundry', 'londri', 'jemur', 'jemur baju', 'angkat jemuran', 'setrika', 'nyetrika', 'menyetrika', 'lipat baju'], ['06:30-08:30', '08:00-11:00 we']),
    k('masak', 'Memasak', '🍳', 'rumah', 'Rumah', 60, ['masak', 'memasak', 'masak sarapan', 'masak makan malam', 'meal prep', 'mealprep', 'bikin sarapan', 'nyiapin makan', 'bekal', 'bikin bekal', 'baking', 'bikin kue'], ['05:30-06:30', '16:30-18:00']),
    k('belanja', 'Belanja', '🛒', 'rumah', 'Rumah', 60, ['belanja', 'belanja bulanan', 'belanja mingguan', 'pasar', 'ke pasar', 'supermarket', 'minimarket', 'indomaret', 'alfamart', 'groceries', 'grocery', 'beli sayur', 'beli beras', 'beli galon', 'beli gas'], ['09:00-12:00 we', '16:00-19:00']),
    k('tagihan', 'Tagihan & keuangan', '💡', 'rumah', 'Rumah', 15, ['bayar', 'tagihan', 'listrik', 'token listrik', 'token', 'pln', 'pdam', 'internet', 'wifi', 'indihome', 'cicilan', 'kpr', 'bpjs', 'pajak', 'pbb', 'iuran', 'spp', 'transfer', 'budgeting', 'catat pengeluaran', 'keuangan', 'nabung', 'menabung', 'investasi'], ['19:30-21:00']),
    k('kendaraan', 'Kendaraan', '🔧', 'rumah', 'Rumah', 90, ['servis motor', 'servis mobil', 'service motor', 'service mobil', 'cuci mobil', 'cuci motor', 'ganti oli', 'bengkel', 'isi bensin', 'spbu', 'tambal ban', 'pajak motor', 'pajak mobil', 'samsat'], ['08:00-12:00 we', '16:00-18:00']),
    k('tanaman', 'Tanaman & hewan', '🪴', 'rumah', 'Rumah', 20, ['siram tanaman', 'nyiram', 'menyiram', 'kebun', 'berkebun', 'tanaman', 'kasih makan kucing', 'makan kucing', 'kucing', 'anjing', 'ikan', 'pakan', 'grooming'], ['06:30-07:30', '16:30-17:30']),

    // ----- Pribadi -----
    k('sarapan', 'Sarapan', '🍞', 'pribadi', 'Makan', 30, ['sarapan', 'breakfast', 'brunch', 'makan pagi'], ['06:00-07:30']),
    k('makansiang', 'Makan siang', '🍛', 'pribadi', 'Makan', 45, ['makan siang', 'lunch', 'maksi', 'makan siang bareng'], ['rest', '12:00-13:00'], { anytime: true }),
    k('makanmalam', 'Makan malam', '🍲', 'pribadi', 'Makan', 45, ['makan malam', 'dinner', 'makmal', 'makan bareng keluarga', 'candle light'], ['18:30-20:00']),
    k('makan', 'Makan', '🍽️', 'pribadi', 'Makan', 45, ['makan', 'kulineran', 'kuliner', 'salad', 'jajan', 'bakso', 'makan enak'], ['12:00-13:00', '18:30-20:00'], { generic: true }),
    k('mandi', 'Mandi & bersiap', '🚿', 'pribadi', 'Pribadi', 30, ['mandi', 'skincare', 'skin care', 'perawatan diri', 'dandan', 'siap siap', 'bersiap', 'siap siap kerja'], ['05:15-06:30', '17:30-19:00']),
    k('nongkrong', 'Nongkrong', '☕', 'pribadi', 'Pribadi', 120, ['nongkrong', 'ngopi', 'ngopi ngopi', 'hangout', 'ketemu teman', 'ketemuan', 'kumpul', 'kumpul teman', 'reuni', 'main ke rumah', 'ngobrol', 'curhat', 'nge date', 'ngedate', 'date', 'kencan', 'pacaran', 'jalan sama pacar'], ['19:00-22:00', '15:00-18:00 we']),
    k('hiburan', 'Hiburan', '🎬', 'pribadi', 'Pribadi', 120, ['nonton', 'film', 'bioskop', 'netflix', 'drakor', 'anime', 'series', 'main game', 'game', 'gaming', 'mabar', 'youtube', 'karaoke', 'konser', 'musik', 'main gitar', 'baca novel', 'novel', 'komik', 'manga'], ['20:00-22:30', '13:00-17:00 we']),
    k('keluarga', 'Keluarga', '👨‍👩‍👧', 'pribadi', 'Keluarga', 60, ['keluarga', 'telpon ibu', 'telepon ibu', 'telpon ortu', 'telepon', 'telpon', 'video call', 'vc', 'ortu', 'orang tua', 'main sama anak', 'main dengan anak', 'quality time', 'istri', 'suami', 'mertua', 'jenguk', 'silaturahmi', 'silaturahim', 'antar anak', 'jemput anak', 'antar jemput', 'ambil rapor', 'rapat wali murid'], ['19:00-21:00', '09:00-12:00 we']),
    k('acara', 'Acara', '🎉', 'pribadi', 'Acara', 120, ['ulang tahun', 'ultah', 'kondangan', 'nikahan', 'pernikahan', 'resepsi', 'akad', 'lamaran', 'arisan', 'syukuran', 'aqiqah', 'akikah', 'tahlilan', 'takziah', 'melayat', 'selametan', 'halal bihalal', 'wisuda', 'khitanan', 'sunatan'], ['10:00-13:00', '19:00-21:00']),
    k('perawatan', 'Perawatan diri', '💈', 'pribadi', 'Pribadi', 60, ['potong rambut', 'cukur', 'cukur rambut', 'barbershop', 'barber', 'pangkas rambut', 'salon', 'creambath', 'spa', 'pijat', 'massage', 'refleksi', 'manicure', 'medicure', 'facial', 'nail art'], ['10:00-16:00 we', '17:30-20:00']),
    k('liburan', 'Jalan-jalan', '🧳', 'pribadi', 'Pribadi', 240, ['jalan jalan', 'liburan', 'piknik', 'wisata', 'staycation', 'traveling', 'travelling', 'travel', 'mudik', 'pulang kampung', 'healing', 'roadtrip', 'road trip', 'ke pantai', 'ke mall', 'nge mall', 'ngemall'], ['08:00-12:00 we', '16:00-19:00 we']),
    k('metime', 'Me time', '🌿', 'pribadi', 'Pribadi', 60, ['me time', 'metime', 'waktu sendiri', 'santai', 'bersantai', 'rileks', 'relaksasi', 'journaling', 'jurnal harian', 'refleksi diri', 'hobi', 'melukis', 'menggambar', 'fotografi', 'merajut', 'menulis'], ['20:00-22:00', '14:00-17:00 we']),
  ];

  // Nama sholat wajib (dengan ejaan tak baku) untuk rekomendasi waktu sholat.
  const PRAYERS = {
    subuh: ['subuh', 'shubuh', 'subu', 'subuhan', 'fajar', 'fajr', 'shubh'],
    dzuhur: ['dzuhur', 'zuhur', 'duhur', 'dhuhur', 'zhuhur', 'dzuhu', 'zuhu', 'lohor', 'luhur', 'zuhr', 'dhuhr', 'dzuhr', 'dhuhurr'],
    ashar: ['ashar', 'asar', 'ashr', 'asr', 'asharr', 'ashar an'],
    maghrib: ['maghrib', 'magrib', 'mahgrib', 'magreb', 'maghreb', 'mgrib', 'maghrip', 'magrip'],
    isya: ['isya', 'isyak', 'isha', 'isyaa', 'isa', 'isya an'],
  };

  const P = (root.Planner = root.Planner || {});
  P.activities = { KINDS, PRAYERS };
  if (typeof module === 'object' && module.exports) module.exports = { KINDS, PRAYERS };
})(typeof self !== 'undefined' ? self : this);
