# Footer watermark and Forms deployment — 10 October 2026

- Super Admin can set each company's footer to the default, hidden, or custom text and image with adjustable sizes. 37/37 integration tests passed; the new test confirms a Company Owner gets 403, invalid image URLs and sizes are rejected, and saving company branding does not overwrite the footer.
- Browser check on the development port with a temporary Super Admin and company: the dialog, custom text, image upload, live preview, and save worked. The footer was not viewed on a public page in the browser, and the hidden mode was not exercised there.
- Deployed: backup at `/home/oem/.local/share/auto-audit-interview/backups/2026-10-10T01-38-10-326Z`, migration `005_form_permissions.sql` applied, production build, PM2 `auto-audit-interview` restarted. Local and public HTTPS readiness returned 200. Temporary test data was removed.

---

# Forms feature — 10 October 2026

Status: built and verified on a development port and on an isolated production build. **Not deployed.** The live process was not rebuilt or restarted; its build ID was the same before and after, and `/api/health/ready` returned `ready` throughout.

- **36/36 PostgreSQL integration tests passed** (27 existing, 9 new in `tests/forms.test.ts`). The new tests cover definition rules (backward jumps, unsafe button links, low-contrast button color, foreign image URLs), logic paths and endings, tenant isolation, role permissions, draft privacy, version tracking, duplicate links, partial saving and merging, eight concurrent first answers, submission validation with the failing question reported, double submission, replay, answers pruned to the visited path, closed forms and inactive companies, response listing, search, CSV export with formula escaping, deletion, and image upload re-encoding.
- `npm run typecheck` and `git diff --check` passed. `next build --webpack` passed in a copy of the project outside this directory, so the live `.next` output was not replaced.
- Browser checks used a temporary company with synthetic respondents on a development server (port 3211) and again on the isolated production build (port 3212). No console errors were logged on the production build.
- Builder at 1440 × 900: create from each tested template (event registration, blank, customer feedback, lead capture), add all 14 blocks by clicking, add a block by dragging it from the palette onto a row, reorder by dragging and with the keyboard (Space, Arrow, Space), row menu (duplicate, move up, delete), answer options (Enter adds, Backspace removes an empty option, pasting four lines creates three options and skips the blank one), block type change, welcome screen toggle, add / make default / delete ending, choosing a jump target for an answer, ending button with a link completed to `https://`, button icon, fill-out-again switch, banner upload, form link validation, save, publish with share dialog, leave-without-saving dialog, duplicate form.
- Builder at 375 × 812: Blocks, Edit, and Preview tabs; `scrollWidth` 375 = `clientWidth` 375.
- Public form at 375 × 812: `scrollWidth` 375 = `clientWidth` 375. Welcome with banner, text, phone, multiple choice, number, long text, dropdown, checkboxes, rating, opinion scale, and date were filled in. Invalid phone number and a number above the maximum showed their messages in Bahasa Indonesia.
- Saving before submission: after typing a name and waiting, without pressing Next, the database held one `partial` response with that answer. Reloading restored the answers at the same question with the welcome-back notice. Submitting turned the same row into `completed` (one row, not two) with the phone number normalized. Answering "Tidak" skipped the remaining questions and stored the second ending.
- Public form at 1440 × 900 with the keyboard only: Enter started the form, answer fields were focused automatically, and the letter shortcut chose an answer and reached the matching ending.
- Responses: totals and completion rate, Partial/Completed badges, details with "Stopped at" and "Ending shown", hold-to-delete, and CSV export content.
- A role limited to `forms.read`, `forms.update`, and `responses.read` saw only Overview and Forms, had no New form, Duplicate, Export, or delete controls, and opened a published form as View only.
- A database and uploads backup was made before the migration at `/home/oem/.local/share/auto-audit-interview/backups/2026-10-09T17-20-45-883Z`.
- Migration `004_forms.sql` (two new tables) was applied. Migration `005_form_permissions.sql` was **not** applied: it adds form permissions to existing roles, and the currently running build rejects role edits that contain permissions it does not know. It was run inside a transaction and rolled back to confirm its result (Booking Manager +4, Company Admin +8, Company Owner +8, Viewer +2). Apply it with `npm run migrate` during deployment, immediately before the build and restart.
- All temporary companies, users, sessions, forms, responses, audit rows, and uploaded files were removed. Afterwards: 0 forms, 0 responses, 1 company, 0 test users, 0 uploaded files.
- Screenshots (synthetic data, development build): `docs/forms-builder.jpg`, `docs/forms-welcome-mobile.jpg`, `docs/forms-ending-mobile.jpg`, `docs/forms-responses.jpg`.

