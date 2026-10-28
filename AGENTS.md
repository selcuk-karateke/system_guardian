# System Guardian – Agent Guide

## Multi-server truth (read this)

Slice 1: per-server SSH via `await getSshClient(serverId)` + encrypted DB secrets. Global `SSH_*` is fallback/seed only. Coolify/backup knobs still global. Details: `.cursor/rules/multi-server-truth.mdc`.

## Start here

1. Read `.env.example` and copy to `.env.local`
2. Local PostgreSQL (no Docker): `CREATE DATABASE system_guardian;` then set `DATABASE_URL`
3. `npm install` → `npm run db:migrate` → `npm run db:seed` → `npm run dev`
4. Local dev uses `CHECK_MODE=mock` (no SSH required)

**Ops / Sysadmin collaborator:** read [docs/SYSADMIN.md](docs/SYSADMIN.md) (orientation map). In the running app: `/docs` and `/docs/api` (Redoc).

After adding a check module or API route, run `npm run docs:check` (catalog + OpenAPI drift).

## Directory tree

```
src/
  app/                    # Pages + API routes
    (dashboard)/          # Home / global status
    infrastructure/       # Server, RAID, CPU/RAM
    docker/               # Containers
    databases/            # PostgreSQL, MySQL
    security/             # Users, SSH, logins, cron
    notifications/        # Alert history
    settings/             # Domains, Telegram, email
    api/cron/             # Scheduled check endpoints
  db/schema/              # Drizzle tables
  lib/
    checks/               # 16 monitoring modules
    ssh/                  # SSH + mock client
    alerts/               # Alert pipeline
    notifications/        # Telegram, email
    history/              # Snapshots and diffs
  components/             # UI (dashboard, ui)
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `CHECK_MODE` | `mock` (Windows) or `ssh` (production) |
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | Remote check target |
| `CRON_SECRET` | Bearer token for cron routes |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Instant alerts |
| `SMTP_*` | Email notifications |

## Adding a check module

1. Create `src/lib/checks/<name>.ts` with `runXxxCheck(serverId)`
2. Register in `src/lib/checks/index.ts` (server or security batch)
3. Use `persistCheckRun` and `processAlerts` from shared libs

## Cron (Coolify)

- `GET /api/cron/server` – 15 min
- `GET /api/cron/security` – 60 min
- `GET /api/cron/daily-report` – 09:00 daily

Header: `Authorization: Bearer <CRON_SECRET>`
