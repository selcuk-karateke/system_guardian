# Deploy System Guardian

Generic deploy for any VPS or Docker host. For hosting **on** Coolify (as an app) and for **monitoring** Coolify stacks, see [COOLIFY.md](./COOLIFY.md).

## Architecture

- **Guardian app** (this repo) + **PostgreSQL**
- Monitored hosts are configured in the UI (SSH per server in DB)
- Cron hits `/api/cron/*` with `Authorization: Bearer <CRON_SECRET>`

## Docker Compose (recommended)

1. Copy env and set secrets:

```bash
cp .env.example .env
```

Required for production:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Usually set by compose for the `app` service |
| `CRON_SECRET` | Protects cron routes |
| `AUTH_SECRET` | Sessions + encrypts SSH/Coolify secrets in DB (min. 16 chars; prefer 32+) |
| `AUTH_USERNAME` + `AUTH_PASSWORD` (or `AUTH_USERS`) | Dashboard login |
| `API_SECRET` | Bearer for `/api/status` |
| `CHECK_MODE=ssh` | Live SSH checks (compose default may be `mock` for local tryouts) |
| `APP_URL` | Links in notifications |

Without `AUTH_*`, the UI stays open — **dev only**.

2. Start:

```bash
docker compose up --build -d
```

The app entrypoint runs `db:migrate` then starts Next.js. Health: `GET /api/health`.

3. Open the UI → **Settings → Server** → add host (name + SSH). Backup paths and Coolify API are optional.

4. Schedule cron (host crontab, Coolify scheduled tasks, or systemd timer):

| Schedule | URL |
|----------|-----|
| `*/15 * * * *` | `https://your-app/api/cron/server` |
| `0 * * * *` | `https://your-app/api/cron/security` |
| `0 9 * * *` | `https://your-app/api/cron/daily-report` |

Header on every request: `Authorization: Bearer <CRON_SECRET>`.

## Bare metal / Node

```bash
npm ci
npm run db:migrate
npm run build
CHECK_MODE=ssh npm start
```

Point `DATABASE_URL` at PostgreSQL 16+.

## Network

Prefer internal URL or VPN. Do not expose the dashboard publicly without auth.

## SSH on targets

The SSH user needs rights for the checks you enable (`docker`, journal/logs, `mdadm`/RAID, backup paths, etc.). Keys are stored encrypted in the DB (`AUTH_SECRET`).