Not covered: real phones and touch dragging (checked only with an emulated viewport and mouse or keyboard input), screen readers, load testing of answer saving, the Super Admin "Login as company" path into Forms, and, in the browser, changing the button color, background, or logo mode, the ending image upload, and the closed-form page (the closed state is covered by the integration tests).

---

# Calendar and company onboarding update — 9 October 2026

- **19/19 PostgreSQL integration tests passed** after the final changes. The new tests cover simple eight-character passwords, matching confirmation, pending and rejected login restrictions, case-insensitive email uniqueness, normalized phone uniqueness, concurrent registrations, approval/rejection, scoped login-as sessions, direct password reset, and legacy Company Owner setup.
- Existing booking capacity, idempotency, role, tenant isolation, form version, and request-origin tests continue to pass.
- `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- Built-in interface text, validation messages, HTML language, and date formatting use English. Calendar and booking terminology replaces interview-specific interface copy. Legacy database identifiers and message-template variables remain compatible.
- Browser inspection confirmed a centered login card with email and password, mobile registration fields, company management and pending review menus, direct reset controls, and login-as/return-to-Super-Admin navigation.
- A synthetic customer booking was completed in the browser through date, time, customer details, review, and successful confirmation. The mobile review kept the selected time visible.
- At a 390 × 844 viewport, customer booking, confirmation, and registration had `clientWidth=375` and `scrollWidth=375`: no horizontal overflow.
- React Bits Micro LatticeLoader and HoldButton are included locally with the upstream license. Reduced-motion styling disables decorative animation.
- Imagegen produced the transparent Auto Audit PNG. Image metadata confirmed four channels and non-opaque alpha with values from 0 to 255. The logo rendered on the application background without a white rectangle.
- A database/uploads backup was made before migrations at `/home/oem/.local/share/auto-audit-interview/backups/2026-10-09T13-05-50-787Z`.
- Migrations 002 and 003 were applied. Only PM2 process `auto-audit-interview` was restarted. Both local and public HTTPS readiness returned HTTP 200 and `status: ready` after startup.
- The public registration page has English HTML metadata and the Calendar & Booking title.
- Temporary UI test accounts, companies, booking, roles, sessions, and audit records were removed. Existing company data was preserved.
- Screenshots: `docs/login-updated.jpg`, `docs/registration-mobile-updated.jpg`. Logo prompt: `docs/logo-edit.txt`.

The following entries are historical baseline results and retain their original wording.

---

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

## Perbaikan origin localhost — 9 Oktober 2026

Form pembuatan gelombang masih terbuka di `http://localhost:3210`, sedangkan APP_URL sudah menggunakan domain publik. Pemeriksaan origin kini menerima localhost/127.0.0.1 pada port 3210 hanya jika Host cocok persis; origin lokal tetap ditolak pada domain publik. 13/13 tes lulus, termasuk membuat gelombang dari kedua origin lokal serta penolakan situs asing, port berbeda, hostname palsu, dan origin null. Build produksi lulus dan proses PM2 direstart. Pemeriksaan HTTP live membuktikan origin sah lolos ke pemeriksaan login (401 tanpa sesi) sedangkan origin tidak sah tetap 403. Readiness HTTPS 200. Form pengguna tidak disubmit atau direload.

