# Auto Audit Interview Scheduler

Aplikasi Next.js + TypeScript, HeroUI 2, Tailwind 3, PostgreSQL 17, `pg`, Zod. Satu aplikasi, satu pool maksimum 8 koneksi. UI bahasa Indonesia. Online di **https://calendar.dbautoaudit.stream**, origin lokal **http://127.0.0.1:3210**, proses PM2 **auto-audit-interview**.

## Akses pertama

Akun Super Admin aktif: `admin@autoaudit.id`. Gunakan password yang telah Anda tetapkan; password tidak disimpan di repository. Tautan aktivasi awal telah dicabut. Untuk instalasi baru tanpa Super Admin, `npm run bootstrap -- email@company.com` membuat tautan aktivasi sekali pakai.

## Domain publik (9 Oktober 2026)

Cloudflare Tunnel `n8n-autoaudit` (`38fea61a-4782-426a-9b4b-bc475943a938`) meneruskan `calendar.dbautoaudit.stream` ke `http://127.0.0.1:3210`. DNS CNAME dibuat oleh dashboard Cloudflare. Lima rute sebelumnya tidak diubah. `.env` menggunakan `APP_URL=https://calendar.dbautoaudit.stream` dan `COOKIE_SECURE=true`. Browser menggunakan HTTPS; cookie sesi Secure, HttpOnly, SameSite=Lax. Proxy aplikasi mengarahkan HTTP pada hostname publik ke HTTPS, tanpa mengubah health check loopback. Komputer, PM2, cloudflared-n8n.service, dan koneksi internet harus aktif. SMTP belum dikonfigurasi.

## Instalasi

1. Node.js 22+, Docker dengan PostgreSQL 17 existing, PM2.
2. `npm ci`.
3. Buat database dan role khusus. Pada mesin ini `node scripts/provision.mjs` sudah dijalankan satu kali. Script menolak menimpa `.env`; jangan menjalankan ulang.
4. Salin `.env.example` menjadi `.env` hanya untuk instalasi baru, isi credential sendiri, `chmod 600 .env`. Jangan commit secret.
5. `npm run migrate`, `npm run bootstrap -- email@company.com`, `npm test`, `npm run build`.
6. `/home/oem/.npm-global/bin/pm2 start ecosystem.config.cjs`, lalu `pm2 save`.

Database: `auto_audit_interview`, role non-superuser `auto_audit_interview`, host `127.0.0.1:5432`, container existing `pgvector-db`. Tidak memakai tabel aplikasi lain. Migration SQL bernomor ada di `migrations/`; migration runner menyimpan ledger `schema_migrations` dan menjalankan transaksi.

File logo persisten: `/home/oem/.local/share/auto-audit-interview/uploads`. Logo diproses ulang menjadi WebP, isi file diperiksa, maksimum 2 MB dan 16 juta piksel. File served melalui `/api/assets/:filename`, bukan path komputer. Batas upload dapat diperkecil pengelola.

## Panduan pengelola dan admin company

1. Login → Companies → Company baru. Pengelola pembuat otomatis menjadi Owner awal agar company tidak tanpa Owner.
2. Buka company → Anggota company → Undang pengguna. Pilih Company Owner untuk pengelola pertama. Bagikan tautan aktivasi secara privat. Pengiriman email otomatis tidak diaktifkan. Pengguna existing mendapat membership baru tanpa reset password.
3. Role & izin: gunakan role awal atau buat role khusus. Pengguna tidak dapat memberikan hak di atas kewenangannya. Role Owner tidak dapat diedit; minimal satu Owner aktif wajib dipertahankan.
4. Gelombang interview → Gelombang baru. Isi slug, lokasi, zona waktu, periode pendaftaran. Form builder menambahkan pertanyaan dengan ID tetap. Tab preview tersedia dalam ukuran desktop/mobile. Simpan sebagai draft sampai siap.
5. Kelola jadwal: tambah satu slot atau buat rentang tanggal dan interval, cek preview, lalu simpan. Setiap slot punya kuota sendiri. Slot identik ditolak. Jadwal yang sudah memiliki peserta tidak dapat dipindah waktunya langsung; pindahkan peserta melalui detail booking.
6. Branding: upload logo, atur warna dan teks, preview, simpan. Warna utama harus memenuhi kontras putih 4.5:1. Footer Auto Audit tidak dapat dikonfigurasi atau dihapus oleh company.
7. Halaman sukses: atur judul, pesan, nomor/template atau link `https://wa.me/...`. Gelombang dapat override. WhatsApp hanya dibuka setelah klik; tidak mengirim otomatis.
8. Ubah gelombang menjadi Published, lalu salin link `/b/company-slug/campaign-slug`.
9. Peserta: cari nama/email/telepon/kode; buka detail untuk jawaban historis, hadir/tidak hadir, batal, atau pindah sesi. CSV dilindungi izin dan formula injection. Daftar/ekspor saat ini maksimum 5.000 baris per pencarian.
10. Menonaktifkan/mengarsipkan company menghentikan booking baru; booking lama tidak dibatalkan. Reset akses global hanya Super Admin karena akun bisa menjadi anggota banyak company.

