# Coolify Deployment

## Services

1. **PostgreSQL** – database `system_guardian`
2. **System Guardian** – deploy from this repo (Dockerfile)

## Environment variables

Copy from `.env.example`. **Required for production:**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `CRON_SECRET` | Cron routes (`Authorization: Bearer …`) |
| `AUTH_SECRET` | Session signing (min. 32 chars random) |
| `AUTH_USERNAME` + `AUTH_PASSWORD` | Dashboard login (or `AUTH_USERS`) |
| `API_SECRET` | Bot/API: `GET /api/status` |
| `CHECK_MODE=ssh` | Live checks |
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | Monitored server |
| `DISCORD_WEBHOOK_URL` | Alert embeds (optional) |
| `APP_URL` | Links in notifications |

Without `AUTH_SECRET` + user, the UI stays **open** (dev only — never in production).

## Auth

- **UI** (`/`, `/monitor`, `/settings`, …): login at `/login`, session cookie 7 days
- **Cron**: `Authorization: Bearer <CRON_SECRET>`
- **API** (bot later): `Authorization: Bearer <API_SECRET>` → `GET /api/status`

```bash
curl -H "Authorization: Bearer YOUR_API_SECRET" https://your-app/api/status
```

## Scheduled tasks

| Schedule | URL | Header |
|----------|-----|--------|
| `*/15 * * * *` | `https://your-app/api/cron/server` | `Authorization: Bearer <CRON_SECRET>` |
| `0 * * * *` | `https://your-app/api/cron/security` | same |
| `0 9 * * *` | `https://your-app/api/cron/daily-report` | same |

## Network

- Prefer **internal URL** or VPN; do not expose publicly without auth
- Coolify Traefik: optional extra IP allowlist

## SSH key

Mount private key as Coolify secret → `SSH_PRIVATE_KEY` or file path.

SSH user needs `docker`, logs, and read access for checks.
