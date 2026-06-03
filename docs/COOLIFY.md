# Coolify Deployment

## Services

1. **PostgreSQL** – create database `system_guardian`
2. **System Guardian** – deploy from this repo (Dockerfile)

## Environment variables

Copy from `.env.example`. Required:

- `DATABASE_URL`
- `CRON_SECRET`
- `CHECK_MODE=ssh`
- `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (optional)
- SMTP vars for email (optional)

## Scheduled tasks

Create HTTP tasks in Coolify pointing to your app URL:

| Schedule | URL | Header |
|----------|-----|--------|
| `*/15 * * * *` | `https://your-app/api/cron/server` | `Authorization: Bearer <CRON_SECRET>` |
| `0 * * * *` | `https://your-app/api/cron/security` | same |
| `0 9 * * *` | `https://your-app/api/cron/daily-report` | same |

## SSH key

Mount the private key as a Coolify secret and set `SSH_PRIVATE_KEY` or use file path if supported.

The SSH user must access `docker`, read logs, and inspect system files.
