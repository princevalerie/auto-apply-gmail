# PRD: AutoApply — Aplikasi Otomatisasi Lamaran Kerja via Screenshot

**Versi:** 1.2
**Tanggal:** 25 Juli 2026
**Author:** Princ
**Status:** Draft

---

## 1. Latar Belakang & Masalah

Proses melamar kerja manual itu repetitif: lihat poster lowongan di sosmed/grup → catat email HR → tulis subject → tulis body email → lampirkan CV & portfolio → kirim. Dilakukan puluhan kali, ini makan waktu dan rawan human error (salah nama posisi, lupa attachment, dsb).

**Goal:** User cukup upload screenshot lowongan + CV (PDF) + portfolio (PDF), sistem otomatis mengekstrak info penting, menyusun email lamaran, dan mengirimkannya ke alamat email HR yang terdeteksi — terjadwal jam 8 pagi hari berikutnya.

---

## 2. Target User

Personal tool — dipakai oleh 1 user (Princ) untuk kebutuhan pribadi mencari kerja. Bukan produk multi-tenant/SaaS di versi awal.

---

## 3. Alur Penggunaan (User Flow)

1. User buka web app.
2. User upload:
   - Screenshot lowongan kerja (gambar: PNG/JPG)
   - File CV (PDF) — bisa disimpan sebagai default, tidak perlu upload ulang tiap kali
   - File portfolio (PDF) — sama, bisa jadi default tersimpan
3. Sistem menjalankan OCR + Gemini AI terhadap screenshot untuk mengekstrak:
   - Nama posisi/role
   - Nama perusahaan
   - Email tujuan (HR/recruiter)
   - Requirement/kualifikasi utama (opsional, untuk personalisasi isi email)
   - Lokasi kerja (jika ada)
4. Sistem generate otomatis:
   - **Subject email** (format profesional, menyertakan posisi yang dilamar)
   - **Isi/body email** (surat lamaran singkat, personalized berdasarkan requirement yang terdeteksi)
5. **Preview ditampilkan di app** — user melihat hasil ekstraksi (posisi, perusahaan, email tujuan) dan draft subject + body sebelum terkirim.
6. User klik **"Kirim"** di halaman preview → email langsung terkirim saat itu juga (real-time, bukan terjadwal), dengan CV + portfolio otomatis terlampir.
7. Sistem menyimpan riwayat lamaran (log): kapan dikirim, ke mana, posisi apa, status terkirim/gagal.

---

## 4. Fitur Utama (Functional Requirements)

### 4.1 Upload & Ekstraksi
- Upload gambar screenshot (drag & drop / pilih file)
- OCR (Tesseract atau cloud OCR) → teks mentah dari gambar
- Teks mentah dikirim ke **Gemini API** (vision + text) untuk ekstraksi terstruktur (JSON: posisi, perusahaan, email, requirement, lokasi)
- Validasi: jika email tidak terdeteksi, sistem harus **flag ke user**, tidak boleh silent-fail atau asal kirim ke alamat kosong/salah

### 4.2 Manajemen CV & Portfolio
- Upload sekali, tersimpan sebagai default (bisa diganti kapan saja)
- Sementara: statis, 1 file yang sama dipakai untuk semua lamaran (tailoring per lowongan = fitur fase 2, out of scope v1)

### 4.3 Generate Email
- Subject + body digenerate otomatis via Gemini, berdasarkan data hasil ekstraksi
- Tone profesional, Bahasa Indonesia formal (default) — bisa ditambah opsi Bahasa Inggris di fase berikutnya
- Body mencantumkan referensi ke posisi & perusahaan (agar tidak terlihat generic)