## Booking confirmation recovery — 9 October 2026

- Fixed Edit details remaining clickable during confirmation, errors hidden above the review, and requests waiting indefinitely. Submission now has a 20-second timeout, inline focused errors, and explicit pending/failed/uncertain/confirmed states.
- Edit details stays disabled while submitting and after errors. A definite rejection offers Return to details with a warning before resetting the attempt; an unknown outcome requires checking the same request first.
- Leaving through the brand link requires confirmation. Reload/Back/close registers a native beforeunload warning. Interrupted attempts restore from tab session storage with the original details and idempotency key.
- 26 tests passed together; an additional interrupted-attempt restoration test passed in the focused 8-test submission suite (27 tests in total). TypeScript and production build passed.
- Production browser test at 390 × 844: delayed POST disabled both buttons; injected 409 displayed its error on review and disabled Edit details; Return to details and Leave this booking dialogs appeared. CDP recorded native beforeunload opening and cancellation on reload.
- Actual disposable booking was committed (HTTP 200), then its response was deliberately interrupted. UI showed Booking status not verified, disabled Edit details, and offered Check & retry booking. Leaving/reopening restored the same attempt. Retry opened the successful confirmation; database count remained exactly one booking before and after retry.
- Screenshots: docs/booking-error-mobile.jpg and docs/booking-confirmed-mobile.jpg. Synthetic fixture was removed after testing. Existing customer data was not edited.
- PM2 application restarted with the new production build; public HTTPS login returned 200. These findings establish UI/recovery defects; the exact server response for the customer's earlier attempt was not available in application error logs.

## Flexible calendar fields and automatic links — 10 October 2026

- Calendar standard fields (full name, email, phone) remain enabled and required by default. Owners can independently hide each field or mark it optional in Form builder; preview and public booking match the saved configuration. Existing calendars retain their previous defaults.
- Server validates enabled required fields, validates optional values when supplied, and discards disabled contact values. Multiple bookings with no email are accepted; provided active email addresses retain their duplicate protection. Migration 006 adds field settings and adjusts the partial unique index.
- Calendar and form links are generated from titles on the server, including collision suffixes. Ordinary create/update requests cannot choose or change slugs. Existing URLs remain stable when titles change. Company Super Admin has Manage links for specific calendar/form overrides with authorization checks and audit records.
- All 38 automated tests passed, including missing default fields, fully disabled contacts, optional contacts, multiple bookings without email, duplicate provided email, automatic/colliding slugs, stable URLs after renaming, and Super Admin-only link changes. Production build and TypeScript passed.
- Browser QA: owner editor no longer contains a slug input; default field toggles all start enabled/required. Hiding email/phone and making name optional updated the preview and persisted. Mobile public form at 390×844 showed only optional full name. Booking with no contact values completed successfully; database confirmed one booking with empty contacts.
- Super Admin Manage links modal successfully changed the synthetic calendar slug to qa-custom-booking and displayed Link updated. Temporary cookies, tabs, and synthetic company/user/bookings were removed after testing.
- Evidence screenshots: docs/calendar-standard-fields.jpg and docs/calendar-optional-mobile.jpg. Production PM2 restarted successfully and public HTTPS login returned 200.

## Configurable duplicate rejection — 13 October 2026

