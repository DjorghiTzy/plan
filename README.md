# Rencana Harian

Aplikasi web perencana harian berbahasa Indonesia. Bisa dipakai langsung di browser tanpa akun (data di perangkat), atau **masuk dengan akun** supaya semua data tersimpan di server dan **tersinkron hampir seketika** antara HP, laptop, dan tablet.

Aplikasi dimulai **kosong**, tanpa contoh data. Untuk mulai cepat, pakai **template rutinitas**: 20 saran siap pakai yang semuanya bisa diubah, ditambah template buatanmu sendiri. Contoh data dari versi lama dibersihkan otomatis saat aplikasi dibuka.

## Fitur

| Halaman | Isi |
| --- | --- |
| **Beranda** | Ringkasan hari: agenda dibagi **Rencana Kerja** dan **Rencana Pribadi**, sapaan sesuai waktu, hari pasaran Jawa & tanggal Hijriah, kotak ringkasan (rencana selesai, fokus, air, kebiasaan), **tambah cepat**, ritual pagi/malam, niat hari ini, Tiga Prioritas, agenda, tugas berikutnya, waktu sholat (opsional), peribahasa, air minum, kebiasaan, suasana hati. |
| **Rencana Kerja** | Menu sendiri untuk pekerjaan: **jam kerja** & beban kerja, **proyek** dengan tenggat, **atur otomatis di jam kerja**, **laporan kerja** harian/mingguan ke WhatsApp, daftar per bagian hari atau linimasa, saringan per proyek. |
| **Rencana Pribadi** | Menu sendiri untuk hidup di luar pekerjaan: **checklist sholat 5 waktu** (dengan jadwal sholat), tugas per bidang **Ibadah, Kesehatan, Belajar, Rumah, Pribadi**, proyek pribadi, atur otomatis di luar jam kerja, daftar atau linimasa. |
| **Pekan** | Senin–Minggu dalam satu layar (bisa disaring Semua / Kerja / Pribadi), target pekanan, ringkasan, **seret-lepas** antarhari. |
| **Kebiasaan** | **Pelacak bulanan ala spreadsheet** (tampilan bawaan): semua kebiasaan × semua tanggal dalam sebulan, dikelompokkan Minggu 1–5 (tgl 1–7, 8–14, …) dengan % tiap minggu; ketuk kotak untuk mencentang. Di atasnya **grafik progres harian** yang sejajar dengan kolom tanggal (arahkan kursor/ketuk untuk melihat angka tiap hari, atau fokus lalu tekan ← →), di bawahnya baris **Selesai (%)** per hari, dan di kanan **Target / Selesai / Progres** per kebiasaan. Ringkasan: progres bulan ini, hari sempurna, streak terpanjang, grafik per minggu, dan peringkat kebiasaan. Pindah bulan lewat tab Jan–Des atau panah. Persentase hanya menghitung hari yang sudah lewat, dan hari sebelum kebiasaan dibuat tidak dihitung kecuali dicentang. Tampilan **7 hari** lama tetap ada (streak berjalan & terbaik, persentase 30 hari, konfeti saat streak 7/21/30/50/100 hari). |
| **Lari** | **Catat lari setiap hari**: tanggal, jam mulai, jarak (km, boleh pakai koma), waktu (jam/menit/detik), jenis (santai, tempo, interval, jarak jauh, lomba, treadmill), rasanya (😫–😄), dan catatan. Pace dan km/jam dihitung otomatis. **Spreadsheet bulanan** per Minggu 1–5 dengan grafik **jarak harian** yang sejajar kolom tanggal, baris Jarak / Waktu / Pace / Rasa, dan total bulan ini. Di bawahnya grafik **akumulasi vs target** bulanan (bawaan 50 km, bisa diubah) dan **per minggu**, daftar **catatan lari**, dan **rekor pribadi** (terjauh, pace tercepat, perkiraan 5K tercepat, total). Ketuk kotak kosong di baris Jarak untuk mencatat lari di tanggal itu, atau angkanya untuk mengubah. Mencentang tugas "Lari pagi/sore" menawarkan **Catat** dengan jam & durasi terisi. Tekan `N` di halaman ini untuk mencatat lari. Tersinkron ke semua perangkat. |
| **Menu aplikasi** | Semua fitur dalam satu layar berisi **ikon berwarna** (seperti layar utama HP): status hidup di tiap ikon, cari aplikasi/aksi/tugas, **dok favorit**, **atur urutan dengan seret**, dan **aksi cepat** (tekan lama / klik kanan). **Satu aplikasi per layar**: tidak ada menu samping atau tab bawah; pindah aplikasi lewat tombol ▦ di kiri atas atau tekan `A`/`M`. Lihat [Menu aplikasi](#menu-aplikasi). |
| **Musik** | Pemutar musik ala **Dynamic Island** iPhone: pil hitam di atas layar yang berubah bentuk dengan animasi pegas (ringkas → terbuka → daftar lagu), sampul berputar, dan bar equalizer. Ada lagu bawaan bebas hak cipta (NCS), dan kamu bisa **menambah lagu sendiri** yang tersimpan di database perangkat & akunmu. Lihat [Musik](#musik). |
| **Coach Lari (AI)** | Aplikasi **Coach** sendiri (ikon Coach di Menu aplikasi). **Impor screenshot** dari Strava, Garmin, Nike Run Club, dll.: coach membaca jarak, waktu, pace, detak jantung, kalori, elevasi, dan lokasi, lalu membuat **ringkasan** dan mengisi dialog Catat lari (tinggal simpan). **Sesi chat** untuk analisis mendalam: kapan sebaiknya lari, berapa jauh dan seberapa cepat, zona detak jantung, beban latihan (rasio akut:kronis), rencana menuju target, berdasarkan catatan lari, **profil kesehatan** (usia, berat, HR istirahat/maks, target, cedera), kebiasaan, air minum, suasana hati, jadwal kerja & agenda, serta waktu sholat. Coach **mengingat seluruh sesi**, membaca **cuaca BMKG** di lokasimu (bila lokasi dihidupkan), dan saran jaraknya langsung diberi **rute sungguhan** di chat. Riwayat sesi tersinkron. Memakai Gemini API (ada paket gratis), lihat [Coach Lari (AI)](#coach-lari-ai). |
| **Fokus** | Pomodoro yang dikaitkan ke tugas + **suara latar** (hujan, derau cokelat, ombak) yang disintesis di browser. |
| **Jurnal** | Suasana hati, tiga hal yang disyukuri, catatan, niat untuk besok. Tersimpan otomatis. |
| **Statistik** | Sorotan otomatis, kartu angka dengan sparkline & perbandingan periode sebelumnya, tugas per hari/pekan, **peta aktivitas 20 pekan**, **donat kategori**, **kerja vs pribadi**, **kurva suasana hati**, **jam produktif**, **hari terbaik**, strip kebiasaan, tabel data. Rentang 7/30/90 hari. |
| **Pengaturan** | Akun & sinkronisasi, tema, target air, **jam kerja**, Pomodoro, jam linimasa, waktu sholat, pengingat, **pengingat per jam**, kelola template, cadangan/pemulihan JSON, kosongkan semua rencana. |

Lainnya:

- **Pilih jam tanpa roda berputar**: semua isian jam memakai dua daftar, jam **00–23** dan menit **00–59**.
- **Kegiatan dikenali otomatis dan saran jam yang luwes:** tulis bebas, termasuk salah ketik dan ejaan tak baku, misalnya `padel` → 🎾 Olahraga (kategori Kesehatan), `solad isya` → 🕌 Ibadah · Sholat Isya, `zoom sama klien` → 👥 Kerja · Rapat, `bultang malam` → 🏸 Badminton. Kamus ±60 jenis kegiatan (ibadah, olahraga, kesehatan, kerja, belajar, rumah, keluarga, acara, hiburan). Kategori dan menu Kerja/Pribadi terisi sendiri, dan muncul pilihan jam yang cocok:
  - waktu sholat (sesuai kota di Pengaturan);
  - petunjuk di kalimat, misalnya `pagi`, `malam`, `habis maghrib`, `sebelum subuh`;
  - kebiasaanmu, misalnya "biasanya lari 06:30";
  - jendela yang wajar untuk jenis kegiatan itu.

  Jam yang disarankan selalu di slot kosong: urusan pribadi di luar jam kerja, pekerjaan di dalam jam kerja, sholat dan makan siang boleh di sela kerja. Tinggal ketuk salah satu, atau pilih *Kapan saja*. Tambah cepat tanpa jam memunculkan tombol **Pasang HH:MM**. Pencarian `Ctrl + K` juga toleran salah ketik dan mengenali nama jenis (cari `olahraga` menemukan "padel"). Statistik menampilkan **Kegiatan terbanyak**.
- **Tambah cepat berbahasa sehari-hari:** `Rapat tim 14.00-15.30 #kerja ! besok`, `Olahraga tiap hari jam 6`, `Futsal setiap selasa & jumat 19.00`.
- **Tugas berulang** (setiap hari, hari kerja, akhir pekan, hari tertentu).
- **Ritual harian**: *Rencanakan hari* (bawa tugas tertunda → Tiga Prioritas → cek kapasitas & atur otomatis → niat) dan *Tutup hari* (pindahkan yang belum selesai ke besok → refleksi → ringkasan).
- **Satu aplikasi per layar** (seperti Odoo/ponsel): tiap aplikasi tampil penuh tanpa menu samping atau tab aplikasi lain. Bilah atas hanya berisi tombol ▦ Menu, ikon & nama aplikasi yang sedang dibuka, dan tanggal untuk aplikasi yang memakai tanggal. Pindah aplikasi lewat Menu (▦, `A`, atau `M`); angka `1`–`9` tetap bisa dipakai.
- **Palet perintah** `Ctrl + K`: cari tugas di semua tanggal atau jalankan perintah (fokus, tema, bagikan, template, pindah halaman).
- **Bagikan**: teks siap tempel ke WhatsApp, atau berkas kalender `.ics`.
- **Template rutinitas yang bisa diubah**: 20 saran (Rutinitas Pagi, Hari Kerja Fokus, Senin: Rencanakan Pekan, Hari Penuh Rapat, Jumat: Tinjau & Laporkan, Kunjungan Klien, Sprint Kerja Dalam, Hari Sehat & Bugar, Beres-beres Rumah, Hari Kreatif, Hari Santai, Rutinitas Malam, Hari Keluarga, Beres Keuangan, Hari Penuh Ibadah, Belanja & Masak Mingguan, Persiapan Perjalanan, Kerja dari Rumah, dll.), tombol **🎲 Saran acak**, kartu saran di hari yang masih kosong, **editor template** (nama, ikon, kegiatan, jam, kategori, prioritas, bintang), **Simpan hari ini sebagai template**, sembunyikan/pulihkan saran. Template milikmu ikut tersinkron ke semua perangkat.
- **Pengingat per jam**: notifikasi "waktunya mengisi rencana" setiap jam pada jam aktif pilihanmu (mis. 07.00–21.00), juga saat aplikasi tertutup (lihat [Pengingat per jam](#pengingat-per-jam)).
- **Responsif tanpa lag**: klik langsung ditanggapi. Pindah halaman/tanggal tidak lagi memakai View Transitions yang mengunci layar. Render ulang hanya menyentuh bagian yang berubah, dan penyimpanan & sinkron dikerjakan saat browser senggang. Saat ada yang perlu ditunggu, muncul **animasi pemuatan** (bilah di atas layar, kerangka daftar saat data akun dimuat, spinner di tombol) yang tetap bergerak walau perangkat sedang sibuk.
- **Animasi halus di setiap interaksi**: halaman & tanggal masuk dengan geser/pudar singkat, lingkaran saat ganti tema, centang yang "tergambar", garis coret yang memanjang, indikator navigasi yang meluncur, dialog & toast beranimasi, konfeti, efek tekan/hover, dan elemen muncul lembut saat digulir. Semua menghormati pengaturan *kurangi gerakan* di perangkat.
- **PWA**: bisa dipasang di layar utama (ikon PNG untuk Android/iPhone) dan dibuka offline. Berkas aplikasi diambil dari cache lalu diperbarui di latar, jadi aplikasi terbuka cepat walau sinyal lemah.

## Rencana Kerja & Rencana Pribadi

Rencana kerja dan rencana pribadi adalah **dua menu terpisah** di navigasi (di HP: tab *Kerja* dan *Pribadi* di bawah layar), dengan alamat `/#kerja` dan `/#pribadi`. Keduanya juga tersedia sebagai pintasan saat aplikasi dipasang. Tautan lama `/#rencana` membuka menu yang terakhir dipakai.

- **Setiap tugas masuk salah satu menu.** Kategori *Kerja* masuk Rencana Kerja; *Ibadah, Kesehatan, Belajar, Rumah, Pribadi* masuk Rencana Pribadi. Di editor tugas ada pilihan *Masuk ke* untuk memindahkan tugas, mis. pelatihan kantor berkategori *Belajar* ke Rencana Kerja.
- **Rencana Pribadi**
  - **Checklist sholat 5 waktu** (Subuh, Dzuhur, Ashar, Maghrib, Isya) lengkap dengan jadwalnya bila waktu sholat diaktifkan, penanda sholat berikutnya, dan hitungan hari berturut-turut yang lengkap. Bisa disembunyikan di Pengaturan → Waktu sholat.
  - Tugas dikelompokkan per bidang: 🕌 Ibadah, 💪 Kesehatan, 📚 Belajar, 🏠 Rumah, ✨ Pribadi. Tombol + di tiap bidang langsung mengisi kategorinya.
  - *Atur otomatis* menempatkan tugas pribadi di luar jam kerja. Proyek pribadi juga bisa, mis. *Renovasi kamar*.
- **Rencana Kerja**
  - **Rencana kerja** (panel terpisah dari Agenda, tampilan sama, tanpa jam; juga tampil di Beranda): ketuk sekali dan pekerjaannya langsung tercoret (selesai); ketuk lagi untuk membatalkan. Isinya rutinitas harian (bawaan: *Penambahan mobil 1 dan 2, Mengurus Delivery Order, Mengurusi Retur, Merapikan Gudang*; bisa diubah lewat *Atur rutinitas harian*) ditambah pekerjaan tambahan hari itu. Di bawahnya ada **Agenda kerja** untuk tugas yang punya jam, tenggat, atau proyek. Setiap hari kerja dimulai lagi belum tercoret; di hari libur rutinitas disembunyikan.
  - **Ubah** lewat ikon pensil di setiap baris. Mengubah rutinitas berlaku untuk setiap hari kerja; mengubah pekerjaan tambahan hanya untuk hari itu. Status tercoret tetap. Dari dialog yang sama bisa *Hapus* (dengan urungkan).
  - **Pelacak Retur & Delivery Order** disembunyikan secara bawaan. Nyalakan di Pengaturan → Kerja → *Tampilkan pelacak Retur & Delivery Order*; datanya tetap tersimpan selama disembunyikan, dan pengingatnya ikut berhenti. Saat menyala, rutinitas Retur/DO menampilkan jumlah yang masih aktif.
  - **Retur per customer**: tanggal mulai & tanggal selesai (bukan jam), SLA maksimal **7 hari** (hari mulai = hari ke-1, hari ke-7 = batas). Tampil *Hari ke-3/7 · sisa 4 hari*, kuning saat mendekati batas, merah *Lewat SLA 2 hari*. Setiap retur yang belum selesai membuatmu **diingatkan setiap hari pukul 15.00**: toast/notifikasi saat aplikasi terbuka, dan notifikasi push saat tertutup (butuh akun, izin notifikasi, dan penjadwal per jam di server, lihat [Pengingat per jam](#pengingat-per-jam)).
  - **Delivery Order**: jam DO diterima, SLA maksimal **1 jam**, hitung mundur (*Sisa 12 mnt* / *Terlambat 5 mnt*), diingatkan 15 menit sebelum batas dan saat batas tercapai. Saat ditandai selesai tercatat tepat waktu atau terlambat.
  - SLA Retur/DO dan jam pengingat retur bisa diubah di Pengaturan → Kerja (muncul saat pelacaknya dinyalakan).
  - **Jam kerja** (bawaan 08.00–17.00, istirahat 12.00–13.00, Sen–Jum; diatur di Pengaturan → Kerja): menentukan hari kerja untuk rutinitas, pita jam kerja & istirahat di linimasa, dan saran jam.
  - **Atur otomatis di jam kerja** (di judul *Agenda kerja*, muncul bila ada tugas kerja tanpa jam): tugas ditempatkan ke celah kosong di jam kerja, melewati istirahat (dan waktu sholat bila aktif). Di sebelahnya ada *Simpan sebagai template*.
  - **Proyek** dengan ikon, tenggat (*3 hari lagi*, *Terlambat 1 hari*), catatan, kemajuan, dan tugas berikutnya; saringan per proyek; tandai selesai; hapus dengan urungkan (tugasnya tetap ada).
  - **Laporan kerja** harian/mingguan siap tempel ke WhatsApp: selesai, belum selesai, rencana hari kerja berikutnya, rencana kerja (✅/⬜), retur (selesai & masih berjalan dengan hari ke-/lewat SLA), Delivery Order (tepat waktu/terlambat), kemajuan proyek, kendala, catatan. Tugas pribadi tidak ikut.
- **Beranda** tetap jadi ringkasan hari, dengan agenda dibagi dua bagian: Kerja dan Pribadi. **Pekan** bisa disaring Semua / Kerja / Pribadi. **Statistik** menampilkan perbandingan kerja vs pribadi.
- Proyek, jam kerja, checklist sholat, dan catatan lari ikut tersinkron ke semua perangkat. Server menolak penghapusan data jenis baru dari tab versi lama yang belum dimuat ulang.

## Sinkronisasi antarperangkat

- **Akun**: daftar dengan email + kata sandi, atau **hubungkan perangkat lain dengan kode 8 karakter / QR** (berlaku 10 menit, sekali pakai) tanpa mengetik kata sandi di HP.
- **Hampir realtime**: perubahan dikirim ~1 detik setelah diketik; perangkat lain memeriksa tiap 3 detik saat aktif (20 detik saat diam), dan langsung saat tab dibuka kembali atau koneksi pulih. Tab lain di browser yang sama diperbarui seketika.
- **Tetap jalan offline**: data selalu disimpan juga di perangkat. Perubahan saat offline diantrekan dan dikirim begitu online.
- **Aman terhadap edit bersamaan**: setiap tugas, kebiasaan, catatan, dll. disinkronkan sebagai entri terpisah dengan aturan *yang diubah terakhir menang*, jadi mengedit tugas A di HP dan tugas B di laptop tidak saling menimpa. Penggabungan di server bersifat atomik (skrip Lua di Redis).
- **Saat pertama masuk**: bila perangkat sudah punya data sendiri, kamu bisa memilih *gabungkan ke akun* (data akun tidak ditimpa) atau *pakai data akun saja*.
- **Keamanan**: kata sandi di-hash dengan scrypt, token sesi 256-bit disimpan dalam bentuk hash, batas percobaan masuk/daftar/kode, validasi & batas ukuran data, CSP dan header keamanan lain lewat `vercel.json`. Pengguna bisa **menghapus akun** beserta seluruh datanya di server.

## Deploy ke Vercel (dengan sinkronisasi)

1. Masuk ke [vercel.com](https://vercel.com) → **Add New… → Project** → impor repositori GitHub ini.
   Framework Preset: **Other**. Tidak perlu build command. Klik **Deploy**.
2. Buka proyeknya di Vercel → tab **Storage** → **Create Database** → pilih **Upstash for Redis** (Marketplace) → buat database (paket gratis cukup) → **Connect** ke proyek ini.
   Vercel otomatis menambahkan variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN` (atau `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`; keduanya dikenali).
3. **Redeploy** (tab Deployments → ⋯ → Redeploy) supaya variabelnya terbaca.
4. Buka alamat situsmu → tombol **Masuk** di kanan atas → **Buat akun**. Di HP: buka alamat yang sama lalu masuk, atau di laptop pilih **Hubungkan perangkat lain** dan pindai QR-nya dengan kamera HP.

Tanpa langkah 2, situs tetap berjalan normal dalam mode lokal (data per perangkat) dan tombol akun disembunyikan.

**Perkiraan pemakaian kuota:** satu perangkat yang terbuka dan aktif memakai ±1 perintah Redis dan 1 pemanggilan fungsi tiap 3 detik (±1.200/jam); saat diam turun ke tiap 20 detik, dan berhenti saat tab tidak terlihat. Untuk pemakaian pribadi biasanya masih dalam paket gratis; cek batas terbaru di halaman harga Upstash dan Vercel. Interval bisa diubah di `js/sync.js` (`ACTIVE_MS`, `IDLE_MS`).

## Mode pribadi (hanya untuk Anda)

Untuk pemakaian pribadi, aktifkan **mode pribadi** supaya orang lain yang mengetahui alamat situs tidak bisa membuka aplikasinya sama sekali. Ada dua cara; pilih salah satu.

### Cara A: satu akun pemilik (nama pengguna + kata sandi), disarankan

Nama pengguna dan kata sandi **hanya disimpan di Vercel**, tidak pernah di kode atau repositori.

1. Di Vercel: **Settings → Environment Variables**, tambahkan untuk lingkungan **Production** dan **Preview**:
   - `LOGIN_USERNAME`: nama pengguna Anda (huruf besar/kecil tidak dibedakan).
   - `LOGIN_PASSWORD_HASH`: hash kata sandi. Buat di komputer Anda dengan `npm run hash-password`, ketik kata sandinya (tidak tampil di layar), lalu salin baris yang keluar.
     Atau, lebih praktis tetapi kurang aman, isi `LOGIN_PASSWORD` dengan kata sandinya langsung. Bila keduanya diisi, `LOGIN_PASSWORD_HASH` yang dipakai.
2. Pastikan Upstash Redis sudah terhubung (langkah 2 di atas), lalu **Redeploy**.
3. Buka situsnya → halaman **Masuk** hanya menampilkan *Nama pengguna* dan *Kata sandi*. Tab *Buat akun* hilang dan pendaftaran ditolak server.
   Di HP cukup masuk dengan nama pengguna yang sama, atau pindai QR dari **Pengaturan → Hubungkan perangkat lain**.

Semua perangkat yang masuk memakai **satu akun data yang sama**. Untuk mengganti kata sandi, ubah variabelnya di Vercel lalu Redeploy: **semua perangkat otomatis keluar** dan harus masuk dengan kata sandi baru, sedangkan datanya tetap utuh. Ini juga cara mengunci perangkat yang hilang. Mengganti `LOGIN_USERNAME` membuat akun data baru yang kosong; pindahkan data lewat **Pengaturan → Unduh cadangan** lalu **Pulihkan dari berkas**.
Cara A mengalahkan cara B: bila `LOGIN_USERNAME` diisi, `ALLOWED_EMAILS` diabaikan dan sesi akun email lama tidak berlaku lagi.

Pakai kata sandi yang panjang dan tidak mudah ditebak (minimal 12 karakter, gabungan kata acak). Server membatasi 10 percobaan masuk per 15 menit untuk setiap nama pengguna dan 30 per 15 menit untuk setiap alamat IP.

### Cara B: email yang diizinkan

1. Di Vercel: **Settings → Environment Variables** → tambahkan `ALLOWED_EMAILS` berisi email Anda (boleh lebih dari satu, pisahkan dengan koma), untuk lingkungan **Production** dan **Preview**.
2. **Redeploy**.
3. Buka situsnya → halaman **Masuk** → tab **Buat akun** dengan email tadi (sekali saja). Di HP cukup **Masuk**, atau pindai QR dari **Pengaturan → Hubungkan perangkat lain**.

Yang terjadi setelah mode pribadi aktif (cara A maupun B):

- `middleware.js` berjalan di server Vercel **sebelum** berkas apa pun dikirim. Tanpa sesi yang masih berlaku, pengunjung hanya mendapat halaman masuk. Kode aplikasi (`/js/...`) pun dijawab `401`.
- Cara A: hanya akun pemilik yang bisa masuk, memakai kode perangkat, dan sinkron. Cara B: pendaftaran, masuk, dan kode perangkat hanya berlaku untuk email di `ALLOWED_EMAILS`; email lain mendapat pesan "Aplikasi ini pribadi".
- Sesi disimpan dalam cookie `HttpOnly` + `Secure` (tidak terbaca skrip) dan diperiksa ke Redis pada setiap pemuatan halaman. Setelah **Keluar**, cookie lama langsung tidak berlaku.
- Halaman masuk ditandai `noindex` dan `robots.txt` melarang mesin pencari.

Saran tambahan: jadikan repositori GitHub **Private** (Settings → General → Danger Zone → Change visibility) agar kodenya juga tidak terlihat publik. Vercel tetap bisa men-deploy repositori privat.

## Pengingat per jam

Di **Pengaturan → Pengingat per jam**, nyalakan *Ingatkan saya setiap 1 jam* lalu pilih jam aktifnya (bawaan 07.00–21.00). Setiap jam tepat (menit :00) muncul pengingat untuk mengisi rencana. Mengetuk **Isi sekarang** membuka Beranda dengan kotak tambah cepat siap diketik.

- **Selama aplikasi terbuka** (termasuk di tab latar): langsung jalan, tanpa pengaturan tambahan. Notifikasi sistem muncul tiap jam (plus toast bila tab sedang dilihat).
- **Saat aplikasi dibuka**: bila browser/aplikasi tertutup saat jam :00, pengingat jam itu langsung muncul begitu kamu membukanya (atau kembali ke tab-nya), sekali per jam. Supaya ikut terbuka saat browser dibuka, jadikan aplikasi halaman awal (Brave: `brave://settings/getStarted` → *Buka halaman tertentu*) atau pasang sebagai aplikasi.
- **Saat aplikasi tertutup** (notifikasi push): butuh akun (masuk), izin notifikasi, dan sebuah **penjadwal per jam** yang memanggil `https://alamat-situsmu/api/remind`. Cron bawaan Vercel paket gratis hanya sekali sehari, jadi pakai salah satu cara di bawah (cukup sekali):
  - **cron-job.org** (gratis, paling mudah): daftar → *Create cronjob* → URL `https://alamat-situsmu.vercel.app/api/remind` → jadwal *Every hour* (menit 0) → simpan.
  - **GitHub Actions** (sudah disertakan di `.github/workflows/pengingat.yml`, menit ke-3 tiap jam): langsung memanggil `https://plan-djtzy.vercel.app`. Untuk situs lain, di GitHub buka **Settings → Secrets and variables → Actions → Variables**, lalu tambahkan `APP_URL` = alamat situsmu. Jadwal GitHub kadang terlambat beberapa menit dan berhenti sendiri bila repositori tidak ada aktivitas 60 hari. Job tidak pernah gagal (hanya memberi peringatan), jadi tidak ada email gagal tiap jam.
- **Vercel Authentication** (Deployment Protection) menahan panggilan penjadwal: `/api/remind` dialihkan ke `vercel.com/sso` (terlihat di log GitHub Actions sebagai HTTP 302). Matikan di Vercel → proyek → **Settings → Deployment Protection → Vercel Authentication** (aplikasi tetap terkunci oleh mode pribadi/login milikmu), atau buat **Protection Bypass for Automation** lalu simpan nilainya sebagai secret GitHub `VERCEL_BYPASS` (workflow mengirimnya sebagai header `x-vercel-protection-bypass`).
- Opsional, supaya hanya penjadwalmu yang bisa memanggil: isi `CRON_SECRET` di Vercel, lalu sertakan header `Authorization: Bearer <rahasia>` (cron-job.org: *Advanced → Headers*; GitHub: secret `CRON_SECRET`), atau `?key=<rahasia>` di URL. Tanpa rahasia pun aman: setiap perangkat paling banyak menerima satu pengingat per jam.
- **Brave**: Brave mematikan layanan push secara bawaan, sehingga muncul *Registration failed - push service error*. Buka `brave://settings/privacy`, nyalakan **Use Google services for push messaging**, mulai ulang Brave, lalu ketuk **Coba lagi** di Pengaturan (aplikasi mendeteksi Brave dan menampilkan langkah ini). Notifikasi saat Brave benar-benar tertutup baru muncul ketika Brave dibuka lagi, kecuali *Continue running background apps when Brave is closed* dinyalakan (`brave://settings/system`).
- **iPhone/iPad**: notifikasi saat tertutup hanya berfungsi bila aplikasi dipasang ke Layar Utama (Safari → Bagikan → *Tambah ke Layar Utama*, iOS 16.4+) lalu dibuka dari ikon itu.
- Status di Pengaturan menunjukkan apakah izin notifikasi, push perangkat ini, dan penjadwal server sudah aktif. Tombol **Kirim notifikasi tes** memeriksa semuanya.

Kunci VAPID untuk push dibuat otomatis sekali dan disimpan di Redis. Bila ingin memakai kunci sendiri, isi `VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` (base64url) di Vercel. Notifikasi dikirim tanpa isi (tanpa data pribadi); teksnya dibuat oleh service worker di perangkat.

## Coach Lari (AI)

Coach memakai **Gemini API (Google)** lewat fungsi server `api/coach.js`, dipanggil langsung dengan `fetch` (tanpa dependensi). Kunci API hanya disimpan di Vercel dan tidak pernah dikirim ke browser.

1. Buka [aistudio.google.com](https://aistudio.google.com), masuk dengan akun Google, lalu **Get API key → Create API key**. Kunci Gemini bisa dipakai **gratis** dengan batas pemakaian per menit dan per hari (lihat angkanya di AI Studio).
2. Di Vercel → proyek → **Settings → Environment Variables**, tambahkan `GEMINI_API_KEY` = kunci tadi (Production dan Preview).
3. **Redeploy**. Cek `https://alamat-situsmu/api/health`: bagian `"coach": true` berarti coach aktif.

Opsional:

| Variabel | Bawaan | Fungsi |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-flash-latest` | Model Gemini. Alias bawaan selalu menunjuk model Flash terbaru, jadi tidak ikut pensiun saat model lama dihentikan. Bisa diganti mis. `gemini-pro-latest`. |
| `GEMINI_FALLBACK_MODEL` | `gemini-flash-lite-latest` | Model cadangan saat model utama sedang penuh ("high demand") atau kuota gratisnya habis. Bisa beberapa, dipisah koma; kosongkan untuk mematikan. |
| `COACH_DAILY_LIMIT` | `40` | Batas permintaan per akun per hari (impor + chat + ringkasan sesi). |
| `WEATHER_DAILY_LIMIT` | `300` | Batas cek cuaca BMKG per akun per hari (tanpa Gemini). |

- **Ingat seluruh sesi**: setiap bertanya, seluruh isi sesi dikirim ke coach (dulu hanya 30 pesan terakhir), termasuk rute yang sudah pernah diberikan. Satu sesi disimpan sampai 240 pesan. Bila sesi sudah sangat panjang (±50 KB, mendekati batas satu entri sinkron), pesan lama diringkas coach (aksi `memory`): ringkasannya disimpan di sesi dan selalu ikut dikirim, sehingga isi awal sesi tetap diingat. Di atas chat muncul catatan "pesan lama sudah diringkas" yang bisa dibuka.
- **Lokasi & cuaca BMKG**: tombol **Lokasi** di atas chat (mati secara bawaan; pilihannya tersinkron, koordinat tidak disimpan). Saat hidup, server mencari desa/kelurahan terdekat dari 83.449 desa (`api/_lib/data/desa.txt.gz`, kode wilayah tingkat IV dari paket [geografis](https://github.com/drizki/geografis), MIT) lalu mengambil prakiraan cuaca BMKG per 3 jam (`api.bmkg.go.id/publik/prakiraan-cuaca?adm4=…`; bila kode desa tidak dikenal BMKG, dicoba desa terdekat berikutnya). Hasilnya disimpan 30 menit per desa. Strip di atas chat menampilkan desa, cuaca sekarang, suhu, dan **peluang hujan 24 jam**; diketuk untuk melihat 8 periode ke depan (cuaca, suhu, kelembapan) dan ringkasan per hari. BMKG tidak memberi angka peluang hujan, jadi persentasenya = bagian periode 3 jam yang diprakirakan hujan. Coach membaca nama desa/kecamatan dan prakiraan ini (tanpa koordinat) untuk menyarankan jam lari.
- **Saran jarak + rute di chat**: bila kamu minta rute atau bertanya mau lari berapa jauh, coach menyebut jarak yang disarankan (atau yang kamu minta) dan menutup jawabannya dengan baris `[[RUTE 5 km putar]]`. Aplikasi menyembunyikan baris itu dan menggantinya dengan **kartu rute** sungguhan dari lokasimu (mesin rute yang sama dengan tab Rute, selisih maks. 300 m): sketsa rute, jarak, arah, belokan, perkiraan waktu, jalan yang dilewati, lalu **Google Maps**, **Lihat di peta** (membuka tab Rute dengan rute itu ditebalkan), **Rute lain** (sampai 3 pilihan), dan **Simpan**. Kartu rute tersimpan di sesi (paling banyak 120 titik per rute). Bila lokasi mati, kartu meminta lokasi dihidupkan lalu langsung mencari rutenya.
- **Tahan lonjakan**: bila Gemini membalas galat sementara (mis. 503 "model sedang penuh"), permintaan diulang sekali; bila tetap gagal atau kuota model utama habis (429), coach otomatis memakai model cadangan. Pengguna baru melihat pesan galat bila semua model gagal.

- **Biaya**: di paket gratis tidak ada tagihan; bila batas gratis habis, coach menampilkan "Batas pemakaian Gemini tercapai" dan bisa dipakai lagi setelah kuotanya pulih. Tagihan baru berlaku bila kamu sendiri mengaktifkan billing di Google Cloud.
- **Privasi**: saat bertanya, aplikasi mengirim ringkasan profil kesehatan, catatan lari (25 terakhir + total mingguan), kebiasaan bulan ini, air minum dan suasana hati 1–2 pekan terakhir, jadwal hari ini dan besok, jam kerja, serta waktu sholat bila aktif. Bila lokasi hidup, koordinat hanya dikirim ke servermu (untuk mencari desa & cuaca BMKG, tidak disimpan); ke Gemini hanya nama desa/kecamatan dan prakiraan cuacanya. Tangkapan layar hanya dikirim saat diimpor dan tidak disimpan di aplikasi. **Di paket gratis, Google dapat memakai data yang dikirim untuk meningkatkan produknya** (menurut ketentuan Gemini API); dengan billing aktif, data tidak dipakai untuk itu.
- Detail lari tambahan (HR, kalori, elevasi, ringkasan coach) disimpan sebagai entri sinkron `runx:`, dan sesi chat sebagai `coach:`. Tab versi lama tidak bisa menghapusnya (klien v13).
- **Sampah**: menghapus sesi chat perlu konfirmasi, lalu sesi pindah ke Sampah (entri `coachbin:`, klien v14). Dari Sampah sesi bisa dipulihkan atau dihapus permanen; setelah 30 hari terhapus permanen otomatis, seperti "Baru dihapus" di galeri.
- Coach AI bisa keliru dan bukan pengganti dokter. Hentikan latihan dan periksa ke tenaga medis bila ada nyeri dada, sesak, atau pusing.

Coba tanpa kunci API di komputer sendiri: `COACH_FAKE=1 WEATHER_FAKE=1 ROUTE_FAKE=1 npm run dev` (jawaban coach, cuaca BMKG, dan jalan tiruan untuk mencoba tampilan).

## Menu aplikasi

Layar peluncur (`js/launcher.js`, logika murni di `js/core/apps.js`) yang berisi semua fitur sebagai ikon: Beranda, Rencana Kerja/Pribadi, Pekan, Kalender, Kebiasaan, Fokus, Jurnal, Lari, Rute Lari, Coach, Musik, Statistik, Cari, Tugas Baru, Tema, Data, dan Pengaturan. Dibuka dengan tombol ▦ di kiri atas (semua ukuran layar) atau tombol `A`/`M`. Aplikasi yang dipilih tampil penuh satu layar; kembali ke Menu dengan ▦.

**Dikelompokkan per database.** Ikon tidak lagi satu tumpukan: tiap kelompok adalah kartu **Database** berisi aplikasinya.

| Database | Aplikasi |
| --- | --- |
| **Database Harian** | Beranda, Pekan, Kalender, Statistik, Cari, Tugas Baru |
| **Database Kerja** | Rencana Kerja, Fokus |
| **Database Pribadi** | Rencana Pribadi, Kebiasaan, Jurnal, Musik |
| **Database Olahraga** | Lari, Rute Lari, Coach |
| **Database Sistem** | Tema, Data, Pengaturan |

- Judul kartu menunjukkan jumlah aplikasi dan jumlah data di database penyimpanannya (mis. *3 aplikasi · 42 data*). Ketuk judul untuk **menciutkan** kartu (tinggal ikon mini) atau membukanya lagi.
- **Pindah database**: aksi cepat ikon (tekan lama / klik kanan) punya bagian *Database* dengan lima pilihan, atau seret ikon ke kartu lain (di depan ikon, di judul = paling depan, di ruang kosong = paling belakang, ke judul kartu yang diciutkan = masuk ke sana). Saat mengatur, database yang kosong tampil sebagai tempat tujuan *Seret ikon ke sini*.
- Saat mencari, hasilnya satu daftar biasa tanpa kelompok. Panah keyboard berpindah ke ikon terdekat secara visual, juga antarkartu.
- Pindahan & kartu yang diciutkan disimpan di pengaturan (ikut sinkron); **Atur ulang** mengembalikan semua ke database asalnya.

- **Hidup**: tiap ikon menampilkan statusnya: tugas belum selesai (lencana merah), progres hari ini & target lari (bar kecil), kebiasaan hari ini, hitung mundur Fokus, lagu yang sedang diputar (piringan berputar + equalizer), jurnal sudah ditulis (centang), dan ikon Kalender memuat tanggal hari ini. Di atasnya jam besar, sapaan, dan ringkasan yang bisa diketuk (tugas tersisa, tugas berikutnya, timer, lagu, kebiasaan).
- **Dinamis**: layar terbuka melingkar dari tombol yang ditekan, ikon muncul bergelombang dari titik itu, latar gumpalan warna yang melayang pelan, kilau & kemiringan 3D mengikuti kursor, dan saat membuka aplikasi ikonnya membesar seolah masuk ke dalamnya. Mengikuti mode terang/gelap dan pengaturan "kurangi gerakan".
- **Cari**: ketik di mana saja. Aplikasi dicocokkan dari nama dan kata kunci ("lagu" → Musik, "timer" → Fokus), huruf yang cocok disorot, dan muncul **aksi cepat** (mis. *Putar musik*, *Tugas kerja baru*) serta **Cari tugas "…"** di semua tanggal. `Enter` membuka hasil pertama, panah untuk berpindah ikon, `Esc` menghapus pencarian lalu menutup.
- **Aksi cepat**: tekan lama (HP) atau klik kanan (komputer) sebuah ikon: Buka, aksi khusus aplikasinya (Mulai/Jeda timer, Putar/Lagu berikutnya, Catat lari, Impor screenshot, Tulis jurnal hari ini, Statistik 7/30 hari, dll.), sematkan/lepas dari dok, dan Atur ikon. Aksi seperti putar musik atau timer dijalankan tanpa menutup menu.
- **Dok favorit** (maks. 5) di bawah, membesar di dekat kursor seperti dok macOS, dengan titik penanda halaman yang sedang dibuka atau yang sedang berjalan. Seret ikon ke dok untuk menyematkan.
- **Atur**: seret ikon untuk mengubah urutan (di HP: tekan lama lalu seret), ikon bergoyang, ☆ menyematkan ke dok, × melepas dari dok, `Alt + panah` memindahkan ikon dengan keyboard, dan **Atur ulang** mengembalikan susunan bawaan. Urutan & dok disimpan di pengaturan sehingga **ikut sinkron** ke perangkat lain.
- **Hanya aplikasi itu yang terbuka**: ikon halaman (Beranda, Rencana, Lari, Rute Lari, Coach, dst.) membuka halamannya sendiri. Lari, Rute Lari, dan Coach masing-masing halaman terpisah tanpa tombol aplikasi lain. Aplikasi berbentuk jendela (Kalender, Cari, Tugas Baru, Musik) dan aksi cepat seperti Catat lari terbuka **di atas Menu**, bukan di atas halaman lain; setelah ditutup kamu kembali ke Menu. Ketukan untuk menutup pemutar musik hanya menutupnya, tidak ikut membuka ikon di bawahnya.
- Tombol **Kembali** browser/HP menutup menu tanpa pindah halaman, dan membuka aplikasi dari menu tidak menambah langkah Kembali.
- **Semua aplikasi seragam**: setiap halaman memakai kepala yang sama (`P.ui.pageHead`): label kecil *NAMA APLIKASI · konteks* (mis. *Rencana Kerja · Hari ini*, *Fokus · Teknik Pomodoro*), judul dengan ukuran & posisi yang sama, keterangan singkat bila perlu, dan tombol aksi di kanan. Di HP tombolnya selalu berpola sama: pilihan tampilan satu baris penuh, tombol biasa berbagi satu baris, tombol utama paling bawah selebar layar. Bilah atas tingginya sama di semua aplikasi (dengan atau tanpa navigasi tanggal), dan kotak angka di Beranda, Pekan, Statistik, Kebiasaan, dan Lari memakai satu gaya.

## Database per fungsi

Data tidak lagi disimpan sebagai satu dokumen besar. Setiap fungsi punya **database sendiri** (`js/core/databases.js`, dipakai perangkat & server):

| Database | Isi |
| --- | --- |
| **Kerja** | tugas & tugas berulang kerja, proyek kerja, Retur / Delivery Order, catatan kerja harian |
| **Pribadi** | tugas & tugas berulang pribadi, proyek pribadi, checklist sholat |
| **Olahraga** | catatan lari, detail lari dari screenshot, chat coach (+ Sampah), rute tersimpan |
| **Kebiasaan & Kesehatan** | daftar kebiasaan, centang harian, air minum |
| **Jurnal** | catatan harian, suasana hati, rasa syukur, niat, target pekan |
| **Fokus** | sesi Pomodoro & timer |
| **Pengaturan & Template** | pengaturan aplikasi, template rutinitas |
| **Musik** | lagu yang diimpor (IndexedDB perangkat + akun, sudah terpisah sejak awal) |

- Tugas, tugas berulang, dan proyek masuk Kerja atau Pribadi sesuai area/kategorinya; tugas yang dipindah ke Pribadi otomatis pindah database.
- **Di perangkat**: tiap database punya kunci localStorage sendiri (`rencana-harian/db/<id>`); hanya database yang berubah yang ditulis ulang. Data lama (`rencana-harian/v1`) dipindah otomatis saat aplikasi dibuka dan baru dihapus setelah semua database tertulis.
- **Di server akun** (Upstash Redis): tiap database adalah hash sendiri `d:<akun>:<id>` dengan revisinya sendiri, jadi sinkron hanya membaca database yang berubah. Dokumen lama dipindah **sekali dan atomik** oleh skrip Lua saat akun pertama kali sinkron setelah pembaruan; salinan aslinya disimpan sebagai cadangan `d:<akun>:lama` selama 90 hari. Tulisan dari server versi lama saat pergantian deploy ikut dipindah bila lebih baru.
- **Aplikasi Data** (ikon di Database Sistem pada Menu aplikasi, atau Pengaturan → Data → *Kelola per database*): kartu tiap database berisi aplikasi yang memakainya (ketuk untuk membuka), jumlah isi, ukuran di perangkat, dan status sinkron (*Tersinkron* / *N menunggu* / *Di perangkat*). Tombolnya: **Lihat isi** (daftar + cari), **Ekspor** (berkas .json database itu saja), **Impor** (digabung tanpa menghapus data yang ada; cadangan lengkap juga bisa diimpor per database), dan **Kosongkan** (database lain tidak tersentuh, bisa diurungkan).

## Tampilan & tema

Tema **Krem & Malam** (`css/styles.css`, token warna di `:root`):

- **Terang (krem)**: latar krem hangat dengan cahaya persik & lavender yang sangat halus, kartu putih gading, tinta ungu tua, aksen **violet**.
- **Gelap (malam)**: latar bergradasi **ungu tua ke biru tua**, kartu nila, aksen **lavender**, dan peta rute ikut gelap.
- Tombol utama bergradasi violet→biru, isian dengan cincin fokus violet, bilah atas kaca tipis, toast & dialog bernuansa tema, kartu sorotan (peribahasa) bergradasi. Label kecil di kepala halaman diawali titik berwarna ikon aplikasinya.
- Semua warna teks lolos kontras WCAG AA di kedua tema. Ikuti perangkat / Terang / Gelap diatur di **Pengaturan → Profil & tampilan** atau tombol tema.

## Menu klik kanan

Klik kanan di mana saja memunculkan menu milik aplikasi (`js/ctxmenu.js`), bukan menu bawaan browser. Bingkainya bergradasi warna tema, ikonnya berwarna, dan muncul dengan riak dari titik klik. **Susunannya sama di semua aplikasi**, jadi posisi tiap perintah selalu di tempat yang sama:

- **Kepala**: ikon & nama aplikasi yang sedang dibuka (atau *Menu aplikasi*), tanggal, dan jam.
- **Baris ikon untuk yang diklik** (hanya bila ada): di atas tugas → Selesai, Ubah, Prioritas, Besok, Duplikat, Fokus, Hapus (pindah & hapus bisa dibatalkan); pada teks yang diblok → Salin, Jadi tugas, Cari.
- **Aksi cepat**: Tugas baru, Cari, Menu aplikasi, Kembali ke hari ini.
- **Buka aplikasi**: ikon aplikasi di dok favorit.
- **Sekarang**: Putar/Jeda musik, Lagu berikutnya, Mulai/Jeda timer Fokus, ganti tema terang/gelap.
- Baris alat: Kembali, Muat ulang, Salin tautan, Pintasan.

Perintah yang sedang tidak berlaku (mis. *Kembali ke hari ini* saat sudah di hari ini) tetap di tempatnya tetapi diredupkan. Menu aksi cepat ikon di Menu aplikasi memakai bentuk yang sama (komponen `P.ui.menuHead/menuSection/menuItem`); mode suara Musik selalu tampil tiga pilihan dengan tanda centang di yang aktif.

Keyboard: panah atas/bawah, `Home`/`End`, `Enter`, `Esc`; tombol Menu di keyboard membukanya di dekat elemen yang sedang fokus. Menu bawaan browser tetap dipakai di kolom isian teks, di dalam jendela dialog, di layar sentuh (tekan lama), dan saat menekan **Shift + klik kanan**.

## Musik

Ikon **Musik** di Menu aplikasi membuka pemutar musik berbentuk **Dynamic Island** (`js/music.js`): pil hitam di tengah atas layar (di HP tepat di bawah bilah atas) yang berubah bentuk dengan animasi pegas.

- **Ringkas**: sampul kecil yang berputar saat lagu diputar + bar equalizer yang bergerak (di layar lebar juga judul lagu). Saat lagu berganti sendiri, pil melebar sebentar menampilkan judul, lalu mengecil lagi.
- **Terbuka** (ketuk pil): sampul, judul, artis, progres yang bisa digeser, acak, sebelumnya, putar/jeda, berikutnya, ulangi (mati / semua / satu lagu), volume (layar lebar), dan tutup. Ketuk di luar atau `Esc` untuk mengecilkan.
- **Daftar lagu**: lagu bawaan *Safe And Sound* oleh Different Heaven (NoCopyrightSounds, bebas dipakai dengan menyebut sumber; `audio/`), lagu yang kamu impor, dan tombol **Tambah lagu**.
- Musik tetap jalan saat pindah halaman, bar equalizer mengikuti suara sungguhan di komputer (Web Audio; di HP animasi saja supaya musik tetap jalan saat layar mati), dan kontrolnya muncul di **layar kunci / notifikasi HP** dan tombol media keyboard (Media Session). Lagu terakhir dan posisinya diingat per perangkat.

**Mode suara: Asli / Musik saja / Vokal saja** (gratis, di perangkat, `js/core/vocal.js` di Web Worker `js/vocal-worker.js`). Lagu dipisahkan sekali per lagu & mode (lagu 3 menit ±3–8 detik), lalu diputar sebagai WAV lewat pemutar biasa, jadi tetap jalan saat layar HP dikunci. Pindah mode tidak memutus lagu: musik jalan terus selama diproses lalu berpindah di detik yang sama, dan kembali ke mode yang sudah diproses terasa instan. Caranya seperti efek *Vocal Reduction and Isolation* di Audacity: tiap potongan lagu diubah ke frekuensi (FFT), bagian yang sama persis di kiri & kanan pada rentang suara manusia (±150 Hz–8 kHz) dianggap vokal. **Musik saja** membuang bagian itu (stereo, bass & nada tinggi tetap utuh), **Vokal saja** hanya menyisakannya. Hasil paling bersih untuk lagu yang vokalnya di tengah; gema, vokal latar, atau instrumen yang juga di tengah kadang masih terdengar/ikut hilang. Lagu mono tidak bisa dipisahkan. Pilihan mode diingat per perangkat, dan tersedia juga sebagai aksi cepat ikon Musik di Menu aplikasi.

**Tambah lagu (impor)**: pilih berkas MP3, M4A, AAC, OGG, WAV, atau FLAC (maks. 15 MB per lagu). Judul, artis, album, dan **sampul** dibaca dari tag ID3 (MP3) atau dari nama berkas ("Artis - Judul.mp3"), durasi dari berkasnya. Lagu disimpan di:

1. **Database perangkat** (IndexedDB `rencana-harian-music`): langsung bisa diputar, juga offline.
2. **Database akunmu di server** (bila masuk akun): lagu dipecah per potongan ±384 KB dan disimpan di Redis (Upstash) yang sama dengan data sinkron, lewat `/api/sync?music=…` (tidak menambah fungsi Vercel). Lagu lalu **muncul di semua perangkatmu**; perangkat lain mengunduhnya saat pertama diputar lalu menyimpannya sendiri. Menghapus lagu (dengan konfirmasi) menghapusnya dari akun dan dari semua perangkat. Lagu yang diimpor sebelum masuk akun diunggah otomatis setelah masuk. Lagu yang sama tidak tersimpan dua kali (dikenali dari isi berkasnya).

| Variabel | Bawaan | Fungsi |
| --- | --- | --- |
| `MUSIC_LIMIT_MB` | `100` | Ruang musik per akun di database server (paket gratis Upstash 256 MB dipakai bersama data sinkron). Paling banyak 100 lagu per akun dan 3.000 potongan unggah/unduh per hari. |

## Rute Lari

Halaman **Rute Lari** mencarikan rute lari yang mulai dan selesai di titikmu dengan jarak mendekati target, **selisih maksimal 300 m** (mis. target 5 km → 4,7 sampai 5,3 km) dan **paling jauh 25 km** (garis lurus) dari titikmu. Jenis rute:

- **Putar**: memutar lalu kembali. Rute yang masuk ke jalan buntu lalu balik ("taji") dirapikan otomatis, dan yang dipilih adalah bentuk paling bulat dengan belokan paling sedikit.
- **Lurus**: lari menjauh di jalan yang selurus mungkin, lalu balik lewat jalan yang sama (bisa sampai jarak maraton 42,2 km).
- **Semua** (bawaan): rute putar dan rute lurus.

Setiap pencarian memberi **sebanyak mungkin rute yang berbeda, sampai 12** (minimal 3), masing-masing dengan warna dan huruf sendiri (A sampai L). Pada jenis **Semua** jatahnya dibagi dua (6 putar + 6 lurus); bila salah satu jenis habis, jenis lain mengisi sisanya. Rute yang bentuknya kurang rapi (putar yang terlalu gepeng atau banyak bolak-balik, lurus yang berliku) tidak ditampilkan kecuali perlu untuk mencapai 3 rute. Rute **tampil bertahap**: yang pertama muncul dalam beberapa detik, lalu terus bertambah sampai 12 rute atau waktunya habis (±20 detik); huruf rute yang sudah tampil tidak berubah, dan tombol **Cukup** menghentikan pencarian. Mencari lagi di titik, jarak, dan jenis yang sama memberi rute **baru**, bukan yang itu-itu saja; rute lama hanya dipakai untuk melengkapi sampai 3 dan ditandai "pernah muncul".

1. Pilih jarak (3, 5, 8, 10, 15, 21,1 km, atau ketik sendiri), lalu **Pakai lokasiku** (izin lokasi browser). Titik mulai juga bisa dipilih dengan mengetuk atau menggeser penanda di peta.
2. **Cari rute**: browser langsung menghubungi layanan rute, per putaran dengan arah-arah baru. Untuk rute putar, 21 titik di beberapa lingkaran per arah diukur jarak jalannya dalam satu permintaan tabel jarak; semua kombinasi dihitung di perangkat, beberapa yang paling pas diambil bentuknya lalu dinilai (bulat, sedikit belokan, tanpa bolak-balik). Arah berikutnya mengikuti sudut emas (137,5°) sehingga mengisi celah arah sebelumnya. Untuk rute lurus, satu tabel jarak dari titikmu ke titik-titik di 16 arah (lalu 16 arah di antaranya bila perlu); dipilih yang jarak jalannya hampir sama dengan garis lurusnya. Agar layanan rute gratis tidak memblokir karena terlalu sering diminta: sampai 4 arah rute putar diukur dalam satu tabel, dan bentuk banyak rute diambil dalam **satu permintaan rute gabungan** (rute-rute dirangkai lewat titik mulai lalu dipotong lagi per kaki rute; satu titik yang tak terjangkau hanya menggagalkan rutenya sendiri). Satu pencarian biasanya cukup 5 sampai 25 permintaan (paling banyak ±40), dan pencarian berhenti lebih awal bila layanan membatasi atau gagal berulang. Di area yang jalannya jarang atau banyak gang buntu, aplikasi belajar dari rute yang sudah diambil titik mana yang berada di ujung gang (dan sepanjang apa gangnya), lalu mengoreksi perkiraan untuk putaran berikutnya. Jawaban disimpan sementara (mencari lagi di tempat yang sama tidak mengulang permintaan), dan bila layanan membatasi permintaan (429/503, atau jawaban tanpa izin CORS yang di browser tampak seperti koneksi gagal) aplikasi menunggu lalu mencoba lagi. Bila layanan tabel tidak tersedia, dipakai cara cadangan (beberapa jari-jari sekaligus + garis regresi). Baris kecil di bawah hasil menunjukkan cara yang dipakai dan jumlah permintaan. Bila browser tidak bisa menghubungi layanan rute, pencarian dicoba lewat server aplikasi.
3. Semua rute tampil sekaligus di peta dengan gaya yang sama; yang membedakan hanya warna dan huruf labelnya. **Mengetuk kartu rute** langsung memindahkan peta ke rute itu (di HP halaman digulir ke peta) dan menebalkannya, sementara rute lain dipudarkan; ketuk lagi atau **Lihat semua** untuk kembali ke semua rute. Mengetuk garis atau huruf di peta juga menebalkan rute itu dan menyorot kartunya. Setiap rute punya tombol **Buka di Google Maps** (petunjuk arah jalan kaki dengan 3 titik antara agar Google mengikuti jalur yang sama; angkanya bisa sedikit berbeda), **GPX** (untuk Strava/Garmin), dan **Simpan**. Rute yang disimpan masuk ke daftar **Rute tersimpan** (bisa ditampilkan lagi di peta, dibuka di Google Maps, diunduh GPX, atau dihapus dengan urungkan) dan tersinkron ke semua perangkat (entri `savedroute:`, klien v15).
4. Bila coach aktif, coach memilih rute yang paling cocok (jumlah belokan, bolak-balik, nama jalan, jam sekarang, profil & riwayat larimu) dan memberi catatan singkat per rute.

**Gambar sendiri**: pilih **Gambar sendiri** di atas formulir, lalu buat rute di peta dengan salah satu cara:

- **Ketuk titik**: ketuk jalan yang ingin dilewati secara berurutan. Titik bisa digeser, atau diketuk untuk menghapusnya.
- **Coret bebas**: tarik jari atau mouse mengikuti jalan (selama mode ini peta tidak bisa digeser; zoom dengan dua jari atau tombol +/−). Coretan disederhanakan jadi paling banyak 25 titik.

Rute otomatis **dirapikan**: ditarik lewat jalan sungguhan (satu permintaan rute, ditunda sebentar agar ketukan beruntun tidak membanjiri layanan), masuk-keluar pendek (≤ 200 m) ke titik yang jatuh di gang atau jalan samping dibuang, lalu **jaraknya dihitung** (juga tampil di peta) beserta selisih dari target km, perkiraan waktu, dan jumlah belokan. Bolak-balik panjang yang disengaja (lari ke satu titik lalu pulang) tetap utuh. Pilihan **Kembali ke titik mulai** (bawaan) menutup rute ke titikmu; matikan untuk rute sekali jalan. Titik yang tidak terjangkau lewat jalan dari titik mulai (mis. di seberang sungai atau laut) dikenali lewat satu tabel jarak lalu dibuang otomatis, dan titik gambar yang lebih dari 25 km dari titik mulai baru (mis. setelah pindah kota) ikut dibuang, sehingga menggambar tidak pernah macet. Ada **Urungkan** dan **Hapus semua** (bisa diurungkan), dan hasilnya bisa dibuka di Google Maps, diunduh GPX, atau **Simpan** ke Rute tersimpan (jenis "Gambar sendiri"). Paling banyak 80 titik per rute.

Tidak perlu kunci API tambahan: jalan dihitung layanan rute OpenStreetMap gratis ([routing.openstreetmap.de](https://routing.openstreetmap.de), profil pejalan kaki) dan peta memakai ubin OpenStreetMap lewat Leaflet. CSP mengizinkan `connect-src https://routing.openstreetmap.de`. Pencarian lewat server (cadangan) dibatasi 60 kali per akun per hari.

| Variabel | Bawaan | Fungsi |
| --- | --- | --- |
| `ROUTE_DAILY_LIMIT` | `60` | Batas pencarian rute per akun per hari. |
| `ROUTING_URL` | `https://routing.openstreetmap.de/routed-foot` | Server OSRM lain untuk pencarian lewat server (cadangan). |

Lokasi hanya dipakai untuk mencari rute (dikirim ke layanan rute OpenStreetMap, atau lewat server aplikasi bila perlu) dan tidak disimpan. Coba tanpa layanan rute di komputer sendiri: `ROUTE_FAKE=1 npm run dev` (jalan tiruan berbentuk kisi).

## Menjalankan secara lokal

Tidak ada dependensi yang perlu dipasang (hanya Node.js 20+).

```bash
npm run dev        # http://localhost:5173 — halaman + API, akun disimpan di memori
LOGIN_USERNAME=saya LOGIN_PASSWORD=sandi-untuk-uji npm run dev   # mencoba akun pemilik secara lokal
ALLOWED_EMAILS=saya@contoh.id npm run dev   # mencoba mode pribadi dengan email
npm run hash-password                        # buat nilai LOGIN_PASSWORD_HASH
npm test           # unit test, uji API, dan uji Redis (bila redis-server terpasang)
```

Untuk mencoba dengan Upstash sungguhan secara lokal, set `KV_REST_API_URL` dan `KV_REST_API_TOKEN` sebelum `npm run dev`. Membuka `index.html` langsung dari berkas juga bisa (mode lokal, tanpa akun).

Saat merilis perubahan, naikkan `VERSION` di `sw.js` dan angka `?v=` pada tautan CSS/JS di `index.html` & `masuk.html` supaya semua perangkat memuat berkas baru bersamaan.

## Struktur

```
index.html              kerangka halaman
css/styles.css          seluruh gaya, token warna terang/gelap, animasi
js/core/date.js         tanggal Indonesia, pasaran Jawa, Hijriah, pekan ISO
js/core/logic.js        logika murni: tambah cepat, pengulangan, streak, linimasa,
                        kapasitas & jadwal otomatis, analitik statistik, berbagi
js/core/prayer.js       perhitungan waktu sholat + 45 kota
js/core/syncmap.js      pemetaan status ⇄ entri sinkronisasi
js/core/databases.js    database per fungsi (Kerja, Pribadi, Olahraga, …): pembagian entri & status, aturan migrasi
js/core/smart.js        pengenalan kegiatan (toleran salah ketik) & rekomendasi jam
js/core/run.js          logika lari: pace, rekap bulanan, akumulasi vs target, rekor
js/data/activities.js   kamus jenis kegiatan: kata kunci, kategori, durasi, jendela waktu
js/store.js             status aplikasi + localStorage + aksi
js/morph.js             DOM morphing (render tanpa kedip, animasi masuk/keluar)
js/sync.js              klien sinkronisasi (antrean offline, polling adaptif)
js/account.js           dialog akun, pasangkan perangkat (kode + QR)
js/templates-ui.js      pengelola & editor template, saran acak, kartu saran di hari kosong
js/work.js              jam kerja, beban kerja, proyek, atur otomatis, laporan kerja
js/ops.js               rencana kerja tanpa jam (ketuk-coret, ubah), Retur & Delivery Order dengan SLA (opsional), pengingat retur 15.00
js/habit-sheet.js       pelacak kebiasaan bulanan ala spreadsheet (grafik progres harian, per minggu, peringkat)
js/views/lari.js        halaman Lari (catat lari, spreadsheet bulanan, grafik, rekor), halaman Rute & Coach
js/core/coach.js        coach lari: profil kesehatan, zona HR, beban latihan, konteks untuk AI
js/coach-ui.js          halaman Coach: chat mengalir, impor screenshot Strava, profil, sesi, Sampah
js/core/geo.js          geometri rute: jarak, titik rute putar, bolak-balik, tautan Google Maps, GPX
js/core/loops.js        pencarian rute putar & lurus ±300 m (sampai 12, bertahap, rute gabungan), rute gambar sendiri, klien OSRM
js/route-ui.js          halaman Rute: peta (Leaflet, dimuat saat dibuka), cari rute ±300 m (bertahap), gambar sendiri, saran coach
js/core/apps.js         menu aplikasi: urutan & dok tersimpan, pencarian aplikasi/aksi, navigasi panah, gelombang animasi
js/launcher.js          menu aplikasi: ikon berwarna, status hidup, dok, seret atur urutan, aksi cepat
js/ctxmenu.js           menu klik kanan: kontekstual (tugas, teks terpilih), aksi cepat, aplikasi, musik & timer
js/core/playlist.js     musik: urutan putar (acak, ulangi), format waktu, judul dari nama berkas, tag ID3
js/music-lib.js         pustaka musik: lagu bawaan, database perangkat (IndexedDB), database akun (unggah/unduh per potongan)
js/music.js             pemutar Dynamic Island: pil ringkas/terbuka/daftar lagu, equalizer, Media Session, mode suara
js/core/vocal.js        pemisah vokal (STFT, kemiripan kiri-kanan): Musik saja / Vokal saja, WAV; js/vocal-worker.js menjalankannya
js/views/rencana.js     menu Rencana Kerja & Rencana Pribadi (checklist sholat, per bidang)
js/reminder.js          pengingat per jam (lokal + langganan Web Push)
js/data/templates.js    20 saran template rutinitas (termasuk 7 untuk hari kerja)
js/ritual.js            ritual Rencanakan/Tutup hari, atur otomatis
js/ambient.js           suara latar fokus (Web Audio)
js/ui.js, components.js ikon, dialog, toast, konfeti, editor tugas, palet perintah
js/views/*.js           satu berkas per halaman (termasuk database.js: kelola database per fungsi)
js/vendor/qrcode.js     pembuat QR (qrcode-generator, MIT, © Kazuhiko Arase)
js/vendor/leaflet/      peta Leaflet 1.9.4 (BSD-2-Clause, © Volodymyr Agafonkin)
api/*.js                fungsi serverless Vercel: register, login, logout, me, pair, sync, account, health,
                        push (langganan notifikasi), remind (dipanggil penjadwal tiap jam)
api/_lib/               HTTP, penyimpanan (Upstash REST + memori), auth, sinkronisasi, push (VAPID tanpa dependensi)
api/coach.js            coach lari (Gemini): baca screenshot, chat mengalir, saran rute; batas harian per akun
api/_lib/routes.js      pencarian rute lewat server (cadangan, js/core/loops.js), lewat /api/coach aksi "route"
api/_lib/weather.js     cuaca BMKG: desa terdekat (data/desa.txt.gz) → prakiraan per 3 jam, lewat /api/coach aksi "weather"
api/_lib/music.js       pustaka musik akun: lagu impor per potongan di Redis, lewat /api/sync?music=…
api/_lib/coach.js       prompt, skema keluaran, validasi; api/_lib/gemini.js klien REST Gemini (fetch + SSE)
sw.js                   service worker: cache aplikasi + notifikasi pengingat
.github/workflows/      penjadwal per jam opsional (GitHub Actions) untuk /api/remind
middleware.js           gerbang mode pribadi (Vercel Routing Middleware)
masuk.html, js/gate.js  halaman masuk untuk mode pribadi
scripts/dev-server.js   server lokal yang meniru Vercel (termasuk header dari vercel.json)
scripts/hash-password.js  pembuat hash kata sandi untuk LOGIN_PASSWORD_HASH
tests/                  unit test, uji API, uji Redis sungguhan
```

Catatan akurasi: waktu sholat memakai Subuh 20°, Isya 18°, Ashar Syafi'i, ihtiyath 2 menit, Imsak 10 menit sebelum Subuh; hasilnya perkiraan dan bisa selisih 1–2 menit dari jadwal resmi Kemenag. Tanggal Hijriah memakai kalender Umm al-Qura bawaan browser, bisa berbeda satu hari dari penetapan resmi. Hari pasaran dihitung dari acuan 17 Agustus 1945 = Jumat Legi.
