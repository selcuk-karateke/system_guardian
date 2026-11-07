# Coolify

Two separate topics:

1. **Deploy System Guardian on Coolify** (Guardian as a Coolify application)
2. **Monitor a Coolify host** (optional stack check + API redeploy)

For generic Compose/VPS deploy, see [DEPLOY.md](./DEPLOY.md).

---

## A) Deploy Guardian on Coolify

### Services

1. **PostgreSQL** – database `system_guardian` (Coolify DB resource or external)
2. **System Guardian** – deploy this repo (Dockerfile)

### Environment

Copy from `.env.example`. **Required in production:**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `CRON_SECRET` | Cron routes (`Authorization: Bearer …`) |
| `AUTH_SECRET` | Session + DB secret encryption (min. 16 chars; prefer 32+) |
| `AUTH_USERNAME` + `AUTH_PASSWORD` | Dashboard login (or `AUTH_USERS`) |
| `API_SECRET` | `GET /api/status` |
| `CHECK_MODE=ssh` | Live checks |
| `APP_URL` | Links in notifications |

SSH targets are **not** configured via `SSH_HOST` ENV. Add servers in **Settings → Server** (credentials encrypted in DB).

Without `AUTH_SECRET` + user, the UI stays **open** (dev only — never in production).

### Auth

- **UI**: login at `/login`, session cookie
- **Cron**: `Authorization: Bearer <CRON_SECRET>`
- **API**: `Authorization: Bearer <API_SECRET>` → `GET /api/status`

```bash
curl -H "Authorization: Bearer YOUR_API_SECRET" https://your-app/api/status
```

### Scheduled tasks (Coolify)

| Schedule | URL | Header |
|----------|-----|--------|
| `*/15 * * * *` | `https://your-app/api/cron/server` | `Authorization: Bearer <CRON_SECRET>` |
| `0 * * * *` | `https://your-app/api/cron/security` | same |
| `0 9 * * *` | `https://your-app/api/cron/daily-report` | same |

### Network

Prefer **internal URL** or VPN; do not expose publicly without auth. Traefik: optional IP allowlist.

---

## B) Monitor a Coolify stack (optional)

On any monitored Linux host:

- If containers named `coolify*` are present **or** Coolify API URL+token are set under **Settings → Server**, the `coolify` module checks the core stack (`coolify`, `coolify-db`, `coolify-redis`, `coolify-proxy`; realtime/sentinel optional).
- If neither is present, the module is **skipped** (healthy, no alerts) — suitable for non-Coolify servers.
- **Force-Rebuild** on `/docker` needs Coolify API credentials + resource UUID.

Backup paths are optional; for Coolify installs you may set e.g. `/data/coolify/backups` under Server → Backup.
