# Rencana Harian

Aplikasi web perencana harian berbahasa Indonesia. Semua berjalan di browser tanpa akun dan tanpa server: data tersimpan di `localStorage` perangkat masing-masing.

Pada kunjungan pertama aplikasi memuat **contoh data** (tugas, kebiasaan 30 hari, jurnal, sesi fokus) agar semua fitur langsung bisa dicoba. Contoh data bisa dihapus lewat tombol **Mulai dari kosong** di Beranda atau menu Pengaturan.

## Fitur

| Halaman | Isi |
| --- | --- |
| **Beranda** | Kalender sobek harian (tanggal Masehi, hari pasaran Jawa, tanggal Hijriah), sapaan sesuai waktu, cincin progres, **tambah cepat**, Tiga Prioritas, agenda, tugas berikutnya, peribahasa hari ini, pelacak air minum, centang kebiasaan, dan suasana hati. |
| **Rencana** | Daftar tugas per bagian hari (pagi, siang, sore, malam) atau **linimasa per jam** dengan garis waktu sekarang. Saring per kategori, template rutinitas, subtugas, catatan, prioritas. |
| **Kebiasaan** | Kisi 7 hari, streak berjalan & terbaik, persentase 30 hari. |
| **Fokus** | Timer Pomodoro (fokus / rehat pendek / rehat panjang) yang bisa dikaitkan ke tugas; tetap berjalan saat pindah halaman atau memuat ulang. |
| **Jurnal** | Suasana hati, tiga hal yang disyukuri, catatan harian, dan niat untuk besok. Tersimpan otomatis. |
| **Statistik** | Ringkasan 7/30 hari: tugas selesai, menit fokus, suasana hati, kategori, konsistensi kebiasaan, plus tabel data. |
| **Pengaturan** | Nama, tema terang/gelap, target air, durasi Pomodoro, jam linimasa, pengingat, cadangan & pemulihan data (JSON). |

Fitur lain:

- **Tambah cepat dengan bahasa sehari-hari.** Contoh: `Rapat tim 14.00-15.30 #kerja ! besok`
  - jam: `14.00`, `14:00`, `9.30-11.00`, `jam 7`, `pukul 8`
  - kategori: `#kerja`, `#kesehatan`, `#ibadah`, `#rumah`, `#pribadi`, `#belajar` (boleh disingkat, mis. `#rum`)
  - prioritas: `!` (tinggi), `!sedang`, `!rendah`
  - `*` memasukkan tugas ke Tiga Prioritas
  - `besok` / `lusa` untuk menjadwalkan ke hari berikutnya
- **Pindahkan tugas yang tertunda** dari hari-hari sebelumnya ke hari ini dengan satu klik.
- **Urungkan** saat menghapus tugas atau menerapkan template.
- **Pengingat** saat tugas berjam dimulai (toast di aplikasi, dan notifikasi browser bila diizinkan).
- **Pintasan keyboard:** `N` tugas baru, `/` tambah cepat, `T` hari ini, `←`/`→` ganti hari, `1`–`7` pindah halaman, `Spasi` mulai/jeda timer, `?` bantuan.
- **Bisa dipasang & dipakai offline** (PWA dengan service worker) saat disajikan lewat http(s).
- Tampilan responsif (sidebar di desktop, tab bawah di ponsel), mode gelap, dan warna kategori yang sudah divalidasi aman untuk buta warna.

## Menjalankan

Tidak ada langkah build. Cukup buka `index.html` di browser, atau jalankan server lokal agar fitur offline aktif:

```bash
npm start          # menyajikan folder ini di http://localhost:5173
```

Untuk menerbitkan, unggah seluruh folder ke hosting statis mana pun (GitHub Pages, Netlify, Vercel, dsb.).

## Pengujian

Logika inti (tanggal, pengurai tambah cepat, streak, tata letak linimasa) diuji dengan test runner bawaan Node.js 18+:

```bash
npm test
```

## Struktur

```
index.html              kerangka halaman
css/styles.css          seluruh gaya (token warna terang & gelap)
js/core/date.js         utilitas tanggal Indonesia, pasaran Jawa, Hijriah
js/core/logic.js        logika murni: tambah cepat, streak, linimasa, statistik
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

Hari pasaran dihitung dari acuan 17 Agustus 1945 = Jumat Legi. Tanggal Hijriah memakai kalender Umm al-Qura bawaan browser (`Intl`), jadi bisa berbeda satu hari dari penetapan resmi di Indonesia.
