# System Guardian

Monitoring, security, and infrastructure dashboard for Coolify environments.

## Stack

- Next.js 16, TypeScript, Tailwind, Shadcn-style UI
- Drizzle ORM + PostgreSQL
- SSH-based checks (production) / mock fixtures (Windows dev)

## Quick start (Windows, lokales PostgreSQL)

PostgreSQL läuft **direkt auf dem PC** (kein Docker für die DB).

### 1. `.env.local`

```powershell
Copy-Item .env.example .env.local
```

Beispiel mit User `postgres` (einfachste Variante):

```env
DATABASE_URL=postgresql://postgres:pass@localhost:5432/system_guardian
CHECK_MODE=mock
CRON_SECRET=dev-secret
```

Alternativ mit eigenem DB-User `system_guardian` (siehe SQL unten):

```env
DATABASE_URL=postgresql://system_guardian:pass@localhost:5432/system_guardian
```

### 2. Datenbank in psql anlegen

```powershell
psql -U postgres
```

```sql
CREATE DATABASE system_guardian;

-- Optional: eigener App-User (empfohlen für Produktion)
CREATE USER system_guardian WITH PASSWORD 'pass';
GRANT ALL PRIVILEGES ON DATABASE system_guardian TO system_guardian;

\c system_guardian
GRANT ALL ON SCHEMA public TO system_guardian;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO system_guardian;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO system_guardian;
```

Mit User `postgres` in `DATABASE_URL` reichen `CREATE DATABASE` – die `GRANT`-Zeilen sind dann optional.

### 3. App starten

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

`db:migrate` liest `DATABASE_URL` aus `.env.local` (siehe `drizzle.config.ts`).

Open http://localhost:3000 · TV/Monitor: http://localhost:3000/monitor

**Manuelle Checks:** Buttons auf dem Dashboard oder `/monitor` (kein curl nötig).

## Run checks manually

```powershell
curl -H "Authorization: Bearer dev-secret" http://localhost:3000/api/cron/server
```

## Security-Features (SIEM-Light)

Was Log-Analyse, HIDS, FIM usw. bei uns bedeuten und warum kein Kibana/Wazuh:
[docs/SECURITY-FEATURES.md](docs/SECURITY-FEATURES.md) · UI: `/security` und `/docs/security`

## Production

See [docs/COOLIFY.md](docs/COOLIFY.md).
