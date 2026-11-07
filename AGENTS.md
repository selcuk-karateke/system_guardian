# System Guardian – Agent Guide

## Multi-server truth (read this)

SSH / Coolify / Backup / Notify / Thresholds / Trusted IPs / Allowlists / Ops (Trivy, Monitor night, Observation, RAID) live in DB (Settings UI). ENV is deploy-runtime only (`DATABASE_URL`, `CHECK_MODE`, `CRON_SECRET`, `AUTH_*`, `API_SECRET`, `APP_URL`). Details: `.cursor/rules/multi-server-truth.mdc`.

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
| `CRON_SECRET` / `AUTH_*` / `API_SECRET` | Deploy secrets |
| SSH / Coolify / Backup / Notify / Ops | Settings UI (DB), not ENV |

Deploy: [docs/DEPLOY.md](docs/DEPLOY.md) · Coolify: [docs/COOLIFY.md](docs/COOLIFY.md)

## Adding a check module

1. Create `src/lib/checks/<name>.ts` with `runXxxCheck(serverId)`
2. Register in `src/lib/checks/index.ts` (server or security batch)
3. Use `persistCheckRun` and `processAlerts` from shared libs
4. Coolify-specific modules must skip cleanly when Coolify is not detected

## Cron

- `GET /api/cron/server` – 15 min
- `GET /api/cron/security` – 60 min
- `GET /api/cron/daily-report` – 09:00 daily

Header: `Authorization: Bearer <CRON_SECRET>`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