## Keamanan dan transaksi

Cookie HttpOnly, SameSite=Lax, sesi satu hari; cookie Secure wajib untuk domain HTTPS. Password menggunakan scrypt dengan salt acak. Password tidak dapat dilihat. Session dicabut pada reset atau nonaktif global; perubahan membership berlaku pada permintaan berikutnya. POST memeriksa Origin terhadap APP_URL. Akses lokal `http://localhost:3210` dan `http://127.0.0.1:3210` juga diizinkan hanya jika Host permintaan persis sesuai origin lokal tersebut; origin lokal tidak diterima pada hostname publik. Database memeriksa FK tenant gabungan. Semua API company memverifikasi membership dan izin.

Booking mengunci company lalu gelombang dan slot dalam transaksi. Ketersediaan dihitung dari booking non-cancelled yang committed; tidak ada counter terpisah yang bisa melenceng. Cancel berulang tidak menambah kursi lebih dari sekali. Pemindahan slot dan rollback atomik. Unique partial index menjaga satu email aktif per gelombang; email lowercase. Idempotency menyimpan fingerprint permintaan; retry identik mengembalikan token booking yang sama bahkan jika company kemudian ditutup.

Jawaban menyimpan label dan konfigurasi field ketika submit, serta referensi form_versions. Token sukses acak 256 bit, kode booking acak 64 bit. Token adalah akses baca ke detail konfirmasi: bagikan hanya kepada peserta. Endpoint publik tidak mengembalikan daftar peserta. Akses data peserta oleh Super Admin dicatat. Audit tidak mencatat password, token, atau isi jawaban.

Rate limit persisten PostgreSQL: login per email 15/15 menit, global login 300/15 menit, booking global 3.000/15 menit, lookup token 1.000/15 menit. `ponytail:` batas global sesuai deployment satu instance lokal; sebelum trafik publik besar gunakan IP dari reverse proxy terpercaya dan kebijakan per-company. Jangan mempercayai X-Forwarded-For langsung dari internet. Tidak ada penjadwalan pewawancara individual.

## Permission dan endpoint

Daftar permission lengkap di `lib/schema.ts` (`permissions`). Role Owner mendapat seluruh izin company, tidak mendapat Super Admin. Backend menolak ID lintas tenant walaupun diketahui pengguna.

| Endpoint | Fungsi / izin |
|---|---|
| GET `/api/health/live`, `/api/health/ready` | Kesehatan proses / koneksi DB |
| GET `/api/auth/me` | Sesi dan daftar company yang dapat diakses |
| POST `/api/auth/login`, `/logout`, `/activate` | Akses internal |
| GET/POST `/api/platform/companies[/:id]` | CRUD lunak company; Super Admin |
| GET/POST `/api/platform/users` | List pengguna / undang Super Admin |
| POST `/api/platform/user/:id` | Reset, enable, disable pengguna |
| GET `/api/platform/overview`, `/audit` | Ringkasan dan audit |
| GET/POST `/api/platform/settings` | Nama platform, kontak, catatan email, batas upload |
| GET `/api/companies/:cid` | Company aktif dan izin user |
| GET `/api/companies/:cid/overview`, `/audit` | Ringkasan / audit.read |
| GET/POST `/api/companies/:cid/roles[/:id]`; DELETE role | roles.read/create/update/delete |
| GET/POST `/api/companies/:cid/members[/:id]` | members.read/invite/update; nonaktif juga members.remove |
| GET/POST `/api/companies/:cid/campaigns[/:id]` | campaigns.read/create/update; publish/archive terpisah |
| GET `/api/companies/:cid/slots?campaign=uuid` | slots.read |
| POST `/api/companies/:cid/slots[/:id]` | slots.create/update/cancel |
| GET `/api/companies/:cid/bookings?q=text[&export=1]` | bookings.read/export |
| POST `/api/companies/:cid/bookings/:id` | bookings.update/cancel |
| GET/POST `/api/companies/:cid/branding`, `/settings` | branding.read/update; settings.read/update |
| POST `/api/companies/:cid/logo` | branding.update, multipart file |
| GET/POST `/api/public/:company/:campaign` | Data published / submit booking |
| GET `/api/success/:token` | Konfirmasi privat via token acak |

