# LESAVI VI · WITEL SURAMADU — AM Dashboard

Dashboard monitoring performa Account Manager (AM) Telkom Witel Suramadu — meliputi Sales Funnel, Activity Monitoring, dan Performance Tracking, dengan integrasi Telegram Bot untuk pengingat otomatis.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS · shadcn/ui |
| Backend | Express 5 · TypeScript · Drizzle ORM |
| Database | PostgreSQL |
| Monorepo | pnpm workspaces |
| Auth | Session-based (express-session) |
| Bot | Telegram Bot API (polling) |

## Struktur Proyek

```
apps/
  dashboard/          # Frontend — React 19 + Vite
  api/                # Backend — Express 5 + Drizzle ORM
packages/
  db/                 # Drizzle schema & config (shared)
  api-spec/           # OpenAPI specification
  api-zod/            # Zod types (auto-generated)
  api-client-react/   # React Query hooks (auto-generated)
```

## Fitur Utama

- **Dashboard Performa** — ranking AM, target vs realisasi revenue
- **Sales Funnel** — tracking pipeline F0–F5 per AM & divisi (DPS/DSS)
- **Activity Monitoring** — kunjungan dan aktivitas AM harian/bulanan
- **Import Data** — upload Excel/CSV + sinkronisasi Google Drive otomatis
- **Telegram Bot** — pengingat jadwal kunjungan & laporan KPI harian
- **Presentation Mode** — tampilan ringkasan real-time untuk rapat

## Development

```bash
# Install dependencies
pnpm install

# Jalankan semua service sekaligus
pnpm --filter @workspace/api-server run dev    # API — port 8080
pnpm --filter @workspace/telkom-am-dashboard run dev  # Frontend — port 3000

# Database migration
pnpm --filter @workspace/db run db:push
```

## Environment Variables

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=...
TELEGRAM_BOT_TOKEN=...   # opsional, bisa diset via UI
```
