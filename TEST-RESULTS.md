# Hasil pengujian — 8 Oktober 2026

## Pembaruan deployment — 9 Oktober 2026

- Domain publik `https://calendar.dbautoaudit.stream` aktif melalui tunnel `n8n-autoaudit`; DNS CNAME dan rute dibuat melalui browser Brave-Marketing. Lima rute lama dipertahankan.
- HTTPS `/api/health/ready` mengembalikan HTTP 200 dan `status: ready`. HTTP dialihkan 308 ke HTTPS.
- Login Super Admin di browser melalui domain publik berhasil. Cookie Secure + HttpOnly + SameSite=Lax diverifikasi; sesi uji diakhiri melalui logout.
- `APP_URL` menggunakan domain publik dan `COOKIE_SECURE=true`; `.env` tidak masuk Git. Origin lokal tetap loopback.
- 12/12 tes otomatis lulus, termasuk redirect HTTPS dan preservasi health check lokal. Build produksi lulus; hanya proses PM2 aplikasi kalender yang direstart.
- Screenshot: `docs/cloudflare-calendar-route.png` dan `docs/calendar-online-dashboard.png`.
- SMTP belum dikonfigurasi. Password admin yang diminta pengguna tidak diubah dan masih sederhana; ganti untuk mengurangi risiko akses publik.

Catatan di bawah merupakan hasil baseline 8 Oktober sebelum publikasi domain.

Lingkungan: Node 22.23.3, Next 16.4.0 production, PostgreSQL 17.11 pada pgvector-db, database khusus auto_audit_interview, PM2 auto-audit-interview, localhost:3210.

## Otomatis: 11/11 lulus

Perintah: `npm test` (PostgreSQL nyata, data test sementara dibersihkan).

- Isolasi company: membership Company A tidak dapat membaca Company B, HTTP 403.
- Viewer tidak dapat membuat slot, HTTP 403.
- 50 submit bersamaan pada kuota 10: **tepat 10 berhasil**, 40 ditolak; jumlah row aktif 10.
- Slot kedua kuota 1 tetap independen. Submit ganda dan retry setelah respons hilang mengembalikan token sama; perubahan payload dengan key lama ditolak.
- Move ke slot penuh ditolak, slot booking awal tetap sama. Cancel dua kali hanya menurunkan alokasi sekali.
- Company inactive dan campaign closed menolak submit dari form lama.
- Penurunan kuota di bawah booking aktif ditolak, HTTP 409.
- Form versi 2 dibuat; booking lama tetap memiliki label dan versi 1.
- Custom role berlaku, eskalasi permission ditolak, penonaktifan Owner terakhir ditolak.
- Host WhatsApp palsu dan javascript URL ditolak, template di-encode, sukses menggunakan konfigurasi company aktif; data peserta tidak ada di endpoint publik.
- Warna dengan kontras rendah ditolak; Origin tidak terpercaya ditolak.
- 12 update gelombang serentak selesai tanpa menghabiskan connection pool.

## HTTP produksi: lulus

`node --env-file=.env scripts/http-check.mjs` dengan fixture sintetis:

- Upload PNG asli → WebP lokal → dapat diambil melalui URL aplikasi.
- File teks berkedok PNG ditolak (400).
- Warna, judul dan logo tersimpan serta muncul pada endpoint publik.
- Satu booking tetap tersimpan setelah `pm2 restart auto-audit-interview`; kuota 20 tersisa 19.
- CSV berisi peserta uji; endpoint tanpa login ditolak (401).
- Akses peserta oleh Super Admin tercatat di audit.

## Browser: lulus

Browser in-app pada build produksi:

- Login akun QA, dashboard platform, pergantian company, daftar gelombang dan editor form dapat dibuka.
- Flow tanggal → sesi → data sintetis + jawaban wajib → ringkasan → Daftar Interview → konfirmasi berhasil.
- Konfirmasi menampilkan kode booking dan tombol WhatsApp. Pesan WhatsApp tidak dikirim; tombol eksternal tidak diklik.
- Branding yang diperbarui muncul di publik; slot menampilkan 19 dan 10 kursi sesuai kapasitas masing-masing.
- Tampilan mobile lebar 390 px: scrollWidth 375 px, tidak ada scroll horizontal.
- Screenshot bukti: `docs/booking-preview.jpg` (data sintetis, bukan data company pengguna).
- Reduced motion dan fallback statis diimplementasikan; kegagalan jaringan player tidak disimulasikan secara khusus. Player WASM dan animasi disimpan lokal.

## Deployment dan recovery: lulus

- Build produksi dan TypeScript lulus.
- PM2 online; readiness mengembalikan `{"status":"ready"}`. Port 3210 hanya loopback.
- Restart diuji dan tidak menghilangkan booking.
- Startup PM2 existing enabled, tidak diubah. Proses aplikasi lain tetap berjalan dengan PID awal yang sama.
- Timer rotasi log khusus aplikasi enabled; service rotasi dijalankan berhasil.
- Backup PostgreSQL dipulihkan ke database sementara terpisah. Hasil: 2 users, 1 company, 1 booking, 1 migration, 1 settings row. Arsip upload diekstrak dan 1 logo yang direferensikan diverifikasi. Database/direktori restore sementara dihapus setelah pengujian.
- Data QA dibersihkan setelah pemeriksaan. Instalasi diserahkan dengan akun Super Admin yang belum memiliki password; gunakan tautan aktivasi lokal.

## Batas dan temuan yang belum ditutup

- Deployment internet, DNS, reverse proxy HTTPS, SMTP dan pengiriman pesan WhatsApp tidak diuji/diaktifkan. Aplikasi hanya mendengarkan loopback. Aktifkan HTTPS dan cookie Secure sebelum akses publik.
- `npm audit --omit=dev` masih melaporkan 5 entri high terkait **braces** dan rantai Tailwind 3 (satu sumber advisory, GHSA-vfj7-8cjw-p6xm). Braces belum memiliki patch; pola glob pada aplikasi ini berasal dari konfigurasi build, bukan input visitor. Jangan membangun source/config dari pihak tidak dipercaya. Migrasi Tailwind 4 perlu verifikasi kompatibilitas HeroUI tersendiri.
- Sharp diperbarui ke 0.35.5; PostCSS 8.5.29, selector parser 7.1.6, esbuild 0.28.2. Temuan audit paket tersebut terselesaikan.
- Uji concurrency merupakan 50 request paralel pada satu instance lokal; belum stress/load test jangka panjang atau audit keamanan eksternal.
- Daftar dan CSV dibatasi 5.000 hasil per pencarian; belum pagination server untuk volume besar.
