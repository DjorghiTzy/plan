# Rencana Harian

Aplikasi web perencana harian berbahasa Indonesia. Bisa dipakai langsung di browser tanpa akun (data di perangkat), atau **masuk dengan akun** supaya semua data tersimpan di server dan **tersinkron hampir seketika** antara HP, laptop, dan tablet.

Pada kunjungan pertama aplikasi memuat **contoh data** (12 pekan riwayat tugas, kebiasaan, jurnal, sesi fokus) agar semua fitur dan grafik langsung bisa dicoba. Contoh data hilang otomatis saat masuk ke akun, atau bisa dihapus lewat **Mulai dari kosong**.

## Fitur

| Halaman | Isi |
| --- | --- |
| **Beranda** | Kalender sobek (Masehi, pasaran Jawa, Hijriah), sapaan sesuai waktu, cincin progres, **tambah cepat**, ritual pagi/malam, niat hari ini, Tiga Prioritas, agenda, tugas berikutnya, waktu sholat (opsional), peribahasa, air minum, kebiasaan, suasana hati. |
| **Rencana** | Daftar per bagian hari atau **linimasa per jam**, **meter kapasitas harian**, **Atur otomatis** (tugas tanpa jam ditempatkan ke celah kosong), filter kategori, template, subtugas, bagikan. |
| **Pekan** | Senin–Minggu dalam satu layar, target pekanan, ringkasan, **seret-lepas** antarhari. |
| **Kebiasaan** | Kisi 7 hari, streak berjalan & terbaik, persentase 30 hari, konfeti saat streak 7/21/30/50/100 hari. |
| **Fokus** | Pomodoro yang dikaitkan ke tugas + **suara latar** (hujan, derau cokelat, ombak) yang disintesis di browser. |
| **Jurnal** | Suasana hati, tiga hal yang disyukuri, catatan, niat untuk besok. Tersimpan otomatis. |
| **Statistik** | Sorotan otomatis, kartu angka dengan sparkline & perbandingan periode sebelumnya, tugas per hari/pekan, **peta aktivitas 20 pekan**, **donat kategori**, **kurva suasana hati**, **jam produktif**, **hari terbaik**, strip kebiasaan, tabel data. Rentang 7/30/90 hari. |
| **Pengaturan** | Akun & sinkronisasi, tema, target air, Pomodoro, jam linimasa, waktu sholat, pengingat, cadangan/pemulihan JSON. |

Lainnya:

- **Tambah cepat berbahasa sehari-hari:** `Rapat tim 14.00-15.30 #kerja ! besok`, `Olahraga tiap hari jam 6`, `Futsal setiap selasa & jumat 19.00`.
- **Tugas berulang** (setiap hari, hari kerja, akhir pekan, hari tertentu).
- **Ritual harian**: *Rencanakan hari* (bawa tugas tertunda → Tiga Prioritas → cek kapasitas & atur otomatis → niat) dan *Tutup hari* (pindahkan yang belum selesai ke besok → refleksi → ringkasan).
- **Palet perintah** `Ctrl + K`: cari tugas di semua tanggal atau jalankan perintah (fokus, tema, bagikan, template, pindah halaman).
- **Bagikan**: teks siap tempel ke WhatsApp, atau berkas kalender `.ics`.
- **Animasi halus di setiap interaksi**: transisi halaman & tanggal (View Transitions), lingkaran saat ganti tema, centang yang "tergambar", garis coret yang memanjang, indikator navigasi yang meluncur, dialog & toast beranimasi, konfeti, efek tekan/hover, dan elemen muncul lembut saat digulir. Semua menghormati pengaturan *kurangi gerakan* di perangkat.
- **PWA**: bisa dipasang di layar utama dan dibuka offline.

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

## Menjalankan secara lokal

Tidak ada dependensi yang perlu dipasang (hanya Node.js 20+).

```bash
npm run dev        # http://localhost:5173 — halaman + API, akun disimpan di memori
npm test           # unit test, uji API, dan uji Redis (bila redis-server terpasang)
```

Untuk mencoba dengan Upstash sungguhan secara lokal, set `KV_REST_API_URL` dan `KV_REST_API_TOKEN` sebelum `npm run dev`. Membuka `index.html` langsung dari berkas juga bisa (mode lokal, tanpa akun).

## Struktur

```
index.html              kerangka halaman
css/styles.css          seluruh gaya, token warna terang/gelap, animasi
js/core/date.js         tanggal Indonesia, pasaran Jawa, Hijriah, pekan ISO
js/core/logic.js        logika murni: tambah cepat, pengulangan, streak, linimasa,
                        kapasitas & jadwal otomatis, analitik statistik, berbagi
js/core/prayer.js       perhitungan waktu sholat + 45 kota
js/core/syncmap.js      pemetaan status ⇄ entri sinkronisasi
js/store.js             status aplikasi + localStorage + aksi
js/morph.js             DOM morphing (render tanpa kedip, animasi masuk/keluar)
js/sync.js              klien sinkronisasi (antrean offline, polling adaptif)
js/account.js           dialog akun, pasangkan perangkat (kode + QR)
js/ritual.js            ritual Rencanakan/Tutup hari, atur otomatis
js/ambient.js           suara latar fokus (Web Audio)
js/ui.js, components.js ikon, dialog, toast, konfeti, editor tugas, palet perintah
js/views/*.js           satu berkas per halaman
js/vendor/qrcode.js     pembuat QR (qrcode-generator, MIT, © Kazuhiko Arase)
api/*.js                fungsi serverless Vercel: register, login, logout, me, pair, sync, account, health
api/_lib/               HTTP, penyimpanan (Upstash REST + memori), auth, sinkronisasi
scripts/dev-server.js   server lokal yang meniru Vercel (termasuk header dari vercel.json)
tests/                  unit test, uji API, uji Redis sungguhan
```

Catatan akurasi: waktu sholat memakai Subuh 20°, Isya 18°, Ashar Syafi'i, ihtiyath 2 menit, Imsak 10 menit sebelum Subuh; hasilnya perkiraan dan bisa selisih 1–2 menit dari jadwal resmi Kemenag. Tanggal Hijriah memakai kalender Umm al-Qura bawaan browser, bisa berbeda satu hari dari penetapan resmi. Hari pasaran dihitung dari acuan 17 Agustus 1945 = Jumat Legi.
