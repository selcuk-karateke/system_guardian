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

**Windows:** Port 3000 oft belegt oder 3001 von Hyper-V reserviert → `npm run dev -- -p 3101`

**Manuelle Checks:** Buttons auf dem Dashboard oder `/monitor` (Reload-Button oben rechts).

## Features

| Bereich | Route | Kurz |
|---------|-------|------|
| Dashboard + globaler Status | `/` | Berücksichtigt **offene** Alerts (entschärfte zählen nicht mehr als WARNING) |
| TV-Monitor | `/monitor` | 16 Module, Auto-Refresh 30s, Reload |
| Docker-Inventar + Trivy | `/docker` | Gruppiert (Apps, DB, Coolify…), Scan-Button on-demand (HIGH/CRITICAL) |
| Security-Übersicht | `/security` | SIEM-Light-Module, `security_posture` |
| Alerts + Vorfallbericht | `/alerts` | Export mit EINORDNUNG pro Modul |
| Historie | `/history` | Snapshots, Outbound-Diffs |

**16 Check-Module** (Cron): Server, RAID, Docker, Coolify, DB, SSL, Website, Ports, Backups, Logs, SSH keys, Users, Logins, Cron, Network, Scanner — plus `security_posture` im Security-Batch.

## Konfiguration (`.env.local`)

| Variable | Zweck |
|----------|--------|
| `CHECK_MODE` | `mock` (Windows) oder `ssh` (Production-Host) |
| `SSH_*` | Ziel-Host für Live-Checks |
| `TRUSTED_LOGIN_IPS` | Kein Root-Login-Alert; `10.0.1.*` intern immer trusted |
| `TRUSTED_OUTBOUND_IPS` | Kein Network-Baseline-Warn für diese Peers |
| `TRUSTED_SHELL_PROCESS_PATTERNS` | Extra-Regex für harmlose `sh -c` (Coolify-Start) in `security_posture` |
| `KNOWN_DOCKER_IMAGE_PREFIXES` | Vertraute Images, fremde Container → CRITICAL |

Vollständige Liste: [.env.example](.env.example)

## Run checks manually

Dashboard-Buttons oder:

```powershell
curl -H "Authorization: Bearer dev-secret" http://localhost:3000/api/cron/server
```

## Docs

| Dokument | Inhalt |
|----------|--------|
| [docs/SECURITY-FEATURES.md](docs/SECURITY-FEATURES.md) | SIEM-Begriffe, Module, UI `/security` |
| [docs/FUTURE-INTEGRATIONS.md](docs/FUTURE-INTEGRATIONS.md) | Roadmap / Phase 2–3 |
| [docs/COOLIFY.md](docs/COOLIFY.md) | Production-Deploy |
| [AGENTS.md](AGENTS.md) | Entwickler-Einstieg |

## Production

See [docs/COOLIFY.md](docs/COOLIFY.md).