### 4.4 Preview & Pengiriman Email
- Setelah ekstraksi & generate selesai, sistem menampilkan halaman **preview** berisi: hasil ekstraksi (posisi, perusahaan, email tujuan), subject, dan body email — semua dalam bentuk read-only (atau editable ringan, opsional) di app.
- User cukup klik tombol **"Kirim Sekarang"** → email langsung dikirim real-time via Gmail API, tidak ada delay/penjadwalan.
- Kalau email tujuan tidak terdeteksi atau formatnya tidak valid, tombol kirim otomatis nonaktif dan sistem menampilkan warning ke user.
- Integrasi ke akun Gmail user via **OAuth 2.0** resmi Google (bukan App Password — lebih aman & sesuai best practice Google, App Password bahkan sudah mulai dibatasi Google untuk akun tertentu)
- Attachment otomatis: CV + portfolio (PDF) terlampir di setiap email
- Sistem harus tangguh terhadap kegagalan kirim (retry logic + notifikasi ke user jika gagal)

### 4.5 Riwayat & Tracking
- Dashboard sederhana: daftar semua lamaran yang sudah/akan dikirim
- Status per lamaran: Terjadwal / Terkirim / Gagal
- Info per entri: posisi, perusahaan, email tujuan, waktu kirim, thumbnail screenshot asli

---

## 5. Bukan Bagian dari Scope v1 (Out of Scope)

- Tailoring CV otomatis per lowongan (nanti fase 2)
- Multi-user / login system kompleks (v1 personal use, auth simpel cukup)
- Penjadwalan pengiriman (misal "kirim besok jam 8 pagi") — v1 kirim real-time saat user klik tombol di preview
- Deteksi lowongan palsu/scam
- Integrasi platform selain Gmail (Outlook, dst.)
- Notifikasi WhatsApp/Telegram (bisa dipertimbangkan fase 2)

---

## 6. Tech Stack

| Layer | Rekomendasi | Alasan |
|---|---|---|
| Framework | **Next.js 14+ (App Router) + TypeScript** | Full-stack dalam satu codebase — frontend (React) & backend (API Routes) jadi satu. Native support di Vercel, deploy gratis tanpa Docker/server terpisah. |
| Styling/UI | **Tailwind CSS + shadcn/ui** | Cepat bikin UI form upload, preview card, dashboard riwayat — tanpa perlu desain dari nol. |
| OCR & Ekstraksi | **Gemini API (Vision + Text)**, dipanggil dari API Route Next.js | Konsisten dengan stack yang sudah pernah dipakai (rumah prediksi + RAG). Skip Tesseract — Gemini Vision langsung baca gambar & keluarin JSON terstruktur. |
| Email Sending | **Gmail API + OAuth 2.0** via `googleapis` (npm package resmi Google) | Wajib OAuth resmi untuk keamanan. Dipanggil dari API Route saat user klik "Kirim Sekarang" di preview — real-time, gak perlu job/scheduler. |
| Database | **Vercel Postgres** (Neon, free tier) atau **Vercel KV** kalau cuma butuh simpel | SQLite gak cocok di Vercel (serverless = filesystem gak persisten antar-request). Perlu DB terkelola. Simpan riwayat lamaran, token OAuth (encrypted), path file. |
| File Storage | **Vercel Blob** (free tier tersedia) | Untuk simpan screenshot, CV, portfolio — Vercel serverless gak punya persistent local disk, jadi file harus disimpan di object storage. |
| Auth (opsional, personal use) | **NextAuth.js / Auth.js** dengan Google Provider | Sekaligus bisa dipakai untuk login *dan* dapetin OAuth token Gmail dalam satu flow — efisien karena keduanya sama-sama lewat Google OAuth. |

### ✅ Kenapa Ini Cocok untuk Deploy Gratis di Vercel

Karena semua serverless-native (Next.js API Routes, Postgres via Neon, Blob storage), semuanya punya free tier yang cukup untuk personal tool: gak ada server yang perlu di-maintain 24/7, gak ada Docker container untuk di-manage, dan deploy tinggal `git push` → auto-deploy. Trade-off: tiap komponen (DB, storage) jadi layanan terpisah (walau tetap gratis & terintegrasi mudah dengan Vercel), beda dengan pendekatan "semua nyimpen di 1 file SQLite lokal" yang lebih simpel tapi gak jalan di lingkungan serverless.

---

## 7. Panduan Setup OAuth Google (Gmail API)