POST update memakai ID pada path. Seluruh request/response JSON kecuali upload dan ekspor. `lib/schema.ts` mendefinisikan schema payload. Company-owned rows selalu memiliki company_id. Form fields, answers, branding dan success disimpan JSONB untuk menghindari tabel yang tidak perlu, dengan versi/constraint relasional.

## Operasi, update, rollback

Startup service existing `pm2-oem.service` telah terpasang dan enabled; tidak diubah. Jangan gunakan `pm2 restart all` / `pm2 delete all`. Konfigurasi aplikasi mengikat **127.0.0.1:3210** supaya tidak terbuka tanpa HTTPS.

- Readiness: `curl http://localhost:3210/api/health/ready`.
- Log: `pm2 logs auto-audit-interview --lines 50` (jangan bagikan data sensitif).
- Restart hanya aplikasi ini: `pm2 restart auto-audit-interview --update-env`.
- Rotasi log: timer user `auto-audit-interview-logrotate.timer`, 14 arsip harian / maksimum 10 MB, hanya log aplikasi ini. Timer memakai `scripts/logrotate.conf`.
- Update: backup terlebih dahulu → `npm ci` → `npm run migrate` → `npm test` → `npm run build` → restart hanya aplikasi ini → readiness dan uji booking. Build dalam folder rilis terpisah direkomendasikan ketika sudah menerima trafik publik.
- Rollback aplikasi: kembalikan source + lockfile rilis sebelumnya, `npm ci`, build, restart proses ini. Migration destruktif harus dirancang terpisah dan tidak otomatis dibalik. Untuk rollback data, restore backup ke database baru, verifikasi, lalu ganti DATABASE_URL dan restart; jangan overwrite database aktif tanpa persetujuan pemilik data.

Untuk akses internet, pasang reverse proxy HTTPS pada domain yang Anda kelola menuju `127.0.0.1:3210`, ubah APP_URL ke origin domain dan COOKIE_SECURE=true, restart. Jangan membuka port langsung. Domain dan TLS sudah aktif melalui tunnel di atas; SMTP belum dikonfigurasi.

## Backup dan restore

`node --env-file=.env scripts/backup.mjs` membuat dump PostgreSQL format custom serta arsip upload di `/home/oem/.local/share/auto-audit-interview/backups/<timestamp>`. Hak akses owner-only; backup memuat data pribadi. Salin ke media terpisah sesuai kebijakan perusahaan. `.env` tidak masuk backup; simpan credential secara terpisah.

`node scripts/restore-check.mjs /path/database.dump` membuat database uji sementara, restore menggunakan role terbatas, memeriksa tabel, lalu menghapus hanya database uji yang dibuatnya.

Restore nyata: buat database **baru** owner role aplikasi, `pg_restore --no-owner --no-acl --exit-on-error` ke database baru dengan user berwenang; ekstrak uploads.tar.gz ke direktori persisten baru; ubah DATABASE_URL dan UPLOAD_DIR; jalankan readiness serta uji login/booking. Setelah diverifikasi, tentukan cutover. Script restore-check tidak menyentuh database aktif.

## Pengujian dan aset

`npm test`: pengujian PostgreSQL nyata dengan data sementara yang dibersihkan setelah selesai. Meliputi concurrency, idempotency, isolasi tenant, custom role, quota, cancel, move, form version, WhatsApp dan CSRF origin. `npm run typecheck` dan `npm run build` memeriksa TypeScript/production build. Hasil aktual dicatat di `TEST-RESULTS.md`.

Logo Auto Audit berasal dari file yang diberikan user. Animasi lokal `public/pulse.json` dibuat khusus untuk aplikasi (MIT), lazy-loaded oleh `@lottiefiles/dotlottie-react`, menghormati reduced motion dan mempunyai ikon statis. Shine Border dari Magic UI, MIT, lisensi di `public/MAGICUI-LICENSE.txt`. Dokumentasi referensi: https://heroui.com/en/docs/react/getting-started/frameworks dan https://magicui.design/docs/components/shine-border.

Di luar v1 sesuai brief: integrasi kalender, upload CV, pembagian pewawancara, dan pengiriman WhatsApp otomatis. Email otomatis belum diaktifkan; undangan manual berfungsi tanpa SMTP.

Catatan audit dependensi: masih ada advisory braces pada rantai build Tailwind 3; hanya pola konfigurasi lokal yang digunakan. Detail risiko, pengujian yang belum dilakukan, dan versi paket yang diperbarui ada di `TEST-RESULTS.md`.
