# System Guardian

Monitoring, security, and infrastructure dashboard for Coolify environments.

## Stack

- Next.js 16, TypeScript, Tailwind, Shadcn-style UI
- Drizzle ORM + PostgreSQL
- SSH-based checks (production) / mock fixtures (Windows dev)

## Quick start (Windows)

```powershell
cp .env.example .env.local
# Set DATABASE_URL, CHECK_MODE=mock

docker compose up -d postgres
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000

## Run checks manually

```powershell
curl -H "Authorization: Bearer dev-secret" http://localhost:3000/api/cron/server
```

## Production

See [docs/COOLIFY.md](docs/COOLIFY.md).