Karena lo belum familiar OAuth, ini langkah-langkahnya, akan gua detailkan lebih lanjut pas masuk fase development:

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project baru.
2. Aktifkan **Gmail API** dari API Library.
3. Buat **OAuth 2.0 Client ID** — kali ini tipe **"Web application"** (bukan Desktop), karena app-nya jalan di web/Vercel. Set **Authorized redirect URI** sesuai domain Vercel lo (misal `https://autoapply.vercel.app/api/auth/callback/google`).
4. Catat **Client ID** dan **Client Secret** → simpan sebagai environment variable di Vercel (jangan hardcode di kode, jangan commit ke repo).
5. Set scope yang dibutuhkan: `https://www.googleapis.com/auth/gmail.send`.
6. Kalau pakai NextAuth.js, integrasi Google OAuth tinggal konfigurasi provider — NextAuth otomatis handle flow login & simpan token di database (Vercel Postgres) dengan aman (session-based, token refresh otomatis).
7. Karena app masih dalam mode "Testing" di Google Cloud Console (belum verified), token akses cuma berlaku terbatas & perlu re-auth berkala (biasanya tiap 7 hari untuk refresh token testing mode) — cukup untuk personal use, tidak masalah. Kalau mau permanen, bisa ajukan verifikasi app ke Google (proses lebih panjang, opsional).

*(Detail step-by-step dengan screenshot akan gua siapkan pas mulai development, biar gak kepanjangan di PRD ini.)*

---

## 8. Data yang Diproses & Privasi

- Screenshot, CV, portfolio, dan isi email tersimpan di Vercel Blob storage & Vercel Postgres milik user sendiri (bukan dikirim ke pihak ketiga selain Gemini API untuk ekstraksi & Gmail API untuk kirim).
- Karena isinya data pribadi (CV, kontak, dsb), pastikan **Client Secret Google, API key Gemini, dan connection string database** disimpan sebagai environment variable di Vercel dashboard — **tidak pernah di-commit ke repo publik** (masuk `.env` dan `.gitignore`).
- Token OAuth Gmail disimpan terenkripsi di database, dikelola otomatis oleh NextAuth.js.

---

## 9. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| OCR/AI salah baca email tujuan → lamaran nyasar | Wajib ada validasi format email sebelum tombol "Kirim" aktif; kalau tidak terdeteksi, flag & tombol kirim dinonaktifkan |
| User asal klik "Kirim" tanpa cek preview dengan teliti | Preview harus jelas & mudah dibaca (highlight email tujuan, subject, body); pertimbangkan konfirmasi dialog sebelum kirim final |
| Gmail API kena rate limit / token expired | Retry logic + refresh token otomatis; notifikasi ke user kalau re-auth diperlukan |
| Body email hasil AI generate terlalu generic/aneh | Sediakan template fallback + opsi edit ringan di halaman preview sebelum kirim |

---

## 10. Rencana Fase Selanjutnya (Future / Fase 2)

- Tailoring CV otomatis (highlight skill relevan sesuai requirement lowongan)
- Multi-bahasa (Indonesia/Inggris otomatis sesuai bahasa lowongan)
- Notifikasi status kirim via Telegram/WhatsApp
- Analytics: tingkat response rate per jenis lowongan/industri
- A/B testing subject line untuk lihat mana yang lebih sering dibalas

---

## 11. Open Questions (untuk didiskusikan sebelum development mulai)

- Di halaman preview, apakah subject & body perlu **bisa diedit manual** oleh user sebelum kirim, atau murni read-only (kalau kurang pas, ekstraksi harus diulang)?
- Kalau upload beberapa lowongan sekaligus dalam satu sesi, apakah preview & kirim dilakukan **satu per satu** (per lowongan), atau ada mode batch (preview semua dulu, baru kirim semua sekaligus)?
- Untuk database (Vercel Postgres/Neon) dan Blob storage — lo udah ada akun Vercel & siap connect ke Neon (biasanya tinggal 1-klik dari Vercel dashboard), atau perlu gua bantu panduan setup dari nol?