- Added Reject duplicate data to Calendar Form builder and Forms Settings. Owners choose fields, ANY/OR or ALL/AND matching, and a custom message (up to 1,000 characters). Calendar includes enabled standard contacts, booking date in calendar time zone, and supported scalar custom questions. Forms uses supported scalar answer questions, including email, phone, and date.
- Calendar defaults preserve previous email protection. Forms default to disabled protection. Empty values do not match; ALL requires nonempty values for every chosen field and compares them against the same previous submission. Email/text are compared after trim/lowercase, phone formatting and Indonesian local prefixes are normalized. Cancelled bookings and partial form responses are excluded.
- Checks run server-side inside company row transactions shared with settings changes, preventing two concurrent matching submissions from both completing. Existing successful submission IDs replay without counting as duplicates. Form completion reads the current saved settings inside that transaction.
- Migration 007 replaces the fixed unique email restriction with configurable transaction checks and lookup indexes. Backup saved before migration at /home/oem/.local/share/auto-audit-interview/backups/2026-10-13T13-52-17-086Z.
- All 40 tests passed; production build and TypeScript passed. New integration cases exercise AND/OR, configurable errors, phone/date normalization, disabled protection permitting repeated contacts, empty optional answers, concurrent duplicate submissions, cancellation/rebooking, replay, and invalid rule selection. A focused rerun of 14 calendar tests also verifies rejection by a custom date question across different booking dates.
- Production browser QA: settings available in both editors; custom Forms message saved through the UI. Mobile Calendar duplicate phone + booking date showed the configured rejection and disabled Edit details. Forms with a duplicate email and different date showed its newly saved custom message. Database remained at one booking and one completed form response after these rejected attempts; a draft response remains partial until successful submission by design.
- Evidence: docs/calendar-duplicate-settings.jpg, docs/form-duplicate-settings.jpg, docs/calendar-duplicate-error-mobile.jpg, docs/form-duplicate-error-mobile.jpg. Synthetic company, owner, responses, sessions and bookings were cleaned up; browser cookies/tabs and viewport overrides removed. PM2 restarted with the production build; public HTTPS login returned 200.

## Form upload and 30-day file retention — 14 October 2026

- `npm run typecheck`: passed. `npm test`: **48/48 passed** (including 18 form tests). Isolated production build: passed.
- Upload node accepts one JPEG/JPG/PNG/SVG/PDF/MD/DOC/DOCX/XLSX/CSV file, up to exactly 5,242,880 bytes. Oversized Content-Length and chunked transfers are rejected; supported downloads preserve their exact bytes and use attachment/sandbox headers.
- Response/file references and metadata are verified by the server. Other-company access, anonymous access, and missing read/export permissions are rejected. Upload replay is idempotent; submissions cannot attach another session's file.
- Four concurrent stalled uploads leave the health endpoint responsive; further uploads receive 503. Cancelling releases capacity and removes unfinished files. Three simultaneous ZIP requests admit only two; cancelling ZIP streams releases their capacity.
- ZIP extraction verified with Python `zipfile`: all current response attachments, unique safe entry names, replaced files excluded. Deleting a response removes its stored files.
- Retention is **30 days from each upload**. Company Responses shows days/hours/minutes remaining, the expiry date, a download reminder, and per-file expiry status. Expired downloads return 410 and ZIP excludes expired files. Cleanup deletes attachment bytes and keeps completed responses, text answers, and original filenames.
- Production-browser checks at 1440, 390 and 320 px: no page overflow or JavaScript errors. Upload percentage/loading, unsupported file errors, disabled submission during transfer, form Back and browser Back confirmation, refresh recovery, successful submission, company ZIP download, and builder add → Save → reload verified.
- Screenshots: `docs/form-upload-{320,390,1440}.png`, `docs/form-upload-progress-mobile.png`, `docs/form-upload-complete-mobile.png`, `docs/form-files-responses-{320,390,1440}.png`, `docs/form-files-builder.png`.
- Migrations 008–010 applied after database/upload backup. Cleanup runs every minute once the application has handled a request; orphan disk scanning runs daily. `npm run uploads:cleanup` can run cleanup manually.
- Deployment verified on `https://calendar.dbautoaudit.stream`: public health is ready, a real HTTP upload of exactly 5 MB succeeds, authenticated download preserves its bytes, and the company UI displays the 30-day countdown. Live screenshot: `docs/form-files-live-company.png`. Previous build retained with the pre-release backup at `/home/oem/.local/share/auto-audit-interview/backups/2026-10-14T02-57-08-663Z/next-before-form-files`.
- Temporary upload QA company, users, sessions, responses, and files cleaned; isolated preview server stopped.
