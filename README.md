# Rencana Harian

Aplikasi web perencana harian berbahasa Indonesia. Semua berjalan di browser tanpa akun dan tanpa server: data tersimpan di `localStorage` perangkat masing-masing.

Pada kunjungan pertama aplikasi memuat **contoh data** (tugas, kebiasaan 30 hari, jurnal, sesi fokus) agar semua fitur langsung bisa dicoba. Contoh data bisa dihapus lewat tombol **Mulai dari kosong** di Beranda atau menu Pengaturan.

## Fitur

| Halaman | Isi |
| --- | --- |
| **Beranda** | Kalender sobek harian (tanggal Masehi, hari pasaran Jawa, tanggal Hijriah), sapaan sesuai waktu, cincin progres, **tambah cepat**, Tiga Prioritas, agenda, tugas berikutnya, peribahasa hari ini, pelacak air minum, centang kebiasaan, dan suasana hati. |
| **Rencana** | Daftar tugas per bagian hari (pagi, siang, sore, malam) atau **linimasa per jam** dengan garis waktu sekarang. Saring per kategori, template rutinitas, subtugas, catatan, prioritas, dan tombol **Bagikan**. |
| **Pekan** | Tujuh hari Senin–Minggu dalam satu layar, target pekanan, ringkasan pekan, dan **seret-lepas** tugas antarhari (atau geser ke hari berikutnya dengan satu tombol). |
| **Kebiasaan** | Kisi 7 hari, streak berjalan & terbaik, persentase 30 hari. |
| **Fokus** | Timer Pomodoro (fokus / rehat pendek / rehat panjang) yang bisa dikaitkan ke tugas; tetap berjalan saat pindah halaman atau memuat ulang. |
| **Jurnal** | Suasana hati, tiga hal yang disyukuri, catatan harian, dan niat untuk besok. Tersimpan otomatis. |
| **Statistik** | Ringkasan 7/30 hari: tugas selesai, menit fokus, suasana hati, kategori, konsistensi kebiasaan, plus tabel data. |
| **Pengaturan** | Nama, tema terang/gelap, target air, durasi Pomodoro, jam linimasa, **waktu sholat**, pengingat, cadangan & pemulihan data (JSON). |

Fitur lain:

- **Tambah cepat dengan bahasa sehari-hari.** Contoh: `Rapat tim 14.00-15.30 #kerja ! besok`
  - jam: `14.00`, `14:00`, `9.30-11.00`, `jam 7`, `pukul 8`
  - kategori: `#kerja`, `#kesehatan`, `#ibadah`, `#rumah`, `#pribadi`, `#belajar` (boleh disingkat, mis. `#rum`)
  - prioritas: `!` (tinggi), `!sedang`, `!rendah`
  - `*` memasukkan tugas ke Tiga Prioritas
  - `besok` / `lusa` untuk menjadwalkan ke hari berikutnya
  - pengulangan: `tiap hari`, `setiap hari kerja`, `tiap akhir pekan`, `setiap senin & kamis`
- **Tugas berulang** (setiap hari, hari kerja, akhir pekan, atau hari tertentu). Kejadian dibuat otomatis per tanggal; menghapus satu hari tidak memunculkannya lagi, dan perubahan pada seri berlaku untuk jadwal berikutnya yang belum selesai.
- **Cari tugas** di semua tanggal dengan `Ctrl + K` (atau ikon kaca pembesar).
- **Bagikan rencana**: salin sebagai teks siap tempel ke WhatsApp, atau unduh berkas kalender `.ics` (hari ini/pekan ini) untuk Google Calendar, Kalender iPhone, atau Outlook.
- **Waktu sholat (opsional)** untuk 45 kota di Indonesia (WIB/WITA/WIT), dihitung di perangkat dengan kriteria Kemenag. Tampil di Beranda dan sebagai garis di linimasa, lengkap dengan pengingat.
- **Pindahkan tugas yang tertunda** dari hari-hari sebelumnya ke hari ini dengan satu klik.
- **Urungkan** saat menghapus tugas atau menerapkan template.
- **Pengingat** saat tugas berjam dimulai (toast di aplikasi, dan notifikasi browser bila diizinkan).
- **Pintasan keyboard:** `N` tugas baru, `/` tambah cepat, `Ctrl + K` cari, `T` hari ini, `←`/`→` ganti hari, `1`–`8` pindah halaman, `Spasi` mulai/jeda timer, `?` bantuan.
- **Bisa dipasang & dipakai offline** (PWA dengan service worker) saat disajikan lewat http(s).
- Tampilan responsif (sidebar di desktop, tab bawah di ponsel), mode gelap, dan warna kategori yang sudah divalidasi aman untuk buta warna.

## Menjalankan

Tidak ada langkah build. Cukup buka `index.html` di browser, atau jalankan server lokal agar fitur offline aktif:

```bash
npm start          # menyajikan folder ini di http://localhost:5173
```

Untuk menerbitkan, unggah seluruh folder ke hosting statis mana pun (GitHub Pages, Netlify, Vercel, dsb.).

## Pengujian

Logika inti (tanggal, pengurai tambah cepat, tugas berulang, streak, tata letak linimasa, waktu sholat, teks WhatsApp, berkas .ics) diuji dengan test runner bawaan Node.js 18+:

```bash
npm test
```

## Struktur

```
index.html              kerangka halaman
css/styles.css          seluruh gaya (token warna terang & gelap)
js/core/date.js         utilitas tanggal Indonesia, pasaran Jawa, Hijriah
js/core/logic.js        logika murni: tambah cepat, pengulangan, streak, linimasa, statistik, berbagi
js/core/prayer.js       perhitungan waktu sholat + daftar kota
js/data/                peribahasa, template rutinitas, generator contoh data
js/store.js             status aplikasi + penyimpanan localStorage
js/ui.js                ikon, toast, dialog, konfirmasi
js/components.js        baris tugas, editor tugas, pemilih template
js/timer.js             timer Pomodoro
js/views/*.js           satu berkas per halaman
js/app.js               navigasi, tanggal terpilih, kalender, pintasan, pengingat
sw.js                   service worker untuk mode offline
tests/                  unit test (node --test)
```

Waktu sholat memakai Subuh 20°, Isya 18°, Ashar mazhab Syafi'i, ihtiyath 2 menit, dan Imsak 10 menit sebelum Subuh. Hasilnya perkiraan dan bisa selisih 1–2 menit dari jadwal resmi Kemenag.

Hari pasaran dihitung dari acuan 17 Agustus 1945 = Jumat Legi. Tanggal Hijriah memakai kalender Umm al-Qura bawaan browser (`Intl`), jadi bisa berbeda satu hari dari penetapan resmi di Indonesia.
