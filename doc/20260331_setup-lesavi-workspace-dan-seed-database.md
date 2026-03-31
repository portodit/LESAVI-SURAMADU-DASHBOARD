# Setup Workspace LESAVI & Seed Database — 2026-03-31

## Request
Jalankan seeder database sebagai bagian dari setup penuh workspace LESAVI-SURAMADU di environment Replit baru.

## Yang Dikerjakan

### 1. Copy Kode LESAVI ke Workspace

Kode dari GitHub repo (via `/tmp/lesavi-suramadu/`) disalin ke struktur Replit workspace:

| Sumber (GitHub/tmp) | Tujuan (Workspace Replit) |
|---|---|
| `apps/api/` | `artifacts/api-server/` |
| `apps/dashboard/` | `artifacts/telkom-am-dashboard/` |
| `packages/db/` | `lib/db/` |
| `packages/api-spec/` | `lib/api-spec/` |
| `packages/api-zod/` | `lib/api-zod/` |
| `packages/api-client-react/` | `lib/api-client-react/` |

### 2. Install Dependencies

```bash
pnpm install
# Resolved 556 packages, Done in 10.1s
```

### 3. Database Setup

Database sudah ter-provision di Replit (PostgreSQL built-in dengan `DATABASE_URL`).

Push schema (create semua tabel):
```bash
pnpm --filter @workspace/db run push
# ✓ Changes applied
```

### 4. Seed Database

```bash
pnpm --filter @workspace/api-server run seed
```

Hasil seeding:

| Seeder | Records | Waktu |
|---|---|---|
| accounts | 13 AM + 1 Manager + 1 Officer | 0.1s |
| funnel-targets | 2 target (DPS & DSS 2026) | 0.0s |
| performance | 132 records | 0.3s |
| activity | 719 records | 0.1s |
| funnel | 8696 records | 1.0s |

**Total: 9562 records berhasil di-seed.**

### 5. API Server Running

API server berhasil start dengan kode LESAVI penuh:
```
[INFO] Server listening — port: 8080
[INFO] Default admin user ensured
[INFO] Telegram background poller started (no token yet)
[INFO] Session table ensured
[INFO] Default seed data ensured
[INFO] Full seed check complete
```

## Status Setelah Setup

- Database: ✓ Provisioned & seeded
- `artifacts/api-server/`: ✓ LESAVI API (Express 5 + Drizzle)
- `artifacts/telkom-am-dashboard/`: ✓ LESAVI Frontend (React 19 + Vite)
- `lib/db/`: ✓ Schema Drizzle LESAVI
- `lib/api-spec/`, `lib/api-zod/`, `lib/api-client-react/`: ✓ Copied
- API workflow: ✓ Running di port 8080
- Push script (`push-to-github.mjs`): ✓ Siap digunakan

## Yang Belum Dilakukan

- Setup workflow untuk `artifacts/telkom-am-dashboard` (frontend dashboard) — perlu dikonfigurasi agar bisa dipreview
- Set `TELEGRAM_BOT_TOKEN` di Secrets (opsional, untuk notifikasi bot)
