# LESAVI VI · WITEL SURAMADU — AM Dashboard

## Overview

Dashboard monitoring performa Account Manager (AM) Telkom Witel Suramadu — meliputi Sales Funnel, Activity Monitoring, dan Performance Tracking, dengan integrasi Telegram Bot untuk pengingat otomatis.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 · Vite · TypeScript · Tailwind CSS · shadcn/ui · Recharts
- **Backend**: Express 5 · TypeScript · Drizzle ORM · express-session
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Session-based (express-session + bcrypt)
- **Bot**: Telegram Bot API (polling)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Router**: wouter (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/              # Express 5 API server
│   └── telkom-am-dashboard/     # React 19 + Vite frontend
├── lib/
│   ├── api-spec/                # OpenAPI spec + Orval codegen config
│   ├── api-client-react/        # Generated React Query hooks
│   ├── api-zod/                 # Generated Zod schemas from OpenAPI
│   └── db/                      # Drizzle ORM schema + DB connection
├── scripts/                     # Utility scripts
├── pnpm-workspace.yaml          # pnpm workspace definitions
├── tsconfig.base.json           # Shared TS options
├── tsconfig.json                # Root TS project references
└── package.json                 # Root package with hoisted devDeps
```

## Folder Mapping (GitHub vs Replit)

| Di GitHub (repo) | Di Replit (workspace) |
|---|---|
| `apps/dashboard/` | `artifacts/telkom-am-dashboard/` |
| `apps/api/` | `artifacts/api-server/` |
| `packages/db/` | `lib/db/` |
| `packages/api-spec/` | `lib/api-spec/` |
| `packages/api-zod/` | `lib/api-zod/` |
| `packages/api-client-react/` | `lib/api-client-react/` |

## Features

- **Dashboard Performa** — ranking AM, target vs realisasi revenue
- **Sales Funnel** — tracking pipeline F0–F5 per AM & divisi (DPS/DSS)
- **Activity Monitoring** — kunjungan dan aktivitas AM harian/bulanan
- **Import Data** — upload Excel/CSV + sinkronisasi Google Drive otomatis
- **Telegram Bot** — pengingat jadwal kunjungan & laporan KPI harian
- **Presentation Mode** — tampilan ringkasan real-time untuk rapat
- **Google Drive Integration** — auto-sync data dari Google Drive
- **Google Sheets Integration** — sinkronisasi data dari spreadsheet
- **Corporate Customer** — manajemen customer korporat

## Services & Ports

| Service | Package | Port | Workflow |
|---|---|---|---|
| Frontend (Vite dev) | `@workspace/telkom-am-dashboard` | `5000` | `artifacts/telkom-am-dashboard: web` |
| Backend (Express) | `@workspace/api-server` | `8080` | `artifacts/api-server: API Server` |
| Mockup Sandbox | `@workspace/mockup-sandbox` | — | `artifacts/mockup-sandbox: Component Preview Server` |

## Database Schema

Tables managed by Drizzle ORM:
- `admin_users` — akun admin dashboard
- `account_managers` — data AM Telkom
- `performance_data` — data performa AM
- `sales_funnel` — pipeline funnel per AM
- `sales_activity` — aktivitas kunjungan AM
- `data_imports` — log import data
- `telegram_logs` — log pengiriman pesan Telegram
- `telegram_bot_users` — users Telegram bot
- `app_settings` — konfigurasi aplikasi
- `drive_read_logs` — log baca Google Drive
- `master_am` — master data AM
- `pending_am_discoveries` — AM baru yang belum terkonfigurasi

## Environment Variables Required

| Key | Keterangan |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto dari Replit DB) |
| `SESSION_SECRET` | Secret untuk enkripsi session |
| `TELEGRAM_BOT_TOKEN` | Token Telegram Bot (opsional, bisa diset via UI) |

## Development

```bash
# Install dependencies
pnpm install

# Database migration
pnpm --filter @workspace/db run push

# Seed data awal
pnpm --filter @workspace/api-server run seed

# Run frontend
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/telkom-am-dashboard run dev

# Run backend
pnpm --filter @workspace/api-server run dev

# Codegen dari OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

## Packages

### `artifacts/telkom-am-dashboard` (`@workspace/telkom-am-dashboard`)

React 19 + Vite frontend. Routes menggunakan wouter. Pages di `src/features/`.

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes per feature di `src/features/`. Seeds di `src/seeds/`.

### `lib/db` (`@workspace/db`)

Database layer menggunakan Drizzle ORM dengan PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec dan Orval config.

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas dari OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks dari OpenAPI spec.

---

## Workflow Rules (Agent)

> Detail lengkap ada di `.doc/WORKFLOW_RULES.md`

1. **Commit + Push setiap task selesai** — jalankan `bash push-to-github.sh "<pesan>"` ke repo `https://github.com/portodit/LESAVI-SURAMADU` branch `main`, akun `PORTODIT`.
2. **Redeploy setelah push** — sarankan redeploy agar perubahan live di production.
3. **Update replit.md** setiap ada perubahan arsitektur signifikan.
