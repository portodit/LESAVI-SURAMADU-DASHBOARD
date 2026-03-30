# PROJECT BRIEF — LESAVI SURAMADU

> Dokumen ini adalah **panduan utama** proyek. Dibaca oleh agent setiap kali memulai sesi kerja.
> Terakhir diperbarui: 29 Maret 2026

---

## 1. Identitas Proyek

| Item | Detail |
|------|--------|
| **Nama** | LESAVI VI WITEL SURAMADU — AM Dashboard |
| **Fungsi** | Dashboard monitoring Account Manager Telkom Witel Suramadu |
| **Fitur utama** | Sales Funnel · Sales Activity · Performa AM · Telegram Bot Notifikasi |
| **Production URL** | `https://lesa-vi.replit.app` |
| **Platform** | Replit (development + hosting) |

---

## 2. Koneksi Replit ↔ GitHub

### Repo Tunggal — Tidak Boleh Ganti
```
https://github.com/portodit/LESAVI-SURAMADU.git
```
- **Owner**: `PORTODIT`
- **Branch**: `master`
- **Email**: `bliaditdev@gmail.com`

> ⚠️ Hanya repo ini yang digunakan. Jangan pernah push ke repo lain.

### Cara Koneksi (via REST API)
Git CLI diblokir oleh platform Replit di main agent. Koneksi ke GitHub dilakukan melalui **script Node.js** (`push-to-github.mjs`) yang menggunakan **GitHub REST API** dengan token:

- **Token**: env var `GITHUB_TOKEN` → sudah diset di **Replit Secrets**
- **Script**: `push-to-github.mjs` di root project
- **Detail teknis**: lihat [GITHUB_PUSH_GUIDE.md](./GITHUB_PUSH_GUIDE.md)

### Cara Verifikasi Koneksi
```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/portodit/LESAVI-SURAMADU \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log('Repo:',j.full_name,'| Branch default:',j.default_branch)"
```

---

## 3. Aturan Wajib Agent (Setiap Task)

### ✅ Wajib dikerjakan SETIAP selesai task:

**A. Push ke GitHub**
```bash
# Push file spesifik (lebih cepat, 2–5 detik):
node push-to-github.mjs "tipe: deskripsi singkat" \
  path/ke/file-yang-berubah.tsx \
  path/ke/file-lain.ts

# Push semua file berubah (gunakan jika tidak tahu file mana yg berubah):
node push-to-github.mjs "tipe: deskripsi singkat"
```

Format pesan commit:
```
feat:     fitur baru
fix:      perbaikan bug
refactor: refactor kode
docs:     update dokumentasi
chore:    config/tooling
```

**B. Suggest Redeploy** — jika perubahan mempengaruhi UI atau API production.

**C. Update `replit.md`** — jika ada perubahan arsitektur, fitur baru, atau dependency baru.

**D. Update `.doc/`** — jika ada temuan penting, bugfix besar, atau perubahan workflow.

### ❌ Yang TIDAK boleh dilakukan:
- Push ke repo selain `https://github.com/portodit/LESAVI-SURAMADU.git`
- Mengubah branch ke selain `master`
- Melewati langkah push setelah task selesai

---

## 4. Stack Teknologi

```
Frontend  : React 19 · Vite · TypeScript · Tailwind CSS · shadcn/ui · Recharts · Wouter
Backend   : Express 5 · TypeScript · Drizzle ORM · express-session · bcrypt
Database  : PostgreSQL (Replit built-in)
Bot       : Telegram Bot API (long-polling)
Monorepo  : pnpm workspaces
Build     : esbuild (backend) · Vite (frontend)
Deploy    : Replit Autoscale + VM
```

---

## 5. Struktur Project

```
workspace/
├── artifacts/
│   ├── api-server/          # Express 5 API (port 8080)
│   │   └── src/features/
│   │       ├── auth/        # Session auth
│   │       ├── performance/ # Data performa AM
│   │       ├── funnel/      # Sales funnel
│   │       ├── activity/    # Sales activity
│   │       ├── gdrive/      # Import dari Google Drive
│   │       ├── telegram/    # Bot Telegram
│   │       └── import/      # Route import data
│   └── telkom-am-dashboard/ # React frontend (port 24930)
│       └── src/features/
│           ├── performance/ # Halaman performa + PresentationPage
│           ├── funnel/      # Halaman sales funnel
│           ├── activity/    # Halaman sales activity
│           ├── import/      # Halaman import data
│           ├── settings/    # Pengaturan (Google API, Telegram, Drive)
│           └── telegram/    # Halaman kirim Telegram
├── lib/
│   ├── db/                  # Schema Drizzle ORM
│   ├── api-spec/            # OpenAPI spec
│   ├── api-zod/             # Generated Zod schemas
│   └── api-client-react/    # Generated React Query hooks
├── .doc/                    # Dokumentasi proyek (folder ini)
├── push-to-github.mjs       # Script push via GitHub REST API
├── push-to-github.sh        # Script push alternatif (terbatas)
└── replit.md                # Memory utama agent
```

---

## 6. Kredensial & Environment

| Item | Nilai |
|------|-------|
| NIK login default | `160203` |
| Password default | `admin123` |
| Role default | `OFFICER` |
| Frontend port (dev) | `24930` |
| API port (dev) | `8080` |
| GitHub repo | `https://github.com/portodit/LESAVI-SURAMADU.git` |
| GitHub branch | `master` |
| GitHub user | `PORTODIT` |
| GitHub email | `bliaditdev@gmail.com` |
| GitHub token | Env var `GITHUB_TOKEN` (Replit Secret) |

---

## 7. Database

- **Development**: PostgreSQL lokal Replit — sudah berisi seed data
  - Performance: 132 records
  - Activity: 719 records
  - Funnel: 8696 records
  - Target HO: sudah ada
- **Production**: Database terpisah — **kosong saat pertama deploy**, harus import data real via halaman `/import`

> Database dev dan production **tidak saling terhubung**. Setiap deploy membuat instance production yang punya database sendiri.

---

## 8. Fitur Telegram Bot

- Polling aktif — tidak pakai webhook
- `skipPendingUpdates: true` — mencegah spam saat restart
- Reconcile scheduler berjalan tiap **30 menit**
- Perintah bot: `/laporan`, `/status`, link akun via `/start`

---

## 9. Routes Public (Tanpa Auth)

| Endpoint | Fungsi |
|----------|--------|
| `GET /api/public/performance` | Data performa publik |
| `GET /api/public/funnel` | Data funnel publik |
| `GET /api/public/funnel/snapshots` | Daftar snapshot funnel |
| `GET /api/public/import-history` | Riwayat import publik |
| `/embed/performa` | Embed iframe performa (no guard) |

---

## 10. Dokumen Lain di Folder `.doc/`

| File | Isi |
|------|-----|
| `WORKFLOW_RULES.md` | Ringkasan rules + kredensial (versi ringkas) |
| `GITHUB_PUSH_GUIDE.md` | Penjelasan teknis push via REST API |
| `BUGFIX_BLANK_PAGE_IMPORT.md` | Brief bugfix blank page di halaman Import |
| `CHATBOT.md` | Panduan integrasi chatbot |
