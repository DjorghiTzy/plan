# Data wilayah

`desa.txt.gz`: 83.449 desa/kelurahan Indonesia, satu baris per desa:
`<kode wilayah tingkat IV tanpa titik> <lintang × 10⁴> <bujur × 10⁴>` (mis. `1971011004 -21315 1061282`
= 19.71.01.1004, Semabung Lama, Kota Pangkal Pinang). Dipakai untuk mencari desa terdekat dari lokasi
pengguna, lalu kodenya dipakai untuk prakiraan cuaca BMKG (`api.bmkg.go.id/publik/prakiraan-cuaca?adm4=…`).

Sumber: paket npm [geografis](https://github.com/drizki/geografis) 1.3.2 (lisensi MIT, © drizki),
kolom `code`, `latitude`, `longitude`, dibulatkan ke 4 desimal (±11 m).
