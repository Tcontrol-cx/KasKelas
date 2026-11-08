# KasKelas — Neon edition

KasKelas mencatat iuran dan transaksi per bulan, lalu menyimpan data kelas, siswa, pembayaran, dan rekap di Neon Postgres. Browser tidak menjadi database. Aplikasi memakai Neon Function API untuk membaca dan menulis data; kredensial Postgres tidak dikirim ke halaman web.

## Berkas penting

- `index.html` dan `Uang Kas Kelas.html`: aplikasi web.
- `js/neon-config.js`: URL publik Neon Function API. Isi setelah function berhasil di-deploy.
- `js/db.js`: adapter HTTP Neon; pembaruan kelas diperbarui dengan polling.
- `neon/001_schema.sql`: tabel dan skema Neon.
- `functions/kas-api.ts`: API Neon untuk data, autentikasi, migrasi, dan izin akses.
- `neon.ts`: konfigurasi deployment Neon Function.

## Menyiapkan Neon

1. Buat project Neon dan pilih branch yang akan digunakan.
2. Di Neon SQL Editor, jalankan seluruh isi `neon/001_schema.sql`.
3. Install Node.js, lalu jalankan `npm install` dari folder project.
4. Login dan hubungkan folder ini ke project Neon dengan Neon CLI: `npx neon@latest auth`, lalu `npx neon@latest link`. Pilih project dan branch yang sama dengan tempat Anda menjalankan SQL.
5. Salin `.env.example` menjadi `.env.local` (jangan commit berkas ini), lalu isi `APP_ORIGIN` dan buat `OWNER_SETUP_TOKEN` acak yang panjang. Untuk mencoba sebelum hosting, jalankan website pada server lokal, misalnya `http://localhost:5500`; jangan buka HTML langsung sebagai `file://`.

   ```text
   APP_ORIGIN=http://localhost:5500,http://127.0.0.1:5500
   OWNER_SETUP_TOKEN=ganti-dengan-kunci-acak-panjang-minimal-32-karakter
   ```

   Pisahkan beberapa origin dengan koma. Neon menyediakan `DATABASE_URL` ke Function saat berjalan. `APP_ORIGIN` harus sama persis dengan alamat hosting website.

6. Terapkan konfigurasi Neon dengan `sud`, lalu deploy Function beserta dua variabel lingkungan aplikasinya. Di PowerShell:

   ```powershell
   $vars = @{}
   Get-Content .env.local | ForEach-Object { if ($_ -match '^\s*([^#=\s]+)=(.*)$') { $vars[$matches[1]] = $matches[2] } }
   npx neon functions deploy kasapi --src .\functions\kasapi.ts --env "APP_ORIGIN=$($vars['APP_ORIGIN'])" --env "OWNER_SETUP_TOKEN=$($vars['OWNER_SETUP_TOKEN'])" --wait
   ```

   Neon menyediakan `DATABASE_URL` ke Function secara otomatis. Jangan membagikan isi `.env.local`.
7. Salin URL HTTPS Function hasil deployment ke `API_URL` di `js/neon-config.js`.
8. Upload `index.html`, `Uang Kas Kelas.html`, `css/`, dan `js/` ke hosting statis seperti Netlify atau GitHub Pages. Neon menyimpan data dan menjalankan API; file tampilan tetap perlu di-host. Setelah hosting, ubah `APP_ORIGIN` ke alamat publik website lalu ulangi perintah deploy Function di atas.
9. Buka tab **Login Owner**. Pertama kali, masukkan `OWNER_SETUP_TOKEN` dan password Owner baru. Setelah itu, gunakan Login Owner biasa.

Jangan aktifkan akses publik langsung ke tabel `kaskelas`. Semua data aplikasi harus lewat Function agar izin Admin dan Owner diperiksa di server.

## Memindahkan data lama

Setelah API Neon terhubung dan Owner berhasil login:

- Jika data lama masih tersedia pada browser/file lokal yang sama, buka **Backup & Share → Pindahkan data browser lama ke Neon**. Data lokal baru dihapus setelah server menyatakan impor berhasil.
- Jika sudah memiliki file backup JSON, gunakan **Restore / Pulihkan Data**.

Migrasi mempertahankan dokumen dan pembayaran lama. Hash password Admin versi lama dipindahkan ke tabel privat, diverifikasi sekali, lalu ditingkatkan ke scrypt saat login berikutnya. Jika backup tidak membawa password Admin, atur password baru lewat **Ubah Kelas**.

Jika ada pembayaran atau transaksi yang sempat dicatat per pekan, data tetap dibaca dan digabungkan ke bulan sesuai tanggal awal pekan. Saat pembayaran diedit, catatan lama pekanan dinormalisasi menjadi satu catatan bulanan per siswa.

## Penyimpanan browser

Data aktif tidak ditulis ke `localStorage` atau `sessionStorage`. Token login hanya berada di memori selama tab terbuka. Pembacaan `localStorage` tersisa hanya pada tombol migrasi satu kali untuk mengirim data dari versi lama ke Neon, kemudian kunci lama dihapus setelah impor sukses.
