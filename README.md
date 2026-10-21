# Voting House — Literacy Day 2026

Halaman voting house untuk Literacy Day 2026 SMA Gunung Madu.
Front end di GitHub Pages, database di Google Sheet (lewat Google Apps Script).

| Halaman | Isi |
|---|---|
| `index.html` | Voting (siswa: 4 angka terakhir NIS, guru: kode `2026`). Setelah jam tutup, halaman ini otomatis menampilkan pemenang lalu rekap semua house beserta tipe display dan jumlah suaranya. |
| `admin.html` | Panel admin: kelola house (`Nama House - Tipe Display`), jam tutup, kode guru, dan pantau suara secara langsung. Tidak ada link di halaman utama. Cara membukanya: **ketuk logo SMA Gunung Madu di atas judul 5 kali dengan cepat**, atau buka `…/admin.html`. |

---

## 1. Siapkan Google Sheet + Apps Script (±10 menit)

1. Buat Google Sheet baru, misalnya **"Voting House LD 2026"**.
2. Buka menu **Ekstensi → Apps Script**.
3. Hapus isi `Code.gs` lalu tempel seluruh isi file [`apps-script/Code.gs`](apps-script/Code.gs).
4. Di baris paling atas, **ganti** `ADMIN_PASSWORD` dengan password admin kalian sendiri. Lalu simpan (Ctrl+S).
5. Pilih fungsi **`setup`** di toolbar lalu klik **Jalankan**. Berikan izin saat diminta
   (*Advanced → Go to … (unsafe) → Allow*, karena script ini buatan sendiri).
   Sheet `Houses`, `Votes`, `Settings`, dan `NIS` akan dibuat otomatis.
6. Klik **Terapkan (Deploy) → Deployment baru**:
   - Jenis: **Aplikasi web (Web app)**
   - Jalankan sebagai: **Saya (Me)**
   - Yang memiliki akses: **Siapa saja (Anyone)**
7. Klik **Terapkan**, lalu salin **URL aplikasi web** (berakhiran `/exec`).

> Kalau nanti `Code.gs` diubah, pakai **Terapkan → Kelola deployment → ✏️ Edit → Versi: Versi baru** supaya URL-nya tetap sama.

## 2. Hubungkan halaman ke Google Sheet

Buka [`assets/config.js`](assets/config.js), lalu isi `API_URL`:

```js
API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
```

Selama `API_URL` masih kosong, halaman berjalan dalam **MODE DEMO** (ada pita oranye di atas; data hanya tersimpan di browser, password admin demo: `admin`).

## 3. Publikasikan ke GitHub Pages

1. Buat repository baru di GitHub, lalu upload semua file di folder ini (`index.html`, `admin.html`, folder `assets/`, dan file lainnya).
2. Buka **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)** → **Save**.
3. Tunggu 1–2 menit. Halaman akan tersedia di `https://<username>.github.io/<nama-repo>/`.

## 4. Sebelum voting dibuka

1. Buka panel admin, lalu masuk dengan password yang dipasang di langkah 1.4.
2. **Kelola House**: isi nama dan tipe display tiap house, atau tempel sekaligus satu per baris:
   ```
   Enggang - Rumah Panjang Dayak
   Siger - Kain Tapis Lampung
   ```
   Lalu tekan **Simpan Daftar House**.
3. **Pengaturan**: pastikan *Voting ditutup pada* = **22/10/2026 14:00** (WIB) dan kode guru = `2026`.
4. Coba sekali dari HP, lalu tekan **Reset status voting perangkat ini** di panel admin, dan hapus baris uji coba di sheet `Votes`.

## Cara kerja & batasan

- **Satu perangkat, satu suara.** Setelah memilih, tanda tersimpan di browser (localStorage + cookie), sehingga halaman menampilkan "Terima kasih" dan tidak bisa memilih lagi.
  Catatan: tanda ini bisa dihindari dengan mode penyamaran atau browser lain. Untuk memperketat:
  - Isi sheet **`NIS`** dengan daftar NIS siswa (lengkap atau 4 digit terakhir, satu per baris). Hanya 4 digit terakhir yang terdaftar boleh memilih.
  - Centang **"Satu NIS hanya boleh memilih sekali"** di panel admin. **Hanya aktifkan jika 4 digit terakhir NIS di sekolah tidak ada yang sama** (misalnya NIS kelas X dan XI bisa sama-sama berakhiran `0001`).
- **Jam tutup ditentukan server** (jam Google, bukan jam HP). Suara yang masuk setelah jam tutup ditolak, dan hasil baru bisa diakses publik setelah jam tutup.
- **Transparansi:** sheet `Votes` mencatat setiap suara (waktu, peran, 4 digit NIS, house, ID perangkat).
- Mengganti nama house di admin **tidak** menghapus suaranya (suara terhubung ke ID house). Menghapus house yang sudah punya suara akan mengeluarkannya dari hitungan, dan admin akan diminta konfirmasi dulu.
- Ada **seri**? Halaman hasil menampilkan semua pemenang bersama.

## Struktur file

```
index.html          halaman voting + hasil
admin.html          panel admin (tersembunyi)
assets/config.js    URL Apps Script
assets/api.js       komunikasi ke server (+ mode demo)
assets/app.js       logika halaman voting
assets/admin.js     logika panel admin
assets/ornament.js  ornamen spiral bergaya banner
assets/style.css    tema & tampilan responsif (font Smythe + Poppins)
assets/logo-sma-gunung-madu.webp  logo sekolah
apps-script/Code.gs backend Google Sheet (tempel ke Apps Script, tidak dipakai GitHub Pages)
```
