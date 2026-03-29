# LESAVI SURAMADU — Workflow Rules untuk Agent

## Aturan Wajib Setiap Akhir Task

### 1. Selalu Commit + Push ke GitHub
Setelah setiap task selesai (fitur baru, bugfix, refactor, dll.), agent **wajib** menjalankan:

```bash
bash push-to-github.sh "<pesan commit yang deskriptif>"
```

- **Remote**: `https://github.com/portodit/LESAVI-SURAMADU`
- **Branch**: `main`
- **Akun GitHub**: `PORTODIT` (email: `bliaditdev@gmail.com`)
- **Token**: env var `GITHUB_TOKEN` (sudah ada di Replit Secrets)

Format pesan commit yang disarankan:
```
feat: <deskripsi fitur baru>
fix: <deskripsi bugfix>
refactor: <deskripsi refactor>
chore: <perubahan konfigurasi/tooling>
```

### 2. Redeploy Project Setelah Push
Setelah push berhasil, agent **wajib** menyarankan / menjalankan redeploy agar perubahan live di production (`*.replit.app`).

### 3. Update `replit.md`
Setiap perubahan arsitektur signifikan (fitur baru, tambah dependency, ubah schema DB) wajib dicatat di `replit.md`.

---

## Kredensial & Konfigurasi

| Item | Nilai |
|------|-------|
| Default NIK login | `160203` |
| Default password | `admin123` |
| Frontend port | `24930` |
| API port | `8080` |
| GitHub repo | `https://github.com/portodit/LESAVI-SURAMADU` |
| GitHub user | `PORTODIT` |
| GitHub email | `bliaditdev@gmail.com` |

---

## Stack Ringkas

- **Frontend**: React 19 + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express 5 + Drizzle ORM + PostgreSQL
- **Auth**: Session-based (express-session + bcrypt)
- **Bot**: Telegram Bot (polling) — notifikasi & laporan AM
- **Monorepo**: pnpm workspaces

---

## Public Routes (tanpa auth)

- `GET /api/public/*` — semua endpoint public
- `/embed/performa` — embed iframe performa tanpa guard

---

## Catatan Penting

- Git operations (commit, push, remote) **diblokir langsung dari agent** oleh platform Replit — ini adalah pembatasan sistem, bukan pilihan agent. Solusinya: **Anda jalankan sendiri** `bash push-to-github.sh "pesan commit"` dari **Replit Shell** setelah agent selesai mengerjakan task.
- Reconcile job berjalan setiap **30 menit** di background.
- Telegram bot menggunakan `skipPendingUpdates` untuk menghindari spam saat restart.
