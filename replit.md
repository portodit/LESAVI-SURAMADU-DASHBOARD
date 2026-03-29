# LESAVI VI · WITEL SURAMADU — AM Dashboard

## Overview
Dashboard monitoring performa Account Manager (AM) Telkom Witel Suramadu — meliputi Sales Funnel, Activity Monitoring, dan Performance Tracking, dengan integrasi Telegram Bot untuk pengingat otomatis.

## Architecture
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui — runs on port 5000
- **Backend**: Express 5 + TypeScript + Drizzle ORM — runs on port 8080
- **Database**: PostgreSQL (Replit built-in)
- **Package Manager**: pnpm workspaces (monorepo)
- **Auth**: Session-based (express-session)
- **Bot**: Telegram Bot API (polling)

## Project Structure
```
apps/
  dashboard/          # Frontend — React 19 + Vite (port 5000 in dev)
  api/                # Backend — Express 5 + Drizzle ORM (port 8080)
packages/
  db/                 # Drizzle schema & config (shared)
  api-spec/           # OpenAPI specification
  api-zod/            # Zod types (auto-generated)
  api-client-react/   # React Query hooks (auto-generated)
```

## Workflows
- **Start application** — Frontend Vite dev server on port 5000 (webview)
- **Backend API** — Express API server on port 8080 (console)

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit database)
- `SESSION_SECRET` — Session encryption secret
- `TELEGRAM_BOT_TOKEN` — Telegram bot token (optional, can be set via UI)

## Development Commands
```bash
pnpm install                              # Install all dependencies
pnpm --filter @workspace/db run push     # Push DB schema changes
pnpm --filter @workspace/api-server run seed  # Seed database with default data
```

## Key Notes
- Frontend proxies `/api` requests to the backend at `http://localhost:8080`
- In production, the API server serves the built frontend static files
- The tsconfig.base.json at root is shared by all packages
- Vite is configured with `allowedHosts: true` for Replit proxy compatibility
