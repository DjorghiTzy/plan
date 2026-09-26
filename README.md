# Rencana Harian

Aplikasi web perencana harian berbahasa Indonesia. Bisa dipakai langsung di browser tanpa akun (data di perangkat), atau **masuk dengan akun** supaya semua data tersimpan di server dan **tersinkron hampir seketika** antara HP, laptop, dan tablet.

Aplikasi dimulai **kosong**, tanpa contoh data. Untuk mulai cepat, pakai **template rutinitas**: 20 saran siap pakai yang semuanya bisa diubah, ditambah template buatanmu sendiri. Contoh data dari versi lama dibersihkan otomatis saat aplikasi dibuka.

## Fitur

| Halaman | Isi |
| --- | --- |
| **Beranda** | Ringkasan hari: agenda dibagi **Rencana Kerja** dan **Rencana Pribadi**, kalender sobek (Masehi, pasaran Jawa, Hijriah), sapaan sesuai waktu, cincin progres, **tambah cepat**, ritual pagi/malam, niat hari ini, Tiga Prioritas, agenda, tugas berikutnya, waktu sholat (opsional), peribahasa, air minum, kebiasaan, suasana hati. |
| **Rencana Kerja** | Menu sendiri untuk pekerjaan: **jam kerja** & beban kerja, **proyek** dengan tenggat, **atur otomatis di jam kerja**, **laporan kerja** harian/mingguan ke WhatsApp, daftar per bagian hari atau linimasa, saringan per proyek. |
| **Rencana Pribadi** | Menu sendiri untuk hidup di luar pekerjaan: **checklist sholat 5 waktu** (dengan jadwal sholat), tugas per bidang **Ibadah, Kesehatan, Belajar, Rumah, Pribadi**, proyek pribadi, atur otomatis di luar jam kerja, daftar atau linimasa. |
| **Pekan** | Senin–Minggu dalam satu layar (bisa disaring Semua / Kerja / Pribadi), target pekanan, ringkasan, **seret-lepas** antarhari. |
| **Kebiasaan** | **Pelacak bulanan ala spreadsheet** (tampilan bawaan): semua kebiasaan × semua tanggal dalam sebulan, dikelompokkan Minggu 1–5 (tgl 1–7, 8–14, …) dengan % tiap minggu; ketuk kotak untuk mencentang. Di atasnya **grafik progres harian** yang sejajar dengan kolom tanggal (arahkan kursor/ketuk untuk melihat angka tiap hari, atau fokus lalu tekan ← →), di bawahnya baris **Selesai (%)** per hari, dan di kanan **Target / Selesai / Progres** per kebiasaan. Ringkasan: progres bulan ini, hari sempurna, streak terpanjang, grafik per minggu, dan peringkat kebiasaan. Pindah bulan lewat tab Jan–Des atau panah. Persentase hanya menghitung hari yang sudah lewat, dan hari sebelum kebiasaan dibuat tidak dihitung kecuali dicentang. Tampilan **7 hari** lama tetap ada (streak berjalan & terbaik, persentase 30 hari, konfeti saat streak 7/21/30/50/100 hari). |
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
- **Layar penuh di desktop**: tombol di kiri atas (atau tekan `M`) menyembunyikan menu samping sehingga konten memenuhi lebar layar. Pilihan ini diingat di perangkat itu.
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
- Proyek, jam kerja, dan checklist sholat ikut tersinkron ke semua perangkat. Server menolak penghapusan data jenis baru dari tab versi lama yang belum dimuat ulang.

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

- **Selama aplikasi terbuka** (termasuk di tab latar): langsung jalan, tanpa pengaturan tambahan.
- **Saat aplikasi tertutup** (notifikasi push): butuh akun (masuk), izin notifikasi, dan sebuah **penjadwal per jam** yang memanggil `https://alamat-situsmu/api/remind`. Cron bawaan Vercel paket gratis hanya sekali sehari, jadi pakai salah satu cara di bawah (cukup sekali):
  - **cron-job.org** (gratis, paling mudah): daftar → *Create cronjob* → URL `https://alamat-situsmu.vercel.app/api/remind` → jadwal *Every hour* (menit 0) → simpan.
  - **GitHub Actions** (sudah disertakan di `.github/workflows/pengingat.yml`): di GitHub buka **Settings → Secrets and variables → Actions → Variables**, lalu tambahkan `APP_URL` = alamat situsmu. Jadwal GitHub kadang terlambat beberapa menit dan berhenti sendiri bila repositori tidak ada aktivitas 60 hari.
- Opsional, supaya hanya penjadwalmu yang bisa memanggil: isi `CRON_SECRET` di Vercel, lalu sertakan header `Authorization: Bearer <rahasia>` (cron-job.org: *Advanced → Headers*; GitHub: secret `CRON_SECRET`), atau `?key=<rahasia>` di URL. Tanpa rahasia pun aman: setiap perangkat paling banyak menerima satu pengingat per jam.
- **iPhone/iPad**: notifikasi saat tertutup hanya berfungsi bila aplikasi dipasang ke Layar Utama (Safari → Bagikan → *Tambah ke Layar Utama*, iOS 16.4+) lalu dibuka dari ikon itu.
- Status di Pengaturan menunjukkan apakah izin notifikasi, push perangkat ini, dan penjadwal server sudah aktif. Tombol **Kirim notifikasi tes** memeriksa semuanya.

Kunci VAPID untuk push dibuat otomatis sekali dan disimpan di Redis. Bila ingin memakai kunci sendiri, isi `VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` (base64url) di Vercel. Notifikasi dikirim tanpa isi (tanpa data pribadi); teksnya dibuat oleh service worker di perangkat.

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
js/core/smart.js        pengenalan kegiatan (toleran salah ketik) & rekomendasi jam
js/data/activities.js   kamus jenis kegiatan: kata kunci, kategori, durasi, jendela waktu
js/store.js             status aplikasi + localStorage + aksi
js/morph.js             DOM morphing (render tanpa kedip, animasi masuk/keluar)
js/sync.js              klien sinkronisasi (antrean offline, polling adaptif)
js/account.js           dialog akun, pasangkan perangkat (kode + QR)
js/templates-ui.js      pengelola & editor template, saran acak, kartu saran di hari kosong
js/work.js              jam kerja, beban kerja, proyek, atur otomatis, laporan kerja
js/ops.js               rencana kerja tanpa jam (ketuk-coret, ubah), Retur & Delivery Order dengan SLA (opsional), pengingat retur 15.00
js/habit-sheet.js       pelacak kebiasaan bulanan ala spreadsheet (grafik progres harian, per minggu, peringkat)
js/views/rencana.js     menu Rencana Kerja & Rencana Pribadi (checklist sholat, per bidang)
js/reminder.js          pengingat per jam (lokal + langganan Web Push)
js/data/templates.js    20 saran template rutinitas (termasuk 7 untuk hari kerja)
js/ritual.js            ritual Rencanakan/Tutup hari, atur otomatis
js/ambient.js           suara latar fokus (Web Audio)
js/ui.js, components.js ikon, dialog, toast, konfeti, editor tugas, palet perintah
js/views/*.js           satu berkas per halaman
js/vendor/qrcode.js     pembuat QR (qrcode-generator, MIT, © Kazuhiko Arase)
api/*.js                fungsi serverless Vercel: register, login, logout, me, pair, sync, account, health,
                        push (langganan notifikasi), remind (dipanggil penjadwal tiap jam)
api/_lib/               HTTP, penyimpanan (Upstash REST + memori), auth, sinkronisasi, push (VAPID tanpa dependensi)
sw.js                   service worker: cache aplikasi + notifikasi pengingat
.github/workflows/      penjadwal per jam opsional (GitHub Actions) untuk /api/remind
middleware.js           gerbang mode pribadi (Vercel Routing Middleware)
masuk.html, js/gate.js  halaman masuk untuk mode pribadi
scripts/dev-server.js   server lokal yang meniru Vercel (termasuk header dari vercel.json)
scripts/hash-password.js  pembuat hash kata sandi untuk LOGIN_PASSWORD_HASH
tests/                  unit test, uji API, uji Redis sungguhan
```

Catatan akurasi: waktu sholat memakai Subuh 20°, Isya 18°, Ashar Syafi'i, ihtiyath 2 menit, Imsak 10 menit sebelum Subuh; hasilnya perkiraan dan bisa selisih 1–2 menit dari jadwal resmi Kemenag. Tanggal Hijriah memakai kalender Umm al-Qura bawaan browser, bisa berbeda satu hari dari penetapan resmi. Hari pasaran dihitung dari acuan 17 Agustus 1945 = Jumat Legi.
